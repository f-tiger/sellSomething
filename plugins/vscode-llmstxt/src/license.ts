/**
 * License management for the Pro tier.
 *
 * Keys are sold at https://agentready.agiscorecard.com/pricing and validated
 * against GET /api/license/validate?key=<key> -> { valid: boolean, product: string }.
 *
 * The validation result is cached for 24h in globalState. On network errors we
 * fail open: the extension never blocks, and falls back to the last known state
 * (or the free tier when nothing was ever validated).
 */
import * as vscode from "vscode";

const STATE_KEY = "llmstxt.license";
const VALIDATE_URL = "https://agentready.agiscorecard.com/api/license/validate";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export const PRICING_URL = "https://agentready.agiscorecard.com/pricing";

export interface LicenseCache {
  key: string;
  valid: boolean;
  product?: string;
  /** Epoch ms of the last successful server validation (0 = never reached the server). */
  checkedAt: number;
}

interface ValidateResponse {
  valid?: boolean;
  product?: string;
}

const changeEmitter = new vscode.EventEmitter<void>();
/** Fires whenever the stored license state changes (enter key, revalidation). */
export const onLicenseChanged: vscode.Event<void> = changeEmitter.event;

export function getCachedLicense(context: vscode.ExtensionContext): LicenseCache | undefined {
  return context.globalState.get<LicenseCache>(STATE_KEY);
}

/**
 * Call the license endpoint. Returns undefined when the server is unreachable
 * or misbehaving (network error, non-2xx, invalid JSON) so callers can fail open.
 */
async function validateKeyRemote(key: string): Promise<{ valid: boolean; product?: string } | undefined> {
  try {
    const res = await fetch(`${VALIDATE_URL}?key=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return undefined;
    }
    const data = (await res.json()) as ValidateResponse;
    return {
      valid: data.valid === true,
      product: typeof data.product === "string" ? data.product : undefined,
    };
  } catch {
    return undefined;
  }
}

/**
 * True when the user currently has a valid Pro license.
 * Uses the 24h cache; revalidates lazily when stale; fails open to the
 * last known state on network errors.
 */
export async function isPro(context: vscode.ExtensionContext): Promise<boolean> {
  const cached = getCachedLicense(context);
  if (!cached || !cached.key) {
    return false;
  }
  if (cached.checkedAt > 0 && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    return cached.valid;
  }
  const fresh = await validateKeyRemote(cached.key);
  if (fresh === undefined) {
    // Network error: fail open to the last known state / free tier.
    return cached.valid;
  }
  const next: LicenseCache = {
    key: cached.key,
    valid: fresh.valid,
    product: fresh.product,
    checkedAt: Date.now(),
  };
  await context.globalState.update(STATE_KEY, next);
  changeEmitter.fire();
  return next.valid;
}

/** Synchronous best-effort answer for UI (status bar) without hitting the network. */
export function isProCached(context: vscode.ExtensionContext): boolean {
  const cached = getCachedLicense(context);
  return !!cached && !!cached.key && cached.valid;
}

/** Command: llmstxt.enterLicense — prompt for a key, validate and store it. */
export async function enterLicenseCommand(context: vscode.ExtensionContext): Promise<void> {
  const existing = getCachedLicense(context);
  const input = await vscode.window.showInputBox({
    title: "LLMs.txt Toolkit — Enter License Key",
    prompt: "Paste the license key you received after purchase",
    value: existing?.key ?? "",
    ignoreFocusOut: true,
    placeHolder: "e.g. AGR-XXXX-XXXX-XXXX",
    validateInput: (v) => (v.trim().length < 4 ? "That key looks too short." : undefined),
  });
  if (input === undefined) {
    return; // cancelled
  }
  const key = input.trim();
  if (!key) {
    await context.globalState.update(STATE_KEY, undefined);
    changeEmitter.fire();
    void vscode.window.showInformationMessage("License key cleared — running on the Free tier.");
    return;
  }

  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Validating license key…" },
    () => validateKeyRemote(key)
  );

  if (result === undefined) {
    // Could not reach the server: keep the key, mark unchecked so the next
    // feature use revalidates. Fail open to the free tier for now.
    const cache: LicenseCache = { key, valid: false, product: undefined, checkedAt: 0 };
    await context.globalState.update(STATE_KEY, cache);
    changeEmitter.fire();
    void vscode.window.showWarningMessage(
      "Could not reach the license server. Your key was saved and will be validated automatically once you are back online."
    );
    return;
  }

  const cache: LicenseCache = { key, valid: result.valid, product: result.product, checkedAt: Date.now() };
  await context.globalState.update(STATE_KEY, cache);
  changeEmitter.fire();

  if (result.valid) {
    const product = result.product ? ` (${result.product})` : "";
    void vscode.window.showInformationMessage(`Pro unlocked${product} — thanks for supporting the toolkit!`);
  } else {
    void vscode.window.showErrorMessage(
      "That license key is not valid. Check for typos, or get a license at " + PRICING_URL
    );
  }
}

/**
 * While no self-serve checkout is live, every feature ships free — the
 * extension's job is distribution for the AgentReady scanner. Flip to false to
 * re-arm the license gate (the key plumbing below stays functional).
 */
export const FREE_MODE = true;

/**
 * Gate for Pro commands. Returns true when Pro is active; otherwise shows an
 * upsell message with "Enter license key" / "Get a license" actions.
 */
export async function requirePro(context: vscode.ExtensionContext, featureName: string): Promise<boolean> {
  if (FREE_MODE || (await isPro(context))) {
    return true;
  }
  const enterAction = "Enter license key";
  const buyAction = "Get a license";
  const pick = await vscode.window.showInformationMessage(
    `${featureName} is a Pro feature. Unlock all Pro features with a one-time $29 license.`,
    enterAction,
    buyAction
  );
  if (pick === enterAction) {
    await enterLicenseCommand(context);
    return isPro(context);
  }
  if (pick === buyAction) {
    void vscode.env.openExternal(vscode.Uri.parse(PRICING_URL));
  }
  return false;
}
