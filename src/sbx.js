import { execFileSync, spawnSync } from "node:child_process";

/**
 * Thin wrappers around the Docker Sandboxes CLI (`sbx`).
 * https://docs.docker.com/ai/sandboxes/
 *
 * Pure helpers (parseX / buildX) are exported for unit tests.
 */

const SBX = "sbx";

function run(args, opts = {}) {
  return execFileSync(SBX, args, { encoding: "utf-8", stdio: "pipe", ...opts });
}

// ---------- pure helpers ----------

export function parseSandboxList(json) {
  try {
    const data = JSON.parse(json);
    return Array.isArray(data?.sandboxes) ? data.sandboxes : [];
  } catch {
    return [];
  }
}

/**
 * Parse `sbx secret ls` table output into { name: secretStatus }.
 * Columns: SCOPE TYPE NAME SECRET (SECRET may contain spaces).
 */
export function parseSecretList(text) {
  const secrets = {};
  for (const line of text.split("\n").slice(1)) {
    const m = line.trim().match(/^(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/);
    if (m) secrets[m[3]] = m[4].trim();
  }
  return secrets;
}

export function buildCreateArgs(name, projectDir, extraWorkspaces = [], { skills } = {}) {
  const args = ["create", "--name", name];
  if (skills) args.push("--skills", skills);
  args.push("claude", projectDir, ...extraWorkspaces);
  return args;
}

export function buildRunArgs(name, agentArgs = []) {
  const args = ["run", "--name", name];
  if (agentArgs.length > 0) args.push("--", ...agentArgs);
  return args;
}

/**
 * Agent args when attaching to an existing sandbox. Interactive
 * `claude --continue` exits with "No conversation found to continue" when the
 * project has no prior interactive session, so only add it when one exists.
 *
 * resume: true opens Claude's conversation picker, a string resumes that
 * session id. fresh starts a new conversation. A prompt runs in print mode,
 * inside the given session when resume is an id.
 */
export function buildAttachAgentArgs({ prompt = null, canContinue = false, resume = null, fresh = false } = {}) {
  const skipPerms = "--dangerously-skip-permissions";
  const sessionId = typeof resume === "string" ? ["--resume", resume] : [];
  if (prompt) return [...sessionId, "-p", prompt, skipPerms];
  if (resume) return [...(sessionId.length ? sessionId : ["--resume"]), skipPerms];
  return canContinue && !fresh ? ["--continue", skipPerms] : [skipPerms];
}

// ---------- availability ----------

export function checkSbxAvailable() {
  try {
    run(["version"]);
    return true;
  } catch {
    return false;
  }
}

/** e.g. "v0.43.0" */
export function getSbxVersion() {
  try {
    const out = run(["version"]).trim();
    const m = out.match(/v?\d+\.\d+\.\d+/);
    return m ? m[0] : out;
  } catch {
    return null;
  }
}

export function isDaemonRunning() {
  try {
    const out = run(["daemon", "status"]);
    return /status:\s*running/i.test(out);
  } catch {
    return false;
  }
}

/** Returns { anthropic: "(oauth configured)", ... } or {} */
export function listSecrets() {
  try {
    return parseSecretList(run(["secret", "ls"]));
  } catch {
    return {};
  }
}

// ---------- sandboxes ----------

export function listSandboxes() {
  return run(["ls"]);
}

export function getSandboxes() {
  try {
    return parseSandboxList(run(["ls", "--json"]));
  } catch {
    return [];
  }
}

export function getSandbox(name) {
  return getSandboxes().find((s) => s.name === name) || null;
}

export function sandboxExists(name) {
  return getSandbox(name) !== null;
}

/**
 * Create a sandbox. stdio inherited so the user sees image pull progress.
 */
export function createSandbox(name, projectDir, extraWorkspaces = [], opts = {}) {
  const result = spawnSync(SBX, buildCreateArgs(name, projectDir, extraWorkspaces, opts), {
    encoding: "utf-8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error("sbx create failed");
  }
}

/**
 * Execute a shell command inside a sandbox (starts it if stopped).
 */
export function execInSandbox(name, command, { stdin } = {}) {
  const result = spawnSync(
    SBX,
    ["exec", ...(stdin ? ["-i"] : []), name, "/bin/bash", "-c", command],
    {
      encoding: "utf-8",
      stdio: [stdin ? "pipe" : "ignore", "pipe", "pipe"],
      ...(stdin ? { input: stdin } : {}),
    }
  );
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.status,
  };
}

/**
 * Attach to a sandbox's agent (starts the sandbox if stopped).
 * sbx adds `--dangerously-skip-permissions` itself when the first agent arg is a flag.
 */
export function runSandbox(name, agentArgs = []) {
  const result = spawnSync(SBX, buildRunArgs(name, agentArgs), {
    stdio: "inherit",
    encoding: "utf-8",
  });
  return result.status;
}

export function stopSandbox(name) {
  const result = spawnSync(SBX, ["stop", name], {
    encoding: "utf-8",
    stdio: ["inherit", "pipe", "pipe"],
  });
  return result.status === 0;
}

/** --force: skip the interactive confirmation prompt. */
export function removeSandbox(name) {
  const result = spawnSync(SBX, ["rm", "--force", name], {
    encoding: "utf-8",
    stdio: ["inherit", "pipe", "pipe"],
  });
  return result.status === 0;
}
