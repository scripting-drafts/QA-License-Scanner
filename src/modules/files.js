"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  normalizeLicense,
  readJson,
  readText,
  relativePath,
  uniqueBy,
  walkFiles,
} = require("../util");
const { validateManifest } = require("../validate");

const SOURCE_EXTENSIONS = new Set([
  ".c", ".h", ".cc", ".cpp", ".hpp", ".cs", ".go", ".java", ".js", ".kt",
  ".m", ".mm", ".php", ".py", ".rb", ".rs", ".sh", ".swift", ".ts", ".tsx",
  ".jsx", ".css", ".html",
]);

function signatureLicense(text, signatures) {
  for (const signature of signatures) {
    if (signature.patterns.every((pattern) => new RegExp(pattern, "i").test(text))) {
      return signature.id;
    }
  }
  return "";
}

function detect(_root) {
  return true;
}

function scan(root, ctx) {
  const findings = [];
  const notes = [];
  const files = walkFiles(root, { maxFiles: 4000 });
  const licenseNames = new Set(
    (ctx.policy.licenseFileNames || []).map((name) => name.toLowerCase()),
  );
  let licenseFiles = 0;
  for (const file of files) {
    const relative = relativePath(root, file);
    if (relative === "debian/copyright") continue;
    const base = path.basename(file);
    const lower = base.toLowerCase();
    let stat;
    try {
      stat = fs.lstatSync(file);
    } catch (_error) {
      continue;
    }
    if (!stat.isFile() || stat.size > 512 * 1024) continue;
    if (licenseNames.has(lower)) {
      licenseFiles += 1;
      try {
        const text = readText(file, 128 * 1024);
        const license = signatureLicense(text, ctx.policy.licenseSignatures);
        if (license) {
          findings.push({
            name: base,
            version: "",
            license,
            source: "license file",
            path: relativePath(root, file),
            scope: "project",
            confidence: "high",
          });
        } else {
          notes.push(`${relativePath(root, file)}: no recognized license signature.`);
        }
      } catch (error) {
        notes.push(`${relativePath(root, file)}: ${error.message}`);
      }
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    if (stat.size > 128 * 1024) continue;
    try {
      const text = readText(file, 8192);
      const header = text.split(/\r?\n/).slice(0, 40)
        .map((line) => /^\s*(?:\/\/|#|\/\*|\*|--|<!--)\s*SPDX-License-Identifier:\s*(.+?)\s*(?:\*\/|-->)?\s*$/i.exec(line))
        .find(Boolean);
      if (!header) continue;
      const license = normalizeLicense(header[1].trim(), ctx.policy.aliases);
      findings.push({
        name: "SPDX header",
        version: "",
        license,
        source: "source header",
        path: relativePath(root, file),
        scope: "project",
        confidence: license === "UNKNOWN" ? "low" : "high",
      });
    } catch (_error) {
      // Unreadable source files are skipped; the scanner is best-effort.
    }
  }
  if (!licenseFiles) {
    notes.push("No LICENSE, LICENCE, COPYING or COPYRIGHT file found at the project root.");
  }

  const manifestFile = path.join(root, "legal", "manifest.json");
  if (fs.existsSync(manifestFile)) {
    try {
      const manifest = readJson(manifestFile);
      const errors = validateManifest(manifest);
      if (errors.length) {
        notes.push(`legal/manifest.json is invalid: ${errors.slice(0, 3).join("; ")}`);
      } else {
        for (const component of manifest.components) {
          findings.push({
            name: component.name,
            version: component.version || "",
            license: component.license,
            source: "legal/manifest.json",
            path: "legal/manifest.json",
            scope: component.scope,
            confidence: "declared",
            url: component.url || "",
          });
        }
      }
    } catch (error) {
      notes.push(`legal/manifest.json: ${error.message}`);
    }
  }

  return {
    findings: uniqueBy(
      findings,
      (item) => `${item.name}|${item.version}|${item.license}|${item.path}`,
    ),
    notes,
  };
}

module.exports = {
  id: "files",
  label: "License files, SPDX headers, and own-product legal manifests",
  detect,
  scan,
};
