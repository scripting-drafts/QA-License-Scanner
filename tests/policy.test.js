"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { classify, loadDefaults, summarize } = require("../src/policy");

const policy = loadDefaults();

test("classifies common permissive and copyleft licenses", () => {
  assert.equal(classify("MIT", policy).status, "allowed");
  assert.equal(classify("Apache 2.0", policy).status, "allowed");
  assert.equal(classify("ISC", policy).status, "allowed");
  assert.equal(classify("MPL-2.0", policy).status, "review");
  assert.equal(classify("GPL-3.0-only", policy).status, "blocked");
  assert.equal(classify("AGPL-3.0-only", policy).status, "blocked");
  assert.equal(classify("UNKNOWN", policy).status, "blocked");
  assert.equal(classify("UNLICENSED", policy).status, "blocked");
});

test("handles OR as best case and AND as worst case", () => {
  assert.equal(classify("MIT OR GPL-3.0-only", policy).status, "allowed");
  assert.equal(classify("MIT AND GPL-3.0-only", policy).status, "blocked");
  assert.equal(
    classify("MIT AND MPL-2.0", policy).status,
    "review",
  );
  assert.equal(
    classify("Apache-2.0 WITH LLVM-exception", policy).status,
    "allowed",
  );
});

test("unknown expressions are blocked and custom references are reviewed", () => {
  const unknown = classify("Proprietary", policy);
  assert.equal(unknown.status, "blocked");
  const custom = classify("LicenseRef-Custom", policy);
  assert.equal(custom.status, "review");
  assert.equal(classify("LicenseRef-Public-Domain", policy).status, "allowed");
});

test("summarizes policy outcomes", () => {
  const findings = [
    { license: "MIT", policy: { status: "allowed" } },
    { license: "MPL-2.0", policy: { status: "review" } },
    { license: "GPL-3.0-only", policy: { status: "blocked" } },
  ];
  const summary = summarize(findings);
  assert.equal(summary.total, 3);
  assert.equal(summary.allowed, 1);
  assert.equal(summary.review, 1);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.result, "fail");
});
