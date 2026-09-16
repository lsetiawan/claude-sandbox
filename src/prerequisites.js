import { execFileSync } from "node:child_process";
import { platform } from "node:os";
import { checkSbxAvailable, getSbxVersion, isDaemonRunning, listSecrets } from "./sbx.js";

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const os = platform();

function commandExists(cmd) {
  try {
    execFileSync(os === "win32" ? "where" : "which", [cmd], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function hasClaudeCli() {
  return commandExists("claude");
}

/**
 * Platform-specific install instructions for the sbx CLI.
 * Source: https://docs.docker.com/ai/sandboxes/install/
 */
export function getSbxInstallGuide() {
  switch (os) {
    case "win32":
      return {
        name: "Windows",
        steps: [
          `${BOLD}Requirements:${RESET} Windows 11, 64-bit Intel/AMD, Windows Hypervisor Platform enabled`,
          ``,
          `${BOLD}1. Enable the Hypervisor Platform (admin PowerShell, then reboot):${RESET}`,
          `  Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All`,
          ``,
          `${BOLD}2. Install sbx (per-user):${RESET}`,
          `  winget install -h Docker.sbx`,
          ``,
          `${DIM}Machine-wide: download DockerSandboxesMachine.msi from the GitHub releases${RESET}`,
          `${DIM}and run: msiexec.exe /i DockerSandboxesMachine.msi /quiet${RESET}`,
        ],
      };
    case "darwin":
      return {
        name: "macOS",
        steps: [
          `${BOLD}Requirements:${RESET} macOS Sonoma 14 or later, Apple silicon`,
          ``,
          `${BOLD}Install with Homebrew:${RESET}`,
          `  brew trust docker/tap`,
          `  brew install docker/tap/sbx`,
        ],
      };
    case "linux":
      return {
        name: "Linux",
        steps: [
          `${BOLD}Requirements:${RESET} Ubuntu 24.04+, KVM enabled, your user in the kvm group`,
          ``,
          `${BOLD}Option A: sbx only${RESET}`,
          `  curl -fsSL https://get.docker.com | sudo REPO_ONLY=1 sh`,
          `  sudo apt install docker-sbx`,
          ``,
          `${BOLD}Option B: sbx together with Docker Engine${RESET}`,
          `  curl -fsSL https://get.docker.com | sudo SBX=1 sh`,
        ],
      };
    default:
      return {
        name: os,
        steps: [`See https://docs.docker.com/ai/sandboxes/install/`],
      };
  }
}

/**
 * Run full prerequisite check. Returns { ok, issues[], checks[], secrets }.
 * If interactive, prints a guided setup flow.
 */
export function checkPrerequisites({ interactive = true } = {}) {
  const issues = [];
  const checks = [];
  let secrets = {};

  // 1. sbx installed?
  const sbxOk = checkSbxAvailable();
  if (sbxOk) {
    checks.push({ name: "Docker Sandboxes (sbx)", status: "ok", detail: getSbxVersion() });
  } else {
    checks.push({ name: "Docker Sandboxes (sbx)", status: "missing" });
    issues.push("sbx-missing");
  }

  // 2. sandboxd daemon running?
  if (sbxOk) {
    if (isDaemonRunning()) {
      checks.push({ name: "sandboxd daemon", status: "ok" });
    } else {
      checks.push({ name: "sandboxd daemon", status: "stopped" });
      issues.push("daemon-stopped");
    }
  }

  // 3. Anthropic credentials stored in sbx? (optional: /login inside Claude also works)
  if (sbxOk) {
    secrets = listSecrets();
    if (secrets.anthropic) {
      checks.push({ name: "Anthropic auth (sbx secret)", status: "ok", detail: secrets.anthropic.replace(/^\((.*)\)$/, "$1") });
    } else {
      checks.push({
        name: "Anthropic auth (sbx secret)",
        status: "optional",
        detail: "not configured — Claude will ask you to /login once",
      });
    }
  }

  // 4. Claude CLI on host? (only needed for the ~/.claude config we share)
  if (hasClaudeCli()) {
    checks.push({ name: "Claude Code CLI (host)", status: "ok" });
  } else {
    checks.push({
      name: "Claude Code CLI (host)",
      status: "optional",
      detail: "not found (optional; only used to share your ~/.claude config)",
    });
  }

  if (interactive) {
    console.log();
    console.log(`${BOLD}Prerequisite Check${RESET}`);
    console.log();

    for (const check of checks) {
      const icon =
        check.status === "ok"
          ? `${GREEN}✓${RESET}`
          : check.status === "optional"
            ? `${YELLOW}~${RESET}`
            : `${RED}✗${RESET}`;
      const detail = check.detail ? ` ${DIM}(${check.detail})${RESET}` : "";
      console.log(`  ${icon} ${check.name}${detail}`);
    }
    console.log();

    if (issues.includes("sbx-missing")) {
      const guide = getSbxInstallGuide();
      console.log(`${RED}The sbx CLI is not installed.${RESET} Install it for ${guide.name}:\n`);
      for (const step of guide.steps) console.log(`  ${step}`);
      console.log();
      console.log(`  ${DIM}Docker Desktop / Docker Engine are NOT required.${RESET}`);
      console.log(`  ${DIM}Docs: https://docs.docker.com/ai/sandboxes/install/${RESET}`);
      console.log();
    }

    if (issues.includes("daemon-stopped")) {
      console.log(`${YELLOW}sbx is installed but its daemon is not running.${RESET}\n`);
      console.log(`  sbx daemon start`);
      console.log(`  ${DIM}# or run 'sbx diagnose' to find out what is wrong${RESET}`);
      console.log();
    }

    if (sbxOk && !secrets.anthropic) {
      console.log(`${YELLOW}No Anthropic credentials stored in sbx.${RESET}`);
      console.log(`  Either run ${BOLD}/login${RESET} once inside Claude (sbx keeps the OAuth token`);
      console.log(`  on the host and shares it with every sandbox), or store an API key:`);
      console.log(`  sbx secret set anthropic`);
      console.log();
    }

    if (issues.length === 0) {
      console.log(`${GREEN}All prerequisites met. Ready to go.${RESET}`);
      console.log();
    }
  }

  return { ok: issues.length === 0, issues, checks, secrets };
}
