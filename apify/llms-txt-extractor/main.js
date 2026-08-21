/**
 * llms.txt Extractor — Apify Actor (pay-per-event).
 *
 * For each input domain this actor fetches and parses the AI-agent policy
 * surface of the site into structured fields:
 *
 *   - /llms.txt   → title, summary, intro, sections with [title](url): notes
 *                   link lists, total link count
 *   - /agents.md  → presence, headings, excerpt
 *   - /ai.txt     → presence, robots-style directives when present, excerpt
 *   - /robots.txt → per-AI-bot allow/deny verdicts (GPTBot, ClaudeBot,
 *                   PerplexityBot, Google-Extended, CCBot, Bytespider, …),
 *                   matched rule groups and declared sitemaps
 *
 * One dataset item is pushed per domain with an aggregate `signals` block —
 * ready to feed AI-agent-ecosystem analysis, adoption studies or lead lists.
 *
 * The `domain-extracted` PPE event is charged once per successfully reached
 * domain (a domain that answers HTTP but has none of the files is still a
 * valid, chargeable data point: adoption = false). Domains where every fetch
 * failed at the network level are pushed with an `error` field and are never
 * charged.
 *
 * robots.txt parsing/matching ported from sites/agentready/src/worker.js
 * (RFC 9309 most-specific-group matching), extended with crawl-delay capture.
 */

import { Actor, log } from 'apify';

const DEFAULT_TIMEOUT_SECS = 10;
const DEFAULT_CONCURRENCY = 5;
const MAX_BODY_BYTES = 500_000;
const EXCERPT_CHARS = 600;
const DEFAULT_UA = 'LlmsTxtExtractor/1.0 (Apify Actor; llms.txt and AI-crawler-policy parser)';
const CHARGE_EVENT = 'domain-extracted';

// AI crawlers whose robots.txt treatment is extracted per domain.
const AI_BOTS = [
    { bot: 'GPTBot', operator: 'OpenAI', purpose: 'model training / retrieval' },
    { bot: 'OAI-SearchBot', operator: 'OpenAI', purpose: 'ChatGPT Search indexing' },
    { bot: 'ChatGPT-User', operator: 'OpenAI', purpose: 'live browsing on user request' },
    { bot: 'ClaudeBot', operator: 'Anthropic', purpose: 'model training / retrieval' },
    { bot: 'Claude-User', operator: 'Anthropic', purpose: 'live browsing on user request' },
    { bot: 'Claude-SearchBot', operator: 'Anthropic', purpose: 'search indexing' },
    { bot: 'anthropic-ai', operator: 'Anthropic', purpose: 'legacy crawler token' },
    { bot: 'PerplexityBot', operator: 'Perplexity', purpose: 'answer-engine indexing' },
    { bot: 'Perplexity-User', operator: 'Perplexity', purpose: 'live browsing on user request' },
    { bot: 'Google-Extended', operator: 'Google', purpose: 'Gemini / AI Mode grounding control' },
    { bot: 'Applebot-Extended', operator: 'Apple', purpose: 'Apple Intelligence training control' },
    { bot: 'Bytespider', operator: 'ByteDance', purpose: 'model training' },
    { bot: 'CCBot', operator: 'Common Crawl', purpose: 'open web corpus (used in LLM training)' },
    { bot: 'meta-externalagent', operator: 'Meta', purpose: 'model training' },
    { bot: 'Amazonbot', operator: 'Amazon', purpose: 'Alexa / Rufus answers' },
    { bot: 'DuckAssistBot', operator: 'DuckDuckGo', purpose: 'DuckAssist answers' },
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
    const domains = normalizeStringList(input.domains);
    if (domains.length === 0) {
        await Actor.fail('Invalid input: provide at least one domain in the "domains" array.');
        return;
    }

    const opts = {
        timeoutMs: clampInt(input.fetchTimeoutSecs, 3, 60, DEFAULT_TIMEOUT_SECS) * 1000,
        userAgent: typeof input.userAgent === 'string' && input.userAgent.trim() ? input.userAgent.trim() : DEFAULT_UA,
        includeRaw: input.includeRawContent === true,
    };
    const concurrency = clampInt(input.maxConcurrency, 1, 20, DEFAULT_CONCURRENCY);

    const stats = { succeeded: 0, failed: 0, chargeLimitReached: false };
    log.info(`Extracting AI-agent policy files from ${domains.length} domain(s) with concurrency ${concurrency}.`);

    await runPool(domains, concurrency, async (rawDomain, index) => {
        await processDomain(rawDomain, index, opts, stats);
    });

    const message = `Extracted ${stats.succeeded}/${domains.length} domain(s) successfully`
        + (stats.failed ? `, ${stats.failed} unreachable (pushed with error field, not charged)` : '')
        + (stats.chargeLimitReached ? ' — stopped early: run charge limit reached' : '')
        + '.';
    log.info(message);
    await Actor.exit(message.slice(0, 250));
}

/* ---------------- per-domain processing ---------------- */

async function processDomain(rawDomain, index, opts, stats) {
    if (stats.chargeLimitReached) {
        stats.failed += 1;
        await pushSafe({
            input: rawDomain,
            domain: rawDomain,
            ok: false,
            skipped: true,
            error: 'Skipped: the maximum charge for this run was reached. Increase "Maximum cost per run" and re-run.',
            fetchedAt: new Date().toISOString(),
        });
        return;
    }

    try {
        const item = await extractDomain(rawDomain, opts);
        if (item.error) {
            stats.failed += 1;
            log.warning(`[${index + 1}] ${rawDomain} — ${item.error}`);
            await pushSafe({ input: rawDomain, ok: false, ...item });
            return;
        }
        stats.succeeded += 1;
        const s = item.signals;
        log.info(`[${index + 1}] ${item.domain} — llms.txt: ${s.hasLlmsTxt}, agents.md: ${s.hasAgentsMd}, ai.txt: ${s.hasAiTxt}, bots blocked: ${s.aiBotsBlocked}/${AI_BOTS.length}`);
        await pushSafe({ input: rawDomain, ok: true, ...item });
        await chargeSafe(CHARGE_EVENT, stats);
    } catch (err) {
        stats.failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        log.warning(`[${index + 1}] ${rawDomain} — unexpected error: ${message}`);
        await pushSafe({
            input: rawDomain,
            domain: rawDomain,
            ok: false,
            error: `Extraction crashed: ${message}`,
            fetchedAt: new Date().toISOString(),
        });
    }
}

/* ---------------- extraction ---------------- */

async function extractDomain(rawDomain, opts) {
    const target = normalizeTarget(rawDomain);
    if (target.error) return { domain: rawDomain, error: target.error, fetchedAt: new Date().toISOString() };

    const origin = target.origin;
    const [llmsR, agentsR, aiR, robotsR] = await Promise.allSettled([
        fetchText(origin + '/llms.txt', opts),
        fetchText(origin + '/agents.md', opts),
        fetchText(origin + '/ai.txt', opts),
        fetchText(origin + '/robots.txt', opts),
    ]);

    const llms = settled(llmsR);
    const agents = settled(agentsR);
    const ai = settled(aiR);
    const robots = settled(robotsR);

    // Reachability: at least one endpoint must have answered HTTP (any status).
    const reachable = [llms, agents, ai, robots].some((r) => r !== null);
    if (!reachable) {
        const reason = firstReason([llmsR, agentsR, aiR, robotsR]) || 'network error';
        return {
            domain: target.host,
            origin,
            error: `Could not reach ${target.host} (${reason}) — DNS failure, timeout or connection refused on all probed paths.`,
            fetchedAt: new Date().toISOString(),
        };
    }

    const llmsTxt = buildLlmsTxtField(llms, origin, opts);
    const agentsMd = buildAgentsMdField(agents, origin, opts);
    const aiTxt = buildAiTxtField(ai, origin, opts);
    const robotsTxt = buildRobotsField(robots, origin, opts);

    const blocked = robotsTxt.aiBots.filter((b) => b.allowed === false).length;
    const allowed = robotsTxt.aiBots.filter((b) => b.allowed === true).length;
    const adoptionCount = [llmsTxt.found, agentsMd.found, aiTxt.found].filter(Boolean).length;

    return {
        domain: target.host,
        origin,
        fetchedAt: new Date().toISOString(),
        llmsTxt,
        agentsMd,
        aiTxt,
        robotsTxt,
        signals: {
            hasLlmsTxt: llmsTxt.found,
            hasAgentsMd: agentsMd.found,
            hasAiTxt: aiTxt.found,
            hasRobotsTxt: robotsTxt.found,
            aiBotsAllowed: allowed,
            aiBotsBlocked: blocked,
            aiPolicyStance: blocked === 0 ? 'open' : blocked >= AI_BOTS.length - 2 ? 'blocking' : 'selective',
            aiReadinessLevel: adoptionCount >= 2 ? 'high' : adoptionCount === 1 ? 'basic' : 'none',
        },
    };
}

/* ---------------- llms.txt parsing ---------------- */
// llms.txt convention: "# Title", "> one-line summary", optional intro
// paragraphs, then "## Section" headings with "- [title](url): notes" lists.

function buildLlmsTxtField(res, origin, opts) {
    const found = isTextFile(res);
    const field = {
        found,
        url: origin + '/llms.txt',
        status: res ? res.status : null,
        bytes: found ? res.body.length : 0,
    };
    if (!found) return field;

    const parsed = parseLlmsTxt(res.body);
    Object.assign(field, parsed);
    if (opts.includeRaw) field.raw = res.body.slice(0, MAX_BODY_BYTES);
    return field;
}

function parseLlmsTxt(text) {
    const doc = { title: '', summary: '', intro: '', sections: [], orphanLinks: [], linkCount: 0 };
    const introLines = [];
    let current = null;

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trimEnd();

        const h1 = line.match(/^#\s+(.+)$/);
        if (h1 && !doc.title && !current) {
            doc.title = h1[1].trim();
            continue;
        }

        const h2 = line.match(/^#{2,3}\s+(.+)$/);
        if (h2) {
            current = { name: h2[1].trim(), links: [], notes: [] };
            doc.sections.push(current);
            continue;
        }

        const bq = line.match(/^>\s?(.*)$/);
        if (bq && !current) {
            doc.summary = (doc.summary ? doc.summary + ' ' : '') + bq[1].trim();
            continue;
        }

        const link = line.match(/^\s*[-*]\s*\[([^\]]*)\]\(([^)\s]+)\)\s*(?::\s*(.*))?$/);
        if (link) {
            const item = { title: link[1].trim(), url: link[2].trim(), notes: (link[3] || '').trim() };
            if (current) current.links.push(item);
            else doc.orphanLinks.push(item);
            doc.linkCount += 1;
            continue;
        }

        const trimmed = line.trim();
        if (!trimmed) continue;
        if (current) current.notes.push(trimmed);
        else introLines.push(trimmed);
    }

    doc.intro = introLines.join(' ').slice(0, 1000);
    doc.sectionCount = doc.sections.length;
    for (const section of doc.sections) {
        section.notes = section.notes.join(' ').slice(0, 500);
    }
    return doc;
}

/* ---------------- agents.md parsing ---------------- */

function buildAgentsMdField(res, origin, opts) {
    const found = isTextFile(res);
    const field = {
        found,
        url: origin + '/agents.md',
        status: res ? res.status : null,
        bytes: found ? res.body.length : 0,
    };
    if (!found) return field;

    const headings = [];
    for (const m of res.body.matchAll(/^#{1,3}\s+(.+)$/gm)) {
        headings.push(m[1].trim());
        if (headings.length >= 20) break;
    }
    field.headings = headings;
    field.excerpt = res.body.slice(0, EXCERPT_CHARS);
    if (opts.includeRaw) field.raw = res.body.slice(0, MAX_BODY_BYTES);
    return field;
}

/* ---------------- ai.txt parsing ---------------- */
// ai.txt (Spawning.ai convention) usually mirrors robots.txt syntax with
// media-type rules. When it looks robots-like, parse the directive groups.

function buildAiTxtField(res, origin, opts) {
    const found = isTextFile(res);
    const field = {
        found,
        url: origin + '/ai.txt',
        status: res ? res.status : null,
        bytes: found ? res.body.length : 0,
    };
    if (!found) return field;

    if (/user-agent\s*:/i.test(res.body)) {
        field.directives = parseRobots(res.body).map((g) => ({
            userAgents: g.agents,
            allow: g.allows,
            disallow: g.disallows,
        }));
    }
    field.excerpt = res.body.slice(0, EXCERPT_CHARS);
    if (opts.includeRaw) field.raw = res.body.slice(0, MAX_BODY_BYTES);
    return field;
}

/* ---------------- robots.txt AI-crawler directives ---------------- */

function buildRobotsField(res, origin, opts) {
    const found = !!(res && res.ok && res.body.trim().length > 0 && !/^\s*</.test(res.body));
    const field = {
        found,
        url: origin + '/robots.txt',
        status: res ? res.status : null,
        sitemaps: [],
        aiBots: [],
    };

    const groups = found ? parseRobots(res.body) : [];
    if (found) {
        for (const m of res.body.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)) {
            field.sitemaps.push(m[1]);
            if (field.sitemaps.length >= 20) break;
        }
    }

    for (const bot of AI_BOTS) {
        const match = found ? matchGroup(groups, bot.bot) : null;
        const allowed = found ? isAllowedByGroup(match?.group) : true;
        field.aiBots.push({
            bot: bot.bot,
            operator: bot.operator,
            purpose: bot.purpose,
            allowed,
            matchedBy: !found ? 'no robots.txt (default allow)'
                : !match ? 'no matching rule (default allow)'
                    : match.wildcard ? 'wildcard group (*)'
                        : `specific group (${match.agentToken})`,
            allow: match ? match.group.allows : [],
            disallow: match ? match.group.disallows : [],
            crawlDelay: match?.group.crawlDelay ?? null,
        });
    }

    if (found && opts.includeRaw) field.raw = res.body.slice(0, MAX_BODY_BYTES);
    return field;
}

// Ported from the agentready worker, extended to capture crawl-delay.
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

// Most specific matching group wins (longest matching agent token), per RFC 9309.
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

function isAllowedByGroup(group) {
    if (!group) return true;
    const rootBlocked = group.disallows.some((d) => d === '/' || d === '/*');
    const rootAllowed = group.allows.some((a) => a === '/' || a === '/*');
    return !rootBlocked || rootAllowed;
}

/* ---------------- fetch helpers ---------------- */

async function fetchText(url, opts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${opts.timeoutMs} ms`)), opts.timeoutMs);
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': opts.userAgent, Accept: 'text/plain,text/markdown,text/html,*/*' },
            redirect: 'follow',
            signal: controller.signal,
        });
        const body = res.ok ? (await res.text()).slice(0, MAX_BODY_BYTES) : '';
        if (!res.ok) {
            try { await res.body?.cancel(); } catch { /* closed */ }
        }
        return { ok: res.ok, status: res.status, body };
    } finally {
        clearTimeout(timer);
    }
}

// A "found" text file must be a 2xx, non-empty, and not an HTML page
// (SPAs often return their index.html for any path — that is a miss).
function isTextFile(res) {
    return !!(res && res.ok && res.body.trim().length > 0 && !/^\s*</.test(res.body));
}

function settled(r) {
    return r.status === 'fulfilled' ? r.value : null;
}

function firstReason(results) {
    for (const r of results) {
        if (r.status === 'rejected') return r.reason?.message || String(r.reason);
    }
    return '';
}

function normalizeTarget(raw) {
    if (!raw || !String(raw).trim()) return { error: 'Missing domain.' };
    let value = String(raw).trim();
    if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
    let u;
    try { u = new URL(value); } catch { return { error: `"${raw}" does not look like a valid domain or URL.` }; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'Only http(s) domains are supported.' };
    const host = u.hostname.toLowerCase();
    const privateHost = host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')
        || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
        || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
        || /^\[?::1\]?$/.test(host) || !host.includes('.');
    if (privateHost) return { error: 'Private or local addresses cannot be scanned.' };
    return { origin: u.origin, host: u.host };
}

/* ---------------- shared utilities ---------------- */

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
        log.error(`Failed to push dataset item for ${item.domain ?? item.input}: ${err?.message || err}`);
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
