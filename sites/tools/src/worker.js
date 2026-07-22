/**
 * Agentic Tools worker.
 * GET /api/wellknown?url=<site> → JSON report on a site's agent-discovery files
 *   (.well-known/ai-catalog.json, mcp/server-card.json, agent-card.json,
 *    llms.txt, agents.md, robots.txt AI-crawler access). Server-side fetch,
 *    so it works cross-origin (no CORS limits on the browser side).
 * Everything else → static assets.
 */

const FETCH_TIMEOUT_MS = 8000;
const UA = "AgenticToolsBot/1.0 (+https://tools.agiscorecard.com; well-known discovery checker)";

const AI_CRAWLERS = ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/wellknown") return handleWellKnown(request);
    return env.ASSETS.fetch(request);
  },
};

async function handleWellKnown(request) {
  const target = normalizeTarget(new URL(request.url).searchParams.get("url"));
  if (target.error) return json({ error: target.error }, 400);
  const origin = target.origin;

  const paths = {
    aiCatalog: "/.well-known/ai-catalog.json",
    mcpServerCard: "/.well-known/mcp/server-card.json",
    agentCard: "/.well-known/agent-card.json",
    llmsTxt: "/llms.txt",
    agentsMd: "/agents.md",
    robots: "/robots.txt",
  };
  const keys = Object.keys(paths);
  const results = await Promise.allSettled(keys.map((k) => fetchInfo(origin + paths[k])));

  const info = {};
  keys.forEach((k, i) => { info[k] = results[i].status === "fulfilled" ? results[i].value : { ok: false }; });

  const checks = [];
  checks.push(jsonCheck("ai-catalog.json", "Agentic Resource Discovery manifest (lists your MCP servers, agents, APIs)", info.aiCatalog, "https://tools.agiscorecard.com/ai-catalog-generator"));
  checks.push(jsonCheck("MCP Server Card", "/.well-known/mcp/server-card.json — describes your MCP server to agents", info.mcpServerCard, "https://tools.agiscorecard.com/mcp-server-card-generator"));
  checks.push(jsonCheck("A2A Agent Card", "/.well-known/agent-card.json — lets other agents discover and call yours", info.agentCard, "https://tools.agiscorecard.com/a2a-agent-card-generator"));
  checks.push(textCheck("llms.txt", "Curated page map for LLMs and AI crawlers", info.llmsTxt, "https://agentready.agiscorecard.com/llms-txt-generator"));
  checks.push(textCheck("agents.md", "Instructions for how agents should interact with your site", info.agentsMd, null));
  checks.push(robotsCheck(info.robots));

  const present = checks.filter((c) => c.status === "pass").length;
  const score = Math.round((present / checks.length) * 100);

  return json({
    url: target.href,
    checkedAt: new Date().toISOString(),
    score,
    present,
    total: checks.length,
    summary: summarize(score),
    checks,
  });
}

function jsonCheck(title, detail, info, generator) {
  if (!info || !info.ok) return fail(title, detail + " — not found (404 or unreachable).", generator ? "Generate one: " + generator : null);
  let valid = false;
  try { JSON.parse(info.text || ""); valid = true; } catch { /* invalid */ }
  if (!valid) return warn(title, detail + " — found but the JSON is invalid.", generator ? "Rebuild it: " + generator : null);
  return pass(title, detail + " — found and valid JSON.");
}
function textCheck(title, detail, info, generator) {
  const ok = info && info.ok && (info.text || "").trim().length > 0 && !/^\s*</.test(info.text || "");
  if (ok) return pass(title, detail + " — found.");
  return fail(title, detail + " — not found.", generator ? "Generate one: " + generator : null);
}
function robotsCheck(info) {
  if (!info || !info.ok) return warn("AI crawler access (robots.txt)", "No robots.txt found — crawlers are allowed by default, but you have no explicit control.", null);
  const body = info.text || "";
  const blocked = AI_CRAWLERS.filter((ua) => isBlocked(body, ua));
  if (blocked.length === 0) return pass("AI crawler access (robots.txt)", "robots.txt found; no major AI crawler is blocked (" + AI_CRAWLERS.join(", ") + ").");
  return warn("AI crawler access (robots.txt)", "robots.txt blocks: " + blocked.join(", ") + " — these agents can't read your site.", "Fix with the AI robots.txt generator: https://tools.agiscorecard.com/ai-robots-txt-generator");
}
// Very small robots parser: is <ua> disallowed from "/" (either directly or via *)?
function isBlocked(body, ua) {
  const lines = body.split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim());
  let applies = false, star = false, blockUa = false, blockStar = false, curStar = false, curUa = false;
  for (const line of lines) {
    const m = line.match(/^user-agent:\s*(.*)$/i);
    if (m) {
      const val = m[1].trim().toLowerCase();
      curUa = val === ua.toLowerCase();
      curStar = val === "*";
      continue;
    }
    const d = line.match(/^disallow:\s*(.*)$/i);
    if (d) {
      const path = d[1].trim();
      if (path === "/" ) {
        if (curUa) blockUa = true;
        if (curStar) blockStar = true;
      }
    }
  }
  // A specific user-agent block overrides the wildcard.
  return blockUa || (blockStar && !mentionsUa(body, ua));
}
function mentionsUa(body, ua) {
  return new RegExp("user-agent:\\s*" + ua.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "i").test(body);
}

function pass(title, detail) { return { title, detail, status: "pass" }; }
function warn(title, detail, fix) { return { title, detail, status: "warn", fix: fix || undefined }; }
function fail(title, detail, fix) { return { title, detail, status: "fail", fix: fix || undefined }; }

function summarize(score) {
  if (score >= 80) return "Strong agent discoverability — the agentic web can find and describe what you offer.";
  if (score >= 50) return "Partial — some discovery files are missing; agents will find you but miss capabilities.";
  if (score >= 25) return "Weak — most well-known discovery files are absent.";
  return "Invisible to agent discovery — none of the well-known files are published.";
}

function normalizeTarget(raw) {
  if (!raw || !raw.trim()) return { error: "Missing url parameter." };
  let s = raw.trim();
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u;
  try { u = new URL(s); } catch { return { error: "That doesn't look like a valid URL." }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { error: "Only http/https URLs are supported." };
  return { href: u.href, origin: u.origin };
}

async function fetchInfo(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "*/*" }, redirect: "follow", signal: ctrl.signal });
    let text = "";
    if (r.ok) { try { text = await r.text(); } catch { /* ignore */ } }
    return { ok: r.ok, status: r.status, text: text.slice(0, 20000) };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(t);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}
