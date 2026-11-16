"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { readText, uniqueBy } = require("../util");

const REQ_RE = /^([A-Za-z0-9_.-]+)\s*(?:\[[^\]]+\])?\s*(.*)$/;

function cleanRequirement(line, scope, source) {
  let text = String(line).trim();
  if (!text || text.startsWith("#")) return null;
  text = text.replace(/\s+#.*$/, "").trim();
  if (!text || text.startsWith("-")) return null;
  if (/^(?:git\+|https?:|file:|ssh:)/i.test(text)) return null;
  text = text.split(";")[0].trim();
  const match = REQ_RE.exec(text);
  if (!match) return null;
  const name = match[1];
  if (!name || name.toLowerCase() === "python") return null;
  let version = match[2].trim();
  version = version.replace(/^[<>=!~^]+\s*/, "").replace(/,.*$/, "").trim();
  return {
    name,
    version,
    license: "UNKNOWN",
    source,
    path: source,
    scope,
    confidence: "low",
  };
}

function parseRequirements(text, scope, source) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const item = cleanRequirement(line, scope, source);
    if (item) out.push(item);
  }
  return out;
}

function tomlArrayItems(text, startIndex) {
  const items = [];
  let depth = 0;
  let current = "";
  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        if (current.trim()) items.push(current.trim());
        break;
      }
    }
    if (char === '"' || char === "'") {
      const quote = char;
      let value = "";
      index += 1;
      while (index < text.length && text[index] !== quote) {
        value += text[index];
        index += 1;
      }
      current += value;
      continue;
    }
    if (char === "," && depth === 1) {
      if (current.trim()) items.push(current.trim());
      current = "";
      continue;
    }
    if (depth >= 1) current += char;
  }
  return items;
}

function parsePyproject(text, source) {
  const out = [];
  const projectMatch = /\[project\][\s\S]*?dependencies\s*=\s*\[/m.exec(text);
  if (projectMatch) {
    const start = projectMatch.index + projectMatch[0].length - 1;
    for (const item of tomlArrayItems(text, start)) {
      const parsed = cleanRequirement(item, "runtime", source);
      if (parsed) out.push(parsed);
    }
  }
  const optionalSection = /\[project\.optional-dependencies\]([\s\S]*?)(?=\n\[|$)/
    .exec(text);
  if (optionalSection) {
    const base = optionalSection.index + optionalSection[0].indexOf(optionalSection[1]);
    for (const arrayMatch of optionalSection[1].matchAll(/=\s*\[/g)) {
      const start = base + arrayMatch.index + arrayMatch[0].length - 1;
      for (const item of tomlArrayItems(text, start)) {
        const parsed = cleanRequirement(item, "runtime", source);
        if (parsed) out.push(parsed);
      }
    }
  }
  let section = "";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      section = header[1].trim();
      continue;
    }
    if (!/^[A-Za-z0-9_.-]+\s*=/.test(line)) continue;
    const isPoetry = section === "tool.poetry.dependencies" ||
      section === "tool.poetry.dev-dependencies" ||
      /^tool\.poetry\.group\.[^.]+\.dependencies$/.test(section);
    if (!isPoetry) continue;
    const name = line.split("=")[0].trim();
    if (!name || name.toLowerCase() === "python") continue;
    const scope = section.includes("dev") || section.includes("group.")
      ? "build" : "runtime";
    out.push({
      name,
      version: "",
      license: "UNKNOWN",
      source,
      path: source,
      scope,
      confidence: "low",
    });
  }
  return out;
}

function parsePipfile(text, source) {
  const out = [];
  let section = "";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      section = header[1].trim();
      continue;
    }
    if (section !== "packages" && section !== "dev-packages") continue;
    const match = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
    if (!match || match[1].toLowerCase() === "python_version") continue;
    const scope = section === "dev-packages" ? "build" : "runtime";
    const rawVersion = match[2].replace(/["']/g, "").trim();
    out.push({
      name: match[1],
      version: rawVersion,
      license: "UNKNOWN",
      source,
      path: source,
      scope,
      confidence: "low",
    });
  }
  return out;
}

function detect(root) {
  return ["requirements.txt", "pyproject.toml", "Pipfile"].some(
    (name) => fs.existsSync(path.join(root, name)),
  );
}

function scan(root, _ctx) {
  const findings = [];
  const notes = [];
  const files = ["requirements.txt", "pyproject.toml", "Pipfile"];
  for (const name of files) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    try {
      const text = readText(file, 512 * 1024);
      if (name === "requirements.txt") {
        findings.push(...parseRequirements(text, "runtime", name));
      } else if (name === "pyproject.toml") {
        findings.push(...parsePyproject(text, name));
      } else {
        findings.push(...parsePipfile(text, name));
      }
    } catch (error) {
      notes.push(`${name}: ${error.message}`);
    }
  }
  if (findings.length) {
    notes.push(
      "Python dependency licenses are not declared in requirements files; " +
      "install the environment or query the package metadata to confirm them.",
    );
  }
  return {
    findings: uniqueBy(
      findings,
      (item) => `${item.name}|${item.version}|${item.source}`,
    ),
    notes,
  };
}

module.exports = {
  id: "python",
  label: "Python requirements.txt / pyproject.toml / Pipfile",
  detect,
  scan,
};
