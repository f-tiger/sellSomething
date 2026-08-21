#!/usr/bin/env node
/**
 * Builds the Public MCP Server Index by scanning a curated list of public
 * remote MCP servers through the live MCP Pulse API, then writing the JSON
 * that the index page renders. Run from CI (open network required).
 *
 * Servers that error or are auth-gated (can't be introspected) are excluded
 * from the ranking — the index compares only fully-scannable public servers.
 */

const API = process.env.MCP_SCAN_API || "https://mcppulse.agiscorecard.com/api/scan";
const OUT = new URL("../sites/mcppulse/public/data/mcp-index.json", import.meta.url);

// Candidate public streamable-HTTP MCP endpoints. Unreachable/auth-gated ones
// are skipped automatically, so a broad list is fine.
const SERVERS = [
  ["Cloudflare Docs", "https://docs.mcp.cloudflare.com/mcp"],
  ["DeepWiki", "https://mcp.deepwiki.com/mcp"],
  ["Context7", "https://mcp.context7.com/mcp"],
  ["GitMCP", "https://gitmcp.io/docs"],
  ["Hugging Face", "https://huggingface.co/mcp"],
  ["Cloudflare Radar", "https://radar.mcp.cloudflare.com/mcp"],
  ["Cloudflare Browser", "https://browser.mcp.cloudflare.com/mcp"],
  ["Cloudflare Bindings", "https://bindings.mcp.cloudflare.com/mcp"],
  ["Cloudflare Observability", "https://observability.mcp.cloudflare.com/mcp"],
  ["Cloudflare GraphQL", "https://graphql.mcp.cloudflare.com/mcp"],
  ["Cloudflare AI Gateway", "https://ai-gateway.mcp.cloudflare.com/mcp"],
  ["Cloudflare AutoRAG", "https://autorag.mcp.cloudflare.com/mcp"],
  ["Cloudflare DNS Analytics", "https://dns-analytics.mcp.cloudflare.com/mcp"],
  ["Cloudflare Containers", "https://containers.mcp.cloudflare.com/mcp"],
  ["Semgrep", "https://mcp.semgrep.ai/mcp"],
  ["Globalping", "https://mcp.globalping.dev/mcp"],
  ["Microsoft Learn", "https://learn.microsoft.com/api/mcp"],
  ["AWS Knowledge", "https://knowledge-mcp.global.api.aws/mcp"],
  ["GitHub", "https://api.githubcopilot.com/mcp/"],
  ["Notion", "https://mcp.notion.com/mcp"],
  ["Linear", "https://mcp.linear.app/mcp"],
  ["Sentry", "https://mcp.sentry.dev/mcp"],
  ["Stripe", "https://mcp.stripe.com"],
  ["PayPal", "https://mcp.paypal.com/mcp"],
  ["Vercel", "https://mcp.vercel.com"],
  ["Neon", "https://mcp.neon.tech/mcp"],
  ["Grafana", "https://mcp.grafana.com/mcp"],
  ["Asana", "https://mcp.asana.com/mcp"],
  ["Atlassian", "https://mcp.atlassian.com/v1/sse"],
  ["Wix", "https://mcp.wix.com/sse"],
];

async function scan(url) {
  const res = await fetch(API + "?url=" + encodeURIComponent(url), { signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

// Auto-discovery: merge public remote servers from the official MCP Registry
// (registry.modelcontextprotocol.io) into the curated list. The registry is
// the ecosystem's source of truth, so the index grows on its own each weekly
// run. Fail-soft: registry unreachable → curated list only.
const REGISTRY = process.env.MCP_REGISTRY_API || "https://registry.modelcontextprotocol.io";
const MAX_SERVERS = Math.max(1, Number(process.env.MAX_SERVERS || 150));

async function discoverFromRegistry() {
  const found = [];
  for (const base of ["/v0.1/servers", "/v0/servers"]) {
    try {
      let cursor = "";
      for (let page = 0; page < 10 && found.length < MAX_SERVERS * 2; page++) {
        const u = REGISTRY + base + "?limit=100" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
        const res = await fetch(u, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const d = await res.json();
        const items = d.servers || d.data || [];
        for (const it of items) {
          const s = it.server || it; // v0.1 wraps entries in {server, _meta}
          const remotes = s.remotes || [];
          for (const rm of remotes) {
            const type = String(rm.type || rm.transport_type || "").toLowerCase();
            const url = String(rm.url || "");
            if (!/streamable/.test(type) && type !== "http") continue;
            if (!/^https:\/\//.test(url)) continue;
            const name = String(s.title || s.name || "").split("/").pop() || url;
            found.push([name, url]);
          }
        }
        cursor = (d.metadata && d.metadata.next_cursor) || d.next_cursor || "";
        if (!cursor || !items.length) break;
      }
      if (found.length) { console.log(`Registry discovery (${base}): ${found.length} remote servers`); return found; }
    } catch (e) {
      console.warn(`Registry discovery failed on ${base}: ${e.message}`);
    }
  }
  return found;
}

const discovered = await discoverFromRegistry();
const seen = new Set();
const CANDIDATES = [];
for (const [name, url] of [...SERVERS, ...discovered]) {
  const key = url.replace(/\/+$/, "").toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  CANDIDATES.push([name, url]);
  if (CANDIDATES.length >= MAX_SERVERS) break;
}
console.log(`Scanning ${CANDIDATES.length} candidate servers (${SERVERS.length} curated + registry discovery, cap ${MAX_SERVERS})`);

const ranked = [];
const skipped = [];
const CONCURRENCY = Math.max(1, Number(process.env.SCAN_CONCURRENCY || 6));
let next = 0;
async function worker() {
  while (next < CANDIDATES.length) {
    const [name, url] = CANDIDATES[next++];
    try {
      const r = await scan(url);
      if (r.error) { skipped.push({ name, reason: "error" }); console.warn(`SKIP ${name}: ${r.error}`); }
      else if (r.authProtected) { skipped.push({ name, reason: "auth-gated" }); console.log(`AUTH ${name} (excluded from ranking)`); }
      else {
        const failing = r.checks.filter((c) => c.status === "fail").map((c) => c.title);
        ranked.push({
          name, url, score: r.score, grade: r.grade, latencyMs: r.latencyMs,
          tools: r.tools ? r.tools.count : 0, describedPct: r.tools ? r.tools.describedPct : 0,
          failing: failing.slice(0, 3),
        });
        console.log(`${name}: ${r.score} ${r.grade} (${r.latencyMs}ms, ${r.tools ? r.tools.count : 0} tools)`);
      }
    } catch (e) {
      skipped.push({ name, reason: e.message });
      console.warn(`SKIP ${name}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 500)); // be polite to the scan API
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, CANDIDATES.length) }, worker));

ranked.sort((a, b) => b.score - a.score || a.latencyMs - b.latencyMs);
const avg = ranked.length ? Math.round(ranked.reduce((s, r) => s + r.score, 0) / ranked.length) : 0;
const avgLatency = ranked.length ? Math.round(ranked.reduce((s, r) => s + r.latencyMs, 0) / ranked.length) : 0;

const payload = {
  updatedAt: new Date().toISOString().slice(0, 10),
  scanned: ranked.length,
  authGated: skipped.filter((s) => s.reason === "auth-gated").length,
  averageScore: avg,
  averageLatencyMs: avgLatency,
  results: ranked,
};

const fs = await import("node:fs");
fs.mkdirSync(new URL("./", OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`\nWrote ${ranked.length} ranked servers (avg ${avg}, ${avgLatency}ms) -> ${OUT.pathname}`);
