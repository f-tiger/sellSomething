/**
 * x402 — pay-per-call APIs for AI agents (x402 payment-required protocol, v1 + v2).
 * GET /api/scan?url=<site>       → agent-readiness scan of any website ($0.005 USDC)
 * GET /api/mcp-check?url=<mcp>   → MCP server health check            ($0.005 USDC)
 * GET /.well-known/x402          → machine-readable endpoint catalog
 * Everything else                → static assets
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
 *   4. Upstream scan runs; only on success we POST facilitator /settle (same body
 *      shape as /verify) → { success, transaction, network, payer?, errorReason? }
 *   Failed upstream work is never settled — callers aren't charged for errors.
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

const NETWORK_V1 = "base"; // x402 v1 network id for Base mainnet
const NETWORK_V2 = "eip155:8453"; // x402 v2 CAIP-2 id for Base mainnet (specs/x402-specification-v2.md §11.1)
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // native USDC, 6 decimals
// EIP-712 domain of the Base-mainnet USDC contract (needed by "exact" scheme signers).
// Note: Base *mainnet* native USDC is named "USD Coin"; the spec's examples show
// "USDC" because they use the Base-Sepolia test deployment, whose domain differs.
const USDC_EIP712 = { name: "USD Coin", version: "2" };

const MAX_TIMEOUT_SECONDS = 60;

const ENDPOINTS = [
  {
    path: "/api/scan",
    price: "5000", // atomic USDC units (6 decimals) → $0.005
    priceUsd: "$0.005",
    description:
      "Agent-readiness scan of any website: AI-crawler access in robots.txt, llms.txt, agents.md, JSON-LD structured data, meta basics and sitemap — scored 0-100 with itemized checks and concrete fixes. JSON.",
    upstream: "https://agentready.agiscorecard.com/api/scan?url=",
  },
  {
    path: "/api/mcp-check",
    price: "5000",
    priceUsd: "$0.005",
    description:
      "MCP server health check via a real JSON-RPC handshake: initialize, protocol version, serverInfo identity, capabilities, tools/list quality, latency, TLS and auth posture — scored 0-100 with itemized checks. JSON.",
    upstream: "https://mcppulse.agiscorecard.com/api/scan?url=",
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
    return env.ASSETS.fetch(request);
  },
};

/* ---------------- paid endpoints ---------------- */

async function handlePaid(request, env, endpoint) {
  if (request.method !== "GET") return json({ error: "GET only" }, 405);
  const url = new URL(request.url);
  const target = (url.searchParams.get("url") || "").trim();
  if (!target) return json({ error: "Missing url parameter." }, 400);

  // Deployable before the wallet exists: without PAYTO_ADDRESS nothing can be
  // charged, so serve free demo results only when explicitly asked (?demo=1).
  if (!env.PAYTO_ADDRESS) {
    if (url.searchParams.get("demo") === "1") {
      const up = await fetchUpstream(endpoint, target);
      if (up.error) return json({ error: up.error }, up.status);
      return json({ demo: true, note: "payments not configured", result: up.data });
    }
    return json({ error: "x402 not configured yet" }, 503);
  }

  const resourceUrl = url.origin + endpoint.path + "?url=" + encodeURIComponent(target);
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
  const up = await fetchUpstream(endpoint, target);
  if (up.error) {
    // Upstream failed → skip settlement so the caller is not charged.
    console.log("x402: upstream failed, payment NOT settled", endpoint.path, up.status, up.error);
    return json({ error: up.error }, up.status);
  }

  // 3) Settle (broadcast the transfer). Done after the work succeeded so a
  //    failed scan never charges; the receipt is surfaced in both the v2
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

async function fetchUpstream(endpoint, target) {
  try {
    const res = await fetch(endpoint.upstream + encodeURIComponent(target), {
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
        "Pay-per-call scanning APIs for AI agents. No account, no API key: pay $0.005 per call in USDC on Base via the x402 payment-required protocol (v2 with CAIP-2 network ids; legacy v1 clients still accepted).",
      network: NETWORK_V2,
      networkV1: NETWORK_V1,
      asset: { address: USDC_BASE, symbol: "USDC", decimals: 6, eip712: USDC_EIP712 },
      payToConfigured,
      endpoints: ENDPOINTS.map((e) => ({
        path: e.path,
        method: "GET",
        resource: origin + e.path,
        type: "http",
        query: { url: "target URL to scan (required)" },
        price: { amount: e.price, asset: "USDC", decimals: 6, usd: e.priceUsd },
        network: NETWORK_V2,
        description: e.description,
        mimeType: "application/json",
        // Full v2 PaymentRequirements (spec §5.1.2) once the wallet is live:
        accepts: payToConfigured ? [paymentRequirementsV2(e, env)] : [],
      })),
      docs: origin + "/",
    },
    200,
    { "Cache-Control": "public, max-age=3600" }
  );
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
