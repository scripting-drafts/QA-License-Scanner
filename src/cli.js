"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const { listModules } = require("./modules");
const { loadPolicy } = require("./policy");
const { render } = require("./report");
const { scanProject } = require("./scan");
const { inspect, printSuite } = require("./suite");
const { validateFile } = require("./validate");
const { readJson } = require("./util");

const ROOT = path.join(__dirname, "..");
const META = readJson(path.join(ROOT, "package.json"), 128 * 1024);

const HELP = `qa-license-scanner ${META.version}

Usage:
  qa-license-scanner scan <path> [--format json|md|html]
                                  [--output FILE|-] [--policy FILE]
                                  [--strict]
  qa-license-scanner validate <manifest.json...> [--json]
  qa-license-scanner modules
  qa-license-scanner policy [--policy FILE]
  qa-license-scanner suite [--root DIR] [--json]
  qa-license-scanner --version
  qa-license-scanner --help

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
      strict: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
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

function cmdScan(parsed) {
  const target = parsed.positionals[0] || ".";
  const format = String(parsed.values.format || "md").toLowerCase();
  if (!["json", "md", "html"].includes(format)) {
    return fail(`unknown format: ${format}`);
  }
  const result = scanProject(target, { policyFile: parsed.values.policy });
  writeReport(render(result, format), parsed.values.output);
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
  let failed = 0;
  const results = [];
  for (const file of files) {
    try {
      const { errors } = validateFile(file);
      if (errors.length) {
        failed += 1;
        results.push({ file, ok: false, errors });
        if (!parsed.values.json) {
          process.stderr.write(`${file}: invalid\n`);
          for (const error of errors) process.stderr.write(`  ${error}\n`);
        }
      } else {
        results.push({ file, ok: true, errors: [] });
        if (!parsed.values.json) process.stdout.write(`${file}: ok\n`);
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

function cmdModules() {
  const rows = listModules();
  const width = Math.max(...rows.map((row) => row.id.length), 2);
  for (const row of rows) {
    process.stdout.write(`${row.id.padEnd(width)}  ${row.label}\n`);
  }
  return 0;
}

function cmdPolicy(parsed) {
  const policy = loadPolicy(parsed.values.policy);
  const print = (label, set) => {
    process.stdout.write(`${label}: ${[...set].sort().join(", ")}\n`);
  };
  print("allowed", policy.allowed);
  print("review ", policy.review);
  print("blocked", policy.blocked);
  process.stdout.write(
    `system : ${Object.keys(policy.systemLibraries).sort().join(", ")}\n`,
  );
  return 0;
}

function cmdSuite(parsed) {
  const root = parsed.values.root || path.resolve(__dirname, "..", "..");
  const data = inspect(root);
  if (parsed.values.json) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  } else {
    printSuite(data);
  }
  return data.ok ? 0 : 1;
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
  switch (command) {
    case "scan":
      try {
        return cmdScan(parsed);
      } catch (error) {
        return fail(error.message);
      }
    case "validate":
      try {
        return cmdValidate(parsed);
      } catch (error) {
        return fail(error.message);
      }
    case "modules":
      return cmdModules();
    case "policy":
      try {
        return cmdPolicy(parsed);
      } catch (error) {
        return fail(error.message);
      }
    case "suite":
      try {
        return cmdSuite(parsed);
      } catch (error) {
        return fail(error.message);
      }
    default:
      process.stderr.write(HELP);
      return 2;
  }
}

module.exports = { main };
