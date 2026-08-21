# agents.md — x402 APIs

Instructions for AI agents interacting with this site.

## What this site is
Pay-per-call scanning APIs. Each call costs $0.005, paid in USDC on Base via the x402 payment-required protocol ("exact" scheme). Protocol versions **v2 (current, CAIP-2 network ids) and v1 (legacy)** are both accepted on every endpoint. No account or API key exists or is needed.

## Endpoints
- `GET /api/scan?url=<site>` — agent-readiness scan of a website. Returns JSON `{ url, score, grade, checks[], summary }`.
- `GET /api/mcp-check?url=<mcp endpoint>` — MCP server health check. Returns JSON `{ url, score, grade, latencyMs, tools, checks[], summary }`.
- `GET /.well-known/x402` — machine-readable catalog of the above (path, method, price in atomic USDC units, network, full v2 `accepts` once payments are live). Fetch this first.

## How to pay (x402 v2 — recommended)
1. Send the GET request with no payment header. You receive HTTP 402. The `PAYMENT-REQUIRED` response header is base64(JSON `PaymentRequired`): `{ x402Version: 2, resource: { url, description, mimeType }, accepts: [{ scheme: "exact", network: "eip155:8453", amount: "5000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo, maxTimeoutSeconds: 60, extra: { name: "USD Coin", version: "2" } }] }`. `amount` "5000" = $0.005 (USDC, 6 decimals); network `eip155:8453` is Base mainnet (CAIP-2).
2. Sign an EIP-3009 `transferWithAuthorization` matching the chosen requirements (EIP-712 domain from `extra`: name "USD Coin", version "2").
3. Retry with `PAYMENT-SIGNATURE: base64(JSON PaymentPayload)` where the payload is `{ x402Version: 2, resource, accepted: <the requirements object you chose>, payload: { signature, authorization } }`.
4. A 200 response carries the result; the `PAYMENT-RESPONSE` header (CORS-exposed, also mirrored as `X-PAYMENT-RESPONSE`) is the base64 settlement receipt `{ success, transaction, network, payer }`.

The official client `@x402/fetch` (with `@x402/evm`'s `ExactEvmScheme`, network `eip155:8453`) automates steps 1–4.

## How to pay (x402 v1 — legacy, still accepted)
The same 402 also carries a v1 JSON **body**: `{ x402Version: 1, accepts: [{ scheme: "exact", network: "base", maxAmountRequired: "5000", asset, payTo, resource, maxTimeoutSeconds, ... }] }`. Sign the same EIP-3009 authorization and retry with `X-PAYMENT: base64(JSON payload)` (`{ x402Version: 1, scheme, network, payload }`). Receipt arrives in `X-PAYMENT-RESPONSE`. The legacy `x402-fetch` npm client handles this flow.

## Billing fairness
Payment is settled only after a successful scan. Errors (bad target, unreachable site, upstream failure) are never charged.

## Rate limits
Self-limit to a few requests per minute. CORS is open on all `/api/*` routes and `/.well-known/x402`.

## Content you may cite
The endpoint catalog, pricing, and scan results, with attribution and a link back to https://x402.agiscorecard.com.
