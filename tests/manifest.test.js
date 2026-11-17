"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.join(__dirname, "..");

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(target));
    else if (entry.name.endsWith(".js")) out.push(target);
  }
  return out;
}

test("app manifest matches the package and legal register", () => {
  const app = JSON.parse(read("app.manifest.json"));
  const pkg = JSON.parse(read("package.json"));
  const legal = JSON.parse(read("legal/manifest.json"));
  assert.equal(app.apiVersion, 1);
  assert.equal(app.id, "qa-license-scanner");
  assert.equal(app.version, pkg.version);
  assert.equal(app.version, legal.reviewedVersion);
  assert.equal(app.entrypoints.module, "src/app.js");
  assert.equal(app.entrypoints.cli, "bin/qa-license-scanner");
  assert.equal(pkg.main, "src/app.js");
  assert.equal(pkg.exports["./app"], "./src/app.js");
  assert.equal(pkg.exports["./rpc"], "./src/rpc.js");
  assert.equal(pkg.exports["./manifest"], "./app.manifest.json");
  assert.ok(pkg.files.includes("app.manifest.json"));
  assert.ok(pkg.files.includes("src"));
  assert.equal(app.protocol.type, "json-lines");
  assert.equal(app.protocol.transport, "stdio");
  assert.equal(app.host.workspaceBoundary, true);
  assert.equal(app.security.network, false);
  assert.equal(app.security.shell, false);
  for (const method of app.protocol.methods) {
    assert.ok(app.capabilities.includes(method), method);
  }
  assert.ok(fs.existsSync(path.join(ROOT, "docs", "ATTACH.md")));
});

test("the legal register includes the host contract", () => {
  const legal = JSON.parse(read("legal/manifest.json"));
  const ids = legal.documents.map((document) => document.id);
  assert.ok(ids.includes("app-manifest"));
  assert.ok(ids.includes("attach-guide"));
});

test("source has no network or shell dependencies", () => {
  const forbidden = /require\(["'](?:node:)?(?:http|https|net|dgram|child_process)["']\)/;
  for (const file of sourceFiles(path.join(ROOT, "src"))) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), forbidden, file);
  }
});

test("README stays within the project limit", () => {
  const lines = read("README.md").trimEnd().split(/\r?\n/);
  assert.ok(lines.length <= 10, `README has ${lines.length} lines`);
});
