import { readFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { getClaudeHome, getClaudeJsonPath, toSandboxMountCandidates } from "./paths.js";
import { execInSandbox } from "./sbx.js";

const AGENT_HOME = "/home/agent";
const AGENT_CLAUDE = `${AGENT_HOME}/.claude`;

/**
 * Items to symlink from the host ~/.claude (mounted read-only) into the
 * sandbox's own writable ~/.claude.
 *
 * Deliberately NOT here:
 *  - .credentials.json  → sbx injects Anthropic auth through its host proxy
 *                         (`sbx secret set anthropic`); on macOS the token
 *                         lives in the Keychain and there is no file anyway.
 *  - statsig            → sbx mounts a per-sandbox writable volume there.
 *  - skills             → handled separately: sbx mounts its shared skills
 *                         store there unless the sandbox was created with
 *                         `--skills off` (see hostHasSkills()).
 */
const SYMLINK_ITEMS = [
  "settings.json", // user settings, permissions
  "plugins",       // installed plugins
  "CLAUDE.md",     // global instructions
  "agents",        // custom agents
  "commands",      // custom slash commands
];

const WRITABLE_DIRS = [
  "session-env", "sessions", "backups", "cache", "file-history", "shell-snapshots",
  "plans", "tasks", "todos", "debug", "downloads", "paste-cache", "telemetry",
  "projects", "ide",
];

export function hostHasSkills() {
  const home = getClaudeHome();
  return !!home && existsSync(join(home, "skills"));
}

/** Shell-quote a path (single quotes). */
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/**
 * Find where the host ~/.claude ended up inside the sandbox.
 */
export function findMountedClaudeHome(sandboxName, hostClaudeHome) {
  const candidates = toSandboxMountCandidates(hostClaudeHome);
  const script = candidates
    .map((c) => `if [ -d ${q(c)} ]; then echo ${q(c)}; exit 0; fi`)
    .join("; ");
  const { stdout } = execInSandbox(sandboxName, `${script}; exit 1`);
  const found = stdout.trim();
  return found || null;
}

/**
 * Link the host's Claude config into the sandbox.
 *
 * Strategy: keep the sandbox's own writable ~/.claude, symlink selected
 * read-only items from the host mount, and copy ~/.claude.json so Claude
 * skips the first-time setup wizard.
 *
 * Returns { ok, mountedPath, linked[] }.
 */
export function setupHostConfig(sandboxName, hostClaudeHome, { linkSkills = false } = {}) {
  const mountedPath = findMountedClaudeHome(sandboxName, hostClaudeHome);
  if (!mountedPath) {
    return { ok: false, mountedPath: null, linked: [], reason: "host ~/.claude not visible inside sandbox" };
  }

  const items = linkSkills ? [...SYMLINK_ITEMS, "skills"] : SYMLINK_ITEMS;

  // One script: ensure dir, replace each item with a symlink (removing a
  // sandbox-local copy first, otherwise `ln` would drop the link *inside*
  // the existing directory), then create writable dirs.
  const lines = [`mkdir -p ${q(AGENT_CLAUDE)}`];
  for (const item of items) {
    const src = `${mountedPath}/${item}`;
    const dst = `${AGENT_CLAUDE}/${item}`;
    lines.push(
      `if [ -e ${q(src)} ]; then ` +
        `if [ -e ${q(dst)} ] && [ ! -L ${q(dst)} ]; then rm -rf ${q(dst)}; fi; ` +
        `ln -sfn ${q(src)} ${q(dst)} && echo "linked:${item}"; ` +
      `fi`
    );
  }
  lines.push(`mkdir -p ${WRITABLE_DIRS.map((d) => q(`${AGENT_CLAUDE}/${d}`)).join(" ")}`);

  const { stdout } = execInSandbox(sandboxName, lines.join("\n"));
  const linked = stdout
    .split("\n")
    .filter((l) => l.startsWith("linked:"))
    .map((l) => l.slice("linked:".length));

  // Copy ~/.claude.json (can be 50KB+, so pipe via stdin as base64).
  const claudeJsonPath = getClaudeJsonPath();
  let copiedClaudeJson = false;
  if (claudeJsonPath) {
    try {
      const b64 = readFileSync(claudeJsonPath).toString("base64");
      const r = execInSandbox(
        sandboxName,
        `base64 -d > ${q(`${AGENT_HOME}/.claude.json`)} && chmod 600 ${q(`${AGENT_HOME}/.claude.json`)}`,
        { stdin: b64 }
      );
      copiedClaudeJson = r.exitCode === 0;
    } catch {
      // Not critical — Claude will just show first-time setup
    }
  }

  return { ok: true, mountedPath, linked, copiedClaudeJson };
}

/**
 * Verify the sandbox state. Returns { checks: {name: bool}, allOk }.
 */
export function verifySandbox(sandboxName) {
  const script = [
    `[ -f ${q(`${AGENT_HOME}/.claude.json`)} ] && echo "claude.json=ok" || echo "claude.json=missing"`,
    `[ -e ${q(`${AGENT_CLAUDE}/settings.json`)} ] && echo "settings=ok" || echo "settings=missing"`,
    `touch ${q(`${AGENT_CLAUDE}/session-env/.probe`)} 2>/dev/null && rm -f ${q(`${AGENT_CLAUDE}/session-env/.probe`)} && echo "writable=ok" || echo "writable=missing"`,
    `command -v claude >/dev/null && echo "claude-cli=ok" || echo "claude-cli=missing"`,
  ].join("\n");
  const { stdout } = execInSandbox(sandboxName, script);
  const checks = {};
  for (const line of stdout.split("\n")) {
    const [k, v] = line.split("=");
    if (k && v) checks[k] = v.trim() === "ok";
  }
  return { checks, allOk: Object.values(checks).length > 0 && Object.values(checks).every(Boolean) };
}
