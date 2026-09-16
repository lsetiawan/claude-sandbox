import { test } from "node:test";
import assert from "node:assert/strict";
import { getSandboxName, toSandboxMountCandidates, toClaudeProjectDirName } from "../src/paths.js";

test("sandbox name from dir basename", () => {
  assert.equal(getSandboxName("/tmp/my-app"), "claude-sandbox-my-app");
});

test("mount candidates: posix path is itself", () => {
  assert.deepEqual(toSandboxMountCandidates("/Users/me/.claude"), ["/Users/me/.claude"]);
});

test("mount candidates: windows path adds msys form", () => {
  const c = toSandboxMountCandidates("C:\\Users\\me\\.claude");
  assert.ok(c.includes("C:\\Users\\me\\.claude"));
  assert.ok(c.includes("/c/Users/me/.claude"));
  assert.ok(c.includes("/mnt/c/Users/me/.claude"));
});

test("claude project dir name replaces non-alphanumerics with hyphens", () => {
  assert.equal(
    toClaudeProjectDirName("/Users/me/Repos/Work/llmoxie-analysis"),
    "-Users-me-Repos-Work-llmoxie-analysis"
  );
  assert.equal(toClaudeProjectDirName("/home/me/my_app.v2"), "-home-me-my-app-v2");
});
