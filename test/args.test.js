import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/args.js";

const argv = (...a) => ["node", "cli.js", ...a];

test("defaults to run in current dir", () => {
  const p = parseArgs(argv());
  assert.equal(p.command, "run");
  assert.equal(p.projectDir, ".");
  assert.equal(p.prompt, null);
  assert.equal(p.noConfig, false);
});

test("positional dir and prompt", () => {
  const p = parseArgs(argv("/tmp/proj", "-p", "hello"));
  assert.equal(p.projectDir, "/tmp/proj");
  assert.equal(p.prompt, "hello");
});

test("subcommands take names as extra", () => {
  assert.deepEqual(parseArgs(argv("stop", "foo")).extra, ["foo"]);
  assert.equal(parseArgs(argv("remove", "foo")).command, "rm");
  assert.equal(parseArgs(argv("list")).command, "list");
});

test("--no-config and legacy --no-auth alias", () => {
  assert.equal(parseArgs(argv("--no-config")).noConfig, true);
  assert.equal(parseArgs(argv("--no-auth")).noConfig, true);
});

test("version and help", () => {
  assert.equal(parseArgs(argv("-v")).command, "version");
  assert.equal(parseArgs(argv("--help")).help, true);
});
