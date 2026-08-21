/**
 * Pro feature: llmstxt.validateWorkspace — find every llms.txt / llms-full.txt /
 * agents.md in the workspace, run the validators, publish diagnostics and show
 * a summary in an output channel.
 */
import * as vscode from "vscode";
import {
  computeAgentsMdDiagnostics,
  computeLlmsTxtDiagnostics,
  isLlmsTxtDoc,
} from "./diagnostics";
import { requirePro } from "./license";

const FILE_GLOB = "**/{llms.txt,llms-full.txt,agents.md,AGENTS.md}";
const EXCLUDE_GLOB = "**/{node_modules,dist,out,.git}/**";

let outputChannel: vscode.OutputChannel | undefined;

function getOutput(context: vscode.ExtensionContext): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("LLMs.txt Toolkit");
    context.subscriptions.push(outputChannel);
  }
  return outputChannel;
}

function severityLabel(severity: vscode.DiagnosticSeverity): string {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return "error";
    case vscode.DiagnosticSeverity.Warning:
      return "warning";
    case vscode.DiagnosticSeverity.Information:
      return "info";
    default:
      return "hint";
  }
}

export async function validateWorkspaceCommand(
  context: vscode.ExtensionContext,
  collection: vscode.DiagnosticCollection
): Promise<void> {
  if (!(await requirePro(context, "Workspace-wide validation"))) {
    return;
  }
  if (!vscode.workspace.workspaceFolders?.length) {
    void vscode.window.showWarningMessage("Open a folder or workspace first.");
    return;
  }

  const uris = await vscode.workspace.findFiles(FILE_GLOB, EXCLUDE_GLOB);
  // Case-insensitive file systems can report agents.md twice (AGENTS.md).
  const seen = new Set<string>();
  const files = uris.filter((u) => {
    const key = u.fsPath.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  if (files.length === 0) {
    void vscode.window.showInformationMessage(
      "No llms.txt, llms-full.txt or agents.md files found in this workspace. Run “LLMs.txt: Generate llms.txt from Workspace” to create one."
    );
    return;
  }

  const output = getOutput(context);
  output.clear();
  output.appendLine(`LLMs.txt Toolkit — workspace validation (${new Date().toLocaleString()})`);
  output.appendLine("=".repeat(72));

  let totalErrors = 0;
  let totalWarnings = 0;
  let cleanFiles = 0;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Validating llms.txt / agents.md files…" },
    async (progress) => {
      for (const [index, uri] of files.entries()) {
        progress.report({ message: vscode.workspace.asRelativePath(uri), increment: 100 / files.length });
        let doc: vscode.TextDocument;
        try {
          doc = await vscode.workspace.openTextDocument(uri);
        } catch {
          output.appendLine(`\n${vscode.workspace.asRelativePath(uri)}: could not read file`);
          continue;
        }

        const diagnostics = isLlmsTxtDoc(doc)
          ? computeLlmsTxtDiagnostics(doc)
          : computeAgentsMdDiagnostics(doc);
        collection.set(uri, diagnostics);

        const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error).length;
        const warnings = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Warning).length;
        totalErrors += errors;
        totalWarnings += warnings;

        const rel = vscode.workspace.asRelativePath(uri);
        if (diagnostics.length === 0) {
          cleanFiles++;
          output.appendLine(`\n[${index + 1}/${files.length}] ${rel} — OK`);
        } else {
          output.appendLine(`\n[${index + 1}/${files.length}] ${rel} — ${errors} error(s), ${warnings} warning(s)`);
          for (const d of diagnostics) {
            output.appendLine(
              `    line ${d.range.start.line + 1}:${d.range.start.character + 1} [${severityLabel(d.severity)}] ${d.message}`
            );
          }
        }
      }
    }
  );

  output.appendLine("");
  output.appendLine("=".repeat(72));
  output.appendLine(
    `Done: ${files.length} file(s) — ${cleanFiles} clean, ${totalErrors} error(s), ${totalWarnings} warning(s).`
  );
  output.show(true);

  const summary =
    totalErrors + totalWarnings === 0
      ? `All ${files.length} file(s) validate cleanly.`
      : `${files.length} file(s) checked: ${totalErrors} error(s), ${totalWarnings} warning(s). Details in the Problems panel and output channel.`;
  void vscode.window.showInformationMessage(summary);
}
