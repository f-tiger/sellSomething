/**
 * x402 — pay-per-call APIs for AI agents (x402 payment-required protocol, v1).
 * GET /api/scan?url=<site>       → agent-readiness scan of any website ($0.005 USDC)
 * GET /api/mcp-check?url=<mcp>   → MCP server health check            ($0.005 USDC)
 * GET /.well-known/x402          → machine-readable endpoint catalog
 * Everything else                → static assets
 *
 * Payment flow (x402 v1, "exact" scheme, USDC on Base):
 *   1. Agent calls without X-PAYMENT      → 402 + accepts[] (payment requirements)
 *   2. Agent signs an EIP-3009 USDC transfer authorization, retries with
 *      X-PAYMENT: base64(JSON payment payload)
 *   3. We POST facilitator /verify        → isValid?  serve the result
 *   4. We POST facilitator /settle        → tx broadcast on-chain; the settle
 *      result is returned base64-encoded in the X-PAYMENT-RESPONSE header.
 *   Failed upstream work is never settled — callers aren't charged for errors.
 *
 * Env:
 *   PAYTO_ADDRESS   — receiving wallet (0x…) on Base. REQUIRED to charge.
 *                     While unset: ?demo=1 serves free demo results, else 503.
 *   FACILITATOR_URL — optional facilitator base URL. Default
 *                     https://x402.org/facilitator (TESTNET-ONLY — see README).
 */

const FACILITATOR_DEFAULT = "https://x402.org/facilitator";
const FACILITATOR_TIMEOUT_MS = 10000;
const UPSTREAM_TIMEOUT_MS = 30000;

const NETWORK = "base"; // x402 v1 network id for Base mainnet (chain id 8453)
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // native USDC, 6 decimals
// EIP-712 domain of the Base-mainnet USDC contract (needed by "exact" scheme signers).
const USDC_EIP712 = { name: "USD Coin", version: "2" };

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

  const requirements = paymentRequirements(endpoint, url.origin, target, env);

  const header = request.headers.get("X-PAYMENT");
  if (!header) return pay402("X-PAYMENT header is required", requirements);

  const paymentPayload = decodePaymentHeader(header);
  if (!paymentPayload) {
    return pay402("Invalid X-PAYMENT header — expected base64-encoded JSON payment payload", requirements);
  }

  // 1) Verify the payment with the facilitator.
  const verify = await facilitatorCall(env, "/verify", paymentPayload, requirements);
  if (verify.unreachable) {
    return json({ error: "Payment facilitator unreachable: " + verify.error }, 502);
  }
  if (!verify.data || verify.data.isValid !== true) {
    const reason =
      (verify.data && (verify.data.invalidReason || verify.data.error)) ||
      "facilitator returned HTTP " + verify.status;
    return pay402("Payment verification failed: " + reason, requirements);
  }

  // 2) Payment is valid — do the actual work.
  const up = await fetchUpstream(endpoint, target);
  if (up.error) {
    // Upstream failed → skip settlement so the caller is not charged.
    console.log("x402: upstream failed, payment NOT settled", endpoint.path, up.status, up.error);
    return json({ error: up.error }, up.status);
  }

  // 3) Settle (broadcast the transfer). Done after the work succeeded so a
  //    failed scan never charges; result is surfaced via X-PAYMENT-RESPONSE.
  const settle = await facilitatorCall(env, "/settle", paymentPayload, requirements);
  const extra = {};
  if (settle.data) {
    extra["X-PAYMENT-RESPONSE"] = b64json(settle.data);
    if (settle.data.success !== true) {
      console.error("x402: settle failed", endpoint.path, JSON.stringify(settle.data).slice(0, 500));
    }
  } else {
    console.error("x402: settle call errored", endpoint.path, settle.error || "HTTP " + settle.status);
  }
  return json(up.data, 200, extra);
}

function paymentRequirements(endpoint, origin, target, env) {
  return {
    scheme: "exact",
    network: NETWORK,
    maxAmountRequired: endpoint.price,
    resource: origin + endpoint.path + "?url=" + encodeURIComponent(target),
    description: endpoint.description,
    mimeType: "application/json",
    outputSchema: null,
    payTo: env.PAYTO_ADDRESS,
    maxTimeoutSeconds: 60,
    asset: USDC_BASE,
    extra: { name: USDC_EIP712.name, version: USDC_EIP712.version },
  };
}

function pay402(error, requirements) {
  return json({ x402Version: 1, error, accepts: [requirements] }, 402);
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

async function facilitatorCall(env, path, paymentPayload, requirements) {
  const base = (env.FACILITATOR_URL || FACILITATOR_DEFAULT).replace(/\/+$/, "");
  try {
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ x402Version: 1, paymentPayload, paymentRequirements: requirements }),
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
  return json(
    {
      x402Version: 1,
      name: "x402 payable APIs — agiscorecard",
      description:
        "Pay-per-call scanning APIs for AI agents. No account, no API key: pay $0.005 per call in USDC on Base via the x402 payment-required protocol.",
      network: NETWORK,
      asset: { address: USDC_BASE, symbol: "USDC", decimals: 6, eip712: USDC_EIP712 },
      payToConfigured: Boolean(env.PAYTO_ADDRESS),
      endpoints: ENDPOINTS.map((e) => ({
        path: e.path,
        method: "GET",
        resource: origin + e.path,
        query: { url: "target URL to scan (required)" },
        price: { amount: e.price, asset: "USDC", decimals: 6, usd: e.priceUsd },
        network: NETWORK,
        description: e.description,
        mimeType: "application/json",
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
  "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
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
