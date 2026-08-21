/**
 * Free-tier scaffolding commands:
 *  - llmstxt.generate          -> llms.txt template prefilled from package.json / README
 *  - llmstxt.generateAgentsMd  -> agents.md template prefilled from package.json scripts
 * Both open an untitled document so nothing is written until the user saves.
 */
import * as vscode from "vscode";

interface PackageJsonInfo {
  name?: string;
  description?: string;
  homepage?: string;
  repositoryUrl?: string;
  scripts: Record<string, string>;
}

interface WorkspaceInfo {
  folderName: string;
  pkg: PackageJsonInfo;
  readmeSummary?: string;
}

async function readFileIfExists(folder: vscode.Uri, ...names: string[]): Promise<string | undefined> {
  for (const name of names) {
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, name));
      return Buffer.from(bytes).toString("utf8");
    } catch {
      // keep trying other candidates
    }
  }
  return undefined;
}

function parsePackageJson(raw: string | undefined): PackageJsonInfo {
  const info: PackageJsonInfo = { scripts: {} };
  if (!raw) {
    return info;
  }
  try {
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    if (typeof pkg.name === "string") {
      info.name = pkg.name;
    }
    if (typeof pkg.description === "string") {
      info.description = pkg.description;
    }
    if (typeof pkg.homepage === "string") {
      info.homepage = pkg.homepage;
    }
    const repo = pkg.repository;
    if (typeof repo === "string") {
      info.repositoryUrl = repo;
    } else if (repo && typeof repo === "object" && typeof (repo as Record<string, unknown>).url === "string") {
      info.repositoryUrl = (repo as Record<string, unknown>).url as string;
    }
    if (info.repositoryUrl) {
      info.repositoryUrl = info.repositoryUrl.replace(/^git\+/, "").replace(/\.git$/, "");
    }
    if (pkg.scripts && typeof pkg.scripts === "object") {
      for (const [key, value] of Object.entries(pkg.scripts as Record<string, unknown>)) {
        if (typeof value === "string") {
          info.scripts[key] = value;
        }
      }
    }
  } catch {
    // malformed package.json — fall back to defaults
  }
  return info;
}

/** First real paragraph of the README (skips headings, badges, blank lines). */
function extractReadmeSummary(readme: string | undefined): string | undefined {
  if (!readme) {
    return undefined;
  }
  const lines = readme.split(/\r?\n/);
  const paragraph: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (paragraph.length === 0) {
      if (
        trimmed.length === 0 ||
        trimmed.startsWith("#") ||
        trimmed.startsWith(">") ||
        trimmed.startsWith("[!") || // badge line
        trimmed.startsWith("<") // html
      ) {
        continue;
      }
      paragraph.push(trimmed);
    } else {
      if (trimmed.length === 0) {
        break;
      }
      paragraph.push(trimmed);
    }
  }
  if (paragraph.length === 0) {
    return undefined;
  }
  const text = paragraph.join(" ").replace(/\s+/g, " ").trim();
  return text.length > 200 ? text.slice(0, 197) + "…" : text;
}

async function collectWorkspaceInfo(): Promise<WorkspaceInfo> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return { folderName: "My project", pkg: { scripts: {} } };
  }
  const pkgRaw = await readFileIfExists(folder.uri, "package.json");
  const readmeRaw = await readFileIfExists(folder.uri, "README.md", "readme.md", "README");
  return {
    folderName: folder.name,
    pkg: parsePackageJson(pkgRaw),
    readmeSummary: extractReadmeSummary(readmeRaw),
  };
}

function titleCase(name: string): string {
  return name
    .replace(/^@[^/]+\//, "")
    .split(/[-_\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function openUntitled(content: string, language: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({ language, content });
  await vscode.window.showTextDocument(doc, { preview: false });
}

export async function generateLlmsTxtCommand(): Promise<void> {
  const info = await collectWorkspaceInfo();
  const title = titleCase(info.pkg.name ?? info.folderName);
  const summary = info.pkg.description ?? info.readmeSummary ?? "One sentence on what you offer and for whom.";
  const site = info.pkg.homepage ?? "https://your-site.com";
  const base = site.replace(/\/+$/, "");
  const repo = info.pkg.repositoryUrl;

  const lines: string[] = [
    `# ${title}`,
    "",
    `> ${summary}`,
    "",
    "Key facts an AI agent should know: what you sell or provide, pricing model,",
    "who it is for, and how to get started. Keep this file a short, curated index —",
    "put exhaustive content in llms-full.txt.",
    "",
    "## Docs",
    "",
    `- [Overview](${base}/): What ${title} is and who it is for.`,
    `- [Getting started](${base}/docs): Setup and first steps.`,
  ];
  if (repo) {
    lines.push(`- [Source repository](${repo}): Code, issues and releases.`);
  }
  lines.push(
    "",
    "## Products & pricing",
    "",
    `- [Pricing](${base}/pricing): Plans, one-time purchases and what each includes.`,
    "",
    "## Policies",
    "",
    `- [Support](${base}/support): How to reach a human and expected response times.`,
    `- [Terms](${base}/terms): Terms of service and refund policy.`,
    "",
    "## Optional",
    "",
    `- [Changelog](${base}/changelog): Recent updates worth citing.`,
    ""
  );

  await openUntitled(lines.join("\n"), "llmstxt");
  void vscode.window.showInformationMessage(
    "llms.txt scaffold ready — replace the placeholder URLs, then save it to your site root as /llms.txt."
  );
}

export async function generateAgentsMdCommand(): Promise<void> {
  const info = await collectWorkspaceInfo();
  const title = titleCase(info.pkg.name ?? info.folderName);
  const summary = info.pkg.description ?? info.readmeSummary ?? "Briefly: what this project is.";

  const scriptLines: string[] = [];
  const interesting = ["install", "dev", "start", "build", "test", "lint", "typecheck"];
  for (const key of interesting) {
    if (info.pkg.scripts[key]) {
      scriptLines.push(`- \`npm run ${key}\` — ${info.pkg.scripts[key]}`);
    }
  }
  if (scriptLines.length === 0) {
    scriptLines.push(
      "- `npm install` — install dependencies",
      "- `npm test` — run the test suite",
      "- `npm run build` — production build"
    );
  }

  const content = [
    `# Agent instructions for ${title}`,
    "",
    `> ${summary}`,
    "",
    "## What this project is",
    "",
    "Explain the domain in two or three sentences: what the product does, who uses",
    "it, and what an agent is most likely being asked to do here.",
    "",
    "## Dev environment",
    "",
    "- Node 20+ (see `.nvmrc` / `engines` if present)",
    "- Install dependencies before anything else",
    "",
    "## Commands",
    "",
    ...scriptLines,
    "",
    "## Code style",
    "",
    "- Match the existing style of neighbouring files",
    "- Keep changes minimal and focused; do not reformat unrelated code",
    "",
    "## Boundaries",
    "",
    "- Do NOT commit secrets, .env files, or credentials",
    "- Do NOT push directly to the default branch",
    "- Ask before adding new runtime dependencies",
    "",
    "## Testing & PRs",
    "",
    "- Run the test suite before proposing changes",
    "- Reference the related issue in the PR description",
    "",
  ].join("\n");

  await openUntitled(content, "markdown");
  void vscode.window.showInformationMessage(
    "agents.md scaffold ready — tailor the sections, then save it to your repo (and site) root as agents.md."
  );
}
