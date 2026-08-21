/**
 * AgentReady — AI sales-visibility scanner.
 * GET /api/scan?url=<site>  → JSON readiness report
 * POST /api/subscribe       → email capture (KV-backed when SUBSCRIBERS is bound)
 * Everything else           → static assets
 */

const FETCH_TIMEOUT_MS = 8000;
const UA = "AgentReadyBot/1.0 (+https://agentready.agiscorecard.com; agentic-commerce readiness scanner)";

// AI crawlers that decide whether your products appear in AI shopping answers.
const AI_CRAWLERS = [
  { agent: "GPTBot", channel: "ChatGPT model training / retrieval" },
  { agent: "OAI-SearchBot", channel: "ChatGPT Search & Shopping" },
  { agent: "ChatGPT-User", channel: "ChatGPT live browsing on user request" },
  { agent: "ClaudeBot", channel: "Claude model training / retrieval" },
  { agent: "Claude-User", channel: "Claude live browsing on user request" },
  { agent: "PerplexityBot", channel: "Perplexity answers & shopping" },
  { agent: "Google-Extended", channel: "Gemini / Google AI Mode grounding" },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/scan") return handleScan(request);
    if (url.pathname === "/api/subscribe") return handleSubscribe(request, env);
    if (url.pathname === "/api/monitor") return handleMonitor(request, env);
    if (url.pathname === "/api/monitor/status") return handleMonitorStatus(request, env);
    if (url.pathname === "/api/monitor/test") return handleMonitorTest(request, env);
    if (url.pathname === "/api/cron/run") return handleCronRun(request, env);
    if (url.pathname === "/api/billing/webhook") return handleBillingWebhook(request, env);
    if (url.pathname === "/api/billing/paddle") return handlePaddleWebhook(request, env);
    if (url.pathname === "/api/license/validate") return handleLicenseValidate(request, env);
    if (url.pathname === "/api/license/admin") return handleLicenseAdmin(request, env);
    if (url.pathname === "/api/report") return handleAuditReport(request, env);
    if (url.pathname === "/api/verify") return handleVerify(request, env);
    if (url.pathname === "/api/verify/status") return handleVerifyStatus(request, env);
    if (url.pathname.startsWith("/badge/")) return handleBadge(request, env);
    if (url.pathname === "/api/stats") return handleStats(env);
    return env.ASSETS.fetch(request);
  },

  // Cron Trigger: re-scan monitors (alert on regressions) + re-verify badges.
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => { await runScheduledMonitors(env); await reverifyBadges(env); })());
  },
};

/* ---------------- scan ---------------- */

async function handleScan(request) {
  const report = await buildScanReport(new URL(request.url).searchParams.get("url"));
  if (report.error) return json({ error: report.error }, report.status || 400);
  return json(report);
}

// Reusable scan → data object (no Response). Used by /api/scan and the cron monitor.
async function buildScanReport(rawUrl) {
  const target = normalizeTarget(rawUrl);
  if (target.error) return { error: target.error, status: 400 };

  const origin = target.origin;
  const [robotsR, llmsR, homeR, sitemapR, agentsR] = await Promise.allSettled([
    fetchText(origin + "/robots.txt"),
    fetchText(origin + "/llms.txt"),
    fetchText(target.href),
    fetchHead(origin + "/sitemap.xml"),
    fetchText(origin + "/agents.md"),
  ]);

  const robots = settled(robotsR);
  const llms = settled(llmsR);
  const home = settled(homeR);
  const sitemap = settled(sitemapR);
  const agents = settled(agentsR);

  if (!home || !home.ok) {
    return { error: "Could not reach " + target.href + " — check the URL and try again.", status: 422 };
  }

  const checks = [];
  checks.push(...checkAiCrawlerAccess(robots));
  checks.push(checkLlmsTxt(llms));
  checks.push(checkAgentsMd(agents));
  checks.push(...checkStructuredData(home.body));
  checks.push(...checkMetaBasics(home.body));
  checks.push(checkSitemap(sitemap, robots));

  const earned = checks.reduce((s, c) => s + c.earned, 0);
  const possible = checks.reduce((s, c) => s + c.possible, 0);
  const score = Math.round((earned / possible) * 100);

  return {
    url: target.href,
    scannedAt: new Date().toISOString(),
    score,
    grade: grade(score),
    checks,
    summary: summarize(score),
  };
}

function normalizeTarget(raw) {
  if (!raw || !raw.trim()) return { error: "Missing url parameter." };
  let value = raw.trim();
  if (!/^https?:\/\//i.test(value)) value = "https://" + value;
  let u;
  try {
    u = new URL(value);
  } catch {
    return { error: "That does not look like a valid URL." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { error: "Only http(s) URLs are supported." };
  const host = u.hostname.toLowerCase();
  const privateHost =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^\[?::1\]?$/.test(host) ||
    !host.includes(".");
  if (privateHost) return { error: "Private or local addresses cannot be scanned." };
  return { href: u.href, origin: u.origin };
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,text/plain,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const body = res.ok ? (await res.text()).slice(0, 500_000) : "";
  return { ok: res.ok, status: res.status, body };
}

async function fetchHead(url) {
  // Some servers reject HEAD; fall back to a ranged GET.
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status !== 405 && res.status !== 501) return { ok: res.ok, status: res.status, body: "" };
  } catch {
    /* fall through to GET */
  }
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Range: "bytes=0-1024" },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  return { ok: res.ok, status: res.status, body: "" };
}

function settled(r) {
  return r.status === "fulfilled" ? r.value : null;
}

/* ---------------- checks ---------------- */

function checkAiCrawlerAccess(robots) {
  if (!robots || !robots.ok) {
    return [
      {
        id: "robots",
        category: "AI crawler access",
        title: "robots.txt",
        earned: 6,
        possible: 10,
        status: "warn",
        detail:
          "No robots.txt found. AI crawlers default to allowed, but an explicit policy signals intent and lets you steer individual bots.",
        fix: "Publish /robots.txt and explicitly allow the AI shopping crawlers you want (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended).",
      },
    ];
  }

  const rules = parseRobots(robots.body);
  const out = [];
  let blocked = 0;
  for (const bot of AI_CRAWLERS) {
    const allowed = isAllowed(rules, bot.agent);
    if (!allowed) blocked++;
    out.push({
      id: "bot-" + bot.agent.toLowerCase(),
      category: "AI crawler access",
      title: bot.agent,
      earned: allowed ? 3 : 0,
      possible: 3,
      status: allowed ? "pass" : "fail",
      detail: allowed
        ? bot.agent + " can read your site → eligible for: " + bot.channel + "."
        : bot.agent + " is blocked in robots.txt → your products cannot appear via: " + bot.channel + ".",
      fix: allowed ? null : "Remove the Disallow rule for " + bot.agent + " (or add an explicit Allow) in robots.txt.",
    });
  }
  out.unshift({
    id: "robots",
    category: "AI crawler access",
    title: "robots.txt",
    earned: 10,
    possible: 10,
    status: blocked === 0 ? "pass" : "warn",
    detail:
      blocked === 0
        ? "robots.txt found and no major AI shopping crawler is blocked."
        : "robots.txt found, but " + blocked + " AI crawler(s) are blocked — every blocked bot is a sales channel you are invisible in.",
    fix: null,
  });
  return out;
}

function parseRobots(text) {
  // Returns [{agents: [..], allows: [..], disallows: [..]}] per group.
  const groups = [];
  let current = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || current.closed) {
        current = { agents: [], allows: [], disallows: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && (key === "allow" || key === "disallow")) {
      current.closed = true;
      (key === "allow" ? current.allows : current.disallows).push(value);
    } else if (current) {
      current.closed = true;
    }
  }
  return groups;
}

function isAllowed(groups, agent) {
  const name = agent.toLowerCase();
  // Most specific matching group wins (longest matching agent token), per RFC 9309.
  let best = null;
  let bestLen = -1;
  for (const g of groups) {
    for (const a of g.agents) {
      const matches = a === "*" ? bestLen < 0 : name.includes(a) || a.includes(name);
      if (a === "*" && bestLen < 0 && !best) best = g;
      else if (a !== "*" && matches && a.length > bestLen) {
        best = g;
        bestLen = a.length;
      }
    }
  }
  if (!best) return true;
  // Blocked if the whole site is disallowed for the winning group.
  const rootBlocked = best.disallows.some((d) => d === "/" || d === "/*");
  const rootAllowed = best.allows.some((a) => a === "/" || a === "/*");
  return !rootBlocked || rootAllowed;
}

function checkLlmsTxt(llms) {
  const found = !!(llms && llms.ok && llms.body.trim().length > 0 && !/^\s*</.test(llms.body));
  return {
    id: "llms-txt",
    category: "AI-native content",
    title: "llms.txt",
    earned: found ? 7 : 0,
    possible: 7,
    status: found ? "pass" : "warn",
    detail: found
      ? "llms.txt found — a curated map for AI agents. Note: an emerging convention (Shopify serves it natively; Google calls it speculative), useful but not a ranking guarantee."
      : "No llms.txt. It's an emerging convention — cheap to add, gives agents a curated summary of what you sell. Shopify stores get one natively.",
    fix: found
      ? null
      : "Add /llms.txt: a short markdown file listing what you sell, key product pages, pricing, and shipping/return policies (free generator: agentready.agiscorecard.com/llms-txt-generator).",
  };
}

function checkAgentsMd(agents) {
  const found = !!(agents && agents.ok && agents.body.trim().length > 0 && !/^\s*</.test(agents.body));
  return {
    id: "agents-md",
    category: "AI-native content",
    title: "agents.md",
    earned: found ? 3 : 0,
    possible: 3,
    status: found ? "pass" : "warn",
    detail: found
      ? "agents.md found — instructions for AI agents interacting with your site (Shopify now serves this natively)."
      : "No agents.md. A newer convention (adopted natively by Shopify) that tells AI agents how to interact with your store.",
    fix: found ? null : "Add /agents.md describing how agents should browse, query and transact with your site.",
  };
}

function checkStructuredData(html) {
  const jsonLdBlocks = [...html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const types = new Set();
  for (const m of jsonLdBlocks) {
    try {
      const data = JSON.parse(m[1].trim());
      collectTypes(data, types);
    } catch {
      /* invalid JSON-LD block — ignore */
    }
  }
  const hasMicrodata = /itemtype\s*=\s*["'][^"']*schema\.org/i.test(html);

  const has = (t) => types.has(t.toLowerCase());
  const product = has("product") || has("offer") || has("aggregateoffer");
  const org = has("organization") || has("localbusiness") || has("onlinestore") || has("website");
  const faq = has("faqpage") || has("qapage");

  return [
    {
      id: "jsonld",
      category: "Structured data",
      title: "JSON-LD present",
      earned: jsonLdBlocks.length > 0 || hasMicrodata ? 8 : 0,
      possible: 8,
      status: jsonLdBlocks.length > 0 || hasMicrodata ? "pass" : "fail",
      detail:
        jsonLdBlocks.length > 0
          ? "Found " + jsonLdBlocks.length + " JSON-LD block(s)" + (types.size ? " (" + [...types].slice(0, 6).join(", ") + ")" : "") + "."
          : hasMicrodata
            ? "Schema.org microdata found (consider migrating to JSON-LD)."
            : "No schema.org structured data. AI agents rely on structured data to extract prices, availability and specs.",
      fix: jsonLdBlocks.length > 0 || hasMicrodata ? null : "Add JSON-LD structured data to every important page.",
    },
    {
      id: "sd-product",
      category: "Structured data",
      title: "Product / Offer schema",
      earned: product ? 10 : 0,
      possible: 10,
      status: product ? "pass" : "fail",
      detail: product
        ? "Product/Offer markup found — agents can read price, availability and specs."
        : "No Product or Offer schema detected on this page. Shopping agents (ChatGPT Shopping, Google AI Mode) select products from structured feeds, not screenshots.",
      fix: product ? null : "Add schema.org/Product with nested Offer (price, priceCurrency, availability) to product pages, or scan a product URL directly.",
    },
    {
      id: "sd-org",
      category: "Structured data",
      title: "Organization schema",
      earned: org ? 5 : 0,
      possible: 5,
      status: org ? "pass" : "warn",
      detail: org
        ? "Organization/site markup found — helps agents verify who they are buying from."
        : "No Organization schema. Trust signals matter: agents prefer merchants they can identify.",
      fix: org ? null : "Add schema.org/Organization (name, url, logo, contactPoint) to your homepage.",
    },
    {
      id: "sd-faq",
      category: "Structured data",
      title: "FAQ schema",
      earned: faq ? 4 : 0,
      possible: 4,
      status: faq ? "pass" : "warn",
      detail: faq
        ? "FAQPage markup found — a rich source for AI answers about your offering."
        : "No FAQPage schema. FAQ markup is one of the most-cited structures in AI-generated answers.",
      fix: faq ? null : "Publish an FAQ (shipping, returns, sizing, guarantees) with schema.org/FAQPage markup.",
    },
  ];
}

function collectTypes(node, out) {
  if (Array.isArray(node)) return node.forEach((n) => collectTypes(n, out));
  if (node && typeof node === "object") {
    const t = node["@type"];
    if (typeof t === "string") out.add(t.toLowerCase());
    if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && out.add(x.toLowerCase()));
    for (const key of Object.keys(node)) {
      if (key === "@graph" || key === "mainEntity" || key === "offers" || key === "itemListElement") {
        collectTypes(node[key], out);
      }
    }
  }
}

function checkMetaBasics(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || "";
  const desc = (html.match(/<meta[^>]+name\s*=\s*["']description["'][^>]*>/i) || [])[0] || "";
  const og = /<meta[^>]+property\s*=\s*["']og:(title|description|image)["']/i.test(html);
  const canonical = /<link[^>]+rel\s*=\s*["']canonical["']/i.test(html);

  return [
    {
      id: "meta-title",
      category: "Answer readiness",
      title: "Descriptive <title>",
      earned: title.length >= 10 ? 4 : 0,
      possible: 4,
      status: title.length >= 10 ? "pass" : "fail",
      detail: title ? 'Title: "' + title.slice(0, 90) + '"' : "Page has no usable <title>.",
      fix: title.length >= 10 ? null : "Write a descriptive title that states what you sell and for whom.",
    },
    {
      id: "meta-desc",
      category: "Answer readiness",
      title: "Meta description",
      earned: desc ? 4 : 0,
      possible: 4,
      status: desc ? "pass" : "warn",
      detail: desc ? "Meta description present." : "No meta description — the first thing many agents quote about you is missing.",
      fix: desc ? null : "Add a meta description that answers: what do you sell, for whom, at what price point.",
    },
    {
      id: "meta-og",
      category: "Answer readiness",
      title: "Open Graph tags",
      earned: og ? 3 : 0,
      possible: 3,
      status: og ? "pass" : "warn",
      detail: og ? "Open Graph tags present." : "No Open Graph tags — link previews in AI chats will look broken.",
      fix: og ? null : "Add og:title, og:description and og:image.",
    },
    {
      id: "canonical",
      category: "Answer readiness",
      title: "Canonical URL",
      earned: canonical ? 3 : 0,
      possible: 3,
      status: canonical ? "pass" : "warn",
      detail: canonical ? "Canonical link present." : "No canonical link — duplicate URLs dilute how agents consolidate signals about your pages.",
      fix: canonical ? null : 'Add <link rel="canonical"> to every page.',
    },
  ];
}

function checkSitemap(sitemap, robots) {
  const inRobots = !!(robots && robots.ok && /sitemap\s*:/i.test(robots.body));
  const found = !!(sitemap && sitemap.ok) || inRobots;
  return {
    id: "sitemap",
    category: "AI crawler access",
    title: "XML sitemap",
    earned: found ? 5 : 0,
    possible: 5,
    status: found ? "pass" : "warn",
    detail: found
      ? "Sitemap discoverable" + (inRobots ? " (declared in robots.txt)" : " at /sitemap.xml") + "."
      : "No sitemap found — crawlers may miss your product pages entirely.",
    fix: found ? null : "Publish /sitemap.xml and declare it in robots.txt.",
  };
}

/* ---------------- scoring ---------------- */

function grade(score) {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 55) return "C";
  if (score >= 35) return "D";
  return "F";
}

function summarize(score) {
  if (score >= 90) return "Excellent — AI agents can discover, understand and recommend what you sell.";
  if (score >= 75) return "Good — you are visible to AI shoppers, but leaving recommendation share on the table.";
  if (score >= 55) return "Partial — AI agents can find you but will struggle to extract prices, products and trust signals.";
  if (score >= 35) return "Weak — most AI shopping channels either can't read you or can't parse what you sell.";
  return "Invisible — as far as AI shopping agents are concerned, your store barely exists.";
}

/* ---------------- subscribe ---------------- */

async function handleSubscribe(request, env) {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  let email = "";
  let intent = "waitlist";
  try {
    const body = await request.json();
    email = String(body.email || "").trim().toLowerCase();
    if (body.intent === "preorder") intent = "preorder";
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Invalid email" }, 400);
  if (env.SUBSCRIBERS) {
    // Keyed by intent so pre-order demand (willingness to pay) is countable separately.
    await env.SUBSCRIBERS.put(intent + ":" + email, JSON.stringify({ email, intent, at: new Date().toISOString() }));
  }
  return json({ ok: true });
}

/* ---------------- monitoring (subscription engine) ---------------- */
// Recurring value = scheduled re-scan + regression alert. All checks are
// deterministic HTTP fetches (zero LLM cost). Plan-gated for later billing.

const MONITOR_PREFIX = "monitor:agentready:";
const PLAN_FREQ = { free: "weekly", pro: "daily", team: "daily" };
const FREQ_MS = { hourly: 3600e3, daily: 86400e3, weekly: 7 * 86400e3 };
const SCORE_DROP_ALERT = 5; // points
const MAX_SCANS_PER_CRON = 200;
const MAX_HISTORY = 180; // ~180 daily points

function monitorId(email, url) {
  // Deterministic djb2 hash so re-submitting the same pair updates one record.
  const s = email + "|" + url;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

function randToken() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function compactChecks(checks) {
  return checks.map((c) => ({ id: c.id, t: c.title, e: c.earned, p: c.possible }));
}

async function handleMonitor(request, env) {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  let email = "", rawUrl = "";
  try {
    const body = await request.json();
    email = String(body.email || "").trim().toLowerCase();
    rawUrl = String(body.url || "").trim();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Invalid email" }, 400);

  const report = await buildScanReport(rawUrl);
  if (report.error) return json({ error: report.error }, report.status || 400);

  const now = new Date().toISOString();
  const plan = "free";
  const id = monitorId(email, report.url);
  // Preserve token + history if this monitor already exists (re-submit).
  let token, history = [];
  if (env.SUBSCRIBERS) {
    try {
      const prev = JSON.parse(await env.SUBSCRIBERS.get(MONITOR_PREFIX + id));
      if (prev) { token = prev.token; history = Array.isArray(prev.history) ? prev.history : []; }
    } catch { /* new monitor */ }
  }
  if (!token) token = randToken();
  history = [...history, { at: now, score: report.score, grade: report.grade }].slice(-MAX_HISTORY);
  const record = {
    id, url: report.url, email, plan, token,
    freq: PLAN_FREQ[plan],
    createdAt: now,
    lastRun: now,
    baseline: { score: report.score, grade: report.grade, checks: compactChecks(report.checks) },
    history,
  };
  if (env.SUBSCRIBERS) {
    await env.SUBSCRIBERS.put(MONITOR_PREFIX + record.id, JSON.stringify(record));
    await env.SUBSCRIBERS.put("monitorlead:" + email, JSON.stringify({ email, at: now }));
  }
  const statusUrl = `https://agentready.agiscorecard.com/status?id=${record.id}&t=${token}`;
  return json({ ok: true, url: report.url, score: report.score, grade: report.grade, summary: report.summary, statusUrl });
}

// Token-gated read-only status for a monitor (shareable). No email/PII exposed.
// GET /api/monitor/status?id=<id>&t=<token>
async function handleMonitorStatus(request, env) {
  const u = new URL(request.url);
  const id = u.searchParams.get("id") || "";
  const t = u.searchParams.get("t") || "";
  if (!id || !t) return json({ error: "Missing id or token" }, 400);
  if (!env.SUBSCRIBERS) return json({ error: "Not found" }, 404);
  let rec;
  try { rec = JSON.parse(await env.SUBSCRIBERS.get(MONITOR_PREFIX + id)); } catch { rec = null; }
  if (!rec || rec.token !== t) return json({ error: "Not found" }, 404);
  const b = rec.baseline || {};
  const failing = (b.checks || []).filter((c) => c.e === 0).map((c) => c.t);
  return json({
    url: rec.url,
    score: b.score,
    grade: b.grade,
    plan: rec.plan,
    freq: rec.freq,
    createdAt: rec.createdAt,
    lastRun: rec.lastRun,
    failing,
    history: (rec.history || []).map((h) => ({ at: h.at, score: h.score })),
  });
}

// External-scheduler entrypoint for the monitor sweep (used when Cloudflare Cron
// isn't available on the plan). Guarded by CRON_SECRET when that secret is set.
async function handleCronRun(request, env) {
  const key = new URL(request.url).searchParams.get("key") || request.headers.get("x-cron-key");
  if (env.CRON_SECRET && key !== env.CRON_SECRET) return json({ error: "Unauthorized" }, 401);
  const ran = await runScheduledMonitors(env);
  const reverified = await reverifyBadges(env);
  return json({ ok: true, scanned: ran, reverified });
}

async function runScheduledMonitors(env) {
  if (!env.SUBSCRIBERS) return 0;
  const nowMs = Date.now();
  let cursor, scans = 0;
  do {
    const page = await env.SUBSCRIBERS.list({ prefix: MONITOR_PREFIX, cursor, limit: 1000 });
    for (const key of page.keys) {
      if (scans >= MAX_SCANS_PER_CRON) return scans;
      let rec;
      try { rec = JSON.parse(await env.SUBSCRIBERS.get(key.name)); } catch { continue; }
      if (!rec || !rec.url) continue;
      const interval = FREQ_MS[rec.freq] || FREQ_MS.weekly;
      if (rec.lastRun && nowMs - Date.parse(rec.lastRun) < interval) continue; // not due
      scans++;
      const fresh = await buildScanReport(rec.url);
      if (fresh.error) continue; // transient; leave baseline, retry next cron
      const issues = detectRegressions(rec.baseline, fresh);
      if (issues.length) await sendAlert(env, rec, fresh, issues);
      const at = new Date(nowMs).toISOString();
      rec.lastRun = at;
      rec.baseline = { score: fresh.score, grade: fresh.grade, checks: compactChecks(fresh.checks) };
      rec.history = [...(Array.isArray(rec.history) ? rec.history : []), { at, score: fresh.score, grade: fresh.grade }].slice(-MAX_HISTORY);
      await env.SUBSCRIBERS.put(key.name, JSON.stringify(rec));
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return scans;
}

function detectRegressions(baseline, fresh) {
  const issues = [];
  if (baseline && typeof baseline.score === "number" && fresh.score <= baseline.score - SCORE_DROP_ALERT) {
    issues.push(`Overall AI-visibility score dropped ${baseline.score} → ${fresh.score}.`);
  }
  const prev = new Map((baseline?.checks || []).map((c) => [c.id, c]));
  for (const c of fresh.checks) {
    const b = prev.get(c.id);
    if (b && b.e > 0 && c.earned === 0) {
      issues.push(`"${c.title}" regressed — it used to pass and now fails.`);
    }
  }
  return issues;
}

async function sendAlert(env, rec, fresh, issues) {
  const host = (() => { try { return new URL(rec.url).host; } catch { return rec.url; } })();
  const subject = `⚠️ AI-visibility regression on ${host} (score ${fresh.score}/100)`;
  const text = [
    `Your AgentReady monitor found a regression on ${rec.url}:`,
    "",
    ...issues.map((i) => "• " + i),
    "",
    `Current score: ${fresh.score}/100 (${fresh.grade}). ${fresh.summary}`,
    "",
    `Re-scan: https://agentready.agiscorecard.com/?url=${encodeURIComponent(rec.url)}`,
    "",
    "— AgentReady monitoring",
  ].join("\n");

  const res = await sendEmail(env, rec.email, subject, text);
  if (res.ok) return;
  // No email provider configured (or send failed): persist so nothing is lost.
  await env.SUBSCRIBERS.put(`alert:agentready:${rec.id}:${new Date().toISOString()}`,
    JSON.stringify({ email: rec.email, subject, text, at: new Date().toISOString(), delivery: res }));
}

// Single email sender used by alerts + the test endpoint. Returns {ok, skipped?, status?, error?}.
async function sendEmail(env, to, subject, text) {
  if (!env.RESEND_API_KEY) return { ok: false, skipped: "no RESEND_API_KEY set" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.ALERT_FROM || "AgentReady <alerts@agiscorecard.com>", to, subject, text }),
    });
    if (r.ok) return { ok: true, status: r.status };
    let detail = "";
    try { detail = (await r.text()).slice(0, 300); } catch { /* ignore */ }
    return { ok: false, status: r.status, error: detail || "Resend returned " + r.status };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

// Guarded test-alert: verify the Resend integration end-to-end once the key is set.
// GET/POST /api/monitor/test?key=<CRON_SECRET>&to=<email>
async function handleMonitorTest(request, env) {
  const u = new URL(request.url);
  const key = u.searchParams.get("key") || request.headers.get("x-cron-key");
  if (!env.CRON_SECRET) return json({ error: "Set CRON_SECRET (and RESEND_API_KEY) to use the test endpoint." }, 400);
  if (key !== env.CRON_SECRET) return json({ error: "Unauthorized" }, 401);
  const to = u.searchParams.get("to");
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: "Provide a valid ?to= email." }, 400);
  const res = await sendEmail(env, to,
    "AgentReady monitoring — test alert",
    "This is a test of your AgentReady monitoring alerts. If you received this, Resend delivery is working. — AgentReady");
  return json({ ok: res.ok, delivery: res });
}

// Merchant-of-Record (Creem) webhook. Verifies the HMAC signature when
// CREEM_WEBHOOK_SECRET is set, then maps the event → plan and updates the
// subscriber's monitors. Also accepts a manual {email, plan} body (guarded by
// CRON_SECRET) for testing. Env: CREEM_WEBHOOK_SECRET, CREEM_SIGNATURE_HEADER
// (default "creem-signature"), CREEM_PRO_PRODUCT_ID, CREEM_TEAM_PRODUCT_ID.
async function handleBillingWebhook(request, env) {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  const raw = await request.text();

  // Manual path (testing / admin): {email, plan} authorized by CRON_SECRET.
  const adminKey = new URL(request.url).searchParams.get("key");
  if (env.CRON_SECRET && adminKey === env.CRON_SECRET) {
    let b = {}; try { b = JSON.parse(raw || "{}"); } catch { /* ignore */ }
    const email = String(b.email || "").trim().toLowerCase();
    const plan = ["free", "pro", "team"].includes(b.plan) ? b.plan : null;
    if (email && plan) { const n = await setPlanForEmail(env, email, plan); return json({ ok: true, updated: n }); }
    return json({ error: "Provide {email, plan}" }, 400);
  }

  // Creem webhook path: MUST verify signature. If no secret is configured we
  // cannot authenticate the caller, so we never mutate plans from here.
  if (!env.CREEM_WEBHOOK_SECRET) return json({ error: "Billing webhook not configured" }, 400);
  {
    const header = env.CREEM_SIGNATURE_HEADER || "creem-signature";
    const sig = request.headers.get(header) || "";
    const ok = await verifyHmacSha256(raw, env.CREEM_WEBHOOK_SECRET, sig);
    if (!ok) return json({ error: "Invalid signature" }, 401);
  }

  let evt = {}; try { evt = JSON.parse(raw || "{}"); } catch { return json({ error: "Invalid JSON" }, 400); }
  const type = String(evt.eventType || evt.type || evt.event || "").toLowerCase();
  const obj = evt.object || evt.data || evt;
  const email = extractEmail(obj);
  const productId = extractProductId(obj);

  const isBadge = (productId && env.CREEM_BADGE_PRODUCT_ID && productId === env.CREEM_BADGE_PRODUCT_ID)
    || (obj && obj.metadata && obj.metadata.type === "badge");
  const paidEvent = /paid|active|complete|success|subscription|checkout/.test(type);

  // Badge purchase → activate the Verified badge for that email.
  if (isBadge && paidEvent && email) {
    const badges = await setBadgePaidForEmail(env, email);
    return json({ ok: true, type, product: "badge", badges });
  }

  let plan = null;
  if (/cancel|expire|refund|revoke/.test(type)) plan = "free";
  else if (paidEvent) {
    if (productId && env.CREEM_TEAM_PRODUCT_ID && productId === env.CREEM_TEAM_PRODUCT_ID) plan = "team";
    else if (productId && env.CREEM_PRO_PRODUCT_ID && productId === env.CREEM_PRO_PRODUCT_ID) plan = "pro";
    else if (obj && obj.metadata && ["pro", "team"].includes(obj.metadata.plan)) plan = obj.metadata.plan;
    else plan = "pro"; // sensible default for a completed paid event
  }

  let updated = 0;
  if (email && plan) updated = await setPlanForEmail(env, email, plan);
  return json({ ok: true, type, plan, updated });
}

function extractEmail(o) {
  if (!o || typeof o !== "object") return "";
  const cands = [o.customer_email, o.email, o.customer && o.customer.email, o.customer && o.customer.customer_email,
    o.data && o.data.customer && o.data.customer.email];
  for (const c of cands) if (c && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return String(c).trim().toLowerCase();
  return "";
}
function extractProductId(o) {
  if (!o || typeof o !== "object") return "";
  return String((o.product && (o.product.id || o.product)) || o.product_id || (o.data && o.data.product && o.data.product.id) || "").trim();
}
async function setPlanForEmail(env, email, plan) {
  if (!env.SUBSCRIBERS) return 0;
  let cursor, n = 0;
  do {
    const page = await env.SUBSCRIBERS.list({ prefix: MONITOR_PREFIX, cursor, limit: 1000 });
    for (const key of page.keys) {
      let rec;
      try { rec = JSON.parse(await env.SUBSCRIBERS.get(key.name)); } catch { continue; }
      if (rec && rec.email === email) {
        rec.plan = plan;
        rec.freq = PLAN_FREQ[plan] || rec.freq;
        await env.SUBSCRIBERS.put(key.name, JSON.stringify(rec));
        n++;
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return n;
}
// HMAC-SHA256(raw) == sig (hex), constant-time compare. Accepts bare hex or "sha256=hex".
async function verifyHmacSha256(raw, secret, sig) {
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const got = (sig || "").replace(/^sha256=/i, "").trim().toLowerCase();
    if (got.length !== hex.length) return false;
    let diff = 0;
    for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ got.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}

/* ---------------- Paddle billing (second MoR rail) ---------------- */
// Paddle Billing webhook — point a Paddle notification destination at
// /api/billing/paddle. Verifies `Paddle-Signature: ts=...;h1=...`
// (HMAC-SHA256 over "<ts>:<raw body>" with PADDLE_WEBHOOK_SECRET), then maps
// price ids → products. Works alongside the Creem webhook; either rail can be
// live. Env: PADDLE_WEBHOOK_SECRET (required), PADDLE_API_KEY (optional —
// customer-email lookup when checkout didn't carry custom_data.email),
// PADDLE_API_BASE (default https://api.paddle.com; use the sandbox URL while
// testing), and price ids: PADDLE_PRO_PRICE_ID, PADDLE_TEAM_PRICE_ID,
// PADDLE_BADGE_PRICE_ID, PADDLE_AUDIT_PRICE_ID, PADDLE_DEVKIT_PRICE_ID.
async function handlePaddleWebhook(request, env) {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!env.PADDLE_WEBHOOK_SECRET) return json({ error: "Paddle webhook not configured" }, 400);
  const raw = await request.text();
  const sigHeader = request.headers.get("paddle-signature") || "";
  // During secret rotation Paddle may send several h1 entries — accept if ANY
  // verifies. Reject events whose timestamp is older than 10 minutes (replay).
  let ts = "";
  const h1s = [];
  for (const kv of sigHeader.split(";")) {
    const i = kv.indexOf("=");
    if (i <= 0) continue;
    const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim();
    if (k === "ts") ts = v;
    else if (k === "h1") h1s.push(v);
  }
  if (!ts || !h1s.length) return json({ error: "Missing signature" }, 401);
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 600) return json({ error: "Stale webhook timestamp" }, 401);
  let sigOk = false;
  for (const h1 of h1s) {
    if (await verifyHmacSha256(ts + ":" + raw, env.PADDLE_WEBHOOK_SECRET, h1)) { sigOk = true; break; }
  }
  if (!sigOk) return json({ error: "Invalid signature" }, 401);

  let evt = {}; try { evt = JSON.parse(raw || "{}"); } catch { return json({ error: "Invalid JSON" }, 400); }
  const type = String(evt.event_type || "").toLowerCase();
  const data = evt.data || {};
  const priceIds = paddlePriceIds(data);
  let email = paddleEmail(data);
  if (!email && data.customer_id && env.PADDLE_API_KEY) email = await paddleLookupEmail(env, data.customer_id);

  const bought = (k) => env[k] && priceIds.includes(env[k]);
  const paid = /^(transaction\.completed|transaction\.paid|subscription\.activated|subscription\.created)$/.test(type);
  // adjustment.created (refunds/credits) is deliberately NOT here: its payload
  // carries no price ids, so acting on it would touch unrelated products (e.g.
  // downgrade a live Pro plan over a refunded one-time audit). Handle refunds
  // issued as adjustments manually via /api/license/admin.
  const ended = /^(subscription\.canceled|subscription\.paused|transaction\.revoked)$/.test(type);

  const actions = [];
  if (email && paid) {
    // One purchase fires both transaction.paid and transaction.completed (plus
    // retries): dedupe deliveries on the entity id so a buyer never gets two
    // license keys / audit tokens for one payment.
    const entityId = String(data.id || evt.event_id || "");
    if (entityId) {
      const dedupeKey = "pdltxn:agentready:" + entityId;
      if (await env.SUBSCRIBERS.get(dedupeKey)) return json({ ok: true, type, deduped: true });
      await env.SUBSCRIBERS.put(dedupeKey, new Date().toISOString(), { expirationTtl: 90 * 86400 });
    }
    if (bought("PADDLE_BADGE_PRICE_ID")) { await setBadgePaidForEmail(env, email); actions.push("badge"); }
    if (bought("PADDLE_AUDIT_PRICE_ID")) { await issueAuditToken(env, email); actions.push("audit"); }
    if (bought("PADDLE_DEVKIT_PRICE_ID")) { await issueLicense(env, email, "devkit"); actions.push("devkit"); }
    if (bought("PADDLE_TEAM_PRICE_ID")) { await setPlanForEmail(env, email, "team"); actions.push("team"); }
    else if (bought("PADDLE_PRO_PRICE_ID")) { await setPlanForEmail(env, email, "pro"); actions.push("pro"); }
  } else if (email && ended) {
    if (bought("PADDLE_DEVKIT_PRICE_ID")) { await revokeLicenses(env, email, "devkit"); actions.push("devkit-revoked"); }
    if (bought("PADDLE_PRO_PRICE_ID") || bought("PADDLE_TEAM_PRICE_ID")) {
      await setPlanForEmail(env, email, "free"); actions.push("plan-free");
    }
  }
  // Tokens/keys are never echoed here (this response lands in Paddle's webhook
  // logs) — they are emailed to the buyer via Resend, or retrievable by the
  // owner through /api/license/admin.
  return json({ ok: true, type, email: email ? maskEmail(email) : "", actions });
}

function paddlePriceIds(data) {
  const ids = [];
  const items = (data && (data.items || (data.details && data.details.line_items))) || [];
  for (const it of items) {
    const pid = (it && it.price && it.price.id) || (it && it.price_id);
    if (pid) ids.push(String(pid));
  }
  return ids;
}
function paddleEmail(data) {
  const cands = [data.custom_data && data.custom_data.email, data.customer && data.customer.email,
    data.billing_details && data.billing_details.email];
  for (const c of cands) if (c && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return String(c).trim().toLowerCase();
  return "";
}
async function paddleLookupEmail(env, customerId) {
  try {
    const base = env.PADDLE_API_BASE || "https://api.paddle.com";
    const r = await fetch(base + "/customers/" + encodeURIComponent(customerId), {
      headers: { Authorization: "Bearer " + env.PADDLE_API_KEY },
    });
    if (!r.ok) return "";
    const d = await r.json();
    const em = d && d.data && d.data.email;
    return em && /@/.test(em) ? String(em).trim().toLowerCase() : "";
  } catch { return ""; }
}
function maskEmail(email) { return email.replace(/^(.).*(@.*)$/, "$1***$2"); }

/* ---------------- Licenses (DevKit) & deep-audit tokens ---------------- */
// DevKit license keys gate the Pro tier of our editor extensions (VS Code /
// JetBrains). Audit tokens unlock the deep-audit report (up to 3 domains per
// token). Both are issued by the billing webhooks and emailed via Resend when
// configured; the owner can always issue/look them up via /api/license/admin.

const LICENSE_PREFIX = "license:agentready:";
const AUDIT_PREFIX = "audit:agentready:";
const AUDIT_MAX_DOMAINS = 3;

function randomKey(tag) {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const s = [...b].map((x) => alphabet[x % 32]).join("");
  return tag + "-" + s.slice(0, 6) + "-" + s.slice(6, 12) + "-" + s.slice(12, 18);
}

async function issueLicense(env, email, product) {
  const key = randomKey("ARDK");
  await env.SUBSCRIBERS.put(LICENSE_PREFIX + key, JSON.stringify({ email, product: product || "devkit", active: true, at: new Date().toISOString() }));
  let emailed = false;
  if (env.RESEND_API_KEY) {
    const r = await sendEmail(env, email, "Your AgentReady DevKit license key",
      "Thanks for your purchase!\n\nYour license key:\n\n  " + key +
      "\n\nActivate: open the LLMs.txt Toolkit extension → “Enter license key”.\n" +
      "Docs: https://agentready.agiscorecard.com/pricing\n\nQuestions? Just reply to this email.");
    emailed = !!(r && r.ok);
  }
  return { key, emailed };
}

async function revokeLicenses(env, email, product) {
  let cursor, n = 0;
  do {
    const page = await env.SUBSCRIBERS.list({ prefix: LICENSE_PREFIX, cursor, limit: 1000 });
    for (const k of page.keys) {
      try {
        const rec = JSON.parse(await env.SUBSCRIBERS.get(k.name));
        if (rec && rec.email === email && (!product || rec.product === product) && rec.active) {
          rec.active = false;
          rec.revokedAt = new Date().toISOString();
          await env.SUBSCRIBERS.put(k.name, JSON.stringify(rec));
          n++;
        }
      } catch { /* ignore malformed */ }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return n;
}

async function handleLicenseValidate(request, env) {
  const key = (new URL(request.url).searchParams.get("key") || "").trim();
  if (!key) return json({ valid: false, error: "key required" }, 400);
  let rec = null;
  try { rec = JSON.parse(await env.SUBSCRIBERS.get(LICENSE_PREFIX + key)); } catch { /* ignore */ }
  if (!rec || !rec.active) return json({ valid: false });
  return json({ valid: true, product: rec.product || "devkit" });
}

// Owner console (guarded by CRON_SECRET):
//   GET  /api/license/admin?key=<CRON_SECRET>&email=<buyer>   → their licenses + audit tokens
//   POST /api/license/admin?key=<CRON_SECRET>  {email, product:"devkit"|"audit"} → issue manually
async function handleLicenseAdmin(request, env) {
  const adminKey = new URL(request.url).searchParams.get("key");
  if (!env.CRON_SECRET || adminKey !== env.CRON_SECRET) return json({ error: "Unauthorized" }, 401);
  if (request.method === "GET") {
    const email = (new URL(request.url).searchParams.get("email") || "").trim().toLowerCase();
    if (!email) return json({ error: "email required" }, 400);
    const out = { licenses: [], audits: [] };
    for (const [prefix, field] of [[LICENSE_PREFIX, "licenses"], [AUDIT_PREFIX, "audits"]]) {
      let cursor;
      do {
        const page = await env.SUBSCRIBERS.list({ prefix, cursor, limit: 1000 });
        for (const k of page.keys) {
          try {
            const rec = JSON.parse(await env.SUBSCRIBERS.get(k.name));
            if (rec && rec.email === email) out[field].push({ key: k.name.slice(prefix.length), ...rec });
          } catch { /* ignore */ }
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
    }
    return json(out);
  }
  if (request.method !== "POST") return json({ error: "GET or POST" }, 405);
  let b = {};
  try { b = JSON.parse((await request.text()) || "{}"); } catch { /* ignore */ }
  const email = String(b.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Provide {email, product:'devkit'|'audit'}" }, 400);
  if (b.product === "audit") return json({ ok: true, audit: await issueAuditToken(env, email) });
  return json({ ok: true, license: await issueLicense(env, email, b.product || "devkit") });
}

/* ---------------- Deep-audit report (paid) ---------------- */
// One-time purchase → token → /api/report?token=&url= renders a full,
// printable HTML audit (score, every check, prioritized fix roadmap) for up
// to AUDIT_MAX_DOMAINS distinct domains. `&format=json` returns JSON.

async function issueAuditToken(env, email) {
  const token = randomKey("ARAU");
  await env.SUBSCRIBERS.put(AUDIT_PREFIX + token, JSON.stringify({ email, domains: [], max: AUDIT_MAX_DOMAINS, at: new Date().toISOString() }));
  let emailed = false;
  if (env.RESEND_API_KEY) {
    const r = await sendEmail(env, email, "Your AgentReady deep-audit access",
      "Thanks for your purchase!\n\nRun your deep audit here (works for up to " + AUDIT_MAX_DOMAINS + " domains):\n\n" +
      "  https://agentready.agiscorecard.com/api/report?token=" + token + "&url=https://YOUR-STORE.com\n\n" +
      "Replace YOUR-STORE.com with your site. The report is printable (Cmd/Ctrl+P → save as PDF).\n\nQuestions? Just reply to this email.");
    emailed = !!(r && r.ok);
  }
  return { token, emailed };
}

async function handleAuditReport(request, env) {
  const u = new URL(request.url);
  const token = (u.searchParams.get("token") || "").trim();
  const rawUrl = u.searchParams.get("url") || "";
  if (!token) return json({ error: "token required — purchase a deep audit at https://agentready.agiscorecard.com/pricing" }, 401);
  let rec = null;
  try { rec = JSON.parse(await env.SUBSCRIBERS.get(AUDIT_PREFIX + token)); } catch { /* ignore */ }
  if (!rec) return json({ error: "Invalid audit token" }, 401);

  const report = await buildScanReport(rawUrl);
  if (report.error) return json({ error: report.error }, report.status || 400);

  const host = new URL(report.url).hostname;
  const domains = Array.isArray(rec.domains) ? rec.domains : [];
  if (!domains.includes(host)) {
    if (domains.length >= (rec.max || AUDIT_MAX_DOMAINS)) {
      return json({ error: "This token already covers " + domains.length + " domains (" + domains.join(", ") + "). Buy another audit for more." }, 403);
    }
    domains.push(host);
    rec.domains = domains;
    await env.SUBSCRIBERS.put(AUDIT_PREFIX + token, JSON.stringify(rec));
  }

  if (u.searchParams.get("format") === "json") return json({ ...report, audit: true });
  return new Response(renderAuditHtml(report), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderAuditHtml(report) {
  const fails = report.checks.filter((c) => c.status === "fail");
  const warns = report.checks.filter((c) => c.status === "warn");
  const passes = report.checks.filter((c) => c.status === "pass");
  const row = (c) => `<tr><td class="st ${c.status}">${c.status.toUpperCase()}</td><td><b>${escapeHtml(c.title)}</b><div class="cat">${escapeHtml(c.category || "")}</div></td><td>${c.earned}/${c.possible}</td><td>${escapeHtml(c.detail || "")}</td></tr>`;
  const fixItem = (c, i) => `<li><b>${i + 1}. ${escapeHtml(c.title)}</b> <span class="pts">(+${c.possible - c.earned} pts)</span><br>${escapeHtml(c.fix || c.detail || "")}</li>`;
  const fixes = [...fails, ...warns].filter((c) => c.fix);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Deep Agent-Readiness Audit — ${escapeHtml(report.url)}</title>
<style>
body{font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#182033;margin:0;background:#f6f8fb}
.wrap{max-width:880px;margin:0 auto;padding:32px 20px}
.card{background:#fff;border:1px solid #e3e8f0;border-radius:12px;padding:24px;margin-bottom:20px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:0 0 12px}
.score{font-size:52px;font-weight:800}.grade{display:inline-block;padding:2px 12px;border-radius:8px;background:#eef2ff;font-weight:700;font-size:22px;vertical-align:middle;margin-left:10px}
.muted{color:#66718a;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:13.5px}
td{padding:8px 10px;border-top:1px solid #edf0f6;vertical-align:top}
.st{font-weight:700;font-size:11px;white-space:nowrap}
.st.pass{color:#1a9e6e}.st.warn{color:#c58a00}.st.fail{color:#d23f4c}
.cat{color:#8892a8;font-size:11px}
ol.fix{padding-left:18px}ol.fix li{margin-bottom:12px}.pts{color:#1a6ee0;font-weight:600;font-size:12px}
@media print{body{background:#fff}.card{border:none;padding:12px 0}}
</style></head><body><div class="wrap">
<div class="card"><h1>Deep Agent-Readiness Audit</h1>
<div class="muted">${escapeHtml(report.url)} · generated ${escapeHtml(report.scannedAt || new Date().toISOString())} · AgentReady (agentready.agiscorecard.com)</div>
<div style="margin-top:14px"><span class="score">${report.score}</span><span class="muted">/100</span><span class="grade">${escapeHtml(report.grade)}</span></div>
<p>${escapeHtml(report.summary || "")}</p></div>
<div class="card"><h2>Priority fix roadmap (${fixes.length} items, +${fixes.reduce((s, c) => s + (c.possible - c.earned), 0)} points available)</h2>
${fixes.length ? `<ol class="fix">${fixes.map(fixItem).join("")}</ol>` : "<p>No outstanding fixes — this site is in excellent shape. Keep monitoring for regressions.</p>"}</div>
<div class="card"><h2>Every check (${report.checks.length})</h2><table>
${fails.map(row).join("")}${warns.map(row).join("")}${passes.map(row).join("")}
</table></div>
<div class="card muted">How to use this report: work the roadmap top-down — items are ordered by severity, then points. Re-scan free anytime at agentready.agiscorecard.com. This report covers deterministic technical signals; off-site brand mentions also matter for AI visibility. · Print to PDF with Cmd/Ctrl+P.</div>
</div></body></html>`;
}

/* ---------------- Agent-Ready Verified badge ---------------- */
// Monetizes the scanner's existing pass/score: a paid, embeddable "verified"
// badge + a public verification page, kept honest by scheduled re-verification
// (badge de-verifies if the site regresses). Payment via MoR (billing webhook).

const VERIFY_PREFIX = "verified:agentready:";
const VERIFY_THRESHOLD = 75;          // score needed to be eligible
const VERIFY_REVERIFY_MS = 7 * 86400e3; // weekly re-check
const MAX_VERIFY_PER_CRON = 200;

async function handleVerify(request, env) {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  let email = "", rawUrl = "";
  try { const b = await request.json(); email = String(b.email || "").trim().toLowerCase(); rawUrl = String(b.url || "").trim(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Invalid email" }, 400);

  const report = await buildScanReport(rawUrl);
  if (report.error) return json({ error: report.error }, report.status || 400);

  const eligible = report.score >= VERIFY_THRESHOLD;
  const id = monitorId(email, report.url);
  const now = new Date().toISOString();
  let token, paid = false;
  if (env.SUBSCRIBERS) {
    try { const prev = JSON.parse(await env.SUBSCRIBERS.get(VERIFY_PREFIX + id)); if (prev) { token = prev.token; paid = !!prev.paid; } } catch { /* new */ }
  }
  if (!token) token = randToken();
  const record = { id, url: report.url, email, token, paid,
    score: report.score, grade: report.grade, active: eligible,
    createdAt: now, lastVerified: now };
  if (env.SUBSCRIBERS) await env.SUBSCRIBERS.put(VERIFY_PREFIX + id, JSON.stringify(record));

  const failing = eligible ? [] : report.checks.filter((c) => c.earned === 0).map((c) => c.title);
  return json({
    ok: true, eligible, score: report.score, grade: report.grade, threshold: VERIFY_THRESHOLD,
    id, token, paid,
    badgeUrl: `https://agentready.agiscorecard.com/badge/${id}.svg`,
    verifyUrl: `https://agentready.agiscorecard.com/verified?id=${id}`,
    topFixes: failing.slice(0, 5),
  });
}

// Public verification status — no email/token exposed.
async function handleVerifyStatus(request, env) {
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return json({ error: "Missing id" }, 400);
  if (!env.SUBSCRIBERS) return json({ error: "Not found" }, 404);
  let rec; try { rec = JSON.parse(await env.SUBSCRIBERS.get(VERIFY_PREFIX + id)); } catch { rec = null; }
  if (!rec) return json({ error: "Not found" }, 404);
  return json({
    url: rec.url, score: rec.score, grade: rec.grade,
    verified: !!(rec.paid && rec.active), paid: !!rec.paid, active: !!rec.active,
    createdAt: rec.createdAt, lastVerified: rec.lastVerified, threshold: VERIFY_THRESHOLD,
  });
}

async function handleBadge(request, env) {
  const id = new URL(request.url).pathname.replace("/badge/", "").replace(/\.svg$/i, "");
  let rec = null;
  if (env.SUBSCRIBERS && id) { try { rec = JSON.parse(await env.SUBSCRIBERS.get(VERIFY_PREFIX + id)); } catch { rec = null; } }
  let right = "unverified", color = "#9aa4bf";
  if (rec && rec.paid && rec.active) { right = "verified ✓"; color = "#38d9a9"; }
  else if (rec && rec.paid && !rec.active) { right = "check failing"; color = "#ff6b6b"; }
  else if (rec && !rec.paid) { right = "preview"; color = "#8b94b5"; }
  const svg = renderBadgeSVG("Agent-Ready", right, color);
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function renderBadgeSVG(left, right, color) {
  const lw = 7 * left.length + 20, rw = 7 * right.length + 22, w = lw + rw;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(left)}: ${esc(right)}">
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<rect rx="3" width="${w}" height="20" fill="#1b2135"/>
<rect rx="3" x="${lw}" width="${rw}" height="20" fill="${color}"/>
<rect rx="3" width="${w}" height="20" fill="url(#s)"/>
<g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${esc(left)}</text>
<text x="${lw + rw / 2}" y="14" fill="#08131f">${esc(right)}</text>
</g></svg>`;
}

// Scheduled re-verification: keeps badges honest (de-verify on regression).
async function reverifyBadges(env) {
  if (!env.SUBSCRIBERS) return 0;
  const nowMs = Date.now();
  let cursor, n = 0;
  do {
    const page = await env.SUBSCRIBERS.list({ prefix: VERIFY_PREFIX, cursor, limit: 1000 });
    for (const key of page.keys) {
      if (n >= MAX_VERIFY_PER_CRON) return n;
      let rec; try { rec = JSON.parse(await env.SUBSCRIBERS.get(key.name)); } catch { continue; }
      if (!rec || !rec.url) continue;
      if (rec.lastVerified && nowMs - Date.parse(rec.lastVerified) < VERIFY_REVERIFY_MS) continue;
      n++;
      const fresh = await buildScanReport(rec.url);
      if (fresh.error) continue;
      rec.score = fresh.score; rec.grade = fresh.grade;
      rec.active = fresh.score >= VERIFY_THRESHOLD;
      rec.lastVerified = new Date(nowMs).toISOString();
      await env.SUBSCRIBERS.put(key.name, JSON.stringify(rec));
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return n;
}

async function setBadgePaidForEmail(env, email) {
  if (!env.SUBSCRIBERS) return 0;
  let cursor, n = 0;
  do {
    const page = await env.SUBSCRIBERS.list({ prefix: VERIFY_PREFIX, cursor, limit: 1000 });
    for (const key of page.keys) {
      let rec; try { rec = JSON.parse(await env.SUBSCRIBERS.get(key.name)); } catch { continue; }
      if (rec && rec.email === email && !rec.paid) { rec.paid = true; await env.SUBSCRIBERS.put(key.name, JSON.stringify(rec)); n++; }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return n;
}

async function handleStats(env) {
  // Aggregate counts only — no emails or PII are ever exposed.
  const counts = { waitlist: 0, preorder: 0, legacy: 0, monitors: 0 };
  if (env.SUBSCRIBERS) {
    const buckets = { "waitlist:": "waitlist", "preorder:": "preorder", "sub:": "legacy", [MONITOR_PREFIX]: "monitors" };
    for (const prefix of Object.keys(buckets)) {
      let cursor;
      let n = 0;
      do {
        const page = await env.SUBSCRIBERS.list({ prefix, cursor, limit: 1000 });
        n += page.keys.length;
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      counts[buckets[prefix]] = n;
    }
  }
  return json(counts);
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
