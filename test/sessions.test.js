import { test } from "node:test";
import assert from "node:assert/strict";
import { buildListScript, parseSessionListing } from "../src/sessions.js";

const line = (o) => JSON.stringify(o);
const user = (content, extra = {}) => line({ type: "user", message: { role: "user", content }, ...extra });

test("buildListScript targets the project's transcript dir", () => {
  const script = buildListScript("/Users/me/my_app");
  assert.ok(script.includes("cd '/home/agent/.claude/projects/-Users-me-my-app'"));
});

test("parseSessionListing picks titles and sorts newest first", () => {
  const out = [
    "@@session aaa 1000",
    line({ type: "ai-title", aiTitle: "AI title" }),
    user("first prompt"),
    "@@session bbb 3000",
    line({ type: "custom-title", customTitle: "Renamed" }),
    line({ type: "ai-title", aiTitle: "Later AI title" }),
    "@@session ccc 2000",
    user("<command-name>/clear</command-name>"),
    user("meta", { isMeta: true }),
    user([{ type: "tool_result", content: "x" }]),
    user("  fix the\n  login bug "),
    "@@session ddd 500",
    "not json",
    "",
  ].join("\n");

  assert.deepEqual(
    parseSessionListing(out).map(({ id, title }) => [id, title]),
    [
      ["bbb", "Renamed"],
      ["ccc", "fix the login bug"],
      ["aaa", "AI title"],
      ["ddd", "(untitled)"],
    ]
  );
  assert.equal(parseSessionListing(out)[0].modified.getTime(), 3_000_000);
});

test("parseSessionListing handles empty output", () => {
  assert.deepEqual(parseSessionListing(""), []);
});
