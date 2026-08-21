# agentic-commerce-tools — Gemini CLI extension

A [Gemini CLI](https://github.com/google-gemini/gemini-cli) extension that adds
free agentic-commerce readiness tools to your CLI session:

- **Scan any website** for AI-agent visibility (robots.txt AI-crawler access,
  llms.txt / agents.md, schema.org JSON-LD, sitemap, metadata) — 0–100 score with fixes.
- **Health-check any remote MCP server** (real `initialize` + `tools/list`
  handshake: protocol version, capabilities, tool docs quality, latency, TLS) —
  0–100 conformance score.

Both are backed by the remote MCP endpoint `https://mcppulse.agiscorecard.com/mcp`
(streamable HTTP, free, no API key). No local server process is spawned.

## Install

This extension currently lives inside the `sellSomething` monorepo under
`integrations/gemini-cli/`. Gemini CLI installs GitHub-hosted extensions from a
repo whose **root** contains `gemini-extension.json`, so for now install from a
local clone:

```sh
git clone https://github.com/f-tiger/sellSomething
gemini extensions install ./sellSomething/integrations/gemini-cli
```

Once it is split into its own repository (planned — this directory is
self-contained on purpose), the standard one-liner will work:

```sh
gemini extensions install <extension-repo-url>
```

and this in-monorepo copy will point there via the manifest's `migratedTo` field.

Then restart Gemini CLI and check:

```sh
gemini extensions list
```

## Use

Just ask, in a Gemini CLI session:

- "Is examplestore.com visible to AI shopping agents? Scan it."
- "Health-check my MCP server at https://mcp.example.com/mcp"

The model discovers the tools from the MCP server automatically; the bundled
`GEMINI.md` context tells it when to use which.

## What's in here

| File | Purpose |
|---|---|
| `gemini-extension.json` | Extension manifest — points `mcpServers` at our remote endpoint via `httpUrl` (streamable HTTP) |
| `GEMINI.md` | Context loaded into the model when the extension is active |
| `README.md` | This file |

## Uninstall

```sh
gemini extensions uninstall agentic-commerce-tools
```

## Related

- Free browser versions (no CLI needed): https://agentready.agiscorecard.com · https://mcppulse.agiscorecard.com
- Machine-payable API versions for autonomous agents (x402, $0.005/call in USDC,
  no account): https://x402.agiscorecard.com
