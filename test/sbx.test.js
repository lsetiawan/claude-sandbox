import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSandboxList,
  parseSecretList,
  buildCreateArgs,
  buildRunArgs,
  buildAttachAgentArgs,
} from "../src/sbx.js";

const LS_JSON = JSON.stringify({
  sandboxes: [
    {
      name: "claude-sandbox-foo",
      id: "abc",
      agent: "claude",
      status: "stopped",
      workspaces: ["/Users/me/foo"],
    },
  ],
});

test("parseSandboxList returns sandboxes array", () => {
  const list = parseSandboxList(LS_JSON);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "claude-sandbox-foo");
  assert.equal(list[0].status, "stopped");
});

test("parseSandboxList tolerates garbage", () => {
  assert.deepEqual(parseSandboxList(""), []);
  assert.deepEqual(parseSandboxList("not json"), []);
});

test("parseSecretList finds anthropic secret", () => {
  const out = [
    "SCOPE      TYPE      NAME        SECRET",
    "(global)   service   anthropic   (oauth configured)",
    "(global)   service   github      (configured)",
  ].join("\n");
  const s = parseSecretList(out);
  assert.equal(s.anthropic, "(oauth configured)");
  assert.equal(s.github, "(configured)");
});

test("parseSecretList handles empty output", () => {
  assert.deepEqual(parseSecretList(""), {});
  assert.deepEqual(parseSecretList("SCOPE TYPE NAME SECRET\n"), {});
});

test("buildCreateArgs uses --name, agent, workspaces and skills flag", () => {
  assert.deepEqual(
    buildCreateArgs("n", "/p", ["/home/.claude:ro"], { skills: "off" }),
    ["create", "--name", "n", "--skills", "off", "claude", "/p", "/home/.claude:ro"]
  );
  assert.deepEqual(buildCreateArgs("n", "/p"), ["create", "--name", "n", "claude", "/p"]);
});

test("buildRunArgs re-attaches by name and forwards agent args", () => {
  assert.deepEqual(buildRunArgs("n"), ["run", "--name", "n"]);
  assert.deepEqual(buildRunArgs("n", ["--continue"]), ["run", "--name", "n", "--", "--continue"]);
});

test("buildAttachAgentArgs continues only when a conversation exists", () => {
  const skip = "--dangerously-skip-permissions";
  assert.deepEqual(buildAttachAgentArgs({ canContinue: true }), ["--continue", skip]);
  assert.deepEqual(buildAttachAgentArgs({ canContinue: false }), [skip]);
  assert.deepEqual(buildAttachAgentArgs({ prompt: "hi", canContinue: true }), ["-p", "hi", skip]);
});

test("buildAttachAgentArgs honors --resume and --new", () => {
  const skip = "--dangerously-skip-permissions";
  const id = "87b16e09-94e8-4d0d-b963-899a9028fdd7";
  assert.deepEqual(buildAttachAgentArgs({ resume: true }), ["--resume", skip]);
  assert.deepEqual(buildAttachAgentArgs({ resume: id }), ["--resume", id, skip]);
  assert.deepEqual(buildAttachAgentArgs({ resume: id, prompt: "hi" }), ["--resume", id, "-p", "hi", skip]);
  assert.deepEqual(buildAttachAgentArgs({ fresh: true, canContinue: true }), [skip]);
});
