"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const { AppError, createApp } = require("../src/app");
const { MIT_TEXT, cleanup, manifest, tempDir, write } = require("./helpers");

const REPO = path.join(__dirname, "..");

function fixture() {
  const root = tempDir();
  write(root, "project/package.json", JSON.stringify({
    name: "fixture",
    version: "1.0.0",
    license: "MIT",
  }));
  write(root, "project/LICENSE", MIT_TEXT);
  write(root, "project/legal/manifest.json", JSON.stringify(manifest({
    product: "Fixture",
  })));
  return root;
}

test("exposes host info and modules", () => {
  const root = fixture();
  try {
    const app = createApp({ root: REPO, workspace: root });
    const info = app.info();
    assert.equal(info.apiVersion, 1);
    assert.equal(info.id, "qa-license-scanner");
    assert.equal(info.version, "0.1.0");
    assert.equal(info.protocol.type, "json-lines");
    assert.equal(info.host.workspaceBoundary, true);
    assert.equal(info.security.network, false);
    assert.equal(info.security.shell, false);
    assert.equal(info.workspaceJail, true);
    assert.ok(info.capabilities.includes("scan"));
    assert.equal(app.modules().length, 5);
    assert.ok(app.policy().allowed.includes("MIT"));
    assert.ok(app.policy().blocked.includes("GPL-3.0-only"));
  } finally {
    cleanup(root);
  }
});

test("scans, validates, and renders inside a workspace", () => {
  const root = fixture();
  try {
    const app = createApp({ root: REPO, workspace: root });
    const result = app.scan({ root: "project" });
    assert.equal(result.summary.result, "pass");
    assert.ok(result.findings.some((finding) => finding.license === "MIT"));
    assert.ok(!JSON.stringify(result).includes(root));

    const report = app.report({ root: "project", format: "md" });
    assert.equal(report.format, "md");
    assert.match(report.text, /License scan/);

    const valid = app.validate({ manifest: manifest({ product: "Fixture" }) });
    assert.equal(valid.ok, true);
    const invalid = app.validate({ manifest: manifest({ spdx: "MIT AND" }) });
    assert.equal(invalid.ok, false);

    const fromPath = app.validate({ path: "project/legal/manifest.json" });
    assert.equal(fromPath.ok, true);
    assert.equal(fromPath.file, "project/legal/manifest.json");

    const suite = app.suite({ root: "." });
    assert.equal(suite.ok, true);
  } finally {
    cleanup(root);
  }
});

test("rejects paths outside the workspace", () => {
  const root = fixture();
  try {
    const app = createApp({ root: REPO, workspace: root });
    assert.throws(
      () => app.scan({ root: ".." }),
      (error) => error instanceof AppError && error.code === "outside-workspace",
    );
    assert.throws(
      () => app.validate({ path: "../outside.json" }),
      (error) => error instanceof AppError && error.code === "outside-workspace",
    );
    assert.throws(
      () => app.report({ root: "project", format: "pdf" }),
      (error) => error instanceof AppError && error.code === "unknown-format",
    );
  } finally {
    cleanup(root);
  }
});

test("does not require a workspace for the CLI core", () => {
  const app = createApp({ root: REPO });
  const info = app.info();
  assert.equal(info.workspaceJail, false);
  assert.equal(app.version(), "0.1.0");
  assert.equal(fs.existsSync(app.root()), true);
});
