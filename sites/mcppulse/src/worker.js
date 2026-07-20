/**
 * MCP Pulse — health, conformance and latency scanner for remote MCP servers.
 * GET  /api/scan?url=<mcp endpoint>   → JSON health report (JSON-RPC over streamable HTTP)
 * GET  /api/badge?url=<mcp endpoint>  → SVG score badge (embed in your README)
 * POST /api/subscribe                 → Pro-monitoring waitlist (shared SUBSCRIBERS KV)
 */

const TIMEOUT_MS = 10000;
const PROTOCOL = "2025-06-18";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/scan") return handleScan(request);
    if (url.pathname === "/api/badge") return handleBadge(request);
    if (url.pathname === "/api/subscribe") return handleSubscribe(request, env);
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
