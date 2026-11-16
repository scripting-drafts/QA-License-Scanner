"use strict";

const { escapeHtml, escapeMarkdown } = require("./util");

const FORMATS = new Set(["json", "md", "html"]);

function toJson(result) {
  return `${JSON.stringify(result, null, 2)}\n`;
}

function toMarkdown(result) {
  const lines = [];
  lines.push(`# License scan — ${escapeMarkdown(result.root)}`);
  lines.push("");
  lines.push(`- Tool: ${escapeMarkdown(result.tool)} ${escapeMarkdown(result.version)}`);
  lines.push(`- Generated: ${result.generatedAt}`);
  lines.push(`- Findings: ${result.summary.total} (allowed ${result.summary.allowed}, review ${result.summary.review}, blocked ${result.summary.blocked})`);
  lines.push(`- Result: **${result.summary.result}**`);
  lines.push("");
  lines.push("| Status | Component | Version | License | Scope | Source |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const finding of result.findings) {
    lines.push([
      finding.policy?.status || "blocked",
      escapeMarkdown(finding.name),
      escapeMarkdown(finding.version || "—"),
      escapeMarkdown(finding.license),
      escapeMarkdown(finding.scope),
      escapeMarkdown(finding.path || finding.source || "—"),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  if (!result.findings.length) {
    lines.push("| — | No findings | — | — | — | — |");
  }
  if (result.notes.length) {
    lines.push("");
    lines.push("## Notes");
    lines.push("");
    for (const note of result.notes) lines.push(`- ${escapeMarkdown(note)}`);
  }
  lines.push("");
  lines.push("This report is an inventory aid, not legal advice.");
  lines.push("");
  return lines.join("\n");
}

function toHtml(result) {
  const rows = result.findings.map((finding) => {
    const status = finding.policy?.status || "blocked";
    return `<tr class="${escapeHtml(status)}">
      <td><span class="pill ${escapeHtml(status)}">${escapeHtml(status)}</span></td>
      <td>${escapeHtml(finding.name)}</td>
      <td class="mono">${escapeHtml(finding.version || "—")}</td>
      <td>${escapeHtml(finding.license)}</td>
      <td>${escapeHtml(finding.scope)}</td>
      <td class="mono">${escapeHtml(finding.path || finding.source || "—")}</td>
    </tr>`;
  }).join("\n");
  const notes = result.notes.length
    ? `<section><h2>Notes</h2><ul>${result.notes
      .map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul></section>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>License scan — ${escapeHtml(result.root)}</title>
<style>
:root { color-scheme: light dark; }
body { margin: 0; padding: 28px; font: 14px/1.5 "Noto Sans", system-ui, sans-serif; background: #f7f9fa; color: #142126; }
main { max-width: 1180px; margin: 0 auto; }
h1 { margin: 0 0 6px; font-size: 24px; }
.muted { color: #5d7378; }
.summary { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0; }
.summary span { border: 1px solid #c9d7da; border-radius: 999px; padding: 5px 12px; background: #fff; }
table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #c9d7da; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2eaec; vertical-align: top; }
th { background: #eef4f5; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
tr:last-child td { border-bottom: 0; }
.pill { display: inline-block; border-radius: 999px; padding: 2px 8px; font-size: 12px; font-weight: 600; }
.pill.allowed { background: #d9f5e9; color: #0f5c43; }
.pill.review { background: #fff0c7; color: #6b4c00; }
.pill.blocked { background: #ffd9dc; color: #7a1018; }
.mono { font-family: "Adwaita Mono", "Noto Sans Mono", monospace; font-size: 12px; }
.note { margin-top: 18px; color: #5d7378; font-size: 12px; }
@media (prefers-color-scheme: dark) {
  body { background: #0b1418; color: #e9f8f8; }
  .summary span, table { background: #122126; border-color: #2a444a; }
  th { background: #182c32; }
  th, td { border-bottom-color: #223a40; }
  .muted, .note { color: #8fb4b8; }
}
</style>
</head>
<body>
<main>
<h1>License scan — ${escapeHtml(result.root)}</h1>
<p class="muted">${escapeHtml(result.tool)} ${escapeHtml(result.version)} · ${escapeHtml(result.generatedAt)}</p>
<section class="summary">
<span>Total: <strong>${result.summary.total}</strong></span>
<span>Allowed: <strong>${result.summary.allowed}</strong></span>
<span>Review: <strong>${result.summary.review}</strong></span>
<span>Blocked: <strong>${result.summary.blocked}</strong></span>
<span>Result: <strong>${escapeHtml(result.summary.result)}</strong></span>
</section>
<table>
<thead><tr><th>Status</th><th>Component</th><th>Version</th><th>License</th><th>Scope</th><th>Source</th></tr></thead>
<tbody>
${rows || '<tr><td colspan="6">No findings</td></tr>'}
</tbody>
</table>
${notes}
<p class="note">This report is an inventory aid, not legal advice.</p>
</main>
</body>
</html>
`;
}

function render(result, format) {
  if (!FORMATS.has(format)) throw new Error(`unknown format: ${format}`);
  if (format === "json") return toJson(result);
  if (format === "md") return toMarkdown(result);
  return toHtml(result);
}

module.exports = {
  FORMATS,
  render,
  toHtml,
  toJson,
  toMarkdown,
};
