"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const { inspect } = require("../src/suite");
const { cleanup, manifest, tempDir, write } = require("./helpers");

const VERSIONS = {
  "QA-Dashboard": "0.4.0",
  "QA-Sentinels": "1.2.0",
  "QA-SIEM": "1.1.0",
  "QA-License-Scanner": "0.1.0",
};

function suiteManifest(product, version) {
  return manifest({
    product,
    source: `https://example.com/${product.toLowerCase()}`,
    reviewedVersion: version,
    components: [
      { id: "project", name: product, version, license: "MIT", scope: "project" },
      ...Object.entries(VERSIONS)
        .filter(([label]) => label !== product)
        .map(([label, companionVersion]) => ({
          id: label.toLowerCase(),
          name: label,
          version: companionVersion,
          license: "MIT",
          scope: "companion",
        })),
    ],
  });
}

function writeProject(root, dir, version) {
  const base = path.join(root, dir);
  if (dir === "QA-Dashboard" || dir === "QA-License-Scanner") {
    write(root, `${dir}/package.json`, JSON.stringify({ version }));
  } else if (dir === "QA-Sentinels") {
    write(root, `${dir}/sentinels/__init__.py`, `__version__ = "${version}"\n`);
  } else {
    write(root, `${dir}/src/server.h`, `#define QA_SIEM_VERSION "${version}"\n`);
  }
  write(root, `${dir}/LICENSE`, "MIT License\n");
  write(root, `${dir}/legal/manifest.json`, JSON.stringify(
    suiteManifest(dir, version),
  ));
  return base;
}

test("inspects a synchronized suite", (t) => {
  const root = tempDir();
  t.after(() => cleanup(root));
  for (const [dir, version] of Object.entries(VERSIONS)) {
    writeProject(root, dir, version);
  }
  const data = inspect(root);
  assert.equal(data.ok, true);
  assert.equal(data.projects.length, 4);
  assert.ok(data.projects.every((project) => project.status === "ok"));
});

test("reports version drift and stale companion references", (t) => {
  const root = tempDir();
  t.after(() => cleanup(root));
  for (const [dir, version] of Object.entries(VERSIONS)) {
    writeProject(root, dir, version);
  }
  write(root, "QA-SIEM/src/server.h", '#define QA_SIEM_VERSION "1.1.1"\n');
  const data = inspect(root);
  assert.equal(data.ok, false);
  assert.ok(data.errors.some((error) => error.includes("reviewedVersion")));
  assert.ok(data.errors.some((error) => error.includes("references QA-SIEM")));
});
