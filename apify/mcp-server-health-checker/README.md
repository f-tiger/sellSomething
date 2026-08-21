# MCP Server Monitor — Health, Conformance & Latency Checker

**Is your MCP server actually usable by AI agents right now?** The Model Context Protocol is how Claude, ChatGPT, Cursor and every serious agent platform connect to external tools — and a broken handshake, a hung SSE stream or undocumented tools means agents silently skip you. This **MCP server health checker** tests any list of remote MCP endpoints and returns a hard **0-100 health score per server**, with every issue and how to fix it.

## What it checks

For every MCP endpoint you provide, the actor performs a real client interaction (not just a ping):

1. **JSON-RPC `initialize` handshake** over streamable HTTP — with full **SSE (`text/event-stream`) response parsing**, including servers that keep the stream open after answering.
2. **Protocol conformance** — negotiated `protocolVersion`, `serverInfo` identity, declared capabilities.
3. **`tools/list`** — does the server actually expose tools after `notifications/initialized`? (Session `Mcp-Session-Id` headers are honored.)
4. **Tool description completeness scoring** — the % of tools with meaningful descriptions. Agents choose tools by description; undocumented tools rarely get called.
5. **Handshake latency** — measured in ms and graded (< 800 ms pass, < 2500 ms warn).
6. **TLS** — HTTPS or plaintext.
7. **Auth mode detection** — open endpoint, Bearer token, HTTP Basic, or OAuth 2.0 (via `WWW-Authenticate` resource metadata). Auth-protected servers (401/403) are scored as a *pass* — requiring auth is good security.
8. **CORS preflight** — `Access-Control-Allow-Origin` / `Expose-Headers: Mcp-Session-Id`, which browser-based MCP clients need.

## Who it's for

- **MCP server authors** — validate conformance before (and after) every deploy; catch the regression before your users' agents do.
- **Platform & directory operators** — screen submitted MCP servers in bulk before listing them.
- **DevOps / SRE teams** — pair with Apify Schedules for a scheduled **MCP server monitor**: re-check your fleet hourly and alert on score drops.
- **Agent builders** — vet third-party MCP servers (latency, auth, tool quality) before wiring them into production workflows.

## Input example

```json
{
    "serverUrls": [
        "https://mcp.deepwiki.com/mcp",
        "https://mcp.apify.com",
        "https://your-server.example.com/mcp"
    ],
    "maxConcurrency": 5,
    "timeoutSecs": 10
}
```

## Output example (one dataset item per server)

```json
{
    "input": "https://mcp.deepwiki.com/mcp",
    "ok": true,
    "url": "https://mcp.deepwiki.com/mcp",
    "scannedAt": "2026-08-21T09:30:00.000Z",
    "latencyMs": 412,
    "score": 88,
    "grade": "B",
    "serverInfo": { "name": "DeepWiki", "version": "1.0.0" },
    "protocolVersion": "2025-06-18",
    "authProtected": false,
    "authMode": "none (open endpoint)",
    "tools": { "count": 3, "describedPct": 100, "names": ["read_wiki_structure", "read_wiki_contents", "ask_question"] },
    "issues": [
        {
            "title": "Authentication",
            "severity": "warn",
            "detail": "Server answered initialize without authentication...",
            "fix": "If this server is not meant to be public, require an Authorization header (OAuth or bearer token)."
        }
    ],
    "checks": [ { "id": "reachable", "category": "Transport", "title": "MCP handshake", "earned": 15, "possible": 15, "status": "pass", "detail": "Valid JSON-RPC initialize response received (JSON)." } ]
}
```

Unreachable endpoints are **still pushed** with `"ok": false` and an `error` field — every input URL is accounted for in the output.

## Pricing — pay per event, only for results

This actor charges a single event, **`server-checked` ($0.008 per completed health report)**. Unreachable servers are never charged.

Why $0.008 is fair: each check performs 3-4 network round-trips plus SSE stream parsing (a few seconds of small-container compute, well under $0.001 of platform cost). Checking a 100-server fleet costs $0.80 — less than a minute of an SRE's time, and you get structured, diffable JSON instead of "it seems fine".

## FAQ

**Which transport does it test?**
Streamable HTTP (the current MCP remote transport), accepting both `application/json` and `text/event-stream` responses. Legacy SSE-only (`GET /sse`) servers will fail the handshake check — which is itself a useful signal, since modern clients are dropping that transport.

**My server requires OAuth — is that a failure?**
No. A 401/403 with `WWW-Authenticate` is scored as a **pass** on the auth check and the report says which auth mode was detected. Deep introspection (tools/list) is skipped since it needs credentials.

**How do I monitor servers continuously?**
Create an Apify Schedule (e.g. hourly) with your server list as input. Each run appends fresh scores to the dataset; diff `score` between runs or wire the dataset into your alerting.

**Does it call any tools?**
No. It only calls `initialize`, `notifications/initialized` and `tools/list` — read-only protocol methods. It never invokes your actual tools, so it is safe to point at production.

**Why is CORS only worth 5 points?**
Server-to-server MCP clients (the majority) ignore CORS. It only matters for browser-based clients, so it is weighted as a minor check.

## Related keywords

MCP server monitor, MCP health check, Model Context Protocol testing, MCP server uptime, JSON-RPC initialize, streamable HTTP MCP, SSE MCP server, tools/list validator, MCP conformance checker, MCP latency monitoring, remote MCP server checker.

## Changelog

### 0.1.0 (2026-08-21)
- Initial release: initialize handshake (JSON + SSE), tools/list, latency, TLS, auth-mode detection (Bearer/OAuth/Basic), CORS preflight, tool-description scoring; pay-per-event pricing (`server-checked`).
