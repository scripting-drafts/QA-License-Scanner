"use strict";

const path = require("node:path");
const { readText, relativePath, uniqueBy, walkFiles } = require("../util");

function buildFiles(root) {
  const names = new Set([
    "Makefile", "makefile", "GNUmakefile", "CMakeLists.txt", "meson.build",
  ]);
  return walkFiles(root, { maxFiles: 800 }).filter((file) => {
    const base = path.basename(file);
    return names.has(base) || base.endsWith(".mk") || base.endsWith(".cmake");
  });
}

function tokens(value) {
  return String(value)
    .replace(/[(),]/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function knownLibraries(text, systemLibraries) {
  const found = new Set();
  for (const match of text.matchAll(/pkg-config\s+([^\n)]*)/g)) {
    for (const token of tokens(match[1])) {
      if (systemLibraries[token]) found.add(token);
    }
  }
  for (const match of text.matchAll(/pkg_check_modules\s*\(([^)]*)\)/g)) {
    for (const token of tokens(match[1])) {
      if (systemLibraries[token]) found.add(token);
    }
  }
  for (const match of text.matchAll(/dependency\s*\(\s*['"]([^'"]+)['"]/g)) {
    if (systemLibraries[match[1]]) found.add(match[1]);
  }
  for (const match of text.matchAll(/find_package\s*\(\s*([A-Za-z0-9_.+-]+)/g)) {
    const name = match[1].toLowerCase();
    if (systemLibraries[name]) found.add(name);
  }
  return found;
}

function detect(root) {
  return buildFiles(root).length > 0;
}

function scan(root, ctx) {
  const findings = [];
  const notes = [];
  const unknown = new Set();
  for (const file of buildFiles(root)) {
    let text;
    try {
      text = readText(file, 512 * 1024);
    } catch (error) {
      notes.push(`${relativePath(root, file)}: ${error.message}`);
      continue;
    }
    const found = knownLibraries(text, ctx.policy.systemLibraries);
    for (const key of found) {
      const library = ctx.policy.systemLibraries[key];
      findings.push({
        name: library.name,
        version: "",
        license: library.license,
        source: relativePath(root, file),
        path: relativePath(root, file),
        scope: "system",
        confidence: "medium",
        url: library.url,
      });
    }
    for (const match of text.matchAll(/pkg-config\s+([^\n)]*)/g)) {
      for (const token of tokens(match[1])) {
        if (!/^[a-z][a-z0-9+._-]*$/.test(token)) continue;
        if (["cflags", "libs", "pkg-config", "shell"].includes(token)) continue;
        if (!ctx.policy.systemLibraries[token]) unknown.add(token);
      }
    }
  }
  if (findings.length) {
    notes.push(
      "System library licenses are inferred from pkg-config/CMake/Meson names; " +
      "confirm against the host package metadata before redistribution.",
    );
  }
  if (unknown.size) {
    notes.push(`Unmapped build libraries: ${[...unknown].sort().join(", ")}`);
  }
  return {
    findings: uniqueBy(
      findings,
      (item) => `${item.name}|${item.license}|${item.source}`,
    ),
    notes,
  };
}

module.exports = {
  id: "c",
  label: "C/C++ build files and pkg-config system libraries",
  detect,
  scan,
};
