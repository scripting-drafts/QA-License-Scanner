"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { manifest } = require("./helpers");
const { validateManifest } = require("../src/validate");

test("accepts a complete manifest", () => {
  assert.deepEqual(validateManifest(manifest()), []);
});

test("rejects missing and malformed fields", () => {
  const errors = validateManifest(manifest({
    product: "",
    spdx: "MIT AND",
    source: "http://example.com",
    lastReviewed: "2026-02-31",
  }));
  assert.ok(errors.some((error) => error.startsWith("product:")));
  assert.ok(errors.some((error) => error.startsWith("spdx:")));
  assert.ok(errors.some((error) => error.startsWith("source:")));
  assert.ok(errors.some((error) => error.startsWith("lastReviewed:")));
});

test("rejects document path traversal and duplicate IDs", () => {
  const errors = validateManifest(manifest({
    documents: [
      { id: "license", label: "License", path: "../LICENSE", kind: "text" },
      { id: "license", label: "Again", path: "LICENSE", kind: "text" },
    ],
  }));
  assert.ok(errors.some((error) => error.includes("path")));
  assert.ok(errors.some((error) => error.includes("unique")));
});

test("rejects invalid scopes, kinds, and review statuses", () => {
  const errors = validateManifest(manifest({
    components: [{
      id: "x", name: "X", license: "MIT", scope: "unknown",
    }],
    documents: [{ id: "x", label: "X", path: "X", kind: "binary" }],
    reviews: [{
      id: "x", category: "legal", status: "done", date: "2026-11-16", note: "",
    }],
  }));
  assert.ok(errors.some((error) => error.includes("scope")));
  assert.ok(errors.some((error) => error.includes("kind")));
  assert.ok(errors.some((error) => error.includes("category")));
  assert.ok(errors.some((error) => error.includes("status")));
});
