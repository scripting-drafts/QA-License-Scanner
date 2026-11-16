# Privacy and data handling

QA License Scanner is offline and local-only.

- It reads project metadata and license files from the path you give it.
- It does not execute project code, follow symlinks, or make network requests.
- It does not collect telemetry, hostnames, usernames, or file contents beyond
  the license and manifest fields it needs.
- Reports contain relative paths and public license metadata. Output files are
  written with mode `0600`.
- No credentials or tokens are read or stored.

Scanning a directory you do not own may still expose its metadata to you.
Review reports before sharing them.
