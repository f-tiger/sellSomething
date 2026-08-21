/**
 * LLMs.txt & Agents.md Toolkit — extension entry point.
 *
 * Free tier:  language support, live llms.txt diagnostics, generators.
 * Pro tier:   site AI-visibility audit + workspace-wide validation
 *             (license keys sold at agentready.agiscorecard.com/pricing).
 */
import * as vscode from "vscode";
import { auditSiteCommand } from "./audit";
import { registerDiagnostics } from "./diagnostics";
import { generateAgentsMdCommand, generateLlmsTxtCommand } from "./generators";
import { enterLicenseCommand } from "./license";
import { registerStatusBar } from "./statusBar";
import { validateWorkspaceCommand } from "./validateWorkspace";

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = registerDiagnostics(context);
  registerStatusBar(context);

  context.subscriptions.push(
    // Free commands
    vscode.commands.registerCommand("llmstxt.generate", () => generateLlmsTxtCommand()),
    vscode.commands.registerCommand("llmstxt.generateAgentsMd", () => generateAgentsMdCommand()),
    vscode.commands.registerCommand("llmstxt.enterLicense", () => enterLicenseCommand(context)),
    // Pro commands (license-gated inside each handler)
    vscode.commands.registerCommand("llmstxt.auditSite", () => auditSiteCommand(context)),
    vscode.commands.registerCommand("llmstxt.validateWorkspace", () =>
      validateWorkspaceCommand(context, diagnostics)
    )
  );
}

export function deactivate(): void {
  // All resources are registered as subscriptions and disposed by VS Code.
}
