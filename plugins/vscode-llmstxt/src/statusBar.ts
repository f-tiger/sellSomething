/**
 * Status bar item showing the Free/Pro state. Clicking it runs
 * llmstxt.enterLicense.
 */
import * as vscode from "vscode";
import { FREE_MODE, getCachedLicense, isPro, isProCached, onLicenseChanged } from "./license";

export function registerStatusBar(context: vscode.ExtensionContext): void {
  const item = vscode.window.createStatusBarItem("llmstxt.tier", vscode.StatusBarAlignment.Right, 90);
  item.name = "LLMs.txt Toolkit";
  item.command = "llmstxt.enterLicense";
  context.subscriptions.push(item);

  const render = (pro: boolean): void => {
    if (FREE_MODE && !pro) {
      item.text = "$(check-all) llms.txt Toolkit";
      item.tooltip =
        "LLMs.txt & Agents.md Toolkit — all features currently free (site audits, workspace validation, generators).";
      item.backgroundColor = undefined;
      item.show();
      return;
    }
    if (pro) {
      const product = getCachedLicense(context)?.product;
      item.text = "$(verified) llms.txt Pro";
      item.tooltip = `LLMs.txt & Agents.md Toolkit — Pro${product ? ` (${product})` : ""} active. Click to change the license key.`;
      item.backgroundColor = undefined;
    } else {
      item.text = "$(unverified) llms.txt Free";
      item.tooltip =
        "LLMs.txt & Agents.md Toolkit — Free tier. Click to enter a license key and unlock site audits + workspace validation.";
      item.backgroundColor = undefined;
    }
    item.show();
  };

  // Immediate paint from cache, then refresh asynchronously (may revalidate).
  render(isProCached(context));
  void isPro(context).then(render);

  context.subscriptions.push(onLicenseChanged(() => render(isProCached(context))));
}
