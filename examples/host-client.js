#!/usr/bin/env node
"use strict";

// Minimal host example: spawn the scanner RPC and request info, scan, report.
// Usage: node examples/host-client.js /path/to/workspace [project-name]

const path = require("node:path");
const readline = require("node:readline");
const { spawn } = require("node:child_process");

const workspace = path.resolve(process.argv[2] || process.cwd());
const project = process.argv[3] || ".";
const bin = path.join(__dirname, "..", "bin", "qa-license-scanner");

const child = spawn(process.execPath, [bin, "rpc", "--workspace", workspace], {
  stdio: ["pipe", "pipe", "pipe"],
});
child.stderr.on("data", (chunk) => process.stderr.write(chunk));

const pending = new Map();
const requests = [
  { id: "info", method: "info" },
  { id: "scan", method: "scan", params: { root: project } },
  { id: "report", method: "report", params: { root: project, format: "md" } },
];
let remaining = requests.length;

function send(request) {
  child.stdin.write(`${JSON.stringify(request)}\n`);
}

readline.createInterface({ input: child.stdout }).on("line", (line) => {
  let response;
  try {
    response = JSON.parse(line);
  } catch (_error) {
    process.stderr.write(`invalid response: ${line}\n`);
    return;
  }
  if (!response.ok) {
    process.stderr.write(`${response.error.code}: ${response.error.message}\n`);
    return;
  }
  if (response.id === "info") {
    process.stdout.write(
      `${response.data.name} ${response.data.version} (API ${response.data.apiVersion})\n`,
    );
  }
  if (response.id === "scan") {
    const summary = response.data.summary;
    process.stdout.write(
      `scan: ${summary.result}; ${summary.total} findings; ` +
      `${summary.allowed} allowed, ${summary.review} review, ${summary.blocked} blocked\n`,
    );
  }
  if (response.id === "report") {
    process.stdout.write(`report: ${response.data.text.split("\n")[0]}\n`);
  }
  pending.delete(response.id);
  remaining -= 1;
  if (remaining === 0) child.stdin.end();
});

child.on("close", (code) => {
  if (pending.size) process.stderr.write(`unanswered requests: ${pending.size}\n`);
  process.exitCode = code || 0;
});

for (const request of requests) {
  pending.set(request.id, request);
  send(request);
}
