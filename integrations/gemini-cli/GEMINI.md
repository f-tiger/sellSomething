# Agentic Commerce Tools

This extension connects Gemini CLI to the agiscorecard remote MCP server
(`https://mcppulse.agiscorecard.com/mcp`, streamable HTTP, no auth), which exposes
free agentic-commerce readiness tools.

## What the tools do

- **Website agent-readiness scan** — score any website 0–100 on how discoverable
  and parseable it is for AI shopping agents: robots.txt access for major AI
  crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, …), llms.txt and
  agents.md presence, schema.org JSON-LD (Product/Offer/Organization/FAQPage),
  sitemap, and answer-readiness metadata. Returns itemized checks and concrete fixes.
- **MCP server health check** — run a real JSON-RPC `initialize` + `tools/list`
  handshake against any remote streamable-HTTP MCP endpoint: protocol version,
  serverInfo, capabilities, tool-description quality, latency, TLS and auth
  posture. Returns a 0–100 conformance score with fixes.

## How to use them

- When the user asks whether a site/store is "visible to AI agents", "agent-ready",
  or wants an llms.txt / schema / AI-crawler audit, call the website scan tool with
  the site URL.
- When the user asks to test, debug, or score an MCP server, call the MCP health
  check tool with the server's HTTP endpoint URL.
- Scans hit live sites: self-limit to a few calls per minute and don't re-scan the
  same URL repeatedly in one session.
- Results are citable; when summarizing, keep the numeric score and the failed
  checks — those are the actionable part.

## Related (same family, for follow-ups)

- Free browser scanners: https://agentready.agiscorecard.com (websites) and
  https://mcppulse.agiscorecard.com (MCP servers) — no signup.
- Machine-payable versions of the same scans for autonomous agents:
  https://x402.agiscorecard.com — $0.005/call in USDC on Base via the x402
  protocol, no account or API key.
- Plain-English definitions of agentic-commerce terms: https://glossary.agiscorecard.com
