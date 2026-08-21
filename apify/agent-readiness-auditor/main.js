/**
 * Agent Readiness Auditor — Apify Actor (pay-per-event).
 *
 * For each input website this actor fetches the homepage, /robots.txt,
 * /llms.txt, /agents.md and /sitemap.xml, then runs agent-commerce
 * readiness checks:
 *
 *   - AI crawler access in robots.txt (GPTBot, OAI-SearchBot, ChatGPT-User,
 *     ClaudeBot, Claude-User, PerplexityBot, Google-Extended)
 *   - llms.txt presence & sanity
 *   - agents.md presence
 *   - JSON-LD structured data (Product/Offer, Organization, FAQPage)
 *   - Meta basics (title, description, Open Graph, canonical)
 *   - XML sitemap discoverability
 *
 * One dataset item is pushed per site: score 0-100, grade A-F, per-check
 * results with fix recommendations. The `site-audited` PPE event is charged
 * once per successful audit. Failed sites are still pushed (with an `error`
 * field) so buyers always get a full accounting — but they are never charged.
 *
 * Check logic ported from sites/agentready/src/worker.js (Cloudflare Worker)
 * to plain Node 18+ global fetch.
 */

import { Actor, log } from 'apify';

const DEFAULT_TIMEOUT_SECS = 10;
const DEFAULT_CONCURRENCY = 5;
const MAX_BODY_BYTES = 500_000;
const DEFAULT_UA = 'AgentReadinessAuditor/1.0 (Apify Actor; agentic-commerce readiness scanner)';
const CHARGE_EVENT = 'site-audited';

// AI crawlers that decide whether a site appears in AI shopping answers.
const AI_CRAWLERS = [
    { agent: 'GPTBot', channel: 'ChatGPT model training / retrieval' },
    { agent: 'OAI-SearchBot', channel: 'ChatGPT Search & Shopping' },
    { agent: 'ChatGPT-User', channel: 'ChatGPT live browsing on user request' },
    { agent: 'ClaudeBot', channel: 'Claude model training / retrieval' },
    { agent: 'Claude-User', channel: 'Claude live browsing on user request' },
    { agent: 'PerplexityBot', channel: 'Perplexity answers & shopping' },
    { agent: 'Google-Extended', channel: 'Gemini / Google AI Mode grounding' },
];

/* ---------------- entrypoint ---------------- */

await Actor.init();

try {
    await main();
} catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    log.exception(error, 'Actor run failed');
    await Actor.fail(`Run failed: ${error.message}`.slice(0, 250));
}

async function main() {
    const input = (await Actor.getInput()) ?? {};
    const websites = normalizeStringList(input.websites);
    if (websites.length === 0) {
        await Actor.fail('Invalid input: provide at least one URL in the "websites" array.');
        return;
    }

    const opts = {
        timeoutMs: clampInt(input.fetchTimeoutSecs, 3, 60, DEFAULT_TIMEOUT_SECS) * 1000,
        userAgent: typeof input.userAgent === 'string' && input.userAgent.trim() ? input.userAgent.trim() : DEFAULT_UA,
    };
    const concurrency = clampInt(input.maxConcurrency, 1, 20, DEFAULT_CONCURRENCY);

    const stats = { succeeded: 0, failed: 0, chargeLimitReached: false };
    log.info(`Auditing ${websites.length} website(s) with concurrency ${concurrency}, timeout ${opts.timeoutMs} ms per fetch.`);

    await runPool(websites, concurrency, async (rawUrl, index) => {
        await processSite(rawUrl, index, opts, stats);
    });

    const message = `Audited ${stats.succeeded}/${websites.length} site(s) successfully`
        + (stats.failed ? `, ${stats.failed} failed (pushed with error field, not charged)` : '')
        + (stats.chargeLimitReached ? ' — stopped early: run charge limit reached' : '')
        + '.';
    log.info(message);
    await Actor.exit(message.slice(0, 250));
}

/* ---------------- per-site processing ---------------- */

async function processSite(rawUrl, index, opts, stats) {
    if (stats.chargeLimitReached) {
        stats.failed += 1;
        await pushSafe({
            input: rawUrl,
            url: rawUrl,
            ok: false,
            skipped: true,
            error: 'Skipped: the maximum charge for this run was reached. Increase "Maximum cost per run" and re-run.',
            scannedAt: new Date().toISOString(),
        });
        return;
    }

    try {
        const report = await buildScanReport(rawUrl, opts);
        if (report.error) {
            stats.failed += 1;
            log.warning(`[${index + 1}] ${rawUrl} — ${report.error}`);
            await pushSafe({
                input: rawUrl,
                url: report.url ?? rawUrl,
                ok: false,
                error: report.error,
                scannedAt: new Date().toISOString(),
            });
            return;
        }
        stats.succeeded += 1;
        log.info(`[${index + 1}] ${report.url} — score ${report.score}/100 (${report.grade})`);
        await pushSafe({ input: rawUrl, ok: true, ...report });
        await chargeSafe(CHARGE_EVENT, stats);
    } catch (err) {
        stats.failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        log.warning(`[${index + 1}] ${rawUrl} — unexpected error: ${message}`);
        await pushSafe({
            input: rawUrl,
            url: rawUrl,
            ok: false,
            error: `Audit crashed: ${message}`,
            scannedAt: new Date().toISOString(),
        });
    }
}

/* ---------------- scan (ported from agentready worker) ---------------- */

async function buildScanReport(rawUrl, opts) {
    const target = normalizeTarget(rawUrl);
    if (target.error) return { error: target.error };

    const origin = target.origin;
    const [robotsR, llmsR, homeR, sitemapR, agentsR] = await Promise.allSettled([
        fetchText(origin + '/robots.txt', opts),
        fetchText(origin + '/llms.txt', opts),
        fetchText(target.href, opts),
        fetchHead(origin + '/sitemap.xml', opts),
        fetchText(origin + '/agents.md', opts),
    ]);

    const robots = settled(robotsR);
    const llms = settled(llmsR);
    const home = settled(homeR);
    const sitemap = settled(sitemapR);
    const agents = settled(agentsR);

    if (!home || !home.ok) {
        const reason = home ? `HTTP ${home.status}` : (homeR.reason?.message || 'network error');
        return { error: `Could not reach ${target.href} (${reason}) — check the URL and try again.`, url: target.href };
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
        summary: summarize(score),
        topFixes: checks.filter((c) => c.earned === 0 && c.fix).map((c) => c.fix).slice(0, 8),
        checks,
    };
}

function normalizeTarget(raw) {
    if (!raw || !String(raw).trim()) return { error: 'Missing URL.' };
    let value = String(raw).trim();
    if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
    let u;
    try {
        u = new URL(value);
    } catch {
        return { error: `"${raw}" does not look like a valid URL.` };
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'Only http(s) URLs are supported.' };
    const host = u.hostname.toLowerCase();
    const privateHost = host === 'localhost'
        || host.endsWith('.local')
        || host.endsWith('.internal')
        || /^127\./.test(host)
        || /^10\./.test(host)
        || /^192\.168\./.test(host)
        || /^169\.254\./.test(host)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
        || /^\[?::1\]?$/.test(host)
        || !host.includes('.');
    if (privateHost) return { error: 'Private or local addresses cannot be scanned.' };
    return { href: u.href, origin: u.origin };
}

async function fetchText(url, opts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${opts.timeoutMs} ms`)), opts.timeoutMs);
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': opts.userAgent, Accept: 'text/html,text/plain,*/*' },
            redirect: 'follow',
            signal: controller.signal,
        });
        const body = res.ok ? (await res.text()).slice(0, MAX_BODY_BYTES) : '';
        if (!res.ok) await cancelBody(res);
        return { ok: res.ok, status: res.status, body };
    } finally {
        clearTimeout(timer);
    }
}

async function fetchHead(url, opts) {
    // Some servers reject HEAD; fall back to a ranged GET.
    const attempt = async (method, headers) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${opts.timeoutMs} ms`)), opts.timeoutMs);
        try {
            const res = await fetch(url, { method, headers, redirect: 'follow', signal: controller.signal });
            await cancelBody(res);
            return { ok: res.ok, status: res.status, body: '' };
        } finally {
            clearTimeout(timer);
        }
    };
    try {
        const head = await attempt('HEAD', { 'User-Agent': opts.userAgent });
        if (head.status !== 405 && head.status !== 501) return head;
    } catch {
        /* fall through to GET */
    }
    return attempt('GET', { 'User-Agent': opts.userAgent, Range: 'bytes=0-1024' });
}

async function cancelBody(res) {
    try {
        await res.body?.cancel();
    } catch {
        /* already consumed or closed */
    }
}

function settled(r) {
    return r.status === 'fulfilled' ? r.value : null;
}

/* ---------------- checks ---------------- */

function checkAiCrawlerAccess(robots) {
    if (!robots || !robots.ok) {
        return [
            {
                id: 'robots',
                category: 'AI crawler access',
                title: 'robots.txt',
                earned: 6,
                possible: 10,
                status: 'warn',
                detail: 'No robots.txt found. AI crawlers default to allowed, but an explicit policy signals intent and lets you steer individual bots.',
                fix: 'Publish /robots.txt and explicitly allow the AI shopping crawlers you want (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended).',
            },
        ];
    }

    const rules = parseRobots(robots.body);
    const out = [];
    let blocked = 0;
    for (const bot of AI_CRAWLERS) {
        const allowed = isAllowedByGroup(matchGroup(rules, bot.agent)?.group);
        if (!allowed) blocked++;
        out.push({
            id: 'bot-' + bot.agent.toLowerCase(),
            category: 'AI crawler access',
            title: bot.agent,
            earned: allowed ? 3 : 0,
            possible: 3,
            status: allowed ? 'pass' : 'fail',
            detail: allowed
                ? `${bot.agent} can read your site → eligible for: ${bot.channel}.`
                : `${bot.agent} is blocked in robots.txt → your products cannot appear via: ${bot.channel}.`,
            fix: allowed ? null : `Remove the Disallow rule for ${bot.agent} (or add an explicit Allow) in robots.txt.`,
        });
    }
    out.unshift({
        id: 'robots',
        category: 'AI crawler access',
        title: 'robots.txt',
        earned: 10,
        possible: 10,
        status: blocked === 0 ? 'pass' : 'warn',
        detail: blocked === 0
            ? 'robots.txt found and no major AI shopping crawler is blocked.'
            : `robots.txt found, but ${blocked} AI crawler(s) are blocked — every blocked bot is a sales channel you are invisible in.`,
        fix: null,
    });
    return out;
}

// KEEP-IN-SYNC: shared with ../*/main.js — edit all copies together (see apify/README.md)
// robots.txt parsing + RFC 9309 group matching, shared by llms-txt-extractor
// and agent-readiness-auditor. Verify parity with `node apify/check-sync.mjs`.

// Parses robots.txt into rule groups [{agents, allows, disallows, crawlDelay}].
// Agent tokens are lowercased for case-insensitive matching; consecutive
// User-agent lines share one group; crawl-delay is captured per group.
function parseRobots(text) {
    const groups = [];
    let current = null;
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.replace(/#.*$/, '').trim();
        if (!line) continue;
        const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
        if (!m) continue;
        const key = m[1].toLowerCase();
        const value = m[2].trim();
        if (key === 'user-agent') {
            if (!current || current.closed) {
                current = { agents: [], allows: [], disallows: [], crawlDelay: null };
                groups.push(current);
            }
            current.agents.push(value.toLowerCase());
        } else if (current && (key === 'allow' || key === 'disallow')) {
            current.closed = true;
            (key === 'allow' ? current.allows : current.disallows).push(value);
        } else if (current && key === 'crawl-delay') {
            current.closed = true;
            const n = Number.parseFloat(value);
            if (!Number.isNaN(n)) current.crawlDelay = n;
        } else if (current) {
            current.closed = true;
        }
    }
    return groups;
}

// Most specific matching group wins (longest matching agent token), per
// RFC 9309; the wildcard (*) group applies only when no specific token matches.
function matchGroup(groups, agent) {
    const name = agent.toLowerCase();
    let best = null;
    let bestToken = '';
    let bestLen = -1;
    let wildcard = null;
    for (const g of groups) {
        for (const a of g.agents) {
            if (a === '*') {
                if (!wildcard) wildcard = g;
            } else if ((name.includes(a) || a.includes(name)) && a.length > bestLen) {
                best = g;
                bestToken = a;
                bestLen = a.length;
            }
        }
    }
    if (best) return { group: best, agentToken: bestToken, wildcard: false };
    if (wildcard) return { group: wildcard, agentToken: '*', wildcard: true };
    return null;
}

// Verdict for the winning group: blocked only when the whole site is
// disallowed ("/" or "/*") without a counteracting root Allow.
function isAllowedByGroup(group) {
    if (!group) return true;
    const rootBlocked = group.disallows.some((d) => d === '/' || d === '/*');
    const rootAllowed = group.allows.some((a) => a === '/' || a === '/*');
    return !rootBlocked || rootAllowed;
}
// END-KEEP-IN-SYNC

function checkLlmsTxt(llms) {
    const found = !!(llms && llms.ok && llms.body.trim().length > 0 && !/^\s*</.test(llms.body));
    return {
        id: 'llms-txt',
        category: 'AI-native content',
        title: 'llms.txt',
        earned: found ? 7 : 0,
        possible: 7,
        status: found ? 'pass' : 'warn',
        detail: found
            ? 'llms.txt found — a curated map for AI agents. Note: an emerging convention (Shopify serves it natively; Google calls it speculative), useful but not a ranking guarantee.'
            : "No llms.txt. It's an emerging convention — cheap to add, gives agents a curated summary of what you sell. Shopify stores get one natively.",
        fix: found
            ? null
            : 'Add /llms.txt: a short markdown file listing what you sell, key product pages, pricing, and shipping/return policies (free generator: agentready.agiscorecard.com/llms-txt-generator).',
    };
}

function checkAgentsMd(agents) {
    const found = !!(agents && agents.ok && agents.body.trim().length > 0 && !/^\s*</.test(agents.body));
    return {
        id: 'agents-md',
        category: 'AI-native content',
        title: 'agents.md',
        earned: found ? 3 : 0,
        possible: 3,
        status: found ? 'pass' : 'warn',
        detail: found
            ? 'agents.md found — instructions for AI agents interacting with your site (Shopify now serves this natively).'
            : 'No agents.md. A newer convention (adopted natively by Shopify) that tells AI agents how to interact with your store.',
        fix: found ? null : 'Add /agents.md describing how agents should browse, query and transact with your site.',
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
    const product = has('product') || has('offer') || has('aggregateoffer');
    const org = has('organization') || has('localbusiness') || has('onlinestore') || has('website');
    const faq = has('faqpage') || has('qapage');

    return [
        {
            id: 'jsonld',
            category: 'Structured data',
            title: 'JSON-LD present',
            earned: jsonLdBlocks.length > 0 || hasMicrodata ? 8 : 0,
            possible: 8,
            status: jsonLdBlocks.length > 0 || hasMicrodata ? 'pass' : 'fail',
            detail: jsonLdBlocks.length > 0
                ? `Found ${jsonLdBlocks.length} JSON-LD block(s)` + (types.size ? ` (${[...types].slice(0, 6).join(', ')})` : '') + '.'
                : hasMicrodata
                    ? 'Schema.org microdata found (consider migrating to JSON-LD).'
                    : 'No schema.org structured data. AI agents rely on structured data to extract prices, availability and specs.',
            fix: jsonLdBlocks.length > 0 || hasMicrodata ? null : 'Add JSON-LD structured data to every important page.',
        },
        {
            id: 'sd-product',
            category: 'Structured data',
            title: 'Product / Offer schema',
            earned: product ? 10 : 0,
            possible: 10,
            status: product ? 'pass' : 'fail',
            detail: product
                ? 'Product/Offer markup found — agents can read price, availability and specs.'
                : 'No Product or Offer schema detected on this page. Shopping agents (ChatGPT Shopping, Google AI Mode) select products from structured feeds, not screenshots.',
            fix: product ? null : 'Add schema.org/Product with nested Offer (price, priceCurrency, availability) to product pages, or audit a product URL directly.',
        },
        {
            id: 'sd-org',
            category: 'Structured data',
            title: 'Organization schema',
            earned: org ? 5 : 0,
            possible: 5,
            status: org ? 'pass' : 'warn',
            detail: org
                ? 'Organization/site markup found — helps agents verify who they are buying from.'
                : 'No Organization schema. Trust signals matter: agents prefer merchants they can identify.',
            fix: org ? null : 'Add schema.org/Organization (name, url, logo, contactPoint) to your homepage.',
        },
        {
            id: 'sd-faq',
            category: 'Structured data',
            title: 'FAQ schema',
            earned: faq ? 4 : 0,
            possible: 4,
            status: faq ? 'pass' : 'warn',
            detail: faq
                ? 'FAQPage markup found — a rich source for AI answers about your offering.'
                : 'No FAQPage schema. FAQ markup is one of the most-cited structures in AI-generated answers.',
            fix: faq ? null : 'Publish an FAQ (shipping, returns, sizing, guarantees) with schema.org/FAQPage markup.',
        },
    ];
}

function collectTypes(node, out) {
    if (Array.isArray(node)) return node.forEach((n) => collectTypes(n, out));
    if (node && typeof node === 'object') {
        const t = node['@type'];
        if (typeof t === 'string') out.add(t.toLowerCase());
        if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && out.add(x.toLowerCase()));
        for (const key of Object.keys(node)) {
            if (key === '@graph' || key === 'mainEntity' || key === 'offers' || key === 'itemListElement') {
                collectTypes(node[key], out);
            }
        }
    }
}

function checkMetaBasics(html) {
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || '';
    const desc = (html.match(/<meta[^>]+name\s*=\s*["']description["'][^>]*>/i) || [])[0] || '';
    const og = /<meta[^>]+property\s*=\s*["']og:(title|description|image)["']/i.test(html);
    const canonical = /<link[^>]+rel\s*=\s*["']canonical["']/i.test(html);

    return [
        {
            id: 'meta-title',
            category: 'Answer readiness',
            title: 'Descriptive <title>',
            earned: title.length >= 10 ? 4 : 0,
            possible: 4,
            status: title.length >= 10 ? 'pass' : 'fail',
            detail: title ? `Title: "${title.slice(0, 90)}"` : 'Page has no usable <title>.',
            fix: title.length >= 10 ? null : 'Write a descriptive title that states what you sell and for whom.',
        },
        {
            id: 'meta-desc',
            category: 'Answer readiness',
            title: 'Meta description',
            earned: desc ? 4 : 0,
            possible: 4,
            status: desc ? 'pass' : 'warn',
            detail: desc ? 'Meta description present.' : 'No meta description — the first thing many agents quote about you is missing.',
            fix: desc ? null : 'Add a meta description that answers: what do you sell, for whom, at what price point.',
        },
        {
            id: 'meta-og',
            category: 'Answer readiness',
            title: 'Open Graph tags',
            earned: og ? 3 : 0,
            possible: 3,
            status: og ? 'pass' : 'warn',
            detail: og ? 'Open Graph tags present.' : 'No Open Graph tags — link previews in AI chats will look broken.',
            fix: og ? null : 'Add og:title, og:description and og:image.',
        },
        {
            id: 'canonical',
            category: 'Answer readiness',
            title: 'Canonical URL',
            earned: canonical ? 3 : 0,
            possible: 3,
            status: canonical ? 'pass' : 'warn',
            detail: canonical ? 'Canonical link present.' : 'No canonical link — duplicate URLs dilute how agents consolidate signals about your pages.',
            fix: canonical ? null : 'Add <link rel="canonical"> to every page.',
        },
    ];
}

function checkSitemap(sitemap, robots) {
    const inRobots = !!(robots && robots.ok && /sitemap\s*:/i.test(robots.body));
    const found = !!(sitemap && sitemap.ok) || inRobots;
    return {
        id: 'sitemap',
        category: 'AI crawler access',
        title: 'XML sitemap',
        earned: found ? 5 : 0,
        possible: 5,
        status: found ? 'pass' : 'warn',
        detail: found
            ? 'Sitemap discoverable' + (inRobots ? ' (declared in robots.txt)' : ' at /sitemap.xml') + '.'
            : 'No sitemap found — crawlers may miss your product pages entirely.',
        fix: found ? null : 'Publish /sitemap.xml and declare it in robots.txt.',
    };
}

/* ---------------- scoring ---------------- */

function grade(score) {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 55) return 'C';
    if (score >= 35) return 'D';
    return 'F';
}

function summarize(score) {
    if (score >= 90) return 'Excellent — AI agents can discover, understand and recommend what you sell.';
    if (score >= 75) return 'Good — you are visible to AI shoppers, but leaving recommendation share on the table.';
    if (score >= 55) return 'Partial — AI agents can find you but will struggle to extract prices, products and trust signals.';
    if (score >= 35) return "Weak — most AI shopping channels either can't read you or can't parse what you sell.";
    return 'Invisible — as far as AI shopping agents are concerned, your store barely exists.';
}

/* ---------------- shared utilities ---------------- */
// KEEP-IN-SYNC: shared with ../*/main.js — edit all copies together (see apify/README.md)

function normalizeStringList(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const out = [];
    for (const entry of value) {
        const s = String(entry ?? '').trim();
        if (!s || seen.has(s)) continue;
        seen.add(s);
        out.push(s);
    }
    return out;
}

function clampInt(value, min, max, fallback) {
    const n = Number.parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

async function runPool(items, concurrency, worker) {
    const queue = items.map((item, index) => ({ item, index }));
    const size = Math.max(1, Math.min(concurrency, queue.length));
    await Promise.all(
        Array.from({ length: size }, async () => {
            for (;;) {
                const next = queue.shift();
                if (!next) return;
                await worker(next.item, next.index);
            }
        }),
    );
}

async function pushSafe(item) {
    try {
        await Actor.pushData(item);
    } catch (err) {
        log.error(`Failed to push dataset item for ${item.url ?? item.domain ?? item.input}: ${err?.message || err}`);
    }
}

// Charge one PPE event. No-ops gracefully when PPE is not enabled for this
// actor (e.g. local runs, or before monetization is configured).
async function chargeSafe(eventName, stats) {
    try {
        const result = await Actor.charge({ eventName, count: 1 });
        if (result && result.eventChargeLimitReached) {
            stats.chargeLimitReached = true;
            log.warning(`Charge limit reached for event "${eventName}" — remaining items will be skipped.`);
        }
    } catch (err) {
        log.debug(`PPE charge skipped (${eventName}): ${err?.message || err}`);
    }
}
// END-KEEP-IN-SYNC
