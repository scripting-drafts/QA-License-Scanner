"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const { cleanup, manifest, tempDir, write } = require("./helpers");

const BIN = path.join(__dirname, "..", "bin", "qa-license-scanner");

function run(args, cwd) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

test("lists modules and scans a project", (t) => {
  const root = tempDir();
  t.after(() => cleanup(root));
  write(root, "package.json", JSON.stringify({
    name: "safe", version: "1.0.0", license: "MIT",
  }));
  const modules = run(["modules"], root);
  assert.equal(modules.status, 0);
  assert.match(modules.stdout, /npm/);
  assert.match(modules.stdout, /files/);

  const scan = run(["scan", ".", "--format", "json"], root);
  assert.equal(scan.status, 0);
  const parsed = JSON.parse(scan.stdout);
  assert.equal(parsed.summary.result, "pass");
  assert.ok(parsed.findings.some((item) => item.license === "MIT"));
});

test("validates manifests and reports errors", (t) => {
  const root = tempDir();
  t.after(() => cleanup(root));
  const good = write(root, "good.json", JSON.stringify(manifest()));
  const bad = write(root, "bad.json", JSON.stringify(manifest({ spdx: "MIT AND" })));
  const goodRun = run(["validate", good], root);
  assert.equal(goodRun.status, 0);
  assert.match(goodRun.stdout, /ok/);
  const badRun = run(["validate", bad], root);
  assert.equal(badRun.status, 1);
  assert.match(badRun.stderr, /invalid/);
});

test("writes a private report file", (t) => {
  const root = tempDir();
  t.after(() => cleanup(root));
  write(root, "package.json", JSON.stringify({
    name: "safe", version: "1.0.0", license: "MIT",
  }));
  const output = path.join(root, "report.json");
  const result = run(["scan", ".", "--format", "json", "--output", output], root);
  assert.equal(result.status, 0);
  const mode = fs.statSync(output).mode & 0o777;
  assert.equal(mode, 0o600);
  assert.ok(fs.readFileSync(output, "utf8").includes("\"result\""));
});
