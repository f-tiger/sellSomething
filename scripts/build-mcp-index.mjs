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

const ranked = [];
const skipped = [];
for (const [name, url] of SERVERS) {
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
  await new Promise((r) => setTimeout(r, 1500));
}

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
