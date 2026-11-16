"use strict";

const os = require("node:os");
const path = require("node:path");
const { scanAll } = require("./modules");
const { applyPolicy, loadPolicy, summarize } = require("./policy");
const { readJson } = require("./util");

const ROOT = path.join(__dirname, "..");
const META = readJson(path.join(ROOT, "package.json"), 128 * 1024);
const RANK = { blocked: 0, review: 1, allowed: 2 };

function cleanFinding(finding) {
  const out = {
    name: String(finding.name || "unknown"),
    version: String(finding.version || ""),
    license: String(finding.license || "UNKNOWN"),
    scope: String(finding.scope || "dependency"),
    source: String(finding.source || ""),
    path: String(finding.path || ""),
    confidence: String(finding.confidence || "low"),
    module: String(finding.module || ""),
  };
  if (finding.url && /^https:\/\//.test(finding.url)) out.url = finding.url;
  if (finding.policy) {
    out.policy = {
      status: String(finding.policy.status || "blocked"),
      reason: String(finding.policy.reason || ""),
    };
  }
  return out;
}

function safeRootLabel(root) {
  const base = path.basename(path.resolve(root));
  const username = os.userInfo().username;
  if (!base || base === username || base === process.env.USER ||
      base === "home" || base === "root") {
    return "project";
  }
  return base;
}

function scanProject(root, options = {}) {
  const policy = loadPolicy(options.policyFile);
  const result = scanAll(root, { policy });
  const withPolicy = applyPolicy(result.findings, policy).map(cleanFinding);
  withPolicy.sort((left, right) => {
    const rank = RANK[left.policy?.status] - RANK[right.policy?.status];
    if (rank) return rank;
    return `${left.name}${left.version}`.localeCompare(
      `${right.name}${right.version}`,
    );
  });
  const summary = summarize(withPolicy);
  return {
    tool: META.productName || META.name,
    version: META.version,
    generatedAt: new Date().toISOString(),
    root: safeRootLabel(result.root),
    modules: result.modules,
    summary,
    findings: withPolicy,
    notes: result.notes,
  };
}

module.exports = {
  scanProject,
};
