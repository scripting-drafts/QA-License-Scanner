"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { readJson, readText } = require("./util");
const { validateManifest } = require("./validate");

const PROJECTS = [
  {
    id: "qa-dashboard",
    dir: "QA-Dashboard",
    label: "QA Dashboard",
    versionFile: "package.json",
    versionKind: "json",
  },
  {
    id: "qa-sentinels",
    dir: "QA-Sentinels",
    label: "QA Sentinels",
    versionFile: "sentinels/__init__.py",
    versionKind: "regex",
    versionPattern: /__version__\s*=\s*"([^"]+)"/,
  },
  {
    id: "qa-siem",
    dir: "QA-SIEM",
    label: "QA SIEM",
    versionFile: "src/server.h",
    versionKind: "regex",
    versionPattern: /#define QA_SIEM_VERSION\s+"([^"]+)"/,
  },
  {
    id: "qa-license-scanner",
    dir: "QA-License-Scanner",
    label: "QA License Scanner",
    versionFile: "package.json",
    versionKind: "json",
  },
];

function readVersion(root, project) {
  const file = path.join(root, project.dir, project.versionFile);
  if (project.versionKind === "json") {
    const data = readJson(file, 512 * 1024);
    return String(data.version || "");
  }
  const text = readText(file, 512 * 1024);
  const match = project.versionPattern.exec(text);
  return match ? String(match[1]) : "";
}

function inspect(root) {
  const projects = [];
  const errors = [];
  const versions = new Map();
  for (const project of PROJECTS) {
    const dir = path.join(root, project.dir);
    if (!fs.existsSync(dir)) continue;
    const record = {
      id: project.id,
      label: project.label,
      dir: project.dir,
      version: "",
      reviewedVersion: "",
      spdx: "",
      companions: [],
      status: "ok",
      errors: [],
    };
    try {
      record.version = readVersion(root, project);
      versions.set(project.id, record.version);
    } catch (error) {
      record.errors.push(`version: ${error.message}`);
    }
    const manifestFile = path.join(dir, "legal", "manifest.json");
    try {
      const manifest = readJson(manifestFile, 4 * 1024 * 1024);
      const manifestErrors = validateManifest(manifest);
      if (manifestErrors.length) {
        record.errors.push(...manifestErrors.slice(0, 5));
      } else {
        record.reviewedVersion = String(manifest.reviewedVersion || "");
        record.spdx = String(manifest.spdx || "");
        record.companions = (manifest.components || [])
          .filter((component) => component.scope === "companion")
          .map((component) => ({
            id: component.id,
            name: component.name,
            version: String(component.version || ""),
          }));
        for (const document of manifest.documents || []) {
          const target = path.resolve(dir, document.path);
          const real = path.resolve(dir);
          if (target !== real && !target.startsWith(real + path.sep)) {
            record.errors.push(`document escapes repository: ${document.path}`);
          } else if (document.kind !== "external" && !fs.existsSync(target)) {
            record.errors.push(`missing document: ${document.path}`);
          }
        }
        if (record.version && record.reviewedVersion !== record.version) {
          record.errors.push(
            `reviewedVersion ${record.reviewedVersion} != product version ${record.version}`,
          );
        }
      }
    } catch (error) {
      record.errors.push(`manifest: ${error.message}`);
    }
    record.status = record.errors.length ? "action" : "ok";
    if (record.errors.length) {
      errors.push(`${project.label}: ${record.errors.join("; ")}`);
    }
    projects.push(record);
  }

  for (const project of projects) {
    for (const companion of project.companions) {
      const actual = versions.get(companion.id);
      if (actual && companion.version && actual !== companion.version) {
        const message = `${project.label} references ${companion.name} ${companion.version}, but the suite has ${actual}`;
        project.errors.push(message);
        project.status = "action";
        errors.push(message);
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    ok: errors.length === 0,
    projects,
    errors,
  };
}

function printSuite(data) {
  const rows = data.projects || [];
  const width = Math.max(...rows.map((row) => row.label.length), 7);
  process.stdout.write(
    `${"product".padEnd(width)}  ${"version".padEnd(8)}  ${"manifest".padEnd(8)}  status\n`,
  );
  for (const row of rows) {
    process.stdout.write(
      `${row.label.padEnd(width)}  ${(row.version || "—").padEnd(8)}  ` +
      `${(row.reviewedVersion || "—").padEnd(8)}  ${row.status}\n`,
    );
    for (const error of row.errors) {
      process.stdout.write(`  - ${error}\n`);
    }
  }
  process.stdout.write(
    `\nsuite: ${data.ok ? "ok" : "action needed"} (${rows.length} projects)\n`,
  );
}

module.exports = {
  PROJECTS,
  inspect,
  printSuite,
};
