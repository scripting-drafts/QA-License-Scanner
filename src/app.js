"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { listModules } = require("./modules");
const { loadPolicy } = require("./policy");
const { render } = require("./report");
const { scanProject } = require("./scan");
const { inspect } = require("./suite");
const { validateFile, validateManifest } = require("./validate");
const {
  isWithin,
  readJson,
  realpathOrNull,
  relativePath,
} = require("./util");

const APP_ROOT = path.join(__dirname, "..");
const APP_MANIFEST = "app.manifest.json";
const FORMATS = new Set(["json", "md", "html"]);

class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

function readMeta(root = APP_ROOT) {
  return readJson(path.join(root, "package.json"), 128 * 1024);
}

function readManifest(root = APP_ROOT) {
  return readJson(path.join(root, APP_MANIFEST), 128 * 1024);
}

function requireDirectory(target, label) {
  const real = realpathOrNull(target);
  if (!real) throw new AppError("not-found", `${label} does not exist`);
  let stat;
  try {
    stat = fs.statSync(real);
  } catch (_error) {
    throw new AppError("not-found", `${label} does not exist`);
  }
  if (!stat.isDirectory()) {
    throw new AppError("not-directory", `${label} is not a directory`);
  }
  return real;
}

function requireFile(target, label) {
  const real = realpathOrNull(target);
  if (!real) throw new AppError("not-found", `${label} does not exist`);
  let stat;
  try {
    stat = fs.statSync(real);
  } catch (_error) {
    throw new AppError("not-found", `${label} does not exist`);
  }
  if (!stat.isFile()) throw new AppError("not-file", `${label} is not a file`);
  return real;
}

function createApp(options = {}) {
  const root = path.resolve(options.root || APP_ROOT);
  const meta = readMeta(root);
  const manifest = readManifest(root);
  const workspace = options.workspace
    ? requireDirectory(options.workspace, "workspace")
    : "";

  function withinWorkspace(target, label = "path") {
    const resolved = path.resolve(target);
    if (workspace && resolved !== workspace &&
        !resolved.startsWith(workspace + path.sep)) {
      throw new AppError(
        "outside-workspace",
        `${label} is outside the configured workspace`,
      );
    }
    const real = realpathOrNull(resolved);
    if (!real) throw new AppError("not-found", `${label} does not exist`);
    if (workspace && !isWithin(workspace, real)) {
      throw new AppError(
        "outside-workspace",
        `${label} is outside the configured workspace`,
      );
    }
    return real;
  }

  function resolveProjectRoot(input) {
    let candidate;
    if (!input) {
      candidate = workspace || process.cwd();
    } else {
      candidate = path.isAbsolute(input)
        ? input
        : path.resolve(workspace || process.cwd(), input);
    }
    return requireDirectory(withinWorkspace(candidate, "scan root"), "scan root");
  }

  function resolvePolicyFile(input) {
    if (!input) return "";
    const candidate = path.isAbsolute(input)
      ? input
      : path.resolve(workspace || process.cwd(), input);
    return requireFile(withinWorkspace(candidate, "policy file"), "policy file");
  }

  function info() {
    return {
      apiVersion: manifest.apiVersion,
      id: manifest.id,
      name: meta.productName || manifest.name,
      version: meta.version,
      kind: manifest.kind,
      description: manifest.description,
      entrypoints: manifest.entrypoints,
      protocol: manifest.protocol,
      capabilities: manifest.capabilities,
      reportFormats: manifest.reportFormats,
      ui: manifest.ui,
      host: manifest.host,
      security: manifest.security,
      workspaceJail: Boolean(workspace),
    };
  }

  function modules() {
    return listModules();
  }

  function policy(params = {}) {
    const loaded = loadPolicy(resolvePolicyFile(params.policyFile));
    return {
      allowed: [...loaded.allowed].sort(),
      review: [...loaded.review].sort(),
      blocked: [...loaded.blocked].sort(),
      systemLibraries: Object.keys(loaded.systemLibraries).sort(),
    };
  }

  function scan(params = {}) {
    const target = resolveProjectRoot(params.root);
    return scanProject(target, {
      policyFile: resolvePolicyFile(params.policyFile),
    });
  }

  function report(params = {}) {
    const format = String(params.format || "md").toLowerCase();
    if (!FORMATS.has(format)) {
      throw new AppError("unknown-format", `unknown report format: ${format}`);
    }
    const result = scan(params);
    return {
      format,
      text: render(result, format),
      summary: result.summary,
      root: result.root,
    };
  }

  function validate(params = {}) {
    if (params.manifest && typeof params.manifest === "object") {
      const errors = validateManifest(params.manifest);
      return { ok: errors.length === 0, errors, source: "manifest" };
    }
    if (typeof params.path !== "string" || !params.path) {
      throw new AppError(
        "invalid-request",
        "validate requires a manifest object or a path",
      );
    }
    const candidate = path.isAbsolute(params.path)
      ? params.path
      : path.resolve(workspace || process.cwd(), params.path);
    const real = requireFile(withinWorkspace(candidate, "manifest"), "manifest");
    const { errors } = validateFile(real);
    return {
      ok: errors.length === 0,
      errors,
      source: "path",
      file: workspace ? relativePath(workspace, real) : String(params.path),
    };
  }

  function suite(params = {}) {
    const target = params.root
      ? resolveProjectRoot(params.root)
      : requireDirectory(
        withinWorkspace(workspace || path.resolve(root, ".."), "suite root"),
        "suite root",
      );
    return inspect(target);
  }

  return {
    info,
    modules,
    policy,
    render(result, format) {
      const normalized = String(format || "md").toLowerCase();
      if (!FORMATS.has(normalized)) {
        throw new AppError("unknown-format", `unknown report format: ${normalized}`);
      }
      return render(result, normalized);
    },
    report,
    scan,
    suite,
    validate,
    appManifest() {
      return manifest;
    },
    version() {
      return meta.version;
    },
    root() {
      return root;
    },
    workspace() {
      return workspace;
    },
  };
}

module.exports = {
  APP_MANIFEST,
  APP_ROOT,
  AppError,
  FORMATS,
  createApp,
  readManifest,
  readMeta,
};
