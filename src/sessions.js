import { execInSandbox } from "./sbx.js";
import { toClaudeProjectDirName } from "./paths.js";

/**
 * Past Claude conversations stored inside a sandbox.
 *
 * Pure helpers (parseX / buildX) are exported for unit tests.
 */

const AGENT_PROJECTS = "/home/agent/.claude/projects";
const MARKER = "@@session";

/** Shell-quote a string (single quotes). */
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/**
 * Shell script that prints, per interactive transcript: a marker line with
 * the session id and mtime, then its latest custom and AI title lines (if
 * any) and the first few user messages. Print-mode (-p) transcripts are skipped because
 * interactive --continue/--resume ignore them.
 */
export function buildListScript(projectDir) {
  const dir = `${AGENT_PROJECTS}/${toClaudeProjectDirName(projectDir)}`;
  return [
    `cd ${q(dir)} 2>/dev/null || exit 0`,
    `for f in *.jsonl; do`,
    `  [ -f "$f" ] || continue`,
    `  grep -qF '"entrypoint":"cli"' "$f" || continue`,
    `  echo "${MARKER} \${f%.jsonl} $(stat -c %Y "$f")"`,
    `  grep -F '"type":"custom-title"' "$f" | tail -n 1`,
    `  grep -F '"type":"ai-title"' "$f" | tail -n 1`,
    `  grep -m 5 -F '"type":"user"' "$f"`,
    `done`,
  ].join("\n");
}

/** First user message typed by a person (not a tool result or slash command). */
function promptText(entry) {
  const content = entry?.message?.content;
  if (entry?.type !== "user" || entry.isMeta || typeof content !== "string") return null;
  const text = content.trim();
  return text && !text.startsWith("<") ? text : null;
}

/**
 * Parse buildListScript output into [{ id, modified: Date, title }],
 * newest first. A custom (/rename) title wins over the AI title, then the
 * first prompt, then "(untitled)".
 */
export function parseSessionListing(text) {
  const sessions = [];
  let current = null;
  for (const line of text.split("\n")) {
    if (line.startsWith(`${MARKER} `)) {
      const [, id, mtime] = line.split(" ");
      current = { id, modified: new Date(Number(mtime) * 1000), customTitle: null, aiTitle: null, prompt: null };
      sessions.push(current);
      continue;
    }
    if (!current || !line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type === "custom-title") current.customTitle = entry.customTitle || null;
    else if (entry.type === "ai-title") current.aiTitle = entry.aiTitle || null;
    else current.prompt ??= promptText(entry);
  }
  return sessions
    .map(({ id, modified, customTitle, aiTitle, prompt }) => ({
      id,
      modified,
      title: (customTitle || aiTitle || prompt || "(untitled)").replace(/\s+/g, " "),
    }))
    .sort((a, b) => b.modified - a.modified);
}

/** List the sandbox's interactive conversations for a project. */
export function listConversations(sandboxName, projectDir) {
  const { stdout, exitCode } = execInSandbox(sandboxName, buildListScript(projectDir));
  if (exitCode !== 0) return null;
  return parseSessionListing(stdout);
}
