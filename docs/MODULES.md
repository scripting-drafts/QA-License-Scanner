# Scanner modules

A module is a small, offline reader. It must not execute project code, follow
symlinks, or make network requests.

## Contract

```js
module.exports = {
  id: "npm",
  label: "Node.js package.json / package-lock.json",
  detect(root, context) { return true; },
  scan(root, context) {
    return {
      findings: [{
        name: "left-pad",
        version: "1.3.0",
        license: "MIT",
        source: "package-lock.json",
        path: "package-lock.json",
        scope: "runtime",
        confidence: "high",
      }],
      notes: [],
    };
  },
};
```

`context.policy` contains the allowed/review/blocked sets, aliases, system
library map, license file names, and license signatures.

## Current modules

| Module | Reads | Limits |
| --- | --- | --- |
| `npm` | `package.json`, `package-lock.json` | Reads installed package metadata only when the lock omits a license. |
| `python` | `requirements.txt`, `pyproject.toml`, `Pipfile` | No registry lookup; undeclared licenses are `UNKNOWN`. |
| `debian` | `debian/copyright` | Machine-readable format only. |
| `c` | Makefile, CMake, Meson, pkg-config names | Maps known system libraries; unmapped names are notes. |
| `files` | License files, SPDX headers, `legal/manifest.json` | Skips symlinks, ignored directories, and files over 512 KiB. |

## Adding a module

1. Add `src/modules/<id>.js` with the contract above.
2. Register it in `src/modules/index.js`.
3. Add a fixture test under `tests/`.
4. Document the module and its limits here.

Modules return relative paths only. Policy classification is applied by the
orchestrator, not by individual modules.
