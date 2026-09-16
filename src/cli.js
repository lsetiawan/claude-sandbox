#!/usr/bin/env node

import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./args.js";
import {
  checkSbxAvailable,
  listSandboxes,
  getSandbox,
  createSandbox,
  runSandbox,
  stopSandbox,
  removeSandbox,
} from "./sbx.js";
import { getClaudeHome, toHostPath, getSandboxName } from "./paths.js";
import { setupHostConfig, verifySandbox, hostHasSkills } from "./config.js";
import { checkPrerequisites } from "./prerequisites.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const log = (msg) => console.log(`${GREEN}[claude-sandbox]${RESET} ${msg}`);
const warn = (msg) => console.log(`${YELLOW}[claude-sandbox]${RESET} ${msg}`);
const error = (msg) => console.error(`${RED}[claude-sandbox]${RESET} ${msg}`);
const info = (msg) => console.log(`${CYAN}[claude-sandbox]${RESET} ${msg}`);

// Claude args. sbx already adds --dangerously-skip-permissions when the first
// agent arg is a flag; we pass it explicitly so the intent is visible.
const SKIP_PERMS = "--dangerously-skip-permissions";

function printHelp() {
  console.log(`
${GREEN}claude-sandbox${RESET} — Run Claude Code in Docker Sandboxes (sbx) with your host config.

${CYAN}Usage:${RESET}
  claude-sandbox [project-dir] [options]
  claude-sandbox <command> [options]

${CYAN}Commands:${RESET}
  run [dir] [options]    Create and run a sandbox (default command)
  list                   List all sandboxes
  stop [name]            Stop a sandbox
  rm [name]              Remove a sandbox
  resume [name]          Resume an existing sandbox
  status                 Show sbx, daemon, auth and config status

${CYAN}Options:${RESET}
  -p, --prompt <text>    Initial prompt for Claude (non-interactive, print mode)
  -n, --name <name>      Custom sandbox name
  --no-config            Don't share host ~/.claude into the sandbox
  -v, --version          Show version
  -h, --help             Show this help

${CYAN}Examples:${RESET}
  claude-sandbox                              ${DIM}# current dir, interactive${RESET}
  claude-sandbox /path/to/project             ${DIM}# any project${RESET}
  claude-sandbox . -p "improve test coverage" ${DIM}# with prompt${RESET}
  claude-sandbox list                         ${DIM}# show sandboxes${RESET}
  claude-sandbox resume my-sandbox            ${DIM}# resume existing${RESET}

${CYAN}How it works:${RESET}
  1. Creates a Docker Sandbox (microVM) for the project via 'sbx create'
  2. Mounts your host ~/.claude read-only and links settings, plugins,
     agents, commands, CLAUDE.md and skills into the sandbox
  3. Copies ~/.claude.json so Claude skips the first-time setup wizard
  4. Runs Claude with --dangerously-skip-permissions (safe inside the VM)

${CYAN}Authentication:${RESET}
  sbx handles Anthropic auth on the host: run /login once inside Claude
  (or 'sbx secret set anthropic' for an API key) and every sandbox shares
  it. Your token never enters the VM. Check with 'claude-sandbox status'.

${CYAN}About history and data:${RESET}
  Anything Claude writes inside the sandbox (history, sessions) stays in
  the sandbox and persists until 'claude-sandbox rm <name>'.
`);
}

function cmdRun(opts) {
  const projectDir = toHostPath(opts.projectDir);
  const sandboxName = opts.name || getSandboxName(opts.projectDir);

  console.log();
  log(`Project:  ${projectDir}`);
  log(`Sandbox:  ${sandboxName}`);

  // Existing sandbox → re-attach (sbx starts it if stopped)
  const existing = getSandbox(sandboxName);
  if (existing) {
    info(`Sandbox exists (${existing.status}). Resuming...`);
    console.log();
    const agentArgs = opts.prompt ? ["-p", opts.prompt, SKIP_PERMS] : ["--continue", SKIP_PERMS];
    return runSandbox(sandboxName, agentArgs);
  }

  const claudeHome = getClaudeHome();
  const shareConfig = !!claudeHome && !opts.noConfig;
  const extraWorkspaces = [];
  const createOpts = {};

  if (shareConfig) {
    extraWorkspaces.push(`${toHostPath(claudeHome)}:ro`);
    // sbx mounts its own shared skills store at ~/.claude/skills; if the host
    // has skills, turn that off so we can link the host's instead.
    if (hostHasSkills()) createOpts.skills = "off";
  } else if (!opts.noConfig) {
    warn("No ~/.claude found on host. Sandbox will use a fresh Claude config.");
  }

  console.log();

  // Step 1: Create sandbox (shows image pull progress via inherited stdio)
  log(`${CYAN}[1/4]${RESET} Creating sandbox microVM...`);
  try {
    createSandbox(sandboxName, projectDir, extraWorkspaces, createOpts);
  } catch (err) {
    error(`Failed to create sandbox: ${err.message}`);
    process.exit(1);
  }
  log(`${GREEN}[1/4]${RESET} Sandbox created.`);

  // Step 2: Link host config
  log(`${CYAN}[2/4]${RESET} Linking settings, plugins, skills, agents...`);
  if (shareConfig) {
    const res = setupHostConfig(sandboxName, claudeHome, { linkSkills: !!createOpts.skills });
    if (res.ok) {
      const what = res.linked.length ? res.linked.join(", ") : "nothing to link";
      log(`${GREEN}[2/4]${RESET} Linked: ${what}${res.copiedClaudeJson ? " + ~/.claude.json" : ""}`);
    } else {
      warn(`[2/4] Could not link host config: ${res.reason}`);
    }
  } else {
    log(`${DIM}[2/4] Skipped.${RESET}`);
  }

  // Step 3: Verify
  log(`${CYAN}[3/4]${RESET} Verifying sandbox state...`);
  const v = verifySandbox(sandboxName);
  if (v.allOk) {
    log(`${GREEN}[3/4]${RESET} All checks passed: claude.json, settings, writable dirs, claude CLI.`);
  } else {
    const summary = Object.entries(v.checks)
      .map(([k, ok]) => `${k}=${ok ? "ok" : "MISSING"}`)
      .join(" ");
    warn(`[3/4] Checks: ${summary || "no output from sandbox"}`);
  }

  // Step 4: Launch
  log(`${CYAN}[4/4]${RESET} Launching Claude...`);
  console.log();
  const agentArgs = opts.prompt ? ["-p", opts.prompt, SKIP_PERMS] : [SKIP_PERMS];
  return runSandbox(sandboxName, agentArgs);
}

function cmdList() {
  process.stdout.write(listSandboxes());
}

function cmdStop(opts) {
  const name = opts.extra[0] || getSandboxName(".");
  log(`Stopping: ${name}`);
  if (stopSandbox(name)) {
    log("Stopped.");
  } else {
    error("Failed to stop sandbox.");
    process.exit(1);
  }
}

function cmdRm(opts) {
  const name = opts.extra[0] || getSandboxName(".");
  log(`Removing: ${name}`);
  if (removeSandbox(name)) {
    log("Removed.");
  } else {
    error("Failed to remove sandbox.");
    process.exit(1);
  }
}

function cmdResume(opts) {
  const name = opts.extra[0];
  if (!name) {
    error("Specify sandbox name. Use 'claude-sandbox list' to see available.");
    process.exit(1);
  }
  if (!getSandbox(name)) {
    error(`No sandbox named '${name}'. Use 'claude-sandbox list' to see available.`);
    process.exit(1);
  }
  log(`Resuming: ${name}`);
  return runSandbox(name, ["--continue", SKIP_PERMS]);
}

function cmdStatus() {
  checkPrerequisites({ interactive: true });

  const claudeHome = getClaudeHome();
  console.log(`  Claude home:     ${claudeHome || `${YELLOW}not found (nothing to share)${RESET}`}`);
  if (claudeHome) {
    console.log(`  Host skills:     ${hostHasSkills() ? "found (linked instead of sbx skills store)" : "none (sbx skills store used)"}`);
  }
  console.log();
}

// --- Main ---
const opts = parseArgs(process.argv);

if (opts.command === "version") {
  console.log(`claude-sandbox v${pkg.version}`);
  process.exit(0);
}

if (opts.help) {
  printHelp();
  process.exit(0);
}

// Commands that talk to sbx: quiet check, verbose guide only when broken.
if (["run", "stop", "rm", "resume", "list"].includes(opts.command)) {
  const { ok } = checkPrerequisites({ interactive: !checkSbxAvailable() });
  if (!ok) {
    checkPrerequisites({ interactive: true });
    process.exit(1);
  }
}

let status = 0;
switch (opts.command) {
  case "run":
    status = cmdRun(opts);
    break;
  case "list":
    cmdList();
    break;
  case "stop":
    cmdStop(opts);
    break;
  case "rm":
    cmdRm(opts);
    break;
  case "resume":
    status = cmdResume(opts);
    break;
  case "status":
    cmdStatus();
    break;
  default:
    printHelp();
}
process.exitCode = typeof status === "number" ? status : 0;
