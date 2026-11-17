# Legal manifest specification

The legal manifest is the shared own-product compliance register for QA
Dashboard, QA Sentinels, QA SIEM, and QA License Scanner. The machine-readable
schema is `schema/legal-manifest.schema.json` (JSON Schema 2020-12).

## Location and ownership

Each product keeps its register at `legal/manifest.json` in its own repository.
The product owns its manifest; this project owns the schema and the validator.

## Required fields

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | integer | Must be `1`. |
| `product` | string | Product name. |
| `spdx` | string | SPDX-style expression for the product. |
| `copyright` | string | Copyright line. |
| `source` | HTTPS URL | Canonical source repository. |
| `lastReviewed` | date | Last manual review, `YYYY-MM-DD`. |
| `reviewedVersion` | string | Product version the review covers. |
| `components` | array | Shipped, build, runtime, asset, system, or companion components. |
| `documents` | array | License, notice, privacy, contribution, and packaging documents. |
| `reviews` | array | Manual review entries by category. |

Optional: `homepage`, `reviewedComponents` (component id → reviewed version).

## Component scopes

| Scope | Use |
| --- | --- |
| `project` | The product's own code. |
| `shipped` | Third-party code bundled in the product. |
| `dependency` | A package dependency not necessarily shipped. |
| `build` | Build/test-only dependency. |
| `runtime` | System runtime dependency. |
| `asset` | Artwork, fonts, icons, or other assets. |
| `system` | System library linked or required at runtime. |
| `companion` | Another QA product referenced by the register. |

## Review categories

`licensing`, `distribution`, `privacy`, `export`, `trademark`,
`contributions`, `accessibility`.

Status: `reviewed`, `pending`, or `not-applicable`. A `pending` review means the
register must show **Review due**; it is not a legal conclusion.

## Review cadence

Review on every release and at least annually. Update `lastReviewed`,
`reviewedVersion`, and `reviewedComponents`. A version change without a matching
review should be reported as stale by the product's register.

## Validation

```bash
./bin/qa-license-scanner validate ../QA-Dashboard/legal/manifest.json
```

The scanner's `files` module also reads valid manifests and adds their declared
components to scan results with confidence `declared`.

## Application layer

The scanner exposes a reusable application facade in `src/app.js` and a
machine-readable host contract in `app.manifest.json`:

- `createApp({ workspace })` returns `info`, `modules`, `policy`, `scan`,
  `validate`, `suite`, `report`, and render helpers.
- `qa-license-scanner rpc --workspace DIR` serves the same methods over
  newline-delimited JSON on stdio.
- `apiVersion` is independent of the product version. Additive methods stay
  within the same API version.

See `docs/ATTACH.md` for the QA Dashboard attachment sketch.

## Cross-suite check

Run the suite check from a directory containing the QA repositories:

```bash
./bin/qa-license-scanner suite --root /path/to/workspace
```

It validates each `legal/manifest.json`, compares `reviewedVersion` with the
product version, checks document paths, and verifies that companion component
versions match the other discovered products. It exits non-zero on drift.

## Boundary

The manifest is an inventory and attestation aid. It is not legal advice and
does not replace review by qualified counsel for export control, privacy,
trademark, or distribution questions.
