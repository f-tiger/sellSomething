# LLMs.txt & Agents.md Toolkit

**Make your site readable by AI agents — right from VS Code.**

ChatGPT, Claude, Perplexity and Google's AI Mode are already deciding which
sites get recommended, quoted and bought from. `llms.txt` and `agents.md` are
the two files that tell those agents what you offer and how to interact with
you. This extension gives you first-class editor support for both — syntax
highlighting, live validation, one-command scaffolding — plus Pro tools that
audit any site's **AI visibility** and **agent readiness** end to end.

> Keywords: llms.txt, llms-full.txt, agents.md, AI visibility, agent readiness,
> agentic commerce, AI SEO / GEO, ChatGPT Shopping, AI crawlers.

---

## Features

### Free

| Feature | What it does |
| --- | --- |
| **Language support** | `llms.txt` / `llms-full.txt` get their own language with TextMate highlighting for the H1 title, `>` summary blockquote, `##` sections and `- [name](url): description` link bullets. `agents.md` is associated with Markdown. |
| **Live validation** | On open and save, llms.txt is checked for: missing H1, missing blockquote summary, bullets that don't match the link format, relative URLs (agents read your file out of context), empty sections, and files over 50KB. Every issue has a precise range in the Problems panel. |
| **Generate llms.txt** | `LLMs.txt: Generate llms.txt from Workspace` scaffolds a spec-correct llms.txt, prefilled from your `package.json` and `README`, into an untitled editor. |
| **Generate agents.md** | `LLMs.txt: Generate agents.md from Workspace` scaffolds an agents.md with your real npm scripts in the Commands section. |

![Editing llms.txt with live diagnostics](images/screenshot-diagnostics.png)
*(screenshot placeholder — live diagnostics on llms.txt)*

### Pro tools — currently free for everyone

> **Launch promo:** every Pro feature below is unlocked for all users right now — no license needed. A one-time license may be introduced later; early users keep free access to what they already use.

| Feature | What it does |
| --- | --- |
| **Site AI-visibility audit** | `LLMs.txt: Audit Site AI Visibility` scans any URL with the [AgentReady](https://agentready.agiscorecard.com) engine: AI crawler access (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended), llms.txt / agents.md presence, JSON-LD Product/Organization/FAQ schema, meta basics and sitemap — rendered as a score, grade, checks table and prioritized fix list in a dark-theme-aware panel. |
| **Workspace validation** | `LLMs.txt: Validate All llms.txt / agents.md in Workspace` finds every llms.txt / llms-full.txt / agents.md across the workspace (monorepos included), validates all of them and prints a per-file summary. |

![Site audit report](images/screenshot-audit.png)
*(screenshot placeholder — AI-visibility audit panel)*

**Everything is free during launch.** If a paid tier is introduced later, keys will be sold at [agentready.agiscorecard.com/pricing](https://agentready.agiscorecard.com/pricing) and activated with
`LLMs.txt: Enter License Key` (or click the `llms.txt Free` status bar item).

---

## Commands

| Command | Tier |
| --- | --- |
| `LLMs.txt: Generate llms.txt from Workspace` | Free |
| `LLMs.txt: Generate agents.md from Workspace` | Free |
| `LLMs.txt: Audit Site AI Visibility` | Pro |
| `LLMs.txt: Validate All llms.txt / agents.md in Workspace` | Pro |
| `LLMs.txt: Enter License Key` | — |

## FAQ

**What is llms.txt?**
A markdown file at `/llms.txt` that gives AI agents a curated index of your
site: an H1 title, a one-line `>` summary, and `##` sections of
`- [name](url): description` links. Shopify serves one natively for every
store; this extension helps everyone else keep pace.

**What is agents.md?**
A companion convention (also adopted by Shopify and widely used for coding
agents) that tells agents *how to interact* with your project or store —
commands, boundaries, policies.

**Do I need the Pro tier to validate my llms.txt?**
No. Single-file validation, highlighting and both generators are free forever.
Pro adds the cross-workspace bulk validation and the live site audit.

**How does licensing work?**
Buy once at [agentready.agiscorecard.com/pricing](https://agentready.agiscorecard.com/pricing),
paste the key via `LLMs.txt: Enter License Key`. The key is verified against
our license API and cached for 24 hours. If you're offline, the extension fails
open — you're never locked out of the free features, and a previously validated
Pro license keeps working.

**Does the extension send my code anywhere?**
No. Validation runs entirely locally. The only network calls are the license
check (your key only) and the Pro site audit (the URL you explicitly enter).

**Why should I care about AI visibility now?**
AI agents already answer "what should I buy / which tool should I use"
questions. Sites without structured data, llms.txt or crawler access simply do
not exist in those answers. The free scanner behind this extension shows most
sites score under 55/100 — the fixes are cheap, and early movers win the
recommendation share.

---

## Publishing runbook (maintainers)

Release to both marketplaces so Cursor/Windsurf/VSCodium users are covered too.

1. **One-time: Azure DevOps PAT + publisher**
   1. Sign in at https://dev.azure.com (any org works, or create one).
   2. User settings → *Personal Access Tokens* → New token: Organization =
      **All accessible organizations**, Scope = **Marketplace → Manage**.
   3. Create the publisher — either on the web at
      https://marketplace.visualstudio.com/manage (ID must be `agiscorecard`),
      or with `npx @vscode/vsce create-publisher agiscorecard` (legacy CLI path).
   4. `npx @vscode/vsce login agiscorecard` and paste the PAT.
2. **Build & verify**
   ```bash
   cd plugins/vscode-llmstxt
   npm ci
   npm run typecheck
   npm run build
   npx @vscode/vsce package --no-dependencies   # produces llmstxt-toolkit-<version>.vsix
   code --install-extension llmstxt-toolkit-*.vsix   # smoke-test locally
   ```
3. **Publish to the VS Code Marketplace**
   ```bash
   npx @vscode/vsce publish --no-dependencies            # uses version in package.json
   # or bump-and-publish: npx @vscode/vsce publish patch --no-dependencies
   ```
4. **Publish to Open VSX** (Cursor, VSCodium, Gitpod reach)
   1. Create an account + access token at https://open-vsx.org (namespace
      `agiscorecard` must be created and claimed once:
      `npx ovsx create-namespace agiscorecard -p <token>`).
   2. `npx ovsx publish llmstxt-toolkit-<version>.vsix -p <token>`
5. **Tag the release** and update `CHANGELOG.md`. CI
   (`.github/workflows/plugin-vscode.yml`) already typechecks, bundles and
   uploads a `.vsix` artifact on every push touching `plugins/vscode-llmstxt/`.

## License

[MIT](LICENSE) — the extension code is open. The Pro license unlocks hosted
services (site audit API quota) and bulk features.
