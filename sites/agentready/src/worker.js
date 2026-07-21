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
    if (url.pathname === "/api/billing/webhook") return handleBillingWebhook(request, env);
    if (url.pathname === "/api/stats") return handleStats(env);
    return env.ASSETS.fetch(request);
  },

  // Cron Trigger: re-scan every saved monitor that is due, alert on regressions.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduledMonitors(env));
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

function monitorId(email, url) {
  // Deterministic djb2 hash so re-submitting the same pair updates one record.
  const s = email + "|" + url;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
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
  const record = {
    id: monitorId(email, report.url),
    url: report.url,
    email,
    plan,
    freq: PLAN_FREQ[plan],
    createdAt: now,
    lastRun: now,
    baseline: { score: report.score, grade: report.grade, checks: compactChecks(report.checks) },
  };
  if (env.SUBSCRIBERS) {
    await env.SUBSCRIBERS.put(MONITOR_PREFIX + record.id, JSON.stringify(record));
    // Also count this email in the funnel (willingness-to-monitor intent).
    await env.SUBSCRIBERS.put("monitorlead:" + email, JSON.stringify({ email, at: now }));
  }
  return json({ ok: true, url: report.url, score: report.score, grade: report.grade, summary: report.summary });
}

async function runScheduledMonitors(env) {
  if (!env.SUBSCRIBERS) return;
  const nowMs = Date.now();
  let cursor, scans = 0;
  do {
    const page = await env.SUBSCRIBERS.list({ prefix: MONITOR_PREFIX, cursor, limit: 1000 });
    for (const key of page.keys) {
      if (scans >= MAX_SCANS_PER_CRON) return;
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
      rec.lastRun = new Date(nowMs).toISOString();
      rec.baseline = { score: fresh.score, grade: fresh.grade, checks: compactChecks(fresh.checks) };
      await env.SUBSCRIBERS.put(key.name, JSON.stringify(rec));
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
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
  const lines = [
    `Your AgentReady monitor found a regression on ${rec.url}:`,
    "",
    ...issues.map((i) => "• " + i),
    "",
    `Current score: ${fresh.score}/100 (${fresh.grade}). ${fresh.summary}`,
    "",
    `Re-scan: https://agentready.agiscorecard.com/?url=${encodeURIComponent(rec.url)}`,
    "",
    "— AgentReady monitoring",
  ];
  const text = lines.join("\n");
  const at = new Date().toISOString();

  if (env.RESEND_API_KEY) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: env.ALERT_FROM || "AgentReady <alerts@agiscorecard.com>",
          to: rec.email,
          subject,
          text,
        }),
      });
      if (r.ok) return;
    } catch { /* fall through to KV persistence */ }
  }
  // No email provider configured (or send failed): persist so nothing is lost.
  await env.SUBSCRIBERS.put(`alert:agentready:${rec.id}:${at}`, JSON.stringify({ email: rec.email, subject, text, at }));
}

async function handleBillingWebhook(request, env) {
  // Merchant-of-Record webhook stub. Real provider (Creem) sets plan later;
  // today this is a safe no-op that can already flip a plan field if asked.
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  let body = {};
  try { body = await request.json(); } catch { /* accept empty */ }
  const email = String(body.email || "").trim().toLowerCase();
  const plan = ["free", "pro", "team"].includes(body.plan) ? body.plan : null;
  if (env.SUBSCRIBERS && email && plan) {
    let cursor;
    do {
      const page = await env.SUBSCRIBERS.list({ prefix: MONITOR_PREFIX, cursor, limit: 1000 });
      for (const key of page.keys) {
        let rec;
        try { rec = JSON.parse(await env.SUBSCRIBERS.get(key.name)); } catch { continue; }
        if (rec && rec.email === email) {
          rec.plan = plan;
          rec.freq = PLAN_FREQ[plan] || rec.freq;
          await env.SUBSCRIBERS.put(key.name, JSON.stringify(rec));
        }
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  }
  return json({ ok: true });
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
