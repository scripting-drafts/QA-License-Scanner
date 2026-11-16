"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_BYTES = 256 * 1024;

const DEFAULT_IGNORES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".venv",
  "venv",
  "dist",
  "build",
  "target",
  "toolchain",
  "evidence",
  "triage",
  "journal",
  "reports",
  "tickets",
  "var",
  "vendor",
]);

function realpathOrNull(target) {
  try {
    return fs.realpathSync(target);
  } catch (_error) {
    return null;
  }
}

function isWithin(root, target) {
  const realRoot = realpathOrNull(root);
  const realTarget = realpathOrNull(target);
  if (!realRoot || !realTarget) return false;
  return realTarget === realRoot || realTarget.startsWith(realRoot + path.sep);
}

function readText(file, maxBytes = MAX_TEXT_BYTES) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    throw new Error(`cannot read ${file}: ${error.message}`);
  }
  if (stat.isSymbolicLink()) throw new Error(`refusing symlink: ${file}`);
  if (!stat.isFile()) throw new Error(`not a regular file: ${file}`);
  if (stat.size > maxBytes) throw new Error(`file too large: ${file}`);
  return fs.readFileSync(file, "utf8");
}

function readJson(file, maxBytes = MAX_JSON_BYTES) {
  const text = readText(file, maxBytes);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid JSON in ${file}: ${error.message}`);
  }
}

function readJsonIfExists(file, maxBytes = MAX_JSON_BYTES) {
  try {
    return readJson(file, maxBytes);
  } catch (error) {
    if (error.code === "ENOENT" || /ENOENT/.test(error.message)) return null;
    throw error;
  }
}

function relativePath(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function walkFiles(root, options = {}) {
  const maxFiles = options.maxFiles || 4000;
  const ignores = new Set([...DEFAULT_IGNORES, ...(options.ignore || [])]);
  const results = [];
  const rootReal = realpathOrNull(root);
  if (!rootReal) throw new Error(`not a directory: ${root}`);
  const stack = [rootReal];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_error) {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (ignores.has(entry.name)) continue;
        stack.push(path.join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      results.push(path.join(dir, entry.name));
      if (results.length >= maxFiles) {
        results.sort();
        return results;
      }
    }
  }
  results.sort();
  return results;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeMarkdown(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/([`*_\[\]<>|])/g, "\\$1")
    .replace(/\r?\n/g, " ");
}

function uniqueBy(items, key) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const value = typeof key === "function" ? key(item) : item[key];
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(item);
  }
  return out;
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function normalizeLicense(value, aliases = {}) {
  if (value == null) return "UNKNOWN";
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => normalizeLicense(item, aliases))
      .filter((item) => item && item !== "UNKNOWN");
    return parts.length ? parts.join(" OR ") : "UNKNOWN";
  }
  if (typeof value === "object") {
    if (typeof value.type === "string") return normalizeLicense(value.type, aliases);
    if (typeof value.name === "string") return normalizeLicense(value.name, aliases);
    return "UNKNOWN";
  }
  const text = String(value).trim();
  if (!text) return "UNKNOWN";
  if (aliases[text]) return aliases[text];
  const upper = text.toUpperCase();
  if (upper === "UNKNOWN" || upper === "UNLICENSED" || upper === "NONE") {
    return upper === "NONE" ? "UNKNOWN" : upper;
  }
  if (/^[A-Za-z0-9.+-]+(?: (?:AND|OR|WITH) [A-Za-z0-9.+-]+)*$/.test(text)) {
    return text;
  }
  return "UNKNOWN";
}

function isHttpsUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

module.exports = {
  DEFAULT_IGNORES,
  MAX_JSON_BYTES,
  MAX_TEXT_BYTES,
  escapeHtml,
  escapeMarkdown,
  isHttpsUrl,
  isWithin,
  normalizeId,
  normalizeLicense,
  readJson,
  readJsonIfExists,
  readText,
  realpathOrNull,
  relativePath,
  todayUtc,
  uniqueBy,
  walkFiles,
};
