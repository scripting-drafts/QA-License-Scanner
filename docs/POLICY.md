# License policy

The default policy is in `data/licenses.json`. A custom policy file can replace
the three lists while keeping the aliases and system library map:

```json
{
  "policy": {
    "allowed": ["MIT", "ISC", "Apache-2.0"],
    "review": ["MPL-2.0"],
    "blocked": ["GPL-3.0-only", "AGPL-3.0-only"]
  }
}
```

## Classification

- `allowed` — permissive licenses accepted for distributed products.
- `review` — weak copyleft or custom terms that need a human decision.
- `blocked` — strong copyleft, source-available/commercial restrictions,
  unknown, or unlicensed components.

Expressions are split on ` OR ` and ` AND `. `OR` takes the best alternative;
`AND` takes the worst component. `WITH` exceptions classify the base license.
Unknown components are blocked; custom `LicenseRef-*` references are reviewed.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | No blocked findings; review-only findings unless `--strict`. |
| `1` | Blocked findings, invalid manifest, or review with `--strict`. |
| `2` | Usage or read error. |

## Reports

`--format json` for automation, `md` for review, `html` for a self-contained
report. Reports use paths relative to the scan root and exclude usernames,
hostnames, and absolute paths.
