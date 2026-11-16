# Security policy

Report vulnerabilities privately to the maintainer through the repository's
security advisory feature. Do not open a public issue with exploit details.

The scanner is offline by design. Security-relevant changes include symlink
handling, path traversal, report output, and manifest parsing. Keep scanner
modules read-only and free of shell execution.
