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

test("--resume with and without a session id", () => {
  const id = "87b16e09-94e8-4d0d-b963-899a9028fdd7";
  assert.equal(parseArgs(argv()).resume, null);
  assert.equal(parseArgs(argv("--resume")).resume, true);
  assert.equal(parseArgs(argv("--resume", id)).resume, id);
  assert.equal(parseArgs(argv(`--resume=${id}`)).resume, id);
  assert.deepEqual(parseArgs(argv("resume", "box", "--resume", id)), {
    ...parseArgs(argv("resume")),
    resume: id,
    extra: ["box"],
  });
});

test("--resume does not swallow a project dir", () => {
  const p = parseArgs(argv("--resume", "./proj"));
  assert.equal(p.resume, true);
  assert.equal(p.projectDir, "./proj");
});

test("--new and sessions command", () => {
  assert.equal(parseArgs(argv()).fresh, false);
  assert.equal(parseArgs(argv("--new")).fresh, true);
  const p = parseArgs(argv("sessions", "box"));
  assert.equal(p.command, "sessions");
  assert.deepEqual(p.extra, ["box"]);
});
