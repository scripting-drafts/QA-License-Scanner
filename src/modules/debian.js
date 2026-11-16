"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { normalizeLicense, readText, uniqueBy } = require("../util");

function parseStanzas(text) {
  const stanzas = [];
  let current = {};
  let lastKey = "";
  const flush = () => {
    if (Object.keys(current).length) stanzas.push(current);
    current = {};
    lastKey = "";
  };
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) {
      flush();
      continue;
    }
    if (/^\s/.test(rawLine) && lastKey) {
      current[lastKey] = `${current[lastKey]}\n${rawLine.trim()}`;
      continue;
    }
    const match = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/.exec(rawLine);
    if (!match) continue;
    lastKey = match[1];
    current[lastKey] = match[2];
  }
  flush();
  return stanzas;
}

function shortLicense(value) {
  return String(value || "").split(/\n/)[0].trim();
}

function detect(root) {
  return fs.existsSync(path.join(root, "debian", "copyright"));
}

function scan(root, ctx) {
  const file = path.join(root, "debian", "copyright");
  const text = readText(file, 1024 * 1024);
  const stanzas = parseStanzas(text);
  if (!stanzas.length) {
    return {
      findings: [],
      notes: ["debian/copyright is empty or not in machine-readable format."],
    };
  }
  const header = stanzas[0];
  const upstream = header["Upstream-Name"] || "";
  const findings = [];
  for (const stanza of stanzas) {
    if (!stanza.Files || !stanza.License) continue;
    const license = normalizeLicense(shortLicense(stanza.License), ctx.policy.aliases);
    const files = stanza.Files.trim();
    findings.push({
      name: files === "*" && upstream ? upstream : `Debian files: ${files}`,
      version: "",
      license,
      source: "debian/copyright",
      path: "debian/copyright",
      scope: files === "*" ? "project" : "shipped",
      confidence: license === "UNKNOWN" ? "low" : "high",
    });
  }
  if (!findings.length && header.License) {
    findings.push({
      name: upstream || "Debian package",
      version: "",
      license: normalizeLicense(shortLicense(header.License), ctx.policy.aliases),
      source: "debian/copyright",
      path: "debian/copyright",
      scope: "project",
      confidence: "medium",
    });
  }
  return {
    findings: uniqueBy(
      findings,
      (item) => `${item.name}|${item.license}|${item.scope}`,
    ),
    notes: findings.length
      ? []
      : ["debian/copyright has no Files/License stanzas."],
  };
}

module.exports = {
  id: "debian",
  label: "Debian machine-readable copyright",
  detect,
  scan,
};
