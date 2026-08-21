/**
 * MCP Pulse — health, conformance and latency scanner for remote MCP servers.
 * GET  /api/scan?url=<mcp endpoint>   → JSON health report (JSON-RPC over streamable HTTP)
 * GET  /api/badge?url=<mcp endpoint>  → SVG score badge (embed in your README)
 * POST /api/subscribe                 → Pro-monitoring waitlist (shared SUBSCRIBERS KV)
 * POST /mcp                           → this site's own MCP server (streamable HTTP,
 *                                       JSON-RPC 2.0, no SDK) — listed in the official
 *                                       MCP Registry as io.github.f-tiger/agentic-commerce-tools
 * GET  /.well-known/mcp.json          → machine-readable MCP server descriptor
 */

const TIMEOUT_MS = 10000;
const PROTOCOL = "2025-06-18";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/scan") return handleScan(request);
    if (url.pathname === "/api/badge") return handleBadge(request);
    if (url.pathname === "/api/subscribe") return handleSubscribe(request, env);
    if (url.pathname === "/mcp") return handleMcp(request, env);
    if (url.pathname === "/.well-known/mcp.json") return handleWellKnownMcp();
    return env.ASSETS.fetch(request);
  },
};

/* ---------------- scan ---------------- */

async function handleScan(request) {
  const target = normalizeTarget(new URL(request.url).searchParams.get("url"));
  if (target.error) return json({ error: target.error }, 400);
  const report = await buildReport(target.href);
  if (report.error) return json({ error: report.error }, report.status || 422);
  return json(report);
}

async function buildReport(href) {
  const checks = [];
  const started = Date.now();
  let init;
  try {
    init = await rpc(href, null, "initialize", {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: "MCPPulse", version: "1.0" },
    }, 1);
  } catch (e) {
    return { error: "Could not reach " + href + " — " + (e.message || "network error"), status: 422 };
  }
  const latency = Date.now() - started;

  if (init.status === 401 || init.status === 403) {
    checks.push(check("reachable", "Transport", "Endpoint reachable", 15, 15, "pass",
      "Server responded (HTTP " + init.status + ")."));
    checks.push(check("auth", "Security", "Authentication", 15, 15, "pass",
      "Server requires authentication (" + init.status + ") — good: your MCP server is not open to the world. Full introspection needs credentials, so the remaining checks are limited."));
    checks.push(checkHttps(href));
    return finish(href, checks, latency, null, { authProtected: true });
  }

  if (!init.ok || !init.result) {
    checks.push(check("reachable", "Transport", "MCP handshake", 0, 15, "fail",
      "Endpoint responded (HTTP " + init.status + ") but did not return a valid JSON-RPC initialize result. " + (init.note || ""),
      "Confirm this is a streamable-HTTP MCP endpoint that accepts POSTed JSON-RPC 'initialize' requests."));
    checks.push(checkHttps(href));
    return finish(href, checks, latency, null, {});
  }

  const r = init.result;
  checks.push(check("reachable", "Transport", "MCP handshake", 15, 15, "pass",
    "Valid JSON-RPC initialize response received" + (init.sse ? " (SSE stream)" : " (JSON)") + "."));

  const proto = r.protocolVersion;
  checks.push(check("protocol", "Conformance", "Protocol version", proto ? 10 : 0, 10, proto ? "pass" : "fail",
    proto ? "Server negotiated protocol version " + proto + "." : "No protocolVersion in initialize result.",
    proto ? null : "Return protocolVersion in the initialize result per the MCP spec."));

  const si = r.serverInfo || {};
  const idOk = !!(si.name && si.version);
  checks.push(check("identity", "Conformance", "Server identity", idOk ? 10 : 0, 10, idOk ? "pass" : "warn",
    idOk ? 'Identifies as "' + si.name + '" v' + si.version + "." : "serverInfo name/version missing — clients and directories can't identify your server.",
    idOk ? null : "Set serverInfo.name and serverInfo.version."));

  const caps = r.capabilities || {};
  const capList = Object.keys(caps);
  checks.push(check("capabilities", "Conformance", "Declared capabilities", capList.length ? 5 : 0, 5, capList.length ? "pass" : "warn",
    capList.length ? "Declares: " + capList.join(", ") + "." : "No capabilities declared.",
    capList.length ? null : "Declare tools/resources/prompts capabilities you support."));

  let toolsInfo = null;
  if (caps.tools !== undefined) {
    try {
      await rpcNotify(href, init.sessionId, "notifications/initialized");
      const tl = await rpc(href, init.sessionId, "tools/list", {}, 2);
      const tools = tl.ok && tl.result && Array.isArray(tl.result.tools) ? tl.result.tools : null;
      if (tools) {
        const described = tools.filter((t) => t.description && t.description.length >= 10).length;
        const pct = tools.length ? Math.round((described / tools.length) * 100) : 0;
        toolsInfo = { count: tools.length, describedPct: pct, names: tools.slice(0, 12).map((t) => t.name) };
        checks.push(check("tools-list", "Tools", "tools/list", 15, 15, "pass",
          tools.length + " tool(s) listed: " + toolsInfo.names.join(", ") + (tools.length > 12 ? ", …" : "") + "."));
        checks.push(check("tool-docs", "Tools", "Tool descriptions", pct >= 80 ? 10 : pct >= 40 ? 5 : 0, 10,
          pct >= 80 ? "pass" : "warn",
          pct + "% of tools have meaningful descriptions. Agents choose tools by description — undocumented tools rarely get called.",
          pct >= 80 ? null : "Write a one-sentence description for every tool (what it does, inputs, when to use it)."));
      } else {
        checks.push(check("tools-list", "Tools", "tools/list", 0, 15, "fail",
          "tools capability declared but tools/list failed (HTTP " + tl.status + ").",
          "Ensure tools/list responds after initialize; include the Mcp-Session-Id header if you issue one."));
      }
    } catch (e) {
      checks.push(check("tools-list", "Tools", "tools/list", 0, 15, "fail", "tools/list errored: " + e.message, null));
    }
  } else {
    checks.push(check("tools-list", "Tools", "tools capability", 0, 15, "warn",
      "Server declares no tools capability — nothing for agents to call.", "Expose at least one tool, or this server is invisible to agent workflows."));
  }

  checks.push(check("latency", "Transport", "Handshake latency",
    latency < 800 ? 10 : latency < 2500 ? 6 : 2, 10,
    latency < 800 ? "pass" : latency < 2500 ? "warn" : "fail",
    latency + " ms to initialize. Agents run multi-step chains — every slow hop compounds.",
    latency < 800 ? null : "Serve from an edge runtime or reduce cold starts."));

  checks.push(checkHttps(href));

  checks.push(check("auth", "Security", "Authentication", 0, 5, "warn",
    "Server answered initialize without authentication. Fine for public read-only servers; risky if any tool mutates state or reaches private data.",
    "If this server is not meant to be public, require an Authorization header (OAuth or bearer token)."));

  return finish(href, checks, latency, toolsInfo, { serverInfo: si, protocolVersion: proto });
}

function checkHttps(href) {
  const https = href.startsWith("https:");
  return check("tls", "Security", "HTTPS", https ? 10 : 0, 10, https ? "pass" : "fail",
    https ? "Served over HTTPS." : "Not HTTPS — most MCP clients refuse plaintext endpoints.",
    https ? null : "Serve the endpoint over TLS.");
}

function finish(url, checks, latency, tools, extra) {
  const earned = checks.reduce((s, c) => s + c.earned, 0);
  const possible = checks.reduce((s, c) => s + c.possible, 0);
  const score = Math.round((earned / possible) * 100);
  return {
    url,
    scannedAt: new Date().toISOString(),
    latencyMs: latency,
    score,
    grade: score >= 90 ? "A" : score >= 75 ? "B" : score >= 55 ? "C" : score >= 35 ? "D" : "F",
    tools,
    ...extra,
    checks,
    summary:
      score >= 90 ? "Excellent — clients and agent platforms can rely on this server." :
      score >= 75 ? "Good — solid conformance with a few gaps worth closing." :
      score >= 55 ? "Partial — works, but agents will hit friction (docs, latency or metadata gaps)." :
      "Weak — most MCP clients will struggle with this endpoint.",
  };
}

function check(id, category, title, earned, possible, status, detail, fix = null) {
  return { id, category, title, earned, possible, status, detail, fix };
}

/* ---------------- badge ---------------- */

async function handleBadge(request) {
  const target = normalizeTarget(new URL(request.url).searchParams.get("url"));
  let label = "MCP Pulse";
  let value, color;
  if (target.error) {
    value = "invalid url"; color = "#9ca3af";
  } else {
    const report = await buildReport(target.href);
    if (report.error) { value = "unreachable"; color = "#f87171"; }
    else if (report.authProtected) { value = "auth ✓"; color = "#2dd4bf"; }
    else {
      value = report.grade + " " + report.score;
      color = report.grade === "A" ? "#65a30d" : report.grade === "B" ? "#0d9488"
            : report.grade === "C" ? "#d97706" : "#dc2626";
    }
  }
  return new Response(renderBadge(label, value, color), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Let GitHub's camo proxy cache for an hour so README badges stay fast.
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

function renderBadge(label, value, color) {
  const lw = 7 * label.length + 12;
  const vw = 7 * value.length + 14;
  const w = lw + vw;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(label)}: ${esc(value)}">
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)">
<rect width="${lw}" height="20" fill="#20303a"/>
<rect x="${lw}" width="${vw}" height="20" fill="${color}"/>
<rect width="${w}" height="20" fill="url(#s)"/>
</g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${esc(label)}</text>
<text x="${lw / 2}" y="14">${esc(label)}</text>
<text x="${lw + vw / 2}" y="15" fill="#010101" fill-opacity=".3">${esc(value)}</text>
<text x="${lw + vw / 2}" y="14">${esc(value)}</text>
</g></svg>`;
}

/* ---------------- JSON-RPC over streamable HTTP ---------------- */

async function rpc(url, sessionId, method, params, id) {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": PROTOCOL,
    "User-Agent": "MCPPulse/1.0 (+https://mcppulse.agiscorecard.com)",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const out = { status: res.status, ok: false, result: null, sessionId: res.headers.get("mcp-session-id") || sessionId, sse: false };
  if (!res.ok) return out;
  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  const text = (await res.text()).slice(0, 200000);
  try {
    if (ctype.includes("text/event-stream")) {
      out.sse = true;
      for (const line of text.split("\n")) {
        if (line.startsWith("data:")) {
          const payload = JSON.parse(line.slice(5).trim());
          if (payload.id === id && payload.result) { out.result = payload.result; out.ok = true; break; }
          if (payload.id === id && payload.error) { out.note = "JSON-RPC error: " + (payload.error.message || payload.error.code); break; }
        }
      }
    } else {
      const payload = JSON.parse(text);
      if (payload.result) { out.result = payload.result; out.ok = true; }
      else if (payload.error) out.note = "JSON-RPC error: " + (payload.error.message || payload.error.code);
    }
  } catch {
    out.note = "Response was not parseable JSON / SSE.";
  }
  return out;
}

async function rpcNotify(url, sessionId, method) {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": PROTOCOL,
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => {});
}

/* ---------------- our own MCP server (streamable HTTP, JSON-RPC 2.0) ----------------
 * Stateless: no session is issued, every POST is self-contained.
 * Mirrors what buildReport() above expects of a healthy server: valid initialize
 * result (protocolVersion + serverInfo + capabilities), tools/list with fully
 * described tools, JSON responses, open CORS.
 */

const MCP_SERVER_INFO = {
  name: "io.github.f-tiger/agentic-commerce-tools",
  title: "Agentic Commerce Tools (MCP Pulse)",
  version: "1.0.0",
};

// Newest first. We negotiate: echo the client's version if we support it,
// otherwise answer with our latest.
const MCP_SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const MCP_INSTRUCTIONS =
  "Free tools for the agentic-commerce stack: scan any remote MCP server for health/conformance " +
  "(check_mcp_server), score any website's readiness for AI shopping agents (agent_readiness_scan), " +
  "and read a weekly index of public MCP servers (get_public_mcp_index). All tools are free; " +
  "please self-limit to a few calls per minute. For high-volume or production agent use, the same " +
  "scans are available pay-per-call ($0.005, USDC on Base, no account or API key) via the x402 " +
  "protocol at https://x402.agiscorecard.com.";

const MCP_TOOLS = [
  {
    name: "check_mcp_server",
    title: "MCP server health & conformance scan",
    description:
      "Run a free, live health, conformance and latency scan of any remote MCP (Model Context Protocol) " +
      "server over streamable HTTP. Performs a real JSON-RPC initialize + tools/list handshake and returns " +
      "a 0-100 score with letter grade, per-check breakdown (protocol version, serverInfo identity, declared " +
      "capabilities, tool count and description quality, handshake latency, HTTPS, auth posture) and a concrete " +
      "fix for every failed check. Use it before recommending, installing or listing an MCP server, or to debug " +
      "why an agent platform rejects one. Auth-protected servers are detected and scored on reachable surface. " +
      "Free tier: please self-limit to a few calls per minute. High-volume / production use: the identical scan " +
      "is available pay-per-call via the x402 payment protocol at https://x402.agiscorecard.com/api/mcp-check " +
      "($0.005 per call in USDC on Base — no account, no API key).",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "The MCP endpoint URL to scan, e.g. https://example.com/mcp. Must be a public streamable-HTTP " +
            "MCP endpoint; https:// is assumed when the scheme is omitted. Private/localhost addresses are rejected.",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "agent_readiness_scan",
    title: "Website AI-agent readiness scan",
    description:
      "Score any website 0-100 on how ready it is for AI agents and AI shopping assistants (free, via " +
      "AgentReady, agentready.agiscorecard.com). Checks whether AI crawlers are allowed in robots.txt, and " +
      "whether the site serves llms.txt, agents.md, JSON-LD structured data (Product/Offer/Organization), " +
      "descriptive meta tags and a sitemap — the signals ChatGPT, Claude, Perplexity and shopping agents use " +
      "to find, understand and recommend a business. Returns itemized checks with pass/fail status and a " +
      "concrete fix for each gap. Use it to audit a merchant site, compare competitors, or generate an " +
      "agentic-SEO to-do list. Free tier: please self-limit to a few calls per minute. High-volume / " +
      "production use: the identical scan is available pay-per-call via the x402 payment protocol at " +
      "https://x402.agiscorecard.com/api/scan ($0.005 per call in USDC on Base — no account, no API key).",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The website URL to scan, e.g. https://example-store.com. https:// is assumed when the scheme is omitted.",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "get_public_mcp_index",
    title: "Public MCP Server Index (weekly)",
    description:
      "Return the Public MCP Server Index: a weekly-refreshed health, conformance and latency ranking of " +
      "popular public (no-auth) remote MCP servers, scored 0-100 by the same live JSON-RPC handshake used by " +
      "check_mcp_server. Includes per-server score, grade, latency, tool count, description quality and failing " +
      "checks, plus aggregate stats (how many popular servers are auth-gated, average score and latency). " +
      "Use it to pick a reliable public MCP server for a task, cite ecosystem statistics, or benchmark a server " +
      "against the field. Free, no parameters. Curated by MCP Pulse (mcppulse.agiscorecard.com); on-demand scans " +
      "of arbitrary servers at scale are available pay-per-call via x402 at https://x402.agiscorecard.com.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

const MCP_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
};

function mcpJson(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...MCP_CORS, ...extraHeaders },
  });
}

function rpcResult(id, result) {
  return mcpJson({ jsonrpc: "2.0", id, result });
}

function rpcError(id, code, message, status = 200, data = undefined, extraHeaders = {}) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return mcpJson({ jsonrpc: "2.0", id: id === undefined ? null : id, error }, status, extraHeaders);
}

async function handleMcp(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: MCP_CORS });
  }
  if (request.method === "GET") {
    // Spec-tolerant: we do not offer a standalone SSE stream; clients must POST.
    return rpcError(null, -32000,
      "This MCP server does not offer a standalone SSE stream. POST JSON-RPC 2.0 messages to this endpoint (streamable HTTP transport).",
      405, undefined, { "Allow": "POST, OPTIONS" });
  }
  if (request.method === "DELETE") {
    // Stateless server — no sessions to delete.
    return new Response(null, { status: 405, headers: { "Allow": "POST, OPTIONS", ...MCP_CORS } });
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { "Allow": "POST, OPTIONS", ...MCP_CORS } });
  }

  let msg;
  try {
    msg = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error: request body is not valid JSON.", 400);
  }
  if (Array.isArray(msg)) {
    // JSON-RPC batching was removed from MCP in protocol 2025-06-18.
    return rpcError(null, -32600, "Batch requests are not supported (MCP protocol 2025-06-18).", 400);
  }
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0") {
    return rpcError(null, -32600, "Invalid Request: expected a JSON-RPC 2.0 message.", 400);
  }

  // Notifications and client responses get 202 Accepted with no body.
  const hasId = msg.id !== undefined && msg.id !== null;
  if (!hasId || typeof msg.method !== "string") {
    if (typeof msg.method === "string" || "result" in msg || "error" in msg) {
      return new Response(null, { status: 202, headers: MCP_CORS });
    }
    return rpcError(null, -32600, "Invalid Request: message has neither method nor result/error.", 400);
  }

  const { id, method } = msg;
  const params = msg.params && typeof msg.params === "object" ? msg.params : {};

  try {
    switch (method) {
      case "initialize": {
        const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
        const protocolVersion = MCP_SUPPORTED_PROTOCOLS.includes(requested) ? requested : MCP_SUPPORTED_PROTOCOLS[0];
        return rpcResult(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: MCP_SERVER_INFO,
          instructions: MCP_INSTRUCTIONS,
        });
      }
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: MCP_TOOLS });
      case "tools/call":
        return await handleMcpToolCall(id, params, env, request);
      default:
        return rpcError(id, -32601, "Method not found: " + method);
    }
  } catch (e) {
    return rpcError(id, -32603, "Internal error: " + (e && e.message ? e.message : "unknown"));
  }
}

async function handleMcpToolCall(id, params, env, request) {
  const name = params.name;
  const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
  if (typeof name !== "string" || !MCP_TOOLS.some((t) => t.name === name)) {
    return rpcError(id, -32602, "Unknown tool: " + String(name) + ". Available: " + MCP_TOOLS.map((t) => t.name).join(", "));
  }

  const toolOk = (data) => rpcResult(id, {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    isError: false,
  });
  const toolErr = (text) => rpcResult(id, {
    content: [{ type: "text", text }],
    isError: true,
  });

  if (name === "check_mcp_server") {
    if (typeof args.url !== "string" || !args.url.trim()) {
      return rpcError(id, -32602, "Invalid params: 'url' (string) is required for check_mcp_server.");
    }
    const target = normalizeTarget(args.url);
    if (target.error) return toolErr("Invalid url: " + target.error);
    const report = await buildReport(target.href);
    if (report.error) return toolErr(report.error);
    return toolOk(report);
  }

  if (name === "agent_readiness_scan") {
    if (typeof args.url !== "string" || !args.url.trim()) {
      return rpcError(id, -32602, "Invalid params: 'url' (string) is required for agent_readiness_scan.");
    }
    try {
      const res = await fetch("https://agentready.agiscorecard.com/api/scan?url=" + encodeURIComponent(args.url.trim()), {
        headers: { "Accept": "application/json", "User-Agent": "MCPPulse-MCP/1.0 (+https://mcppulse.agiscorecard.com/mcp)" },
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        return toolErr("AgentReady scan failed (HTTP " + res.status + ")" + (data && data.error ? ": " + data.error : "."));
      }
      return toolOk(data);
    } catch (e) {
      return toolErr("AgentReady scan errored: " + (e && e.message ? e.message : "network error"));
    }
  }

  if (name === "get_public_mcp_index") {
    try {
      const assetUrl = new URL("/data/mcp-index.json", new URL(request.url).origin);
      const res = await env.ASSETS.fetch(new Request(assetUrl.href));
      if (!res.ok) return toolErr("Index unavailable (HTTP " + res.status + "). Try https://mcppulse.agiscorecard.com/data/mcp-index.json directly.");
      const data = await res.json();
      return toolOk(data);
    } catch (e) {
      return toolErr("Could not read the index: " + (e && e.message ? e.message : "unknown error"));
    }
  }

  return rpcError(id, -32602, "Unknown tool: " + name);
}

/* ---------------- /.well-known/mcp.json ----------------
 * Not (yet) an official MCP spec well-known URI — the registry's official
 * well-known file is /.well-known/mcp-registry-auth (DNS/HTTP namespace auth,
 * which we don't need under GitHub OIDC). Serving this descriptor is a harmless
 * community convention some crawlers and directories probe for.
 */
function handleWellKnownMcp() {
  return new Response(JSON.stringify({
    name: MCP_SERVER_INFO.name,
    title: MCP_SERVER_INFO.title,
    description:
      "Free MCP tools for the agentic-commerce stack: live MCP server health/conformance scans, website AI-agent readiness scoring, and a weekly public MCP server index.",
    version: MCP_SERVER_INFO.version,
    endpoint: "https://mcppulse.agiscorecard.com/mcp",
    transport: "streamable-http",
    protocolVersions: MCP_SUPPORTED_PROTOCOLS,
    authentication: "none",
    registry: "https://registry.modelcontextprotocol.io",
    tools: MCP_TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description })),
    pricing: {
      free: "All tools free; please self-limit to a few calls per minute.",
      highVolume: "Pay-per-call ($0.005, USDC on Base, x402 protocol, no account) at https://x402.agiscorecard.com",
    },
    website: "https://mcppulse.agiscorecard.com",
    documentation: "https://mcppulse.agiscorecard.com/llms.txt",
  }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600", ...MCP_CORS },
  });
}

/* ---------------- misc ---------------- */

function normalizeTarget(raw) {
  if (!raw || !raw.trim()) return { error: "Missing url parameter." };
  let value = raw.trim();
  if (!/^https?:\/\//i.test(value)) value = "https://" + value;
  let u;
  try { u = new URL(value); } catch { return { error: "That does not look like a valid URL." }; }
  const host = u.hostname.toLowerCase();
  const privateHost =
    host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^\[?::1\]?$/.test(host) || !host.includes(".");
  if (privateHost) return { error: "Private or local addresses cannot be scanned." };
  return { href: u.href };
}

async function handleSubscribe(request, env) {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  let email = "";
  try {
    const body = await request.json();
    email = String(body.email || "").trim().toLowerCase();
  } catch { return json({ error: "Invalid JSON body" }, 400); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Invalid email" }, 400);
  if (env.SUBSCRIBERS) {
    await env.SUBSCRIBERS.put("mcppulse:" + email, JSON.stringify({ email, at: new Date().toISOString() }));
  }
  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
  });
}
