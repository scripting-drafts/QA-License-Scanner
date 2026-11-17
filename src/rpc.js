"use strict";

const os = require("node:os");
const readline = require("node:readline");
const { AppError } = require("./app");

const API_VERSION = 1;
const MAX_LINE = 1024 * 1024;

function redact(message, workspace) {
  let text = String(message || "request failed");
  if (workspace) text = text.split(workspace).join("<workspace>");
  const home = os.homedir();
  if (home) text = text.split(home).join("~");
  return text;
}

function response(id, data) {
  return { apiVersion: API_VERSION, id: id ?? null, ok: true, data };
}

function failure(id, code, message) {
  return {
    apiVersion: API_VERSION,
    id: id ?? null,
    ok: false,
    error: { code, message },
  };
}

function dispatch(app, method, params) {
  switch (method) {
    case "info":
      return app.info();
    case "modules":
      return app.modules();
    case "policy":
      return app.policy(params);
    case "scan":
      return app.scan(params);
    case "validate":
      return app.validate(params);
    case "suite":
      return app.suite(params);
    case "report":
      return app.report(params);
    default:
      throw new AppError("unknown-method", `unknown method: ${method}`);
  }
}

function parseRequest(line) {
  if (line.length > MAX_LINE) {
    throw new AppError("request-too-large", "request exceeds the line limit");
  }
  let request;
  try {
    request = JSON.parse(line);
  } catch (_error) {
    throw new AppError("invalid-json", "request is not valid JSON");
  }
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new AppError("invalid-request", "request must be a JSON object");
  }
  if (!["string", "number", "null", "undefined"].includes(typeof request.id)) {
    throw new AppError("invalid-request", "request id must be a string or number");
  }
  if (typeof request.method !== "string" || !request.method) {
    throw new AppError("invalid-request", "request method is required");
  }
  const params = request.params ?? {};
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new AppError("invalid-request", "request params must be an object");
  }
  return {
    id: request.id ?? null,
    method: request.method,
    params,
  };
}

function startRpc(app, options = {}) {
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const workspace = app.workspace ? app.workspace() : "";
  const reader = readline.createInterface({
    input,
    crlfDelay: Infinity,
    terminal: false,
  });

  reader.on("line", (line) => {
    if (!line.trim()) return;
    let request;
    try {
      request = parseRequest(line);
    } catch (error) {
      output.write(`${JSON.stringify(failure(
        null,
        error.code || "invalid-request",
        redact(error.message, workspace),
      ))}\n`);
      return;
    }
    try {
      const data = dispatch(app, request.method, request.params);
      output.write(`${JSON.stringify(response(request.id, data))}\n`);
    } catch (error) {
      output.write(`${JSON.stringify(failure(
        request.id,
        error.code || "error",
        redact(error.message, workspace),
      ))}\n`);
    }
  });

  return reader;
}

module.exports = {
  API_VERSION,
  MAX_LINE,
  dispatch,
  failure,
  parseRequest,
  redact,
  response,
  startRpc,
};
