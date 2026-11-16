"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { render, toHtml, toJson, toMarkdown } = require("../src/report");

const result = {
  tool: "QA License Scanner",
  version: "0.1.0",
  generatedAt: "2026-11-16T00:00:00.000Z",
  root: "fixture",
  modules: ["npm"],
  summary: { total: 2, allowed: 1, review: 0, blocked: 1, unknown: 0, result: "fail" },
  findings: [
    {
      name: "safe",
      version: "1.0.0",
      license: "MIT",
      scope: "runtime",
      source: "package-lock.json",
      path: "package-lock.json",
      confidence: "high",
      module: "npm",
      policy: { status: "allowed", reason: "allowed by policy" },
    },
    {
      name: "<script>alert(1)</script>",
      version: "",
      license: "GPL-3.0-only",
      scope: "dependency",
      source: "package-lock.json",
      path: "package-lock.json",
      confidence: "high",
      module: "npm",
      policy: { status: "blocked", reason: "blocked by policy" },
    },
  ],
  notes: ["a note with <b>markup</b>"],
};

test("renders JSON, Markdown, and self-contained HTML", () => {
  const json = JSON.parse(toJson(result));
  assert.equal(json.summary.result, "fail");
  const markdown = toMarkdown(result);
  assert.match(markdown, /License scan/);
  assert.match(markdown, /blocked/);
  const html = toHtml(result);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /a note with &lt;b&gt;markup&lt;\/b&gt;/);
});

test("rejects unknown report formats", () => {
  assert.throws(() => render(result, "pdf"), /unknown format/);
});
