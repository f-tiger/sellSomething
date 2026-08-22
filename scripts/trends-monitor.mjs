#!/usr/bin/env node
/**
 * Real-time trend monitor: pulls Google Trends daily-trending RSS (multi-geo)
 * and Google News RSS for our agentic-commerce niche, matches results against
 * the DTC Visibility Index brand roster and a niche keyword map, and writes:
 *
 *   sites/selltoagents/public/data/trending.json  (rendered by /trending)
 *   docs/trends/latest.md                         (human-readable digest)
 *
 * Zero accounts / zero API keys — public RSS endpoints only. Runs from CI
 * (open network required; local egress is proxied/blocked, so for local tests
 * set TRENDS_FIXTURES_DIR to a directory of saved XML fixtures).
 *
 * Fail-soft: any unreachable source is skipped; if a section comes back empty
 * the previous run's data for that section is retained, so the live page
 * never regresses to a blank state because one feed had a bad day.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_JSON = path.join(ROOT, "sites/selltoagents/public/data/trending.json");
const OUT_MD = path.join(ROOT, "docs/trends/latest.md");
const INDEX_JSON = path.join(ROOT, "sites/selltoagents/public/data/visibility-index.json");

const GEOS = (process.env.TRENDS_GEOS || "US,GB,CA,AU").split(",").map((s) => s.trim()).filter(Boolean);
const FIXTURES = process.env.TRENDS_FIXTURES_DIR || "";
const MAX_NEWS = Math.max(1, Number(process.env.MAX_NEWS || 24));
const MAX_TOPICS = Math.max(1, Number(process.env.MAX_TOPICS || 20));

/* Niche keyword map: a trending query touching any of these is relevant to the
   sites (AI commerce, AI search, the stacks we cover, seasonal commerce). */
const NICHE_KEYWORDS = [
  "ai shopping", "shopping agent", "ai agent", "agentic", "ai assistant",
  "chatgpt", "openai", "claude", "anthropic", "perplexity", "gemini", "copilot",
  "ai search", "ai mode", "ai overview",
  "mcp", "model context protocol", "llms.txt", "x402", "stablecoin payment",
  "ecommerce", "e-commerce", "online shopping", "online store", "shopify",
  "dtc brand", "direct to consumer",
  "black friday", "cyber monday", "prime day", "holiday shopping", "gift guide",
];

/* Google News searches that define our beat. Quoted phrases keep results tight. */
const NEWS_QUERIES = [
  '"agentic commerce"',
  '"AI shopping agent" OR "AI shopping agents"',
  '"ChatGPT shopping" OR "buy in ChatGPT"',
  '"Model Context Protocol"',
  '"llms.txt"',
  '"x402"',
];

function nowIso() { return new Date().toISOString(); }
function today() { return nowIso().slice(0, 10); }

async function fetchText(url, fixtureName) {
  if (FIXTURES) {
    const p = path.join(FIXTURES, fixtureName);
    if (!fs.existsSync(p)) throw new Error("fixture missing: " + fixtureName);
    return fs.readFileSync(p, "utf8");
  }
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { "user-agent": "Mozilla/5.0 (compatible; sellSomething-trends/1.0)" },
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.text();
}

/* Minimal RSS item extraction (consistent with the repo's other scripts —
   no XML dependency). Handles CDATA and entity-encoded text. */
function decodeXml(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ").trim();
}
function items(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
}
function tag(block, name) {
  const m = block.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">"));
  return m ? decodeXml(m[1]) : "";
}

/* ---------- Google Trends daily trending searches ---------- */
async function fetchTrends(geo) {
  // The trending RSS moved once already; try both known paths.
  const urls = [
    `https://trends.google.com/trending/rss?geo=${geo}`,
    `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${geo}`,
  ];
  let xml = null, lastErr = null;
  for (const u of urls) {
    try { xml = await fetchText(u, `trends-${geo}.xml`); break; }
    catch (e) { lastErr = e; }
  }
  if (xml === null) throw lastErr || new Error("unreachable");
  return items(xml).map((b) => ({
    query: tag(b, "title"),
    traffic: tag(b, "ht:approx_traffic") || null,
    newsTitle: tag(b, "ht:news_item_title") || null,
    geo,
  })).filter((t) => t.query);
}

/* ---------- Google News searches ---------- */
async function fetchNews(query, i) {
  const u = "https://news.google.com/rss/search?q=" + encodeURIComponent(query) +
    "&hl=en-US&gl=US&ceid=US:en";
  const xml = await fetchText(u, `news-${i}.xml`);
  return items(xml).map((b) => ({
    title: tag(b, "title"),
    link: tag(b, "link"),
    published: tag(b, "pubDate"),
    source: tag(b, "source"),
    query: query.replace(/"/g, ""),
  })).filter((n) => n.title && n.link);
}

/* ---------- matching ---------- */
function loadBrands() {
  try {
    const d = JSON.parse(fs.readFileSync(INDEX_JSON, "utf8"));
    return (d.results || []).filter((r) => r && r.name && r.domain);
  } catch { return []; }
}
function wordMatch(haystack, needle) {
  // Whole-word, case-insensitive; brand names like "Away" need the boundary.
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(?:^|[^a-z0-9])" + esc + "(?:$|[^a-z0-9])", "i").test(haystack);
}
function matchBrands(trends, brands) {
  const hits = [];
  const seen = new Set();
  for (const t of trends) {
    for (const b of brands) {
      if (b.name.length < 4) continue; // short names ("DJI") false-positive too easily
      if (!wordMatch(t.query, b.name)) continue;
      const key = b.domain + "|" + t.query.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        query: t.query, geo: t.geo, traffic: t.traffic,
        brand: { name: b.name, domain: b.domain, category: b.category || null, score: b.score, grade: b.grade || null },
      });
    }
  }
  return hits;
}
function matchTopics(trends) {
  const hits = [];
  const seen = new Set();
  for (const t of trends) {
    const q = t.query.toLowerCase();
    const kw = NICHE_KEYWORDS.find((k) => q.includes(k));
    if (!kw) continue;
    const key = q;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ query: t.query, geo: t.geo, traffic: t.traffic, matchedKeyword: kw, context: t.newsTitle });
  }
  return hits.slice(0, MAX_TOPICS);
}
function dedupeNews(all) {
  const seen = new Set();
  const out = [];
  for (const n of all) {
    const key = n.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  out.sort((a, b) => Date.parse(b.published || 0) - Date.parse(a.published || 0) || 0);
  return out.slice(0, MAX_NEWS);
}

/* ---------- main ---------- */
const brands = loadBrands();
console.log(`Brand roster: ${brands.length} · geos: ${GEOS.join(",")} · news queries: ${NEWS_QUERIES.length}${FIXTURES ? " · FIXTURE MODE" : ""}`);

const allTrends = [];
const trendsOk = [];
for (const geo of GEOS) {
  try {
    const t = await fetchTrends(geo);
    allTrends.push(...t);
    trendsOk.push(geo);
    console.log(`trends ${geo}: ${t.length} queries`);
  } catch (e) {
    console.warn(`trends ${geo} FAILED: ${e.message}`);
  }
}

const allNews = [];
let newsOk = 0;
for (let i = 0; i < NEWS_QUERIES.length; i++) {
  try {
    const n = await fetchNews(NEWS_QUERIES[i], i);
    allNews.push(...n);
    newsOk++;
    console.log(`news [${NEWS_QUERIES[i]}]: ${n.length} items`);
  } catch (e) {
    console.warn(`news [${NEWS_QUERIES[i]}] FAILED: ${e.message}`);
  }
}

if (!trendsOk.length && !newsOk) {
  console.error("Every source failed — keeping previous data untouched.");
  process.exit(process.env.FAIL_ON_EMPTY ? 1 : 0);
}

let prev = {};
try { prev = JSON.parse(fs.readFileSync(OUT_JSON, "utf8")); } catch {}

const trendingBrands = matchBrands(allTrends, brands);
const trendingTopics = matchTopics(allTrends);
const news = dedupeNews(allNews);

/* Sections that legitimately came back empty (feed down / genuinely nothing
   matched today while its feeds were down) fall back to the previous run. */
const payload = {
  updatedAt: today(),
  generatedAtUtc: nowIso(),
  geos: trendsOk,
  trendingBrands: trendingBrands.length || !trendsOk.length ? (trendingBrands.length ? trendingBrands : (prev.trendingBrands || [])) : [],
  trendingTopics: trendingTopics.length || !trendsOk.length ? (trendingTopics.length ? trendingTopics : (prev.trendingTopics || [])) : [],
  news: news.length ? news : (prev.news || []),
  totals: { trendingQueriesScanned: allTrends.length, brandRoster: brands.length },
};

fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));

const md = [
  `# Trend digest — ${payload.updatedAt}`,
  "",
  `Auto-generated by \`scripts/trends-monitor.mjs\` (Google Trends RSS geos: ${trendsOk.join(", ") || "none"}; ${newsOk}/${NEWS_QUERIES.length} news queries). ` +
  `Scanned ${allTrends.length} trending queries against ${brands.length} index brands.`,
  "",
  `## Index brands trending right now (${payload.trendingBrands.length})`,
  ...(payload.trendingBrands.length
    ? payload.trendingBrands.map((h) => `- **${h.brand.name}** (${h.brand.domain}, score ${h.brand.score}) — trending as “${h.query}” in ${h.geo}${h.traffic ? `, ~${h.traffic} searches` : ""}`)
    : ["- none today"]),
  "",
  `## Niche topics in the trending feed (${payload.trendingTopics.length})`,
  ...(payload.trendingTopics.length
    ? payload.trendingTopics.map((t) => `- “${t.query}” (${t.geo}${t.traffic ? `, ~${t.traffic}` : ""}) — matched \`${t.matchedKeyword}\``)
    : ["- none today"]),
  "",
  `## Latest agentic-commerce headlines (${payload.news.length})`,
  ...payload.news.slice(0, 12).map((n) => `- ${n.title}${n.source ? ` — ${n.source}` : ""}`),
  "",
  "Live page: https://selltoagents.agiscorecard.com/trending",
  "",
].join("\n");
fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
fs.writeFileSync(OUT_MD, md);

console.log(`\nWrote ${payload.trendingBrands.length} brand hits, ${payload.trendingTopics.length} topics, ${payload.news.length} headlines`);
console.log(`-> ${path.relative(ROOT, OUT_JSON)}\n-> ${path.relative(ROOT, OUT_MD)}`);
