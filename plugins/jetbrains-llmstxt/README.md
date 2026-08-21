# LLMs.txt & Agents.md Support — JetBrains plugin

Paid JetBrains IDE plugin (product code `PLLMSTXT`) for the AI-visibility / agentic-commerce
niche: first-class editor support for `llms.txt`, `llms-full.txt` and `agents.md`, plus an
in-IDE [AgentReady](https://agentready.agiscorecard.com) site audit. Licensing (including the
30-day free trial) is handled entirely by JetBrains Marketplace — no license code in the plugin.

## Features

- **File types + highlighting** — `llms.txt` / `llms-full.txt` / `agents.md` get their own file
  type, icon and line-based syntax highlighting (H1 title, `>` summary blockquote, `##` sections,
  `- [name](url): description` link bullets).
- **Completion** — canonical llms.txt sections (`## Docs`, `## Products`, `## Policies`,
  `## Optional`, …), common agents.md sections (`## Setup commands`, `## Code style`, …) and a
  link-bullet template. Trigger with Ctrl+Space (typing `#` does not auto-popup).
- **Inspections (annotator) + quick-fixes** — missing H1 title, missing summary blockquote,
  malformed link bullets, relative/non-HTTPS URLs, empty `##` sections; fixes insert the missing
  scaffold or a sample link.
- **Generators** — Tools → *LLMs.txt & Agents.md* → *Generate llms.txt* / *Generate agents.md*
  (also in the New file menu). Templates are pre-filled from the default domain setting.
- **AgentReady audit tool window** — *Audit Site with AgentReady…* prompts for a URL, calls
  `GET https://agentready.agiscorecard.com/api/scan?url=…` in a background task and renders
  score / grade / per-check PASS-WARN-FAIL rows. Fails soft with a status message when offline.
  This is the plugin's **only** network call and it runs only on explicit user action.
- **Settings** — Settings → Tools → *LLMs.txt & Agents.md*: default site domain
  (persisted app-wide in `llmstxt-agents.xml`).

## Build

Prerequisites: JDK 21 (auto-provisioned via the Foojay toolchain resolver if missing) and any
recent Gradle to bootstrap the wrapper. **No wrapper binaries are committed** — generate them:

```bash
cd plugins/jetbrains-llmstxt
gradle wrapper --gradle-version 8.10   # one-time bootstrap
./gradlew buildPlugin                  # → build/distributions/llmstxt-agentsmd-support-2026.1.0.zip
./gradlew runIde                       # launch a sandbox IDE with the plugin
./gradlew verifyPlugin                 # Plugin Verifier against IC (see build.gradle.kts)
```

Notes:

- `plugin.xml` keeps the documented placeholder
  `release-date="__RELEASE_DATE__"` — the Gradle `patchPluginXml` step replaces it from
  `pluginReleaseDate` in `gradle.properties` (or today's date when unset). **Pin it before a
  real Marketplace release.**
- Paid-plugin version rule: `pluginVersion` (2026.1.x) must start with the digits of
  `release-version` (20261). Bump both together (e.g. 2026.2.0 ↔ 20262).
- Target platform: IntelliJ IDEA Community 2024.2+ (`sinceBuild=242`, no `untilBuild`).

## JetBrains Marketplace publish runbook (paid plugin)

1. **Vendor profile** — create/verify the vendor "AGIScorecard" at
   <https://plugins.jetbrains.com> (Organizations → new vendor), set website
   `https://agentready.agiscorecard.com`, a support email, and complete the **bank/payout
   details** (required before any paid listing goes live).
2. **Request paid-plugin approval** — paid/freemium listings require JetBrains approval:
   open Marketplace → *Sell your plugin* and submit the form (vendor must be a legal entity or
   registered sole proprietor; JetBrains acts as merchant of record).
3. **Register the product code** — in the Marketplace vendor console add product code
   `PLLMSTXT` for this plugin. It must match `<product-descriptor code="PLLMSTXT" …/>` exactly.
4. **First upload** — `./gradlew buildPlugin` with `pluginReleaseDate` pinned in
   `gradle.properties`, then upload `build/distributions/*.zip` manually. After approval,
   automate with the `publishPlugin` task (`intellijPlatform.publishing.token` from a
   Marketplace API token stored as a CI secret; optionally configure `signing { }` with a
   certificate chain + private key).
5. **Pricing** — suggested launch pricing: **US$19/year personal** (≈US$39/year commercial),
   with the **30-day free trial** enabled in the listing. Marketplace handles VAT, invoicing
   and license enforcement; JetBrains takes a **15% commission** (net payout ≈ $16/yr per
   personal seat). Annual-only keeps the SKU simple; JetBrains applies its standard
   second/third-year continuity discounts automatically.
6. **Release cadence** — for every paid release: bump `pluginVersion` + (if a new major)
   `pluginReleaseVersion`, set `pluginReleaseDate` to the actual release date, update
   `<change-notes>`, run `./gradlew buildPlugin verifyPlugin`, upload.

## Roadmap

- **v2026.1.x** — color settings page; llms.txt structure view; spellcheck suppression.
- **v2026.2** — generate `llms.txt` from the project's sitemap.xml / routes; `llms-full.txt`
  expansion; ACP/UCP product-feed JSON schema validation (ties into SellToAgents content).
- **Later** — AgentReady monitor integration (watch a domain, surface regressions in the IDE
  status bar); deep-audit report rendering (`/api/report`); optional bundle deal with the
  AgentReady DevKit license (`/api/license/validate`) for teams buying outside Marketplace.

## Known limitations

- The lexer/annotator are line-based by design (the llms.txt spec is line-oriented) — no
  inline-markdown parsing inside descriptions.
- `agents.md` intentionally gets the lenient rule set (H1 check only) since it is free-form.
- If the JetBrains Markdown plugin is installed, the exact filename association `agents.md`
  takes precedence over the generic `*.md` extension mapping; users can reassign in
  Settings → Editor → File Types.
