import { homedir } from "node:os";
import { join, resolve, basename } from "node:path";
import { existsSync } from "node:fs";

/**
 * Get the host ~/.claude directory path
 */
export function getClaudeHome() {
  const claudeDir = join(homedir(), ".claude");
  return existsSync(claudeDir) ? claudeDir : null;
}

/**
 * Get ~/.claude.json path (lives at HOME root, not inside .claude/).
 * Stores startup config, theme, onboarding state — without it Claude shows first-time setup.
 */
export function getClaudeJsonPath() {
  const p = join(homedir(), ".claude.json");
  return existsSync(p) ? p : null;
}

/**
 * Absolute host path as passed to `sbx create`.
 */
export function toHostPath(p) {
  return resolve(p);
}

/**
 * sbx mounts a workspace "at the same path as on the host". On macOS/Linux
 * that is literally the same string. On Windows the drive letter has to be
 * mapped somehow, so we return several candidates and let the caller probe
 * which one exists inside the sandbox.
 */
export function toSandboxMountCandidates(hostPath) {
  const m = hostPath.match(/^([A-Za-z]):\\(.*)$/);
  if (!m) return [hostPath];
  const drive = m[1].toLowerCase();
  const rest = m[2].replace(/\\/g, "/");
  return [hostPath, `/${drive}/${rest}`, `/mnt/${drive}/${rest}`, `/${m[1]}/${rest}`];
}

export function getProjectName(projectDir) {
  return basename(resolve(projectDir));
}

/**
 * Directory name Claude uses for a project's transcripts under
 * ~/.claude/projects (every non-alphanumeric character becomes "-").
 */
export function toClaudeProjectDirName(projectPath) {
  return projectPath.replace(/[^A-Za-z0-9]/g, "-");
}

/**
 * Sandbox name. sbx allows letters, numbers, hyphens and periods only.
 */
export function getSandboxName(projectDir) {
  const safe = getProjectName(projectDir).replace(/[^A-Za-z0-9.-]+/g, "-");
  return `claude-sandbox-${safe}`;
}
