"use strict";

const path = require("node:path");
const {
  normalizeLicense,
  readJsonIfExists,
  relativePath,
  uniqueBy,
} = require("../util");

function packageNameFromKey(key) {
  const marker = "node_modules/";
  const index = key.lastIndexOf(marker);
  if (index < 0) return "";
  return key.slice(index + marker.length);
}

function packageLabel(name, version) {
  return version ? `${name}@${version}` : name;
}

function readInstalledLicense(root, name) {
  if (!name || name.includes("..") || name.startsWith("/")) return "";
  const file = path.join(root, "node_modules", ...name.split("/"), "package.json");
  const pkg = readJsonIfExists(file, 512 * 1024);
  if (!pkg) return "";
  return normalizeLicense(pkg.license ?? pkg.licenses);
}

function detect(root) {
  return readJsonIfExists(path.join(root, "package.json"), 512 * 1024) !== null;
}

function scan(root, ctx) {
  const findings = [];
  const notes = [];
  const manifestFile = path.join(root, "package.json");
  const lockFile = path.join(root, "package-lock.json");
  const pkg = readJsonIfExists(manifestFile, 512 * 1024);
  const lock = readJsonIfExists(lockFile, 4 * 1024 * 1024);
  const runtime = new Set(Object.keys(pkg?.dependencies || {}));
  const optional = new Set(Object.keys(pkg?.optionalDependencies || {}));
  const build = new Set(Object.keys(pkg?.devDependencies || {}));

  if (pkg) {
    findings.push({
      name: pkg.name || "package.json project",
      version: pkg.version || "",
      license: normalizeLicense(pkg.license ?? pkg.licenses, ctx.policy.aliases),
      source: "package.json",
      path: "package.json",
      scope: "project",
      confidence: pkg.license || pkg.licenses ? "high" : "low",
    });
  }

  if (lock?.packages && typeof lock.packages === "object") {
    for (const [key, entry] of Object.entries(lock.packages)) {
      if (!key || !entry || typeof entry !== "object") continue;
      if (entry.link) continue;
      const name = entry.name || packageNameFromKey(key);
      if (!name) continue;
      let license = normalizeLicense(
        entry.license ?? entry.licenses, ctx.policy.aliases,
      );
      if (license === "UNKNOWN") {
        license = readInstalledLicense(root, name) || "UNKNOWN";
      }
      let scope = "dependency";
      if (runtime.has(name) || optional.has(name)) scope = "runtime";
      else if (build.has(name)) scope = "build";
      findings.push({
        name,
        version: entry.version || "",
        license,
        source: "package-lock.json",
        path: relativePath(root, lockFile),
        scope,
        confidence: license === "UNKNOWN" ? "low" : "high",
      });
    }
  } else if (pkg) {
    for (const [name, version] of Object.entries(pkg.dependencies || {})) {
      findings.push({
        name,
        version: String(version),
        license: readInstalledLicense(root, name) || "UNKNOWN",
        source: "package.json",
        path: "package.json",
        scope: "runtime",
        confidence: "low",
      });
    }
    for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
      findings.push({
        name,
        version: String(version),
        license: readInstalledLicense(root, name) || "UNKNOWN",
        source: "package.json",
        path: "package.json",
        scope: "build",
        confidence: "low",
      });
    }
    if (!Object.keys(pkg.dependencies || {}).length &&
        !Object.keys(pkg.devDependencies || {}).length) {
      notes.push("package.json has no dependencies; only the project license was read.");
    }
  }

  const deduped = uniqueBy(
    findings.filter((item) => item.name),
    (item) => `${item.name}|${item.version}|${item.license}|${item.scope}`,
  );
  return { findings: deduped, notes };
}

module.exports = {
  id: "npm",
  label: "Node.js package.json / package-lock.json",
  detect,
  scan,
};
