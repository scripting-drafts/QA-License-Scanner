"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { scanProject } = require("../src/scan");
const { MIT_TEXT, cleanup, manifest, tempDir, write } = require("./helpers");

function byName(result, name) {
  return result.findings.find((finding) => finding.name === name);
}

test("scans npm lockfiles and applies policy", (t) => {
  const root = tempDir();
  t.after(() => cleanup(root));
  write(root, "package.json", JSON.stringify({
    name: "fixture",
    version: "1.0.0",
    license: "MIT",
    dependencies: { "left-pad": "^1.0.0" },
  }));
  write(root, "package-lock.json", JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { name: "fixture", version: "1.0.0", license: "MIT" },
      "node_modules/left-pad": { version: "1.0.0", license: "MIT" },
      "node_modules/bad-lib": { version: "2.0.0", license: "GPL-3.0-only" },
    },
  }));
  write(root, "LICENSE", MIT_TEXT);

  const result = scanProject(root);
  assert.equal(result.summary.result, "fail");
  assert.equal(result.summary.blocked, 1);
  assert.equal(byName(result, "left-pad").policy.status, "allowed");
  assert.equal(byName(result, "left-pad").scope, "runtime");
  assert.equal(byName(result, "bad-lib").policy.status, "blocked");
  assert.ok(result.findings.every((finding) => !finding.path.startsWith("/")));
  assert.ok(!JSON.stringify(result).includes(root));
});

test("detects a project license file", (t) => {
  const root = tempDir();
  t.after(() => cleanup(root));
  write(root, "LICENSE", MIT_TEXT);
  const result = scanProject(root);
  const finding = result.findings.find((item) => item.path === "LICENSE");
  assert.equal(finding.license, "MIT");
  assert.equal(finding.policy.status, "allowed");
});

test("scans Python requirement declarations as unknown", (t) => {
  const root = tempDir();
  t.after(() => cleanup(root));
  write(root, "requirements.txt", "requests==2.31.0\nflask>=2.0 ; python_version >= \"3.8\"\n");
  const result = scanProject(root);
  assert.equal(byName(result, "requests").license, "UNKNOWN");
  assert.equal(byName(result, "requests").policy.status, "blocked");
  assert.ok(result.notes.some((note) => note.includes("Python dependency")));
});

test("parses Debian machine-readable copyright", (t) => {
  const root = tempDir();
  t.after(() => cleanup(root));
  write(root, "debian/copyright", `Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/
Upstream-Name: Fixture
Source: https://example.com/fixture

Files: *
Copyright: 2026 Example
License: MIT

Files: debian/*
Copyright: 2026 Example
License: MIT
`);
  const result = scanProject(root);
  assert.ok(result.findings.some((finding) =>
    finding.source === "debian/copyright" && finding.license === "MIT"));
});

test("maps C build system libraries", (t) => {
  const root = tempDir();
  t.after(() => cleanup(root));
  write(root, "Makefile", "CFLAGS += $(shell pkg-config --cflags sqlite3 openssl)\nLDLIBS += $(shell pkg-config --libs sqlite3 openssl)\n");
  const result = scanProject(root);
  assert.equal(byName(result, "SQLite").license, "LicenseRef-Public-Domain");
  assert.equal(byName(result, "OpenSSL").license, "Apache-2.0");
  assert.ok(result.findings.every((finding) => finding.scope === "system"));
});

test("reads components from a valid own-product manifest", (t) => {
  const root = tempDir();
  t.after(() => cleanup(root));
  write(root, "legal/manifest.json", JSON.stringify(manifest({
    components: [{
      id: "electron",
      name: "Electron",
      version: "45.2.3",
      license: "MIT",
      scope: "shipped",
    }],
  })));
  write(root, "LICENSE", MIT_TEXT);
  const result = scanProject(root);
  const finding = result.findings.find((item) =>
    item.source === "legal/manifest.json");
  assert.equal(finding.name, "Electron");
  assert.equal(finding.confidence, "declared");
  assert.equal(finding.policy.status, "allowed");
});
