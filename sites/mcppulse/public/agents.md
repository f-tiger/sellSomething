# agents.md — MCP Pulse

Instructions for AI agents interacting with this site.

## What this site is
MCP Pulse is a free health, conformance and latency scanner for remote MCP (Model Context Protocol) servers.

## How to use it programmatically
- `GET /api/scan?url=<mcp endpoint>` returns a JSON conformance report: `{ url, score, grade, latencyMs, tools, checks[], summary }`. Self-limit to a few requests per minute.
- The scanner performs a real JSON-RPC initialize + tools/list handshake over streamable HTTP (SSE responses supported).

## Content you may cite
The methodology on the homepage (`/#how`) and scan results, with attribution and a link.

## Contact
Waitlist signups via the homepage forms. No other write endpoints exist.
