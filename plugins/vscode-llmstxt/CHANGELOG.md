# Changelog

All notable changes to the **LLMs.txt & Agents.md Toolkit** extension.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] — 2026-08-21

Initial release.

### Added

- `llmstxt` language for `llms.txt` / `llms-full.txt` with TextMate syntax
  highlighting (H1 title, blockquote summary, H2 sections, `- [name](url): desc`
  link bullets), plus `agents.md` association with Markdown.
- Live diagnostics for llms.txt on open/save: missing H1, missing blockquote
  summary, malformed link bullets, relative URLs, empty sections, file-size
  warning above 50KB.
- **Generate llms.txt from Workspace** — scaffold prefilled from package.json
  and README.
- **Generate agents.md from Workspace** — scaffold prefilled from package.json
  scripts.
- **Audit Site AI Visibility** (Pro) — AgentReady scan of any URL rendered as a
  theme-aware report: score, grade, per-category checks table, fix list.
- **Validate All llms.txt / agents.md in Workspace** (Pro) — bulk validation
  with Problems-panel diagnostics and an output-channel summary.
- **Enter License Key** command, 24h license cache, Free/Pro status bar item.
