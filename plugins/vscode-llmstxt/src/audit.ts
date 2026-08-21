/**
 * Pro feature: llmstxt.auditSite — run the AgentReady AI-visibility scan
 * (GET https://agentready.agiscorecard.com/api/scan?url=...) against any URL
 * and render the report in a theme-aware webview panel.
 */
import * as vscode from "vscode";
import { requirePro } from "./license";

const SCAN_URL = "https://agentready.agiscorecard.com/api/scan";
const SCAN_TIMEOUT_MS = 30_000;

interface ScanCheck {
  id: string;
  category: string;
  title: string;
  earned: number;
  possible: number;
  status: "pass" | "warn" | "fail";
  detail: string;
  fix: string | null;
}

interface ScanReport {
  url: string;
  scannedAt: string;
  score: number;
  grade: string;
  summary: string;
  checks: ScanCheck[];
}

interface ScanError {
  error: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function runScan(url: string): Promise<ScanReport> {
  const res = await fetch(`${SCAN_URL}?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  const data = (await res.json()) as ScanReport | ScanError;
  if (!res.ok || "error" in data) {
    throw new Error("error" in data ? data.error : `Scan failed with HTTP ${res.status}.`);
  }
  return data;
}

function gradeColor(grade: string): string {
  switch (grade) {
    case "A":
      return "var(--vscode-testing-iconPassed, #2ea043)";
    case "B":
      return "var(--vscode-charts-green, #57ab5a)";
    case "C":
      return "var(--vscode-charts-yellow, #d4a72c)";
    case "D":
      return "var(--vscode-charts-orange, #e0823d)";
    default:
      return "var(--vscode-testing-iconFailed, #f85149)";
  }
}

function statusBadge(status: ScanCheck["status"]): string {
  const label = status === "pass" ? "PASS" : status === "warn" ? "WARN" : "FAIL";
  return `<span class="badge badge-${status}">${label}</span>`;
}

function renderReportHtml(report: ScanReport): string {
  const categories = new Map<string, ScanCheck[]>();
  for (const check of report.checks) {
    const list = categories.get(check.category) ?? [];
    list.push(check);
    categories.set(check.category, list);
  }

  const tables = [...categories.entries()]
    .map(([category, checks]) => {
      const rows = checks
        .map(
          (c) => `
        <tr>
          <td class="col-status">${statusBadge(c.status)}</td>
          <td class="col-title">${escapeHtml(c.title)}</td>
          <td class="col-points">${c.earned}/${c.possible}</td>
          <td class="col-detail">${escapeHtml(c.detail)}</td>
        </tr>`
        )
        .join("");
      return `
      <h2>${escapeHtml(category)}</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th></th><th>Check</th><th>Points</th><th>Detail</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    })
    .join("");

  const fixes = report.checks
    .filter((c) => typeof c.fix === "string" && c.fix.length > 0)
    .map((c) => `<li><strong>${escapeHtml(c.title)}:</strong> ${escapeHtml(c.fix as string)}</li>`)
    .join("");

  const fixSection = fixes
    ? `<h2>Fix list</h2><ol class="fixes">${fixes}</ol>`
    : `<h2>Fix list</h2><p class="all-clear">Nothing to fix — every check passed. 🎉</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Visibility Audit</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 1.2rem 1.6rem 3rem;
    line-height: 1.5;
    max-width: 900px;
    margin: 0 auto;
  }
  a { color: var(--vscode-textLink-foreground); }
  .hero { display: flex; align-items: center; gap: 1.4rem; flex-wrap: wrap; margin-bottom: .6rem; }
  .score-ring {
    width: 96px; height: 96px; border-radius: 50%;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    border: 4px solid ${gradeColor(report.grade)};
    flex: none;
  }
  .score-ring .num { font-size: 1.7rem; font-weight: 700; }
  .score-ring .of { font-size: .7rem; opacity: .7; }
  .grade { font-size: 2.2rem; font-weight: 800; color: ${gradeColor(report.grade)}; }
  .meta { font-size: .85rem; opacity: .75; }
  .summary {
    border-left: 3px solid var(--vscode-textBlockQuote-border, #888);
    background: var(--vscode-textBlockQuote-background, rgba(127,127,127,.08));
    padding: .5rem .9rem; margin: .8rem 0 1.4rem; border-radius: 0 4px 4px 0;
  }
  h2 { margin-top: 1.6rem; border-bottom: 1px solid var(--vscode-panel-border, rgba(127,127,127,.3)); padding-bottom: .25rem; }
  .table-wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: .88rem; }
  th, td { text-align: left; padding: .4rem .6rem; vertical-align: top; }
  thead th { opacity: .7; font-weight: 600; border-bottom: 1px solid var(--vscode-panel-border, rgba(127,127,127,.3)); }
  tbody tr:nth-child(odd) { background: var(--vscode-list-hoverBackground, rgba(127,127,127,.06)); }
  .col-points { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .badge {
    display: inline-block; font-size: .68rem; font-weight: 700; letter-spacing: .04em;
    border-radius: 3px; padding: .1rem .4rem; color: #fff;
  }
  .badge-pass { background: var(--vscode-testing-iconPassed, #2ea043); }
  .badge-warn { background: var(--vscode-charts-yellow, #b08800); color: #1b1b1b; }
  .badge-fail { background: var(--vscode-testing-iconFailed, #cf222e); }
  .fixes li { margin-bottom: .5rem; }
  .all-clear { opacity: .8; }
  .footer { margin-top: 2.2rem; font-size: .78rem; opacity: .6; }
</style>
</head>
<body>
  <div class="hero">
    <div class="score-ring"><span class="num">${report.score}</span><span class="of">/ 100</span></div>
    <div>
      <div class="grade">Grade ${escapeHtml(report.grade)}</div>
      <div class="meta">${escapeHtml(report.url)}<br>Scanned ${escapeHtml(new Date(report.scannedAt).toLocaleString())}</div>
    </div>
  </div>
  <div class="summary">${escapeHtml(report.summary)}</div>
  ${tables}
  ${fixSection}
  <div class="footer">Powered by AgentReady — agentready.agiscorecard.com</div>
</body>
</html>`;
}

export async function auditSiteCommand(context: vscode.ExtensionContext): Promise<void> {
  if (!(await requirePro(context, "Site AI-visibility audit"))) {
    return;
  }

  const input = await vscode.window.showInputBox({
    title: "Audit Site AI Visibility",
    prompt: "URL to audit (homepage or a product page)",
    placeHolder: "https://your-store.com",
    ignoreFocusOut: true,
    validateInput: (v) => (v.trim().length === 0 ? "Enter a URL." : undefined),
  });
  if (!input) {
    return;
  }

  let report: ScanReport;
  try {
    report = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Auditing ${input.trim()}…`, cancellable: false },
      () => runScan(input.trim())
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`Audit failed: ${message}`);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "llmstxt.audit",
    `AI Audit: ${report.grade} ${report.score}/100`,
    vscode.ViewColumn.One,
    { enableScripts: false, retainContextWhenHidden: false }
  );
  panel.webview.html = renderReportHtml(report);
}
