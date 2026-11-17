"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const { redact } = require("../src/rpc");
const { MIT_TEXT, cleanup, manifest, tempDir, write } = require("./helpers");

const BIN = path.join(__dirname, "..", "bin", "qa-license-scanner");

function runRpc(workspace, requests) {
  return spawnSync(
    process.execPath,
    [BIN, "rpc", "--workspace", workspace],
    {
      input: `${requests.join("\n")}\n`,
      encoding: "utf8",
      timeout: 15000,
    },
  );
}

test("serves JSON-lines info, scan, validate, and report", (t) => {
  const root = tempDir();
  t.after(() => cleanup(root));
  write(root, "project/package.json", JSON.stringify({
    name: "fixture", version: "1.0.0", license: "MIT",
  }));
  write(root, "project/LICENSE", MIT_TEXT);
  write(root, "project/legal/manifest.json", JSON.stringify(manifest({
    product: "Fixture",
  })));

  const requests = [
    JSON.stringify({ id: "info", method: "info" }),
    JSON.stringify({ id: "scan", method: "scan", params: { root: "project" } }),
    JSON.stringify({
      id: "report", method: "report",
      params: { root: "project", format: "md" },
    }),
    JSON.stringify({
      id: "validate", method: "validate",
      params: { path: "project/legal/manifest.json" },
    }),
  ];
  const result = runRpc(root, requests);
  assert.equal(result.status, 0, result.stderr);
  const responses = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(responses.length, 4);
  const byId = Object.fromEntries(responses.map((response) => [response.id, response]));
  assert.equal(byId.info.data.version, "0.1.0");
  assert.equal(byId.info.data.workspaceJail, true);
  assert.equal(byId.scan.data.summary.result, "pass");
  assert.match(byId.report.data.text, /License scan/);
  assert.equal(byId.validate.data.ok, true);
  assert.equal(byId.validate.data.file, "project/legal/manifest.json");
  assert.ok(!result.stdout.includes(root));
});

test("returns structured errors and keeps serving", (t) => {
  const root = tempDir();
  t.after(() => cleanup(root));
  const requests = [
    JSON.stringify({ id: "unknown", method: "nope" }),
    JSON.stringify({ id: "outside", method: "scan", params: { root: ".." } }),
    "{",
  ];
  const result = runRpc(root, requests);
  assert.equal(result.status, 0, result.stderr);
  const responses = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(responses.length, 3);
  assert.equal(responses[0].error.code, "unknown-method");
  assert.equal(responses[1].error.code, "outside-workspace");
  assert.equal(responses[2].id, null);
  assert.equal(responses[2].error.code, "invalid-json");
  assert.ok(!result.stdout.includes(root));
});

test("redacts workspace and home paths from errors", () => {
  const workspace = "/tmp/qa-workspace";
  assert.equal(
    redact(`cannot read ${workspace}/legal.json`, workspace),
    "cannot read <workspace>/legal.json",
  );
});

test("requires a workspace for rpc", () => {
  const result = spawnSync(process.execPath, [BIN, "rpc"], {
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /requires --workspace/);
});
