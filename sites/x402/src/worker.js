/**
 * x402 — pay-per-call APIs for AI agents (x402 payment-required protocol, v1 + v2).
 * GET /api/scan?url=<site>          → agent-readiness scan of any website   ($0.005 USDC)
 * GET /api/mcp-check?url=<mcp>      → MCP server health check               ($0.005 USDC)
 * GET /api/wellknown?url=<site>     → well-known agent-discovery audit      ($0.005 USDC)
 * GET /api/llms-extract?url=<site>  → llms.txt / AI-policy file extraction  ($0.005 USDC)
 * GET /api/scan-batch?urls=a,b,c    → batch agent-readiness scan (≤5 URLs)  ($0.02  USDC)
 * GET /api/mcp-index                → full Public MCP Server Index          ($0.01  USDC)
 * GET /.well-known/x402             → machine-readable endpoint catalog
 * Everything else                   → static assets (the landing page's endpoint
 *                                     cards are injected from the ENDPOINTS table)
 *
 * Every payable endpoint is one entry in the ENDPOINTS table below —
 * {path, price, description, validate, work} — and the 402 challenge, the
 * /.well-known/x402 catalog and the landing-page endpoint cards all derive
 * from that single table. `validate` runs BEFORE the payment challenge, so
 * invalid requests (missing params, >5 batch URLs, private hosts) are
 * rejected with a plain 400 and never quoted, verified or charged.
 *
 * Protocol versions (per coinbase/x402 specs/, verified 2026-08-21):
 *   v2 (current)  — specs/x402-specification-v2.md + specs/transports-v2/http.md:
 *     · 402 challenge: base64(PaymentRequired) in the `PAYMENT-REQUIRED` response
 *       header; the response *body* is "a server implementation concern".
 *     · PaymentRequired: { x402Version:2, error?, resource:{url,description,mimeType},
 *       accepts:[PaymentRequirements], extensions? }
 *     · PaymentRequirements (v2): { scheme, network(CAIP-2, e.g. "eip155:8453"),
 *       amount, asset, payTo, maxTimeoutSeconds, extra? }   ← `amount`, not
 *       `maxAmountRequired`; no `resource`/`description`/`mimeType`/`outputSchema`
 *       (those moved to the top-level ResourceInfo object).
 *     · Client pays via `PAYMENT-SIGNATURE: base64(PaymentPayload)` where
 *       PaymentPayload = { x402Version:2, resource?, accepted:PaymentRequirements,
 *       payload:{signature, authorization}, extensions? }
 *     · Receipt: base64(SettleResponse) in the `PAYMENT-RESPONSE` header.
 *   v1 (legacy)   — specs/x402-specification-v1.md + specs/transports-v1/http.md:
 *     · 402 challenge: JSON body { x402Version:1, error, accepts:[...] };
 *       requirements use `maxAmountRequired`, network "base", and carry
 *       resource/description/mimeType/outputSchema inline.
 *     · Client pays via `X-PAYMENT: base64({x402Version:1, scheme, network, payload})`.
 *     · Receipt: `X-PAYMENT-RESPONSE` header.
 *
 * Dual-version serving (matches the official @x402/fetch client, which reads the
 * v2 `PAYMENT-REQUIRED` header first and falls back to a v1 JSON body — see
 * typescript/packages/core/src/http/x402HTTPClient.ts#getPaymentRequiredResponse):
 *   · Every 402 carries BOTH the v2 header and the v1 body simultaneously.
 *   · Incoming payments are read from `PAYMENT-SIGNATURE` (v2) or `X-PAYMENT`
 *     (v1); the payload's own `x402Version` picks the requirements shape sent
 *     to the facilitator.
 *   · Receipts are emitted in BOTH `PAYMENT-RESPONSE` and `X-PAYMENT-RESPONSE`
 *     (the reference client checks them in that order; same base64 bytes).
 *
 * Payment flow ("exact" scheme, EIP-3009 USDC transfer authorization on Base):
 *   1. Agent calls without a payment header → 402 challenge (v2 header + v1 body)
 *   2. Agent signs and retries with PAYMENT-SIGNATURE (v2) or X-PAYMENT (v1)
 *   3. We POST facilitator /verify  { x402Version, paymentPayload, paymentRequirements }
 *      → { isValid, invalidReason?, payer? }  (same shape in v1 and v2)
 *   4. The endpoint's work runs; only on success we POST facilitator /settle (same
 *      body shape as /verify) → { success, transaction, network, payer?, errorReason? }
 *   Failed work is never settled — callers aren't charged for errors.
 *
 * Env:
 *   PAYTO_ADDRESS      — receiving wallet (0x…) on Base. REQUIRED to charge.
 *                        While unset: ?demo=1 serves free demo results, else 503.
 *   FACILITATOR_URL    — optional facilitator base URL. Default
 *                        https://x402.org/facilitator (TESTNET-ONLY — see README).
 *   FACILITATOR_URL_V1 — optional separate facilitator for v1 payments, for
 *                        facilitators that split versions across deployments.
 *                        Falls back to FACILITATOR_URL.
 */

const FACILITATOR_DEFAULT = "https://x402.org/facilitator";
const FACILITATOR_TIMEOUT_MS = 10000;
const UPSTREAM_TIMEOUT_MS = 30000;
const EXTRACT_TIMEOUT_MS = 10000; // per-file timeout for inline llms-extract fetches
const EXTRACT_MAX_BODY = 500_000;
const EXTRACT_EXCERPT_CHARS = 600;

const NETWORK_V1 = "base"; // x402 v1 network id for Base mainnet
const NETWORK_V2 = "eip155:8453"; // x402 v2 CAIP-2 id for Base mainnet (specs/x402-specification-v2.md §11.1)
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // native USDC, 6 decimals
// EIP-712 domain of the Base-mainnet USDC contract (needed by "exact" scheme signers).
// Note: Base *mainnet* native USDC is named "USD Coin"; the spec's examples show
// "USDC" because they use the Base-Sepolia test deployment, whose domain differs.
const USDC_EIP712 = { name: "USD Coin", version: "2" };

const MAX_TIMEOUT_SECONDS = 60;
const MAX_BATCH_URLS = 5;

const SCAN_UPSTREAM = "https://agentready.agiscorecard.com/api/scan?url=";
const MCP_CHECK_UPSTREAM = "https://mcppulse.agiscorecard.com/api/scan?url=";
const WELLKNOWN_UPSTREAM = "https://tools.agiscorecard.com/api/wellknown?url=";
const MCP_INDEX_UPSTREAM = "https://mcppulse.agiscorecard.com/data/mcp-index.json";

/**
 * The single source of truth for everything payable. Each entry:
 *   path        — route under /api/
 *   name        — human title (landing-page card)
 *   price       — atomic USDC units, 6 decimals ("5000" = $0.005)
 *   priceUsd    — display price
 *   description — used verbatim in the 402 challenge (v1 accepts[] +
 *                 v2 ResourceInfo), the catalog and the landing card
 *   example     — usage snippet (landing card)
 *   query       — catalog documentation of accepted query params
 *   validate(searchParams) → { error, status } | { params, query }
 *                 runs BEFORE any payment challenge (invalid = free 400);
 *                 `query` is the canonical query string for the resource URL
 *   work(params) → { data } | { error, status }
 *                 the actual job; only a `data` result is ever settled/charged
 */
const ENDPOINTS = [
  {
    path: "/api/scan",
    name: "Agent-readiness scan",
    price: "5000",
    priceUsd: "$0.005",
    description:
      "Agent-readiness scan of any website: AI-crawler access in robots.txt, llms.txt, agents.md, JSON-LD structured data, meta basics and sitemap — scored 0-100 with itemized checks and concrete fixes. JSON.",
    example: "GET /api/scan?url=example.com",
    query: { url: "target URL to scan (required)" },
    validate: requireUrl,
    work: ({ target }) => proxyJson(SCAN_UPSTREAM + encodeURIComponent(target)),
  },
  {
    path: "/api/mcp-check",
    name: "MCP server health check",
    price: "5000",
    priceUsd: "$0.005",
    description:
      "MCP server health check via a real JSON-RPC handshake: initialize, protocol version, serverInfo identity, capabilities, tools/list quality, latency, TLS and auth posture — scored 0-100 with itemized checks. JSON.",
    example: "GET /api/mcp-check?url=your-server.com/mcp",
    query: { url: "MCP server endpoint URL to check (required)" },
    validate: requireUrl,
    work: ({ target }) => proxyJson(MCP_CHECK_UPSTREAM + encodeURIComponent(target)),
  },
  {
    path: "/api/wellknown",
    name: "Well-known discovery audit",
    price: "5000",
    priceUsd: "$0.005",
    description:
      "Agent-discovery audit of a site's well-known surface: .well-known/ai-catalog.json, MCP server card, A2A agent card, llms.txt, agents.md and robots.txt AI-crawler access — scored 0-100 with pass/warn/fail checks and fix links. JSON.",
    example: "GET /api/wellknown?url=example.com",
    query: { url: "target URL to audit (required)" },
    validate: requireUrl,
    work: ({ target }) => proxyJson(WELLKNOWN_UPSTREAM + encodeURIComponent(target)),
  },
  {
    path: "/api/llms-extract",
    name: "llms.txt extractor",
    price: "5000",
    priceUsd: "$0.005",
    description:
      "Structured extraction of one domain's AI-policy files: llms.txt parsed into title/summary/sections/link lists, agents.md headings and excerpt, ai.txt, and per-AI-crawler robots.txt verdicts (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, …) with aggregate adoption signals. JSON.",
    example: "GET /api/llms-extract?url=example.com",
    query: { url: "target domain or URL to extract (required; public hosts only)" },
    validate: validateExtractTarget,
    work: extractLlmsPolicy,
  },
  {
    path: "/api/scan-batch",
    name: "Batch agent-readiness scan",
    price: "20000",
    priceUsd: "$0.02",
    description:
      "Batch agent-readiness scan: up to 5 comma-separated URLs scanned concurrently in one paid call, each returning the full 0-100 scored report. Requests with more than 5 URLs are rejected with a free 400 — never charged. JSON.",
    example: "GET /api/scan-batch?urls=a.com,b.com,c.com",
    query: { urls: "comma-separated target URLs, 1 to 5 (required)" },
    validate: validateBatchUrls,
    work: batchScan,
  },
  {
    path: "/api/mcp-index",
    name: "Public MCP Server Index",
    price: "10000",
    priceUsd: "$0.01",
    description:
      "The full current Public MCP Server Index as JSON: every indexed public MCP server with health score, grade, latency, tool counts and failing checks, fetched live. A free weekly summary of this index is published at https://mcppulse.agiscorecard.com — this endpoint returns the complete machine-readable dataset.",
    example: "GET /api/mcp-index",
    query: {},
    validate: () => ({ params: {}, query: "" }),
    work: () => proxyJson(MCP_INDEX_UPSTREAM),
  },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isApi = url.pathname.startsWith("/api/") || url.pathname === "/.well-known/x402";
    if (request.method === "OPTIONS" && isApi) return preflight();
    if (url.pathname === "/.well-known/x402") return handleDiscovery(request, env);
    const endpoint = ENDPOINTS.find((e) => e.path === url.pathname);
    if (endpoint) return handlePaid(request, env, endpoint);
    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Unknown endpoint — see /.well-known/x402 for the catalog." }, 404);
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return serveIndex(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

/* ---------------- paid endpoints ---------------- */

async function handlePaid(request, env, endpoint) {
  if (request.method !== "GET") return json({ error: "GET only" }, 405);
  const url = new URL(request.url);

  // Endpoint-specific validation happens BEFORE any payment challenge, so a
  // malformed request (missing url, >5 batch URLs, private host) costs nothing.
  const v = endpoint.validate(url.searchParams);
  if (v.error) return json({ error: v.error }, v.status || 400);

  // Deployable before the wallet exists: without PAYTO_ADDRESS nothing can be
  // charged, so serve free demo results only when explicitly asked (?demo=1).
  if (!env.PAYTO_ADDRESS) {
    if (url.searchParams.get("demo") === "1") {
      const up = await endpoint.work(v.params);
      if (up.error) return json({ error: up.error }, up.status);
      return json({ demo: true, note: "payments not configured", result: up.data });
    }
    return json({ error: "x402 not configured yet" }, 503);
  }

  const resourceUrl = url.origin + endpoint.path + v.query;
  const reqV1 = paymentRequirementsV1(endpoint, resourceUrl, env);
  const reqV2 = paymentRequirementsV2(endpoint, env);
  const resourceInfo = {
    url: resourceUrl,
    description: endpoint.description,
    mimeType: "application/json",
  };
  const challenge = { reqV1, reqV2, resourceInfo };

  // Detect the client's protocol version from which payment header it used
  // (v2 clients send PAYMENT-SIGNATURE, v1 clients send X-PAYMENT — see
  // x402HTTPClient.encodePaymentSignatureHeader in the reference SDK), then
  // trust the payload's own x402Version field for the facilitator exchange.
  const headerV2 = request.headers.get("PAYMENT-SIGNATURE");
  const headerV1 = request.headers.get("X-PAYMENT");
  const header = headerV2 || headerV1;
  if (!header) {
    return pay402("Payment required: send PAYMENT-SIGNATURE (x402 v2) or X-PAYMENT (v1)", challenge);
  }

  const paymentPayload = decodePaymentHeader(header);
  if (!paymentPayload) {
    return pay402(
      "Invalid " + (headerV2 ? "PAYMENT-SIGNATURE" : "X-PAYMENT") +
        " header — expected base64-encoded JSON payment payload",
      challenge
    );
  }

  const version = paymentPayload.x402Version;
  if (version !== 1 && version !== 2) {
    return pay402(
      "invalid_x402_version: this server supports x402Version 1 and 2, got " + JSON.stringify(version),
      challenge
    );
  }

  // v2 payloads carry the chosen requirements in `accepted`; make sure the
  // client accepted one of ours (the reference server deep-equals against the
  // advertised accepts — we compare the economically meaningful fields).
  let requirements;
  if (version === 2) {
    const a = paymentPayload.accepted;
    if (!a || !matchesV2Requirements(a, reqV2)) {
      return pay402("No matching payment requirements", challenge);
    }
    requirements = reqV2;
  } else {
    requirements = reqV1;
  }

  // 1) Verify the payment with the facilitator.
  const verify = await facilitatorCall(env, "/verify", version, paymentPayload, requirements);
  if (verify.unreachable) {
    return json({ error: "Payment facilitator unreachable: " + verify.error }, 502);
  }
  if (!verify.data || verify.data.isValid !== true) {
    const reason =
      (verify.data && (verify.data.invalidReason || verify.data.error)) ||
      "facilitator returned HTTP " + verify.status;
    return pay402("Payment verification failed: " + reason, challenge);
  }

  // 2) Payment is valid — do the actual work.
  const up = await endpoint.work(v.params);
  if (up.error) {
    // Work failed → skip settlement so the caller is not charged.
    console.log("x402: work failed, payment NOT settled", endpoint.path, up.status, up.error);
    return json({ error: up.error }, up.status);
  }

  // 3) Settle (broadcast the transfer). Done after the work succeeded so a
  //    failed call never charges; the receipt is surfaced in both the v2
  //    PAYMENT-RESPONSE and legacy X-PAYMENT-RESPONSE headers (same bytes —
  //    the reference client checks them in that order).
  const settle = await facilitatorCall(env, "/settle", version, paymentPayload, requirements);
  // The paid result is released ONLY when settlement actually succeeded.
  // Serving on a failed settle would let one signed authorization be replayed
  // for unlimited free calls (verify passes until the nonce is spent on-chain);
  // the v2 reference server also 402s here. We eat the wasted upstream compute.
  if (!settle.data || settle.data.success !== true) {
    console.error("x402: settle failed, result withheld", endpoint.path,
      settle.data ? JSON.stringify(settle.data).slice(0, 500) : (settle.error || "HTTP " + settle.status));
    return pay402("Payment settlement failed" +
      (settle.data && settle.data.errorReason ? ": " + settle.data.errorReason : "") +
      " — obtain a fresh payment authorization and retry.", challenge);
  }
  const receipt = b64json(settle.data);
  return json(up.data, 200, { "PAYMENT-RESPONSE": receipt, "X-PAYMENT-RESPONSE": receipt });
}

/* ---------------- request validation (pre-payment, free) ---------------- */

function requireUrl(searchParams) {
  const target = (searchParams.get("url") || "").trim();
  if (!target) return { error: "Missing url parameter.", status: 400 };
  return { params: { target }, query: "?url=" + encodeURIComponent(target) };
}

function validateBatchUrls(searchParams) {
  const raw = (searchParams.get("urls") || "").trim();
  const targets = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (targets.length === 0) {
    return { error: "Missing urls parameter — comma-separated list of 1 to " + MAX_BATCH_URLS + " URLs.", status: 400 };
  }
  if (targets.length > MAX_BATCH_URLS) {
    return {
      error: "Too many URLs: " + targets.length + " (maximum " + MAX_BATCH_URLS + " per call). Nothing was charged.",
      status: 400,
    };
  }
  return { params: { targets }, query: "?urls=" + encodeURIComponent(targets.join(",")) };
}

function validateExtractTarget(searchParams) {
  const raw = (searchParams.get("url") || "").trim();
  if (!raw) return { error: "Missing url parameter.", status: 400 };
  const t = normalizeTarget(raw);
  if (t.error) return { error: t.error, status: 400 };
  return { params: { origin: t.origin, host: t.host }, query: "?url=" + encodeURIComponent(raw) };
}

// SSRF guard, ported from apify/llms-txt-extractor/main.js#normalizeTarget:
// llms-extract fetches arbitrary user-supplied hosts from inside our
// infrastructure, so localhost, RFC-1918/link-local ranges and dotless or
// .local/.internal hostnames are rejected before any payment or fetch.
// (Proxied endpoints inherit the equivalent guard of their upstream scanner.)
function normalizeTarget(raw) {
  let value = String(raw).trim();
  if (!/^https?:\/\//i.test(value)) value = "https://" + value;
  let u;
  try { u = new URL(value); } catch { return { error: '"' + raw + '" does not look like a valid domain or URL.' }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { error: "Only http(s) URLs are supported." };
  const host = u.hostname.toLowerCase();
  const privateHost = host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")
    || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
    || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || /^\[?::1\]?$/.test(host) || !host.includes(".");
  if (privateHost) return { error: "Private or local addresses cannot be scanned." };
  return { origin: u.origin, host: u.host };
}

/* ---------------- endpoint work: batch scan ---------------- */

async function batchScan({ targets }) {
  const results = await Promise.all(
    targets.map(async (target) => {
      const r = await proxyJson(SCAN_UPSTREAM + encodeURIComponent(target));
      return r.error
        ? { url: target, ok: false, error: r.error }
        : { url: target, ok: true, result: r.data };
    })
  );
  // Charge-only-after-success: if every scan failed, the whole call is an
  // error and settlement is skipped. Partial batches are delivered (and
  // charged) with per-URL error entries.
  if (!results.some((r) => r.ok)) {
    return { error: "All " + results.length + " scans failed: " + results[0].error, status: 502 };
  }
  return {
    data: {
      count: results.length,
      succeeded: results.filter((r) => r.ok).length,
      results,
    },
  };
}

/* ---------------- endpoint work: llms-extract (inline) ---------------- */
// Ported from apify/llms-txt-extractor/main.js, adapted for Workers: fetch a
// domain's AI-policy surface (/llms.txt, /agents.md, /ai.txt, /robots.txt)
// concurrently and return structured fields + aggregate signals. The domain
// counts as a success (chargeable) when at least one path answered HTTP —
// a site with none of the files is still a valid data point (adoption=false).

const AI_BOTS = [
  { bot: "GPTBot", operator: "OpenAI", purpose: "model training / retrieval" },
  { bot: "OAI-SearchBot", operator: "OpenAI", purpose: "ChatGPT Search indexing" },
  { bot: "ChatGPT-User", operator: "OpenAI", purpose: "live browsing on user request" },
  { bot: "ClaudeBot", operator: "Anthropic", purpose: "model training / retrieval" },
  { bot: "Claude-User", operator: "Anthropic", purpose: "live browsing on user request" },
  { bot: "Claude-SearchBot", operator: "Anthropic", purpose: "search indexing" },
  { bot: "anthropic-ai", operator: "Anthropic", purpose: "legacy crawler token" },
  { bot: "PerplexityBot", operator: "Perplexity", purpose: "answer-engine indexing" },
  { bot: "Perplexity-User", operator: "Perplexity", purpose: "live browsing on user request" },
  { bot: "Google-Extended", operator: "Google", purpose: "Gemini / AI Mode grounding control" },
  { bot: "Applebot-Extended", operator: "Apple", purpose: "Apple Intelligence training control" },
  { bot: "Bytespider", operator: "ByteDance", purpose: "model training" },
  { bot: "CCBot", operator: "Common Crawl", purpose: "open web corpus (used in LLM training)" },
  { bot: "meta-externalagent", operator: "Meta", purpose: "model training" },
  { bot: "Amazonbot", operator: "Amazon", purpose: "Alexa / Rufus answers" },
  { bot: "DuckAssistBot", operator: "DuckDuckGo", purpose: "DuckAssist answers" },
];

async function extractLlmsPolicy({ origin, host }) {
  const [llmsR, agentsR, aiR, robotsR] = await Promise.allSettled([
    fetchTextFile(origin + "/llms.txt"),
    fetchTextFile(origin + "/agents.md"),
    fetchTextFile(origin + "/ai.txt"),
    fetchTextFile(origin + "/robots.txt"),
  ]);
  const llms = settled(llmsR);
  const agents = settled(agentsR);
  const ai = settled(aiR);
  const robots = settled(robotsR);

  // Reachability: at least one endpoint must have answered HTTP (any status).
  if (![llms, agents, ai, robots].some((r) => r !== null)) {
    return {
      error: "Could not reach " + host + " — DNS failure, timeout or connection refused on all probed paths. Not charged.",
      status: 502,
    };
  }

  const llmsTxt = buildLlmsTxtField(llms, origin);
  const agentsMd = buildAgentsMdField(agents, origin);
  const aiTxt = buildAiTxtField(ai, origin);
  const robotsTxt = buildRobotsField(robots, origin);

  const blocked = robotsTxt.aiBots.filter((b) => b.allowed === false).length;
  const allowed = robotsTxt.aiBots.filter((b) => b.allowed === true).length;
  const adoptionCount = [llmsTxt.found, agentsMd.found, aiTxt.found].filter(Boolean).length;

  return {
    data: {
      domain: host,
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
        aiPolicyStance: blocked === 0 ? "open" : blocked >= AI_BOTS.length - 2 ? "blocking" : "selective",
        aiReadinessLevel: adoptionCount >= 2 ? "high" : adoptionCount === 1 ? "basic" : "none",
      },
    },
  };
}

// llms.txt convention: "# Title", "> one-line summary", optional intro
// paragraphs, then "## Section" headings with "- [title](url): notes" lists.
function buildLlmsTxtField(res, origin) {
  const found = isTextFile(res);
  const field = { found, url: origin + "/llms.txt", status: res ? res.status : null, bytes: found ? res.body.length : 0 };
  if (found) Object.assign(field, parseLlmsTxt(res.body));
  return field;
}

function parseLlmsTxt(text) {
  const doc = { title: "", summary: "", intro: "", sections: [], orphanLinks: [], linkCount: 0 };
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
      doc.summary = (doc.summary ? doc.summary + " " : "") + bq[1].trim();
      continue;
    }

    const link = line.match(/^\s*[-*]\s*\[([^\]]*)\]\(([^)\s]+)\)\s*(?::\s*(.*))?$/);
    if (link) {
      const item = { title: link[1].trim(), url: link[2].trim(), notes: (link[3] || "").trim() };
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

  doc.intro = introLines.join(" ").slice(0, 1000);
  doc.sectionCount = doc.sections.length;
  for (const section of doc.sections) section.notes = section.notes.join(" ").slice(0, 500);
  return doc;
}

function buildAgentsMdField(res, origin) {
  const found = isTextFile(res);
  const field = { found, url: origin + "/agents.md", status: res ? res.status : null, bytes: found ? res.body.length : 0 };
  if (!found) return field;
  const headings = [];
  for (const m of res.body.matchAll(/^#{1,3}\s+(.+)$/gm)) {
    headings.push(m[1].trim());
    if (headings.length >= 20) break;
  }
  field.headings = headings;
  field.excerpt = res.body.slice(0, EXTRACT_EXCERPT_CHARS);
  return field;
}

// ai.txt (Spawning.ai convention) usually mirrors robots.txt syntax with
// media-type rules. When it looks robots-like, parse the directive groups.
function buildAiTxtField(res, origin) {
  const found = isTextFile(res);
  const field = { found, url: origin + "/ai.txt", status: res ? res.status : null, bytes: found ? res.body.length : 0 };
  if (!found) return field;
  if (/user-agent\s*:/i.test(res.body)) {
    field.directives = parseRobots(res.body).map((g) => ({
      userAgents: g.agents,
      allow: g.allows,
      disallow: g.disallows,
    }));
  }
  field.excerpt = res.body.slice(0, EXTRACT_EXCERPT_CHARS);
  return field;
}

function buildRobotsField(res, origin) {
  const found = isTextFile(res);
  const field = { found, url: origin + "/robots.txt", status: res ? res.status : null, sitemaps: [], aiBots: [] };

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
      matchedBy: !found ? "no robots.txt (default allow)"
        : !match ? "no matching rule (default allow)"
          : match.wildcard ? "wildcard group (*)"
            : "specific group (" + match.agentToken + ")",
      allow: match ? match.group.allows : [],
      disallow: match ? match.group.disallows : [],
      crawlDelay: match?.group.crawlDelay ?? null,
    });
  }
  return field;
}

// robots.txt parsing + RFC 9309 group matching, ported from
// apify/llms-txt-extractor/main.js (itself ported from sites/agentready).
// Parses robots.txt into rule groups [{agents, allows, disallows, crawlDelay}];
// consecutive User-agent lines share one group.
function parseRobots(text) {
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
        current = { agents: [], allows: [], disallows: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && (key === "allow" || key === "disallow")) {
      current.closed = true;
      (key === "allow" ? current.allows : current.disallows).push(value);
    } else if (current && key === "crawl-delay") {
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
  let bestToken = "";
  let bestLen = -1;
  let wildcard = null;
  for (const g of groups) {
    for (const a of g.agents) {
      if (a === "*") {
        if (!wildcard) wildcard = g;
      } else if ((name.includes(a) || a.includes(name)) && a.length > bestLen) {
        best = g;
        bestToken = a;
        bestLen = a.length;
      }
    }
  }
  if (best) return { group: best, agentToken: bestToken, wildcard: false };
  if (wildcard) return { group: wildcard, agentToken: "*", wildcard: true };
  return null;
}

// Verdict for the winning group: blocked only when the whole site is
// disallowed ("/" or "/*") without a counteracting root Allow.
function isAllowedByGroup(group) {
  if (!group) return true;
  const rootBlocked = group.disallows.some((d) => d === "/" || d === "/*");
  const rootAllowed = group.allows.some((a) => a === "/" || a === "/*");
  return !rootBlocked || rootAllowed;
}

async function fetchTextFile(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "x402-gateway/1.0 (+https://x402.agiscorecard.com; llms.txt extractor)",
      Accept: "text/plain,text/markdown,text/html,*/*",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
  });
  const body = res.ok ? (await res.text()).slice(0, EXTRACT_MAX_BODY) : "";
  if (!res.ok) {
    try { await res.body?.cancel(); } catch { /* already closed */ }
  }
  return { ok: res.ok, status: res.status, body };
}

// A "found" text file must be a 2xx, non-empty, and not an HTML page
// (SPAs often return their index.html for any path — that is a miss).
function isTextFile(res) {
  return !!(res && res.ok && res.body.trim().length > 0 && !/^\s*</.test(res.body));
}

function settled(r) {
  return r.status === "fulfilled" ? r.value : null;
}

/* ---------------- payment requirements ---------------- */

// v1 PaymentRequirements — specs/x402-specification-v1.md (flat object with
// maxAmountRequired + resource/description/mimeType/outputSchema inline).
function paymentRequirementsV1(endpoint, resourceUrl, env) {
  return {
    scheme: "exact",
    network: NETWORK_V1,
    maxAmountRequired: endpoint.price,
    resource: resourceUrl,
    description: endpoint.description,
    mimeType: "application/json",
    outputSchema: null,
    payTo: env.PAYTO_ADDRESS,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    asset: USDC_BASE,
    extra: { name: USDC_EIP712.name, version: USDC_EIP712.version },
  };
}

// v2 PaymentRequirements — specs/x402-specification-v2.md §5.1.2: `amount`
// replaces `maxAmountRequired`; CAIP-2 network; resource info lives in the
// top-level PaymentRequired object, not here.
function paymentRequirementsV2(endpoint, env) {
  return {
    scheme: "exact",
    network: NETWORK_V2,
    amount: endpoint.price,
    asset: USDC_BASE,
    payTo: env.PAYTO_ADDRESS,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    extra: { name: USDC_EIP712.name, version: USDC_EIP712.version },
  };
}

// Compare a v2 client's `accepted` echo against what we advertise. The
// reference implementation uses deepEqual; we require the fields that decide
// who gets paid what, and tolerate cosmetic differences (extra, casing).
function matchesV2Requirements(accepted, reqV2) {
  const lc = (s) => String(s || "").toLowerCase();
  return (
    accepted.scheme === reqV2.scheme &&
    accepted.network === reqV2.network &&
    String(accepted.amount) === reqV2.amount &&
    lc(accepted.asset) === lc(reqV2.asset) &&
    lc(accepted.payTo) === lc(reqV2.payTo)
  );
}

/**
 * Dual-version 402 challenge:
 *   body   = v1 PaymentRequired JSON  (transports-v1/http.md — v1 clients read the body)
 *   header = PAYMENT-REQUIRED: base64(v2 PaymentRequired)  (transports-v2/http.md —
 *            v2 clients read the header first and ignore the body)
 */
function pay402(error, { reqV1, reqV2, resourceInfo }) {
  const v2PaymentRequired = {
    x402Version: 2,
    error,
    resource: resourceInfo,
    accepts: [reqV2],
  };
  return json({ x402Version: 1, error, accepts: [reqV1] }, 402, {
    "PAYMENT-REQUIRED": b64json(v2PaymentRequired),
  });
}

// Tolerant decode: base64(JSON) per spec, base64url, or raw JSON.
function decodePaymentHeader(header) {
  const h = header.trim();
  for (const candidate of [h, h.replace(/-/g, "+").replace(/_/g, "/")]) {
    try {
      const decoded = atob(candidate.padEnd(candidate.length + ((4 - (candidate.length % 4)) % 4), "="));
      const obj = JSON.parse(decoded);
      if (obj && typeof obj === "object") return obj;
    } catch {
      /* try next form */
    }
  }
  try {
    const obj = JSON.parse(h);
    if (obj && typeof obj === "object") return obj;
  } catch {
    /* not JSON either */
  }
  return null;
}

/* ---------------- facilitator ---------------- */

/**
 * POST /verify and /settle share one body shape in both protocol versions
 * (v2 spec §7.1–7.2; the reference HTTPFacilitatorClient sends
 * `x402Version: paymentPayload.x402Version` alongside the payload and the
 * version-matching requirements object):
 *   { x402Version, paymentPayload, paymentRequirements }
 */
async function facilitatorCall(env, path, version, paymentPayload, requirements) {
  const base = facilitatorBase(env, version);
  try {
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ x402Version: version, paymentPayload, paymentRequirements: requirements }),
      signal: AbortSignal.timeout(FACILITATOR_TIMEOUT_MS),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON facilitator response */
    }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, unreachable: true, status: 0, data: null, error: String((e && e.message) || e) };
  }
}

function facilitatorBase(env, version) {
  const url = (version === 1 && env.FACILITATOR_URL_V1) || env.FACILITATOR_URL || FACILITATOR_DEFAULT;
  return url.replace(/\/+$/, "");
}

/* ---------------- upstream proxying ---------------- */

async function proxyJson(upstreamUrl) {
  try {
    const res = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "x402-gateway/1.0 (+https://x402.agiscorecard.com)",
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON upstream response */
    }
    if (!res.ok) {
      return {
        error: (data && data.error) || "Upstream scanner returned HTTP " + res.status,
        status: res.status >= 500 ? 502 : res.status,
      };
    }
    if (data === null) return { error: "Upstream scanner returned non-JSON.", status: 502 };
    return { data };
  } catch (e) {
    return { error: "Upstream scanner unreachable: " + String((e && e.message) || e), status: 502 };
  }
}

/* ---------------- discovery ---------------- */

function handleDiscovery(request, env) {
  const origin = new URL(request.url).origin;
  const payToConfigured = Boolean(env.PAYTO_ADDRESS);
  return json(
    {
      x402Version: 2,
      x402Versions: [1, 2], // both protocol versions are accepted on every endpoint
      name: "x402 payable APIs — agiscorecard",
      description:
        "Pay-per-call APIs for AI agents. No account, no API key: pay $0.005-$0.02 per call in USDC on Base via the x402 payment-required protocol (v2 with CAIP-2 network ids; legacy v1 clients still accepted).",
      network: NETWORK_V2,
      networkV1: NETWORK_V1,
      asset: { address: USDC_BASE, symbol: "USDC", decimals: 6, eip712: USDC_EIP712 },
      payToConfigured,
      endpoints: ENDPOINTS.map((e) => ({
        path: e.path,
        method: "GET",
        resource: origin + e.path,
        type: "http",
        query: e.query,
        price: { amount: e.price, asset: "USDC", decimals: 6, usd: e.priceUsd },
        network: NETWORK_V2,
        description: e.description,
        mimeType: "application/json",
        // Full v2 PaymentRequirements (spec §5.1.2) once the wallet is live:
        accepts: payToConfigured ? [paymentRequirementsV2(e, env)] : [],
      })),
      openapi: origin + "/openapi.json", // OpenAPI 3.1 spec of the same endpoints
      docs: origin + "/",
    },
    200,
    { "Cache-Control": "public, max-age=3600" }
  );
}

/* ---------------- landing page (endpoint cards from the table) ---------------- */

const CARDS_START = "<!--X402_ENDPOINTS_START-->";
const CARDS_END = "<!--X402_ENDPOINTS_END-->";

// The landing page's endpoint section derives from the same ENDPOINTS table as
// the 402 challenge and the catalog: the static index.html carries a marker
// pair and the cards are injected here at serve time.
async function serveIndex(request, env) {
  const res = await env.ASSETS.fetch(request);
  let html;
  try {
    html = await res.text();
  } catch {
    return res;
  }
  const start = html.indexOf(CARDS_START);
  const end = html.indexOf(CARDS_END);
  const headers = new Headers(res.headers);
  headers.delete("Content-Length");
  if (start === -1 || end === -1 || end < start) {
    return new Response(html, { status: res.status, headers });
  }
  const out =
    html.slice(0, start + CARDS_START.length) +
    "\n    " + endpointCardsHtml() + "\n    " +
    html.slice(end);
  return new Response(out, { status: res.status, headers });
}

function endpointCardsHtml() {
  return ENDPOINTS.map(
    (e) =>
      '<div class="card">\n' +
      "      <b>" + escapeHtml(e.name) + "</b>\n" +
      '      <div class="price">' + escapeHtml(e.priceUsd) + " <span>/ call</span></div>\n" +
      "      <p>" + escapeHtml(e.description) + "</p>\n" +
      "      <code>" + escapeHtml(e.example) + "</code>\n" +
      "    </div>"
  ).join("\n    ");
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ---------------- helpers ---------------- */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  // v2 + v1 receipt headers, and the v2 challenge header, readable cross-origin.
  "Access-Control-Expose-Headers": "PAYMENT-RESPONSE, X-PAYMENT-RESPONSE, PAYMENT-REQUIRED",
};

function preflight() {
  return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "86400" } });
}

// base64(JSON) safe for arbitrary UTF-8 content.
function b64json(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS,
      ...extraHeaders,
    },
  });
}
