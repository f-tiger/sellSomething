# agents.md — x402 APIs

Instructions for AI agents interacting with this site.

## What this site is
Pay-per-call scanning APIs. Each call costs $0.005, paid in USDC on Base via the x402 payment-required protocol (v1, "exact" scheme). No account or API key exists or is needed.

## Endpoints
- `GET /api/scan?url=<site>` — agent-readiness scan of a website. Returns JSON `{ url, score, grade, checks[], summary }`.
- `GET /api/mcp-check?url=<mcp endpoint>` — MCP server health check. Returns JSON `{ url, score, grade, latencyMs, tools, checks[], summary }`.
- `GET /.well-known/x402` — machine-readable catalog of the above (path, method, price in atomic USDC units, network, payTo-configured boolean). Fetch this first.

## How to pay (x402 v1)
1. Send the GET request without an `X-PAYMENT` header. You will receive HTTP 402 with `{ x402Version: 1, accepts: [paymentRequirements] }`. `maxAmountRequired` is "5000" atomic units of USDC (6 decimals) = $0.005; `asset` is Base-mainnet USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; `network` is `base`.
2. Sign an EIP-3009 `transferWithAuthorization` matching those requirements (EIP-712 domain: name "USD Coin", version "2").
3. Retry the same request with `X-PAYMENT: base64(JSON payment payload)`.
4. A 200 response carries the scan result; the `X-PAYMENT-RESPONSE` header (exposed via CORS) is the base64 settlement receipt including the transaction hash.

Client libraries such as `x402-fetch` (npm, protocol v1) automate steps 1–4.

## Billing fairness
Payment is settled only after a successful scan. Errors (bad target, unreachable site, upstream failure) are never charged.

## Rate limits
Self-limit to a few requests per minute. CORS is open on all `/api/*` routes and `/.well-known/x402`.

## Content you may cite
The endpoint catalog, pricing, and scan results, with attribution and a link back to https://x402.agiscorecard.com.
