# Attaching QA License Scanner to a host

QA License Scanner is designed as an optional host application. QA Dashboard can
attach it later without changing the scanner's core or exposing a shell.

## Integration modes

### 1. In-process module

The host main process can require `src/app.js` and call the core API directly.
When the package is installed as a module, `require("qa-license-scanner")`
resolves to the same facade:

```js
const { createApp } = require("/path/to/QA-License-Scanner/src/app");

const scanner = createApp({ workspace: "/home/user/qa-workspace" });
const info = scanner.info();
const result = scanner.scan({ root: "QA-Dashboard" });
const report = scanner.report({ root: "QA-Dashboard", format: "md" });
```

The renderer must never import this module. Expose a narrow IPC surface from the
host main process instead.

### 2. JSON-lines subprocess

The safer default is to spawn the scanner and speak newline-delimited JSON over
stdio:

```bash
qa-license-scanner rpc --workspace /home/user/qa-workspace
```

The adapter requires `--workspace` and rejects paths outside it. It writes one
JSON response per request on stdout; diagnostics go to stderr.

Request:

```json
{"id":"1","method":"info"}
{"id":"2","method":"scan","params":{"root":"QA-Dashboard"}}
{"id":"3","method":"report","params":{"root":"QA-Dashboard","format":"md"}}
```

Response:

```json
{"apiVersion":1,"id":"2","ok":true,"data":{"summary":{"result":"review"}}}
```

Errors are returned without stack traces:

```json
{"apiVersion":1,"id":"4","ok":false,"error":{"code":"outside-workspace","message":"scan root is outside the configured workspace"}}
```

## Methods

| Method | Params | Result |
| --- | --- | --- |
| `info` | none | App manifest, version, capabilities, protocol, UI hints |
| `modules` | none | Scanner module list |
| `policy` | `policyFile?` | Allowed, review, blocked, and system library lists |
| `scan` | `root?`, `policyFile?` | Structured findings with policy status |
| `validate` | `manifest?` or `path?` | Validation errors |
| `suite` | `root?` | Cross-project version and manifest check |
| `report` | `root?`, `format`, `policyFile?` | Rendered `json`, `md`, or `html` text |

Relative `root` and `path` values resolve against the workspace. Absolute paths
must remain inside it.

## QA Dashboard attachment sketch

A future QA Dashboard module can:

1. Read `app.manifest.json` to discover `apiVersion`, capabilities, report
   formats, and the suggested window size.
2. Spawn `qa-license-scanner rpc --workspace <configured root>` from the main
   process with a fixed argv vector.
3. Expose only `info`, `scan`, and `report` to the renderer over the existing
   narrow `contextBridge`.
4. Render `summary`, `components`, and `checks` from the structured `scan`
   result; use `report` only for export.
5. Keep the renderer sandboxed; the scanner process stays read-only and
   offline.

## Security boundaries

- No network sockets.
- No shell execution.
- No project code execution.
- Workspace jail for the RPC adapter.
- Relative paths in reports; absolute paths are redacted from RPC errors.
- Report files are written by the caller, not by the RPC adapter.

## Versioning

`apiVersion` is 1. Additive methods may be added within 1.x; incompatible changes
require a new `apiVersion`. The app version is independent and follows the
project release.

The current host contract is also machine-readable in `app.manifest.json`.
