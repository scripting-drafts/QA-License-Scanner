"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function tempDir(prefix = "qa-license-scanner-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(root, name, content) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

const MIT_TEXT = `MIT License

Copyright (c) 2026 Example

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

function manifest(overrides = {}) {
  return {
    schemaVersion: 1,
    product: "Example",
    spdx: "MIT",
    copyright: "Copyright (c) 2026 Example",
    source: "https://example.com/example",
    lastReviewed: "2026-11-16",
    reviewedVersion: "1.0.0",
    components: [
      {
        id: "example",
        name: "Example",
        version: "1.0.0",
        license: "MIT",
        scope: "project",
      },
    ],
    documents: [
      { id: "license", label: "License", path: "LICENSE", kind: "text" },
    ],
    reviews: [
      {
        id: "licensing",
        category: "licensing",
        status: "reviewed",
        date: "2026-11-16",
        note: "Reviewed.",
      },
    ],
    ...overrides,
  };
}

module.exports = {
  MIT_TEXT,
  cleanup,
  manifest,
  tempDir,
  write,
};
