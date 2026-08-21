/**
 * MCP Server Health Checker — Apify Actor (pay-per-event).
 *
 * For each input MCP server URL this actor:
 *   - performs a JSON-RPC `initialize` handshake over streamable HTTP
 *     (parsing both plain JSON and SSE `text/event-stream` responses),
 *   - calls `tools/list` and scores tool-description completeness,
 *   - measures handshake latency,
 *   - detects TLS and the authentication mode (open / bearer / OAuth
 *     via WWW-Authenticate), and
 *   - probes CORS preflight headers for browser-based MCP clients.
 *
 * One dataset item is pushed per server: 0-100 health score, A-F grade,
 * per-check results and an `issues` list. The `server-checked` PPE event is
 * charged once per completed health report; unreachable servers are pushed
 * with an `error` field and are never charged.
 *
 * Check logic ported from sites/mcppulse/src/worker.js (Cloudflare Worker)
 * to plain Node 18+ global fetch.
 */

import { Actor, log } from 'apify';

const DEFAULT_TIMEOUT_SECS = 10;
const DEFAULT_CONCURRENCY = 5;
const PROTOCOL = '2025-06-18';
const MAX_BODY_BYTES = 200_000;
const DEFAULT_UA = 'MCPServerHealthChecker/1.0 (Apify Actor; MCP conformance scanner)';
const CHARGE_EVENT = 'server-checked';

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
    const serverUrls = normalizeStringList(input.serverUrls);
    if (serverUrls.length === 0) {
        await Actor.fail('Invalid input: provide at least one MCP endpoint in the "serverUrls" array.');
        return;
    }

    const opts = {
        timeoutMs: clampInt(input.timeoutSecs, 3, 60, DEFAULT_TIMEOUT_SECS) * 1000,
        userAgent: typeof input.userAgent === 'string' && input.userAgent.trim() ? input.userAgent.trim() : DEFAULT_UA,
    };
    const concurrency = clampInt(input.maxConcurrency, 1, 20, DEFAULT_CONCURRENCY);

    const stats = { succeeded: 0, failed: 0, chargeLimitReached: false };
    log.info(`Checking ${serverUrls.length} MCP server(s) with concurrency ${concurrency}, timeout ${opts.timeoutMs} ms.`);

    await runPool(serverUrls, concurrency, async (rawUrl, index) => {
        await processServer(rawUrl, index, opts, stats);
    });

    const message = `Checked ${stats.succeeded}/${serverUrls.length} MCP server(s) successfully`
        + (stats.failed ? `, ${stats.failed} unreachable (pushed with error field, not charged)` : '')
        + (stats.chargeLimitReached ? ' — stopped early: run charge limit reached' : '')
        + '.';
    log.info(message);
    await Actor.exit(message.slice(0, 250));
}

/* ---------------- per-server processing ---------------- */

async function processServer(rawUrl, index, opts, stats) {
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
        const target = normalizeTarget(rawUrl);
        if (target.error) {
            stats.failed += 1;
            await pushSafe({ input: rawUrl, url: rawUrl, ok: false, error: target.error, scannedAt: new Date().toISOString() });
            return;
        }
        const report = await buildReport(target.href, opts);
        if (report.error) {
            stats.failed += 1;
            log.warning(`[${index + 1}] ${target.href} — ${report.error}`);
            await pushSafe({ input: rawUrl, url: target.href, ok: false, error: report.error, scannedAt: new Date().toISOString() });
            return;
        }
        stats.succeeded += 1;
        log.info(`[${index + 1}] ${report.url} — health ${report.score}/100 (${report.grade}), ${report.latencyMs} ms handshake`);
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
            error: `Health check crashed: ${message}`,
            scannedAt: new Date().toISOString(),
        });
    }
}

/* ---------------- health report (ported from mcppulse worker) ---------------- */

async function buildReport(href, opts) {
    const checks = [];
    const started = Date.now();
    let init;
    try {
        init = await rpc(href, null, 'initialize', {
            protocolVersion: PROTOCOL,
            capabilities: {},
            clientInfo: { name: 'MCPServerHealthChecker', version: '1.0' },
        }, 1, opts);
    } catch (e) {
        return { error: `Could not reach ${href} — ${e.message || 'network error'}` };
    }
    // Prefer the moment the initialize response was actually parsed (recorded
    // by rpc), so servers that keep their SSE stream open after answering are
    // not penalized with the full stream-read/abort duration.
    const latency = init.latencyMs ?? (Date.now() - started);
    const corsCheck = await checkCors(href, opts);

    // Auth-protected endpoint: a valid, secure configuration — report it as such.
    if (init.status === 401 || init.status === 403) {
        const authMode = detectAuthMode(init.wwwAuthenticate, init.status);
        checks.push(check('reachable', 'Transport', 'Endpoint reachable', 15, 15, 'pass',
            `Server responded (HTTP ${init.status}).`));
        checks.push(check('auth', 'Security', 'Authentication', 15, 15, 'pass',
            `Server requires authentication (${authMode}) — good: your MCP server is not open to the world. Full introspection needs credentials, so the remaining checks are limited.`));
        checks.push(checkHttps(href));
        checks.push(corsCheck);
        return finish(href, checks, latency, null, { authProtected: true, authMode });
    }

    if (!init.ok || !init.result) {
        checks.push(check('reachable', 'Transport', 'MCP handshake', 0, 15, 'fail',
            `Endpoint responded (HTTP ${init.status}) but did not return a valid JSON-RPC initialize result. ${init.note || ''}`.trim(),
            "Confirm this is a streamable-HTTP MCP endpoint that accepts POSTed JSON-RPC 'initialize' requests."));
        checks.push(checkHttps(href));
        checks.push(corsCheck);
        return finish(href, checks, latency, null, { authProtected: false, authMode: 'none' });
    }

    const r = init.result;
    checks.push(check('reachable', 'Transport', 'MCP handshake', 15, 15, 'pass',
        `Valid JSON-RPC initialize response received${init.sse ? ' (SSE stream)' : ' (JSON)'}.`));

    const proto = r.protocolVersion;
    checks.push(check('protocol', 'Conformance', 'Protocol version', proto ? 10 : 0, 10, proto ? 'pass' : 'fail',
        proto ? `Server negotiated protocol version ${proto}.` : 'No protocolVersion in initialize result.',
        proto ? null : 'Return protocolVersion in the initialize result per the MCP spec.'));

    const si = r.serverInfo || {};
    const idOk = !!(si.name && si.version);
    checks.push(check('identity', 'Conformance', 'Server identity', idOk ? 10 : 0, 10, idOk ? 'pass' : 'warn',
        idOk ? `Identifies as "${si.name}" v${si.version}.` : "serverInfo name/version missing — clients and directories can't identify your server.",
        idOk ? null : 'Set serverInfo.name and serverInfo.version.'));

    const caps = r.capabilities || {};
    const capList = Object.keys(caps);
    checks.push(check('capabilities', 'Conformance', 'Declared capabilities', capList.length ? 5 : 0, 5, capList.length ? 'pass' : 'warn',
        capList.length ? `Declares: ${capList.join(', ')}.` : 'No capabilities declared.',
        capList.length ? null : 'Declare tools/resources/prompts capabilities you support.'));

    let toolsInfo = null;
    if (caps.tools !== undefined) {
        try {
            await rpcNotify(href, init.sessionId, 'notifications/initialized', opts);
            const tl = await rpc(href, init.sessionId, 'tools/list', {}, 2, opts);
            const tools = tl.ok && tl.result && Array.isArray(tl.result.tools) ? tl.result.tools : null;
            if (tools) {
                const described = tools.filter((t) => t.description && t.description.length >= 10).length;
                const pct = tools.length ? Math.round((described / tools.length) * 100) : 0;
                toolsInfo = { count: tools.length, describedPct: pct, names: tools.slice(0, 12).map((t) => t.name) };
                checks.push(check('tools-list', 'Tools', 'tools/list', 15, 15, 'pass',
                    `${tools.length} tool(s) listed: ${toolsInfo.names.join(', ')}${tools.length > 12 ? ', …' : ''}.`));
                checks.push(check('tool-docs', 'Tools', 'Tool descriptions', pct >= 80 ? 10 : pct >= 40 ? 5 : 0, 10,
                    pct >= 80 ? 'pass' : 'warn',
                    `${pct}% of tools have meaningful descriptions. Agents choose tools by description — undocumented tools rarely get called.`,
                    pct >= 80 ? null : 'Write a one-sentence description for every tool (what it does, inputs, when to use it).'));
            } else {
                checks.push(check('tools-list', 'Tools', 'tools/list', 0, 15, 'fail',
                    `tools capability declared but tools/list failed (HTTP ${tl.status}).`,
                    'Ensure tools/list responds after initialize; include the Mcp-Session-Id header if you issue one.'));
            }
        } catch (e) {
            checks.push(check('tools-list', 'Tools', 'tools/list', 0, 15, 'fail', `tools/list errored: ${e.message}`, null));
        }
    } else {
        checks.push(check('tools-list', 'Tools', 'tools capability', 0, 15, 'warn',
            'Server declares no tools capability — nothing for agents to call.',
            'Expose at least one tool, or this server is invisible to agent workflows.'));
    }

    checks.push(check('latency', 'Transport', 'Handshake latency',
        latency < 800 ? 10 : latency < 2500 ? 6 : 2, 10,
        latency < 800 ? 'pass' : latency < 2500 ? 'warn' : 'fail',
        `${latency} ms to initialize. Agents run multi-step chains — every slow hop compounds.`,
        latency < 800 ? null : 'Serve from an edge runtime or reduce cold starts.'));

    checks.push(checkHttps(href));
    checks.push(corsCheck);

    checks.push(check('auth', 'Security', 'Authentication', 0, 5, 'warn',
        'Server answered initialize without authentication. Fine for public read-only servers; risky if any tool mutates state or reaches private data.',
        'If this server is not meant to be public, require an Authorization header (OAuth or bearer token).'));

    return finish(href, checks, latency, toolsInfo, {
        serverInfo: si,
        protocolVersion: proto,
        authProtected: false,
        authMode: 'none (open endpoint)',
    });
}

function checkHttps(href) {
    const https = href.startsWith('https:');
    return check('tls', 'Security', 'HTTPS', https ? 10 : 0, 10, https ? 'pass' : 'fail',
        https ? 'Served over HTTPS.' : 'Not HTTPS — most MCP clients refuse plaintext endpoints.',
        https ? null : 'Serve the endpoint over TLS.');
}

// CORS preflight probe — matters for browser-based MCP clients (inspector,
// web IDEs). Weighted lightly: server-to-server clients ignore CORS entirely.
async function checkCors(href, opts) {
    let res;
    try {
        res = await timedFetch(href, {
            method: 'OPTIONS',
            headers: {
                'User-Agent': opts.userAgent,
                Origin: 'https://mcp-health-check.example',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'content-type,mcp-protocol-version,mcp-session-id',
            },
        }, opts.timeoutMs);
    } catch (e) {
        return check('cors', 'Transport', 'CORS preflight', 2, 5, 'warn',
            `CORS preflight (OPTIONS) failed: ${e.message || 'network error'}. Server-to-server MCP clients are unaffected, but browser-based clients cannot connect.`,
            'Answer OPTIONS preflights with Access-Control-Allow-Origin and Access-Control-Allow-Headers (include Mcp-Session-Id and MCP-Protocol-Version).');
    }
    const allowOrigin = res.headers.get('access-control-allow-origin') || '';
    const exposeHeaders = (res.headers.get('access-control-expose-headers') || '').toLowerCase();
    if (!allowOrigin) {
        return check('cors', 'Transport', 'CORS preflight', 2, 5, 'warn',
            `Preflight answered (HTTP ${res.status}) without Access-Control-Allow-Origin — browser-based MCP clients will be blocked. Server-to-server clients are unaffected.`,
            'Add CORS headers if you want browser-based MCP clients (Access-Control-Allow-Origin, -Methods, -Headers; expose Mcp-Session-Id).');
    }
    const sessionExposed = exposeHeaders.includes('mcp-session-id') || exposeHeaders.includes('*');
    return check('cors', 'Transport', 'CORS preflight', sessionExposed ? 5 : 4, 5, 'pass',
        `CORS enabled (Access-Control-Allow-Origin: ${allowOrigin})${sessionExposed ? ', Mcp-Session-Id exposed.' : ', but Mcp-Session-Id is not in Access-Control-Expose-Headers — browser clients may lose the session.'}`,
        sessionExposed ? null : 'Add Mcp-Session-Id to Access-Control-Expose-Headers.');
}

function detectAuthMode(wwwAuthenticate, status) {
    const h = String(wwwAuthenticate || '').toLowerCase();
    if (h.includes('bearer') && (h.includes('resource_metadata') || h.includes('oauth'))) return 'OAuth 2.0 (Bearer with resource metadata)';
    if (h.includes('bearer')) return 'Bearer token';
    if (h.includes('basic')) return 'HTTP Basic';
    if (status === 401 || status === 403) return `HTTP ${status} without WWW-Authenticate header`;
    return 'none';
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
        grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 55 ? 'C' : score >= 35 ? 'D' : 'F',
        tools,
        ...extra,
        issues: checks
            .filter((c) => c.status !== 'pass')
            .map((c) => ({ title: c.title, severity: c.status, detail: c.detail, fix: c.fix })),
        checks,
        summary:
            score >= 90 ? 'Excellent — clients and agent platforms can rely on this server.'
                : score >= 75 ? 'Good — solid conformance with a few gaps worth closing.'
                    : score >= 55 ? 'Partial — works, but agents will hit friction (docs, latency or metadata gaps).'
                        : 'Weak — most MCP clients will struggle with this endpoint.',
    };
}

function check(id, category, title, earned, possible, status, detail, fix = null) {
    return { id, category, title, earned, possible, status, detail, fix };
}

/* ---------------- JSON-RPC over streamable HTTP ---------------- */

async function rpc(url, sessionId, method, params, id, opts) {
    const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': PROTOCOL,
        'User-Agent': opts.userAgent,
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${opts.timeoutMs} ms`)), opts.timeoutMs);
    const startedAt = Date.now();
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
            signal: controller.signal,
        });
        const out = {
            status: res.status,
            ok: false,
            result: null,
            sessionId: res.headers.get('mcp-session-id') || sessionId,
            sse: false,
            latencyMs: null, // time from request start to a parsed matching response
            wwwAuthenticate: res.headers.get('www-authenticate') || '',
        };
        if (!res.ok) {
            await cancelBody(res);
            return out;
        }
        const ctype = (res.headers.get('content-type') || '').toLowerCase();
        if (ctype.includes('text/event-stream')) {
            out.sse = true;
            // Parse the SSE stream incrementally: many MCP servers keep the
            // connection open after answering, so a plain .text() would hang
            // until the AbortController backstop fires. readSseUntilResponse
            // resolves the moment the response for our request id is parsed.
            const found = await readSseUntilResponse(res, id, startedAt);
            out.latencyMs = found.latencyMs;
            const payload = found.payload;
            if (payload && payload.result) { out.result = payload.result; out.ok = true; }
            else if (payload && payload.error) out.note = `JSON-RPC error: ${payload.error.message || payload.error.code}`;
            if (!out.ok && !out.note) out.note = 'SSE stream ended without a matching JSON-RPC response.';
        } else {
            const text = (await res.text()).slice(0, MAX_BODY_BYTES);
            out.latencyMs = Date.now() - startedAt;
            try {
                const payload = JSON.parse(text);
                if (payload.result) { out.result = payload.result; out.ok = true; }
                else if (payload.error) out.note = `JSON-RPC error: ${payload.error.message || payload.error.code}`;
            } catch {
                out.note = 'Response was not parseable JSON.';
            }
        }
        return out;
    } finally {
        clearTimeout(timer);
    }
}

/* ---------------- incremental SSE response parsing ---------------- */

// Loose JSON-RPC id comparison: some servers echo our numeric request id back
// as a string. We compare parsed values (numeric and string equality), never
// raw serialized text, so spacing/formatting differences are irrelevant.
function idMatches(responseId, requestId) {
    if (responseId === null || responseId === undefined) return false;
    return responseId === requestId
        || Number(responseId) === requestId
        || String(responseId) === String(requestId);
}

// Joins the `data:` lines of one raw SSE event (multi-line data is joined with
// "\n" per the SSE spec) and attempts JSON.parse. Returns the parsed object,
// or null when the event carries no parseable JSON object.
function parseSseEventData(rawEvent) {
    const dataLines = [];
    for (const line of rawEvent.split(/\r?\n/)) {
        if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (dataLines.length === 0) return null;
    try {
        const parsed = JSON.parse(dataLines.join('\n'));
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null; // non-JSON or truncated event
    }
}

// Consumes complete events (terminated by a blank line, LF or CRLF) from
// state.buf and returns the first parsed payload whose JSON-RPC id matches the
// request id, else null. Incomplete trailing data is left in state.buf so the
// next chunk can complete it.
function findMatchingSseEvent(state, requestId) {
    for (;;) {
        const boundary = state.buf.match(/\r?\n\r?\n/);
        if (!boundary) return null;
        const rawEvent = state.buf.slice(0, boundary.index);
        state.buf = state.buf.slice(boundary.index + boundary[0].length);
        const payload = parseSseEventData(rawEvent);
        if (payload && idMatches(payload.id, requestId)) return payload;
    }
}

// Reads an SSE body chunk by chunk, parsing event-by-event, and resolves as
// soon as the JSON-RPC response for `requestId` has been parsed — so held-open
// streams neither block the check nor inflate the measured latency. The
// caller's AbortController timeout remains the backstop for streams that never
// answer. Returns { payload, latencyMs }; both are null when no match arrived.
async function readSseUntilResponse(res, requestId, startedAt) {
    const state = { buf: '' };
    const decoder = new TextDecoder();
    const reader = res.body?.getReader?.();
    if (!reader) {
        // No streaming reader available — fall back to reading the whole body
        // (bounded by the AbortController timeout).
        try { state.buf = (await res.text()).slice(0, MAX_BODY_BYTES); } catch { /* aborted */ }
        state.buf += '\n\n';
        const payload = findMatchingSseEvent(state, requestId);
        return { payload, latencyMs: payload ? Date.now() - startedAt : null };
    }
    let received = 0;
    let payload = null;
    for (;;) {
        let chunk;
        try {
            chunk = await reader.read();
        } catch {
            break; // aborted or connection dropped — flush what we have
        }
        if (chunk.done) break;
        received += chunk.value.byteLength;
        state.buf += decoder.decode(chunk.value, { stream: true });
        payload = findMatchingSseEvent(state, requestId);
        if (payload || received >= MAX_BODY_BYTES) break;
    }
    if (!payload) {
        // Stream ended (or size cap hit) — the final event may lack a trailing
        // blank line, so flush the remainder as one last event.
        state.buf += '\n\n';
        payload = findMatchingSseEvent(state, requestId);
    }
    const latencyMs = payload ? Date.now() - startedAt : null;
    try { await reader.cancel(); } catch { /* stream already closed */ }
    return { payload, latencyMs };
}

async function rpcNotify(url, sessionId, method, opts) {
    const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': PROTOCOL,
        'User-Agent': opts.userAgent,
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    try {
        const res = await timedFetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ jsonrpc: '2.0', method }),
        }, opts.timeoutMs);
        await cancelBody(res);
    } catch {
        /* notifications are fire-and-forget */
    }
}

/* ---------------- shared utilities ---------------- */

async function timedFetch(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${timeoutMs} ms`)), timeoutMs);
    try {
        return await fetch(url, { redirect: 'follow', ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function cancelBody(res) {
    try {
        await res.body?.cancel();
    } catch {
        /* already consumed or closed */
    }
}

function normalizeTarget(raw) {
    if (!raw || !String(raw).trim()) return { error: 'Missing URL.' };
    let value = String(raw).trim();
    if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
    let u;
    try { u = new URL(value); } catch { return { error: `"${raw}" does not look like a valid URL.` }; }
    const host = u.hostname.toLowerCase();
    const privateHost = host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')
        || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
        || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
        || /^\[?::1\]?$/.test(host) || !host.includes('.');
    if (privateHost) return { error: 'Private or local addresses cannot be scanned.' };
    return { href: u.href };
}

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
