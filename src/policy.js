"use strict";

const path = require("node:path");
const { normalizeLicense, readJson } = require("./util");

const DATA_FILE = path.join(__dirname, "..", "data", "licenses.json");
const RANK = { allowed: 0, review: 1, blocked: 2 };

function loadDefaults() {
  const data = readJson(DATA_FILE);
  return {
    allowed: new Set(data.policy.allowed),
    review: new Set(data.policy.review),
    blocked: new Set(data.policy.blocked),
    aliases: data.aliases || {},
    systemLibraries: data.systemLibraries || {},
    licenseFileNames: data.licenseFileNames || [],
    licenseSignatures: data.licenseSignatures || [],
  };
}

function loadPolicy(file) {
  if (!file) return loadDefaults();
  const data = readJson(file);
  const policy = data.policy && typeof data.policy === "object" ? data.policy : data;
  for (const key of ["allowed", "review", "blocked"]) {
    if (!Array.isArray(policy[key])) {
      throw new Error(`policy file is missing an array: ${key}`);
    }
  }
  return {
    ...loadDefaults(),
    allowed: new Set(policy.allowed),
    review: new Set(policy.review),
    blocked: new Set(policy.blocked),
  };
}

function classifyAtom(license, policy) {
  const text = normalizeLicense(license, policy.aliases);
  if (text === "UNKNOWN") {
    return { status: "blocked", reason: "unknown or missing license" };
  }
  if (text === "UNLICENSED") {
    return { status: "blocked", reason: "explicitly unlicensed" };
  }
  if (policy.blocked.has(text)) {
    return { status: "blocked", reason: "blocked by policy" };
  }
  if (policy.review.has(text)) {
    return { status: "review", reason: "requires review" };
  }
  if (policy.allowed.has(text)) {
    return { status: "allowed", reason: "allowed by policy" };
  }
  if (text.startsWith("LicenseRef-")) {
    if (text === "LicenseRef-Public-Domain") {
      return { status: "allowed", reason: "public domain" };
    }
    return { status: "review", reason: "custom license reference" };
  }
  return { status: "review", reason: "not in the policy table" };
}

function classify(license, policy) {
  const text = normalizeLicense(license, policy.aliases);
  const orParts = text.split(/\s+OR\s+/);
  const partResults = orParts.map((part) => {
    const andParts = part.split(/\s+AND\s+/);
    const atoms = andParts.map((atom) => {
      const [base] = atom.split(/\s+WITH\s+/);
      return classifyAtom(base, policy);
    });
    if (!atoms.length) return { status: "blocked", reason: "empty expression" };
    if (atoms.some((item) => item.status === "blocked")) {
      return {
        status: "blocked",
        reason: atoms.find((item) => item.status === "blocked").reason,
      };
    }
    if (atoms.some((item) => item.status === "review")) {
      return {
        status: "review",
        reason: atoms.find((item) => item.status === "review").reason,
      };
    }
    return { status: "allowed", reason: "all components allowed" };
  });
  if (!partResults.length) return { status: "blocked", reason: "empty expression" };
  const best = partResults
    .slice()
    .sort((left, right) => RANK[left.status] - RANK[right.status])[0];
  return {
    license: text,
    status: best.status,
    reason: best.reason,
    alternatives: partResults.map((item) => item.status),
  };
}

function applyPolicy(findings, policy) {
  return findings.map((finding) => {
    const result = classify(finding.license, policy);
    return {
      ...finding,
      license: result.license,
      policy: {
        status: result.status,
        reason: result.reason,
      },
    };
  });
}

function summarize(findings) {
  const summary = {
    total: findings.length,
    allowed: 0,
    review: 0,
    blocked: 0,
    unknown: 0,
  };
  for (const finding of findings) {
    const status = finding.policy?.status || "blocked";
    if (status === "allowed") summary.allowed += 1;
    else if (status === "review") summary.review += 1;
    else summary.blocked += 1;
    if (finding.license === "UNKNOWN") summary.unknown += 1;
  }
  summary.result = summary.blocked > 0 ? "fail" : summary.review > 0 ? "review" : "pass";
  return summary;
}

module.exports = {
  applyPolicy,
  classify,
  loadDefaults,
  loadPolicy,
  summarize,
};
