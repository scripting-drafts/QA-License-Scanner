"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const { AppError, createApp } = require("./app");
const { startRpc } = require("./rpc");
const { printSuite } = require("./suite");
const { readJson } = require("./util");

const ROOT = path.join(__dirname, "..");
const META = readJson(path.join(ROOT, "package.json"), 128 * 1024);

const HELP = `qa-license-scanner ${META.version}

Usage:
  qa-license-scanner info [--json]
  qa-license-scanner scan <path> [--format json|md|html]
                                  [--output FILE|-] [--policy FILE]
                                  [--workspace DIR] [--strict]
  qa-license-scanner validate <manifest.json...> [--json] [--workspace DIR]
  qa-license-scanner modules [--json]
  qa-license-scanner policy [--policy FILE] [--json]
  qa-license-scanner suite [--root DIR] [--workspace DIR] [--json]
  qa-license-scanner rpc --workspace DIR
  qa-license-scanner --version
  qa-license-scanner --help

RPC:
  The rpc adapter requires --workspace. It reads one JSON request per line on
  stdin and writes one JSON response per line on stdout. It never listens on a
  network socket and never executes project code.

Exit codes:
  0  no blocked licenses (or review only, without --strict)
  1  blocked licenses, invalid manifest, or review with --strict
  2  usage or read error

The scanner is offline. It reads local project metadata and never executes
project code. Reports use relative paths only.
`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  return 2;
}

function parse(argv) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      format: { type: "string", default: "md" },
      output: { type: "string" },
      policy: { type: "string" },
      root: { type: "string" },
      workspace: { type: "string" },
      strict: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
}

function appFor(parsed) {
  return createApp({
    root: ROOT,
    workspace: parsed.values.workspace,
  });
}

function writeReport(text, output) {
  if (!output || output === "-") {
    process.stdout.write(text);
    return;
  }
  const target = path.resolve(output);
  fs.writeFileSync(target, text, { mode: 0o600 });
  fs.chmodSync(target, 0o600);
  process.stdout.write(`report: ${path.basename(target)}\n`);
}

function cmdInfo(parsed) {
  const app = appFor(parsed);
  const info = app.info();
  if (parsed.values.json) {
    process.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(`${info.name} ${info.version}\n`);
  process.stdout.write(`api        : ${info.apiVersion}\n`);
  process.stdout.write(`kind       : ${info.kind}\n`);
  process.stdout.write(`protocol   : ${info.protocol.type}/${info.protocol.transport}\n`);
  process.stdout.write(`workspace  : ${info.workspaceJail ? "jailed" : "none"}\n`);
  process.stdout.write(`reports    : ${info.reportFormats.join(", ")}\n`);
  process.stdout.write(`capabilities: ${info.capabilities.join(", ")}\n`);
  return 0;
}

function cmdScan(parsed) {
  const app = appFor(parsed);
  const target = parsed.positionals[0] || ".";
  const format = String(parsed.values.format || "md").toLowerCase();
  if (!["json", "md", "html"].includes(format)) {
    return fail(`unknown format: ${format}`);
  }
  const result = app.scan({
    root: target,
    policyFile: parsed.values.policy,
  });
  writeReport(app.render(result, format), parsed.values.output);
  const summary = result.summary;
  process.stderr.write(
    `${summary.result}: ${summary.total} findings ` +
    `(${summary.allowed} allowed, ${summary.review} review, ${summary.blocked} blocked)\n`,
  );
  if (summary.blocked > 0) return 1;
  if (parsed.values.strict && summary.review > 0) return 1;
  return 0;
}

function cmdValidate(parsed) {
  const files = parsed.positionals;
  if (!files.length) return fail("validate needs at least one manifest");
  const app = appFor(parsed);
  let failed = 0;
  const results = [];
  for (const file of files) {
    try {
      const result = app.validate({ path: file });
      const display = result.file || file;
      if (!result.ok) {
        failed += 1;
        results.push({ file: display, ok: false, errors: result.errors });
        if (!parsed.values.json) {
          process.stderr.write(`${display}: invalid\n`);
          for (const error of result.errors) process.stderr.write(`  ${error}\n`);
        }
      } else {
        results.push({ file: display, ok: true, errors: [] });
        if (!parsed.values.json) process.stdout.write(`${display}: ok\n`);
      }
    } catch (error) {
      failed += 1;
      results.push({ file, ok: false, errors: [error.message] });
      if (!parsed.values.json) process.stderr.write(`${file}: ${error.message}\n`);
    }
  }
  if (parsed.values.json) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  }
  return failed ? 1 : 0;
}

function cmdModules(parsed) {
  const rows = appFor(parsed).modules();
  if (parsed.values.json) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return 0;
  }
  const width = Math.max(...rows.map((row) => row.id.length), 2);
  for (const row of rows) {
    process.stdout.write(`${row.id.padEnd(width)}  ${row.label}\n`);
  }
  return 0;
}

function cmdPolicy(parsed) {
  const data = appFor(parsed).policy({
    policyFile: parsed.values.policy,
  });
  if (parsed.values.json) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(`allowed: ${data.allowed.join(", ")}\n`);
  process.stdout.write(`review : ${data.review.join(", ")}\n`);
  process.stdout.write(`blocked: ${data.blocked.join(", ")}\n`);
  process.stdout.write(`system : ${data.systemLibraries.join(", ")}\n`);
  return 0;
}

function cmdSuite(parsed) {
  const data = appFor(parsed).suite({ root: parsed.values.root });
  if (parsed.values.json) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  } else {
    printSuite(data);
  }
  return data.ok ? 0 : 1;
}

function cmdRpc(parsed) {
  if (!parsed.values.workspace) {
    return fail("rpc requires --workspace DIR");
  }
  const app = appFor(parsed);
  startRpc(app);
  process.stderr.write("qa-license-scanner rpc: ready\n");
  return 0;
}

function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parse(argv);
  } catch (error) {
    return fail(error.message);
  }
  if (parsed.values.help || parsed.positionals[0] === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (parsed.values.version) {
    process.stdout.write(`qa-license-scanner ${META.version}\n`);
    return 0;
  }
  const command = parsed.positionals.shift();
  const handlers = {
    info: cmdInfo,
    scan: cmdScan,
    validate: cmdValidate,
    modules: cmdModules,
    policy: cmdPolicy,
    suite: cmdSuite,
    rpc: cmdRpc,
  };
  const handler = handlers[command];
  if (!handler) {
    process.stderr.write(HELP);
    return 2;
  }
  try {
    return handler(parsed);
  } catch (error) {
    if (error instanceof AppError) return fail(error.message);
    return fail(error.message || String(error));
  }
}

module.exports = { main };
