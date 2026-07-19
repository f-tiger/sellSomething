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
    return env.ASSETS.fetch(request);
  },
};

/* ---------------- scan ---------------- */

async function handleScan(request) {
  const target = normalizeTarget(new URL(request.url).searchParams.get("url"));
  if (target.error) return json({ error: target.error }, 400);

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
    return json({ error: "Could not reach " + target.href + " — check the URL and try again." }, 422);
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

  return json({
    url: target.href,
    scannedAt: new Date().toISOString(),
    score,
    grade: grade(score),
    checks,
    summary: summarize(score),
  });
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
  try {
    const body = await request.json();
    email = String(body.email || "").trim().toLowerCase();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Invalid email" }, 400);
  if (env.SUBSCRIBERS) {
    await env.SUBSCRIBERS.put("sub:" + email, JSON.stringify({ email, at: new Date().toISOString() }));
  }
  return json({ ok: true });
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
