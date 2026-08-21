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
  version: "1.1.0",
};

// Newest first. We negotiate: echo the client's version if we support it,
// otherwise answer with our latest.
const MCP_SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const MCP_INSTRUCTIONS =
  "Free tools for the agentic-commerce stack: scan any remote MCP server for health/conformance " +
  "(check_mcp_server), score any website's readiness for AI shopping agents (agent_readiness_scan), " +
  "audit a site's agent-discovery well-known files (check_wellknown_discovery), generate a " +
  "spec-correct llms.txt (generate_llms_txt), look up agentic-commerce/MCP glossary definitions " +
  "(define_term), read a weekly index of public MCP servers (get_public_mcp_index), and read the " +
  "DTC AI Visibility Index (get_visibility_index). All tools are free; please self-limit to a few " +
  "calls per minute. For high-volume or production agent use, the same scans are available " +
  "pay-per-call ($0.005, USDC on Base, no account or API key) via the x402 protocol at " +
  "https://x402.agiscorecard.com.";

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
  {
    name: "check_wellknown_discovery",
    title: "Agent-discovery well-known file audit",
    description:
      "Audit any website's agent-discovery surface in one call (free, via tools.agiscorecard.com). Checks the " +
      "six files the agentic web uses to find and describe a business: /.well-known/ai-catalog.json (Agentic " +
      "Resource Discovery manifest), /.well-known/mcp/server-card.json (MCP Server Card), " +
      "/.well-known/agent-card.json (A2A Agent Card), /llms.txt, /agents.md, and robots.txt AI-crawler access " +
      "(GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot & co.). Returns a 0-100 discoverability score, " +
      "per-file pass/warn/fail status with JSON validity checks, and a free generator link for every missing " +
      "file. Use it to audit a merchant or SaaS site before agent integration, compare competitors' agent " +
      "readiness, or produce a fix list. Complements agent_readiness_scan (page-level signals) with the " +
      "well-known discovery layer. Free tier: please self-limit to a few calls per minute. High-volume / " +
      "production agent use: pay-per-call APIs via the x402 payment protocol at https://x402.agiscorecard.com " +
      "($0.005 per call in USDC on Base — no account, no API key).",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "The website URL (or bare domain) to audit, e.g. https://example-store.com or example-store.com. " +
            "https:// is assumed when the scheme is omitted; only the origin is checked.",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "generate_llms_txt",
    title: "llms.txt generator (spec-correct)",
    description:
      "Generate a complete, spec-correct llms.txt file from structured input — the generator counterpart to " +
      "this server's checkers. You supply the site name, a one-paragraph summary and optional sections of " +
      "curated links; the tool renders canonical llms.txt markdown: an H1 with the site name, a blockquote " +
      "summary, then one H2 per section with '- [name](url): description' link bullets. The result is returned " +
      "as ready-to-publish text (serve it at https://yourdomain.com/llms.txt as plain text) plus structured " +
      "metadata (byte size, section/link counts). llms.txt is the curated site map AI systems read first — " +
      "Shopify serves one natively, and AI-readiness scanners (including agent_readiness_scan and " +
      "check_wellknown_discovery on this server) check for it. Pure function: no network calls, deterministic, " +
      "free, unlimited within fair use. Related free web tools and pay-per-call agent APIs (x402 protocol, " +
      "$0.005/call, USDC on Base, no account) at https://x402.agiscorecard.com.",
    inputSchema: {
      type: "object",
      properties: {
        site_name: {
          type: "string",
          description: "The site or business name — becomes the H1 title, e.g. 'Acme Outdoor Gear'.",
        },
        summary: {
          type: "string",
          description:
            "One-paragraph plain-text summary of what the site is and offers — becomes the blockquote " +
            "directly under the H1. Keep it factual; agents quote it.",
        },
        sections: {
          type: "array",
          description:
            "Optional list of sections, each rendered as an H2 heading followed by link bullets. " +
            "Typical sections: 'Key pages', 'Products', 'Docs', 'Policies'.",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Section heading, e.g. 'Key pages'." },
              links: {
                type: "array",
                description: "Links in this section, rendered as '- [name](url): description'.",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Link text, e.g. 'Pricing'." },
                    url: { type: "string", description: "Absolute or root-relative URL, e.g. /pricing." },
                    description: { type: "string", description: "Optional one-line description appended after a colon." },
                  },
                  required: ["name", "url"],
                  additionalProperties: false,
                },
              },
            },
            required: ["title", "links"],
            additionalProperties: false,
          },
        },
      },
      required: ["site_name", "summary"],
      additionalProperties: false,
    },
  },
  {
    name: "define_term",
    title: "Agentic-commerce & MCP glossary lookup",
    description:
      "Look up a plain-English definition of any agentic-commerce, MCP, AI-visibility or agent-payments term " +
      "from the Agent Glossary (glossary.agiscorecard.com) — 25 terms including agentic commerce, ACP, UCP, " +
      "MCP, MCP server, MCP tool, streamable HTTP, llms.txt, agents.md, GEO, AEO, citation share, AI " +
      "Overviews, zero-click search, structured data, ChatGPT Shopping, x402, AP2, agentic payments, AI " +
      "agent, RAG, function calling, A2A and prompt injection. Returns a one-paragraph citable definition " +
      "plus the canonical glossary URL to link as the source. Matching is forgiving: case-insensitive and " +
      "hyphen/space tolerant ('Streamable HTTP', 'streamable-http' and 'streamable_http' all resolve); an " +
      "unknown term returns the full list of available terms. Answered inline from an embedded snapshot — " +
      "no network round-trip, instant, free, unlimited within fair use. More agent tooling: free scanners on " +
      "this server, pay-per-call APIs (x402 protocol, $0.005/call, USDC on Base, no account) at " +
      "https://x402.agiscorecard.com.",
    inputSchema: {
      type: "object",
      properties: {
        term: {
          type: "string",
          description:
            "The term to define, by name or slug — e.g. 'agentic commerce', 'ACP', 'llms.txt', " +
            "'streamable-http', 'x402'. Case-insensitive; spaces, hyphens and underscores are interchangeable.",
        },
      },
      required: ["term"],
      additionalProperties: false,
    },
  },
  {
    name: "get_visibility_index",
    title: "DTC AI Visibility Index",
    description:
      "Return the DTC AI Visibility Index: a recurring audit of well-known direct-to-consumer brands " +
      "(Casper, Ridge, Away, Rothy's and ~35 more) scored 0-100 on AI-agent visibility — robots.txt AI-crawler " +
      "access, llms.txt, agents.md, Product/Offer structured data, meta quality and sitemap — using the same " +
      "checks as agent_readiness_scan. Includes per-brand score, grade and failing checks, plus aggregate " +
      "stats (brand count, average score, last update date). Use it to benchmark a merchant against named DTC " +
      "brands, cite ecosystem statistics ('X% of leading DTC brands still lack Product schema'), or find " +
      "outreach targets with visibility gaps. Published by SellToAgents (selltoagents.agiscorecard.com), " +
      "fetched live server-side. Free, no parameters, no auth. To score an arbitrary site on the same rubric " +
      "call agent_readiness_scan (free) or the pay-per-call x402 API at https://x402.agiscorecard.com " +
      "($0.005 per call, USDC on Base, no account, no API key) for high-volume agent pipelines.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

/* Compact glossary snapshot for define_term — generated from scripts/gen-glossary.mjs
 * (the source of truth for glossary.agiscorecard.com). Re-generate when TERMS changes there. */
const GLOSSARY = {
  "agentic-commerce": {
    term: "Agentic commerce",
    def: "Agentic commerce is delegated shopping: a person states intent and constraints, and an AI agent searches, compares and completes part or all of a purchase on their behalf. Unlike a chatbot, an agent transacts — it produces an order.",
    url: "https://glossary.agiscorecard.com/agentic-commerce",
  },
  "acp": {
    term: "Agentic Commerce Protocol (ACP)",
    def: "The Agentic Commerce Protocol (ACP) is an open protocol from OpenAI and Stripe that lets AI agents discover merchant products and complete purchases. It powers ChatGPT Shopping.",
    url: "https://glossary.agiscorecard.com/acp",
  },
  "ucp": {
    term: "Universal Commerce Protocol (UCP)",
    def: "The Universal Commerce Protocol (UCP) is Google's agentic-commerce standard, launched at NRF 2026, covering the full journey from product discovery to post-purchase across Google's AI surfaces.",
    url: "https://glossary.agiscorecard.com/ucp",
  },
  "ai-shopping-agent": {
    term: "AI shopping agent",
    def: "An AI shopping agent is an AI assistant that discovers, compares and can purchase products on a buyer's behalf — for example ChatGPT Shopping, Perplexity, or Google AI Mode acting on a shopping request.",
    url: "https://glossary.agiscorecard.com/ai-shopping-agent",
  },
  "citation-share": {
    term: "Citation share",
    def: "Citation share is how often an AI assistant cites or recommends your brand when answering a relevant query — the AI-era replacement for search rankings. If SEO was about ranking a link, citation share is about being part of the answer.",
    url: "https://glossary.agiscorecard.com/citation-share",
  },
  "geo": {
    term: "Generative Engine Optimization (GEO)",
    def: "Generative Engine Optimization (GEO) is the practice of optimizing content and data so AI systems (ChatGPT, Perplexity, Google AI Overviews) cite you in their synthesized answers. It's SEO for the AI-answer era.",
    url: "https://glossary.agiscorecard.com/geo",
  },
  "aeo": {
    term: "Answer Engine Optimization (AEO)",
    def: "Answer Engine Optimization (AEO) is optimizing content to be the direct answer an AI or search engine returns — often used interchangeably with GEO, with a slightly stronger focus on Q&A-style extraction and featured answers.",
    url: "https://glossary.agiscorecard.com/aeo",
  },
  "llms-txt": {
    term: "llms.txt",
    def: "llms.txt is a plain-markdown file served at a site's root (/llms.txt) that gives AI systems a curated summary of the site — what it is, its key pages, and important facts like pricing and policies.",
    url: "https://glossary.agiscorecard.com/llms-txt",
  },
  "agents-md": {
    term: "agents.md",
    def: "agents.md is an emerging convention: a markdown file that tells AI agents how to interact with your site or repository — what it is, how to use it, and what they may do. Shopify serves one natively for stores.",
    url: "https://glossary.agiscorecard.com/agents-md",
  },
  "mcp": {
    term: "Model Context Protocol (MCP)",
    def: "The Model Context Protocol (MCP) is an open standard from Anthropic that lets AI applications connect to external tools and data through a common interface. It's often described as \"USB-C for AI\" — one protocol, many integrations.",
    url: "https://glossary.agiscorecard.com/mcp",
  },
  "mcp-server": {
    term: "MCP server",
    def: "An MCP server is a program that exposes tools, resources or prompts to AI clients over the Model Context Protocol. Clients discover its tools via a tools/list call and invoke them through JSON-RPC.",
    url: "https://glossary.agiscorecard.com/mcp-server",
  },
  "streamable-http": {
    term: "Streamable HTTP (MCP transport)",
    def: "Streamable HTTP is the current transport for remote MCP servers: a single HTTPS endpoint that accepts POSTed JSON-RPC and replies with either a plain JSON response or a Server-Sent-Events stream, with optional sessions via the Mcp-Session-Id header.",
    url: "https://glossary.agiscorecard.com/streamable-http",
  },
  "x402": {
    term: "x402",
    def: "x402 is an open protocol (originated by Coinbase) that revives the HTTP 402 \"Payment Required\" status so AI agents and apps can pay for API calls or content programmatically, typically with stablecoins, in a single request-response.",
    url: "https://glossary.agiscorecard.com/x402",
  },
  "ap2": {
    term: "AP2 (Agent Payments Protocol)",
    def: "AP2 (Agent Payments Protocol) is Google's open protocol for agent-initiated payments, using cryptographically signed \"mandates\" that prove a user authorized an agent to make a specific purchase within set limits.",
    url: "https://glossary.agiscorecard.com/ap2",
  },
  "agentic-payments": {
    term: "Agentic payments",
    def: "Agentic payments are payments initiated and completed by AI agents on a user's behalf, using protocols like x402 (settlement) and AP2 (authorization) so an agent can pay for goods, APIs or content without manual checkout.",
    url: "https://glossary.agiscorecard.com/agentic-payments",
  },
  "ai-agent": {
    term: "AI agent",
    def: "An AI agent is a system that uses a large language model to pursue a goal autonomously — deciding on steps, calling tools or APIs, and acting on the results — rather than just answering a single prompt.",
    url: "https://glossary.agiscorecard.com/ai-agent",
  },
  "rag": {
    term: "RAG (Retrieval-Augmented Generation)",
    def: "RAG (Retrieval-Augmented Generation) is a technique where an AI model retrieves relevant documents from an external knowledge source and uses them as context to generate a more accurate, grounded answer — reducing hallucination.",
    url: "https://glossary.agiscorecard.com/rag",
  },
  "function-calling": {
    term: "Function calling (tool calling)",
    def: "Function calling (or tool calling) is a capability where an AI model, given a set of tool definitions, outputs a structured request to invoke one — with arguments — so an application can run it and return the result to the model.",
    url: "https://glossary.agiscorecard.com/function-calling",
  },
  "a2a": {
    term: "A2A (Agent2Agent protocol)",
    def: "A2A (Agent2Agent) is an open protocol, introduced by Google, that lets independent AI agents discover each other and collaborate — delegating tasks and exchanging results — across different vendors and frameworks.",
    url: "https://glossary.agiscorecard.com/a2a",
  },
  "prompt-injection": {
    term: "Prompt injection",
    def: "Prompt injection is an attack where malicious instructions hidden in content an AI reads (a web page, document, tool output) trick the model into ignoring its original task and following the attacker's instructions instead.",
    url: "https://glossary.agiscorecard.com/prompt-injection",
  },
  "ai-overviews": {
    term: "AI Overviews",
    def: "AI Overviews are Google's AI-generated answer summaries shown at the top of search results. They synthesize an answer from multiple sources and cite them, often reducing clicks to the underlying websites.",
    url: "https://glossary.agiscorecard.com/ai-overviews",
  },
  "zero-click-search": {
    term: "Zero-click search",
    def: "A zero-click search is a search where the user gets their answer directly on the results page — from an AI Overview, featured snippet or knowledge panel — without clicking through to any website.",
    url: "https://glossary.agiscorecard.com/zero-click-search",
  },
  "structured-data": {
    term: "Structured data (schema markup)",
    def: "Structured data is machine-readable markup (usually schema.org JSON-LD) added to a web page that describes its content — a product's price, an FAQ, an organization — so search engines and AI agents can understand and use it reliably.",
    url: "https://glossary.agiscorecard.com/structured-data",
  },
  "chatgpt-shopping": {
    term: "ChatGPT Shopping",
    def: "ChatGPT Shopping is OpenAI's feature that lets ChatGPT recommend products and, via the Agentic Commerce Protocol, surface merchant items and support purchases directly in the conversation.",
    url: "https://glossary.agiscorecard.com/chatgpt-shopping",
  },
  "mcp-tool": {
    term: "MCP tool",
    def: "An MCP tool is a single callable function exposed by an MCP server — with a name, a description and a JSON-Schema for its inputs — that an AI agent can discover via tools/list and invoke to perform an action.",
    url: "https://glossary.agiscorecard.com/mcp-tool",
  },
};

// "Streamable HTTP", "streamable-http", "streamable_http", "llms.txt" → "streamable-http" / "llms-txt"
function glossaryKey(raw) {
  return String(raw).trim().toLowerCase()
    .replace(/[\s_.]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function findGlossaryEntry(raw) {
  const key = glossaryKey(raw);
  if (!key) return null;
  if (GLOSSARY[key]) return { slug: key, ...GLOSSARY[key] };
  for (const [slug, entry] of Object.entries(GLOSSARY)) {
    if (glossaryKey(entry.term) === key) return { slug, ...entry };
  }
  return null;
}

// Renders spec-correct llms.txt: H1, blockquote summary, H2 sections with link bullets.
function renderLlmsTxt(siteName, summary, sections) {
  const clean = (s) => String(s).replace(/\s+/g, " ").trim();
  let out = "# " + clean(siteName) + "\n\n> " + clean(summary) + "\n";
  for (const section of Array.isArray(sections) ? sections : []) {
    if (!section || typeof section !== "object" || !section.title) continue;
    out += "\n## " + clean(section.title) + "\n";
    for (const link of Array.isArray(section.links) ? section.links : []) {
      if (!link || typeof link !== "object" || !link.name || !link.url) continue;
      out += "- [" + clean(link.name) + "](" + clean(link.url) + ")" +
        (link.description ? ": " + clean(link.description) : "") + "\n";
    }
  }
  return out;
}

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

  if (name === "check_wellknown_discovery") {
    if (typeof args.url !== "string" || !args.url.trim()) {
      return rpcError(id, -32602, "Invalid params: 'url' (string) is required for check_wellknown_discovery.");
    }
    try {
      const res = await fetch("https://tools.agiscorecard.com/api/wellknown?url=" + encodeURIComponent(args.url.trim()), {
        headers: { "Accept": "application/json", "User-Agent": "MCPPulse-MCP/1.0 (+https://mcppulse.agiscorecard.com/mcp)" },
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        return toolErr("Well-known discovery audit failed (HTTP " + res.status + ")" + (data && data.error ? ": " + data.error : "."));
      }
      return toolOk(data);
    } catch (e) {
      return toolErr("Well-known discovery audit errored: " + (e && e.message ? e.message : "network error"));
    }
  }

  if (name === "generate_llms_txt") {
    if (typeof args.site_name !== "string" || !args.site_name.trim()) {
      return rpcError(id, -32602, "Invalid params: 'site_name' (string) is required for generate_llms_txt.");
    }
    if (typeof args.summary !== "string" || !args.summary.trim()) {
      return rpcError(id, -32602, "Invalid params: 'summary' (string) is required for generate_llms_txt.");
    }
    if (args.sections !== undefined && !Array.isArray(args.sections)) {
      return rpcError(id, -32602, "Invalid params: 'sections' must be an array when provided.");
    }
    const text = renderLlmsTxt(args.site_name, args.summary, args.sections);
    const sections = Array.isArray(args.sections) ? args.sections : [];
    const data = {
      llmsTxt: text,
      bytes: new TextEncoder().encode(text).length,
      sectionCount: sections.length,
      linkCount: sections.reduce((n, s) => n + (s && Array.isArray(s.links) ? s.links.length : 0), 0),
      howToPublish: "Serve this verbatim at https://yourdomain.com/llms.txt with Content-Type: text/plain. " +
        "Verify it with the agent_readiness_scan or check_wellknown_discovery tool on this server.",
    };
    return rpcResult(id, {
      content: [{ type: "text", text }],
      structuredContent: data,
      isError: false,
    });
  }

  if (name === "define_term") {
    if (typeof args.term !== "string" || !args.term.trim()) {
      return rpcError(id, -32602, "Invalid params: 'term' (string) is required for define_term.");
    }
    const entry = findGlossaryEntry(args.term);
    if (!entry) {
      const available = Object.keys(GLOSSARY);
      const data = {
        found: false,
        query: args.term.trim(),
        message: "No glossary entry for \"" + args.term.trim() + "\". Available terms: " + available.join(", ") + ".",
        availableTerms: available,
        glossary: "https://glossary.agiscorecard.com",
      };
      return rpcResult(id, {
        content: [{ type: "text", text: data.message }],
        structuredContent: data,
        isError: false,
      });
    }
    const data = {
      found: true,
      term: entry.term,
      slug: entry.slug,
      definition: entry.def,
      url: entry.url,
      cite: entry.term + " — " + entry.url + " (Agent Glossary)",
    };
    return rpcResult(id, {
      content: [{ type: "text", text: entry.term + ": " + entry.def + "\n\nSource: " + entry.url }],
      structuredContent: data,
      isError: false,
    });
  }

  if (name === "get_visibility_index") {
    try {
      const res = await fetch("https://selltoagents.agiscorecard.com/data/visibility-index.json", {
        headers: { "Accept": "application/json", "User-Agent": "MCPPulse-MCP/1.0 (+https://mcppulse.agiscorecard.com/mcp)" },
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        return toolErr("Visibility index unavailable (HTTP " + res.status + "). Try https://selltoagents.agiscorecard.com/data/visibility-index.json directly.");
      }
      return toolOk(data);
    } catch (e) {
      return toolErr("Could not read the visibility index: " + (e && e.message ? e.message : "network error"));
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
      "Free MCP tools for the agentic-commerce stack (7 tools): live MCP server health/conformance scans, website AI-agent readiness scoring, agent-discovery well-known file audits, a spec-correct llms.txt generator, an agentic-commerce/MCP glossary, a weekly public MCP server index, and the DTC AI Visibility Index.",
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
