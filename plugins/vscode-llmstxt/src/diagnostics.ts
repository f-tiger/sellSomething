/**
 * Free-tier diagnostics for llms.txt / llms-full.txt.
 *
 * Rules (mirrors the checks used by the AgentReady scanner at
 * agentready.agiscorecard.com — see sites/agentready/src/worker.js):
 *  - missing H1 title
 *  - missing "> summary" blockquote
 *  - list bullets that do not match the link format `- [name](url): description`
 *  - relative (non-absolute) URLs — agents fetch llms.txt out of context
 *  - empty H2 sections
 *  - file larger than 50KB (llms.txt only; llms-full.txt is expected to be big)
 */
import * as vscode from "vscode";
import * as path from "path";

export const DIAGNOSTIC_SOURCE = "llms.txt";

const LLMS_FILENAMES = new Set(["llms.txt", "llms-full.txt"]);
const AGENTS_FILENAMES = new Set(["agents.md"]);
const MAX_BYTES = 50 * 1024;

/** `- [name](url)` with an optional `: description` tail. */
const LINK_BULLET_RE = /^\s*-\s+\[[^\]]+\]\([^()\s]+\)\s*(?::\s*\S.*)?$/;
/** Any list bullet. */
const BULLET_RE = /^\s*[-*+]\s+\S/;
/** Markdown inline link — capture group 2 is the URL. */
const INLINE_LINK_RE = /\[([^\]]*)\]\(([^()\s]*)\)/g;

export function isLlmsTxtDoc(doc: vscode.TextDocument): boolean {
  if (doc.languageId === "llmstxt") {
    return true;
  }
  return LLMS_FILENAMES.has(path.basename(doc.fileName).toLowerCase());
}

export function isAgentsMdDoc(doc: vscode.TextDocument): boolean {
  return AGENTS_FILENAMES.has(path.basename(doc.fileName).toLowerCase());
}

function lineRange(doc: vscode.TextDocument, line: number): vscode.Range {
  const text = doc.lineAt(line).text;
  return new vscode.Range(line, 0, line, text.length);
}

function diag(
  range: vscode.Range,
  message: string,
  severity: vscode.DiagnosticSeverity,
  code: string
): vscode.Diagnostic {
  const d = new vscode.Diagnostic(range, message, severity);
  d.source = DIAGNOSTIC_SOURCE;
  d.code = code;
  return d;
}

/** Compute all diagnostics for one llms.txt / llms-full.txt document. */
export function computeLlmsTxtDiagnostics(doc: vscode.TextDocument): vscode.Diagnostic[] {
  const out: vscode.Diagnostic[] = [];
  const text = doc.getText();
  const lineCount = doc.lineCount;
  const firstLineRange = lineCount > 0 ? lineRange(doc, 0) : new vscode.Range(0, 0, 0, 0);

  // --- file size (llms.txt only — llms-full.txt is the intentionally big variant)
  const isFullVariant = path.basename(doc.fileName).toLowerCase() === "llms-full.txt";
  if (!isFullVariant && Buffer.byteLength(text, "utf8") > MAX_BYTES) {
    out.push(
      diag(
        firstLineRange,
        "llms.txt is larger than 50KB. Many agents truncate large context files — keep this file a lean index and move detail into llms-full.txt.",
        vscode.DiagnosticSeverity.Warning,
        "file-too-large"
      )
    );
  }

  // --- structural pass over lines
  let h1Line = -1;
  let firstH2Line = -1;
  let blockquoteLine = -1;

  interface Section {
    line: number;
    title: string;
    contentLines: number;
  }
  const sections: Section[] = [];

  for (let i = 0; i < lineCount; i++) {
    const lineText = doc.lineAt(i).text;
    const trimmed = lineText.trim();

    if (/^#\s+\S/.test(trimmed) && h1Line === -1) {
      h1Line = i;
      continue;
    }
    if (/^##\s+\S/.test(trimmed)) {
      if (firstH2Line === -1) {
        firstH2Line = i;
      }
      sections.push({ line: i, title: trimmed.replace(/^##\s+/, ""), contentLines: 0 });
      continue;
    }
    if (/^>\s?/.test(trimmed) && blockquoteLine === -1 && firstH2Line === -1) {
      blockquoteLine = i;
    }

    if (trimmed.length > 0) {
      const current = sections[sections.length - 1];
      if (current) {
        current.contentLines++;
      }
    }

    // --- bullets inside sections must use the link format
    if (BULLET_RE.test(lineText) && sections.length > 0) {
      if (!LINK_BULLET_RE.test(lineText)) {
        const start = lineText.length - lineText.trimStart().length;
        out.push(
          diag(
            new vscode.Range(i, start, i, lineText.length),
            "Bullet does not match the llms.txt link format `- [name](url): description`.",
            vscode.DiagnosticSeverity.Warning,
            "bullet-format"
          )
        );
      }
    }

    // --- relative URLs anywhere in the file
    INLINE_LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = INLINE_LINK_RE.exec(lineText)) !== null) {
      const url = m[2];
      if (url.length === 0) {
        continue; // empty () is already caught by bullet-format
      }
      if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) {
        const urlStart = m.index + m[0].indexOf("(") + 1;
        out.push(
          diag(
            new vscode.Range(i, urlStart, i, urlStart + url.length),
            `Relative URL "${url}" — agents read llms.txt out of context, so every link should be an absolute https:// URL.`,
            vscode.DiagnosticSeverity.Warning,
            "relative-url"
          )
        );
      }
    }
  }

  // --- missing H1
  if (h1Line === -1) {
    out.push(
      diag(
        firstLineRange,
        "Missing H1 title. llms.txt must start with `# Your project name` so agents know what this site is.",
        vscode.DiagnosticSeverity.Error,
        "missing-h1"
      )
    );
  }

  // --- missing blockquote summary
  if (blockquoteLine === -1) {
    const anchor = h1Line >= 0 ? lineRange(doc, h1Line) : firstLineRange;
    out.push(
      diag(
        anchor,
        "Missing blockquote summary. Add a `> one-line summary of what you offer` right after the H1 — it is the first thing agents quote about you.",
        vscode.DiagnosticSeverity.Warning,
        "missing-summary"
      )
    );
  }

  // --- empty H2 sections
  for (const section of sections) {
    if (section.contentLines === 0) {
      out.push(
        diag(
          lineRange(doc, section.line),
          `Section "${section.title}" is empty. Add link bullets (\`- [name](url): description\`) or remove the heading.`,
          vscode.DiagnosticSeverity.Warning,
          "empty-section"
        )
      );
    }
  }

  return out;
}

/**
 * Lightweight checks for agents.md (used by the Pro workspace validation —
 * live diagnostics stay scoped to llms.txt).
 */
export function computeAgentsMdDiagnostics(doc: vscode.TextDocument): vscode.Diagnostic[] {
  const out: vscode.Diagnostic[] = [];
  const text = doc.getText();
  const firstLine = doc.lineCount > 0 ? lineRange(doc, 0) : new vscode.Range(0, 0, 0, 0);

  if (text.trim().length === 0) {
    out.push(
      diag(
        firstLine,
        "agents.md is empty. Describe how AI agents should browse, query and interact with this project.",
        vscode.DiagnosticSeverity.Error,
        "agents-empty"
      )
    );
    return out;
  }

  let hasHeading = false;
  for (let i = 0; i < doc.lineCount; i++) {
    if (/^#\s+\S/.test(doc.lineAt(i).text.trim())) {
      hasHeading = true;
      break;
    }
  }
  if (!hasHeading) {
    out.push(
      diag(
        firstLine,
        "agents.md has no top-level heading. Start with `# Agent instructions for <project>`.",
        vscode.DiagnosticSeverity.Warning,
        "agents-missing-h1"
      )
    );
  }
  return out;
}

/** Wire live diagnostics (open/save/change-language) into the extension lifecycle. */
export function registerDiagnostics(context: vscode.ExtensionContext): vscode.DiagnosticCollection {
  const collection = vscode.languages.createDiagnosticCollection("llmstxt");
  context.subscriptions.push(collection);

  const refresh = (doc: vscode.TextDocument): void => {
    if (isLlmsTxtDoc(doc)) {
      collection.set(doc.uri, computeLlmsTxtDiagnostics(doc));
    }
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidSaveTextDocument(refresh),
    vscode.workspace.onDidCloseTextDocument((doc) => collection.delete(doc.uri))
  );

  for (const doc of vscode.workspace.textDocuments) {
    refresh(doc);
  }

  return collection;
}
