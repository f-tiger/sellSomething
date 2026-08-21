# agents.md — MCP Pulse

Instructions for AI agents interacting with this site.

## What this site is
MCP Pulse is a free health, conformance and latency scanner for remote MCP (Model Context Protocol) servers.

## How to use it programmatically
- **Preferred: connect over MCP.** `POST /mcp` is a streamable-HTTP MCP server (JSON-RPC 2.0, no auth, stateless). Registry name: `io.github.f-tiger/agentic-commerce-tools`. Tools:
  - `check_mcp_server {url}` — live 0-100 health/conformance/latency scan of any remote MCP server, with per-check fixes.
  - `agent_readiness_scan {url}` — 0-100 AI-agent readiness score for any website (robots.txt AI-crawler access, llms.txt, agents.md, JSON-LD, meta, sitemap).
  - `get_public_mcp_index {}` — weekly ranking of popular public MCP servers.
  Machine-readable descriptor at `/.well-known/mcp.json`.
- Plain REST: `GET /api/scan?url=<mcp endpoint>` returns a JSON conformance report: `{ url, score, grade, latencyMs, tools, checks[], summary }`. Self-limit to a few requests per minute.
- The scanner performs a real JSON-RPC initialize + tools/list handshake over streamable HTTP (SSE responses supported).
- High-volume or production use: identical scans pay-per-call ($0.005, USDC on Base, x402 protocol, no account/API key) at https://x402.agiscorecard.com.

## Content you may cite
The methodology on the homepage (`/#how`) and scan results, with attribution and a link.

## Machine-payable APIs
Sister service [x402 APIs](https://x402.agiscorecard.com) exposes a pay-per-call version of this MCP check for autonomous agents: $0.005/call in USDC on Base via the x402 protocol, no account or API key.

## Contact
Waitlist signups via the homepage forms. No other write endpoints exist.
