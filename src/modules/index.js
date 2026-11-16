"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { realpathOrNull } = require("../util");

const modules = [
  require("./npm"),
  require("./python"),
  require("./debian"),
  require("./c"),
  require("./files"),
];

function listModules() {
  return modules.map((module) => ({
    id: module.id,
    label: module.label,
  }));
}

function resolveRoot(root) {
  const resolved = realpathOrNull(path.resolve(root));
  if (!resolved || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`not a directory: ${root}`);
  }
  return resolved;
}

function scanAll(root, context) {
  const resolved = resolveRoot(root);
  const findings = [];
  const notes = [];
  const ran = [];
  for (const module of modules) {
    let detected = true;
    try {
      if (typeof module.detect === "function") {
        detected = module.detect(resolved, context);
      }
    } catch (error) {
      notes.push(`${module.id}: detect failed: ${error.message}`);
      continue;
    }
    if (!detected) continue;
    ran.push(module.id);
    try {
      const result = module.scan(resolved, context) || {};
      for (const finding of result.findings || []) {
        findings.push({ ...finding, module: module.id });
      }
      for (const note of result.notes || []) {
        notes.push(`${module.id}: ${note}`);
      }
    } catch (error) {
      notes.push(`${module.id}: scan failed: ${error.message}`);
    }
  }
  findings.sort((left, right) =>
    `${left.name}${left.version}${left.license}`.localeCompare(
      `${right.name}${right.version}${right.license}`,
    ));
  return { root: resolved, modules: ran, findings, notes };
}

module.exports = {
  listModules,
  resolveRoot,
  scanAll,
};
