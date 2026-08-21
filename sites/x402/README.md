# x402 — pay-per-call APIs for AI agents

Worker for **x402.agiscorecard.com**. Serves the family's scanners and datasets as x402-payable endpoints — agents pay **$0.005–$0.02/call in USDC on Base**, no account, no API key. All six payable endpoints live in one `ENDPOINTS` table in `src/worker.js` (`{path, price, description, validate, work}`); the 402 challenges, the `/.well-known/x402` catalog and the landing page's endpoint cards all derive from that single table:

| Endpoint | Work | Price |
|---|---|---|
| `GET /api/scan?url=<site>` | proxy → agentready.agiscorecard.com/api/scan | $0.005 (`"5000"` atomic USDC) |
| `GET /api/mcp-check?url=<mcp>` | proxy → mcppulse.agiscorecard.com/api/scan | $0.005 |
| `GET /api/wellknown?url=<site>` | proxy → tools.agiscorecard.com/api/wellknown | $0.005 |
| `GET /api/llms-extract?url=<site>` | inline: llms.txt/agents.md/ai.txt/robots.txt fetch + parse (SSRF-guarded, ported from apify/llms-txt-extractor) | $0.005 |
| `GET /api/scan-batch?urls=<a,b,c>` | ≤5 concurrent agentready scans (>5 → free 400 before any challenge) | $0.02 (`"20000"`) |
| `GET /api/mcp-index` | proxy → mcppulse.agiscorecard.com/data/mcp-index.json (free weekly summary on mcppulse) | $0.01 (`"10000"`) |
| `GET /.well-known/x402` | — | free (machine-readable catalog) |

Protocol: **x402 v2 + v1 (dual)**, `exact` scheme (EIP-3009 USDC `transferWithAuthorization`), implemented manually in `src/worker.js` — no SDK dependencies. Every 402 challenge is emitted in both versions simultaneously: the **v2** `PaymentRequired` (CAIP-2 network `eip155:8453`, `amount` field) goes base64-encoded into the `PAYMENT-REQUIRED` response header per `specs/transports-v2/http.md`, while the response **body** carries the **v1** JSON (`{x402Version:1, accepts:[…]}`, network `base`, `maxAmountRequired`) per `specs/transports-v1/http.md` — exactly the fallback order the official `@x402/fetch` client implements (header first, then v1 body). Incoming payments are read from `PAYMENT-SIGNATURE` (v2) or `X-PAYMENT` (v1). Payment is **settled only after a successful scan**; failed scans are never charged. The settle receipt is returned base64-encoded in both the `PAYMENT-RESPONSE` (v2) and `X-PAYMENT-RESPONSE` (v1) headers (CORS-exposed, identical bytes).

Deploys like every other site in this repo: push to the default branch, CI runs wrangler for `sites/x402` (once wired in `.github/workflows/deploy.yml`).

## Setup runbook

### 1. Generate a receiving wallet (Base)

The server only ever needs the **public address**. The private key stays offline — it is the key that can *spend* the USDC you earn.

Recommended options (this repo has a no-npm-deps policy, and Node's built-in `node:crypto` has no reliable Keccak-256, which Ethereum address derivation requires — so no wallet-generation script ships here; use a proper tool):

- **Foundry `cast`** (offline, auditable):
  ```sh
  # install: curl -L https://foundry.paradigm.xyz | bash && foundryup
  cast wallet new
  # → prints a new private key + address. Run on a trusted machine,
  #   store the private key in a password manager / hardware wallet.
  ```
- **Coinbase Wallet / any EVM wallet app** — create a wallet, copy its `0x…` address. Base is an EVM chain: a standard Ethereum address works as-is.
- For non-trivial revenue, prefer a **hardware wallet** address, or sweep periodically from the hot receiving address to cold storage.

Sanity check before going live: send yourself ~$1 of USDC on Base and confirm it arrives at the address you configured.

**Never** put the private key in `wrangler.jsonc`, Worker secrets, or this repo. The Worker cannot spend funds and does not need to — x402 settlement is signed by the *payer*.

### 2. Configure `PAYTO_ADDRESS`

The address is public information, so either mechanism is fine:

```sh
# as a secret (kept out of git):
npx wrangler secret put PAYTO_ADDRESS --name x402
# or as a plain var: uncomment "vars" in wrangler.jsonc and commit the address.
```

Until `PAYTO_ADDRESS` is set the site is safely deployable: paid endpoints return `503 {"error":"x402 not configured yet"}`, except with `?demo=1`, which returns the real scan wrapped in `{"demo":true,"note":"payments not configured"}` for free.

### 3. Choose a facilitator (`FACILITATOR_URL`) — **required for mainnet**

The facilitator verifies the signed payment (`POST /verify`) and broadcasts it on-chain (`POST /settle`). This Worker defaults to `https://x402.org/facilitator`, **but that default is testnet-only**. Verified against the official x402 docs (coinbase/x402 `docs/getting-started/quickstart-for-sellers.mdx`):

> "For testing, use `https://x402.org/facilitator` which works on Base Sepolia and Solana devnet."

So for real USDC on Base mainnet you **must** set `FACILITATOR_URL` to a production facilitator. Options named in the official docs:

- **Coinbase CDP**: `https://api.cdp.coinbase.com/platform/v2/x402` — the reference production facilitator (fee-free for Base USDC at the time of writing), named as the mainnet example in the official quickstart (`docs/getting-started/quickstart-for-sellers.mdx`). Historically its `/settle` required CDP API keys sent as auth headers; **this Worker sends no auth headers**, so verify current requirements in the CDP docs before choosing it, or extend `facilitatorCall()` if keys are needed.
- **PayAI**: `https://facilitator.payai.network` — community production facilitator, listed alongside CDP in the same quickstart (it also runs its own Bazaar at `…/discovery/resources`).
- Note: the coinbase/x402 repo's Go v2 examples also use `https://facilitator.x402.org` as the SDK-default facilitator host (same operator as `x402.org/facilitator`); treat it as testnet/dev unless the ecosystem page says otherwise.
- Full live list: https://www.x402.org/ecosystem?filter=facilitators

```sh
npx wrangler secret put FACILITATOR_URL --name x402   # or a plain var
```

**Version note (verified against coinbase/x402 `specs/`, 2026-08-21):** this Worker now speaks **both** protocol versions. v2 (`specs/x402-specification-v2.md`) is current: CAIP-2 network ids (`eip155:8453` = Base mainnet), `amount` instead of `maxAmountRequired`, resource metadata moved to a top-level `resource` object, and the HTTP headers `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE` (`specs/transports-v2/http.md`). v1 is frozen-but-supported (the legacy `x402-fetch` client still works). The facilitator `/verify` & `/settle` **request body shape is identical in both versions** — `{ x402Version, paymentPayload, paymentRequirements }` — with `x402Version` echoing the client payload's version, and the response shapes (`isValid`/`invalidReason`, `success`/`errorReason`/`transaction`/`network`/`payer`) are shared too; only the `paymentRequirements`/`paymentPayload` internals differ. The Worker sends each payment to the facilitator in the version the client used. **Caveat:** a facilitator deployment may support only one version; if your chosen facilitator rejects v1 traffic, point legacy clients elsewhere via the optional `FACILITATOR_URL_V1` env var (falls back to `FACILITATOR_URL`).

Testnet dry-run: temporarily set `NETWORK_V1 = "base-sepolia"`, `NETWORK_V2 = "eip155:84532"` and `USDC_BASE = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"` (Base Sepolia USDC, EIP-712 name `"USDC"` — note the mainnet contract's name is `"USD Coin"`, so also flip `USDC_EIP712.name`) in `src/worker.js`, keep the default facilitator, and pay with faucet USDC via `@x402/fetch`.

### 4. Verify end-to-end

```sh
# price quote (no payment) — one 402, two protocol versions:
curl -i "https://x402.agiscorecard.com/api/scan?url=example.com"
#   → 402; header `payment-required:` = base64 v2 PaymentRequired (eip155:8453),
#     body = v1 JSON {x402Version:1, accepts:[…]}
curl -s "https://x402.agiscorecard.com/.well-known/x402"                # → catalog, payToConfigured:true
# paid call: use the @x402/fetch snippet on the landing page with a wallet
# holding a few cents of Base USDC; expect 200 + PAYMENT-RESPONSE (and mirrored
# X-PAYMENT-RESPONSE) headers, then the USDC arriving at PAYTO_ADDRESS
# (check basescan.org).
```

### 5. Get discovered

- **x402 Bazaar** (CDP's discovery layer, `GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources`): resources are cataloged via facilitator-side registration — when using the CDP facilitator, enable the `bazaar` discovery extension / `discoverable: true` metadata per https://docs.cdp.coinbase.com (the Bazaar indexes services registered through the respective facilitator; PayAI runs its own at `https://facilitator.payai.network/discovery/resources`).
- **Agent marketplaces** (agent.market and similar x402 directories): submit `https://x402.agiscorecard.com/.well-known/x402` — the catalog route was designed to be pasted into listing forms.
- The landing page, `llms.txt` and `agents.md` already document the payment flow for crawling agents.

### 6. 中国大陆合规提示（重要，须自行评估）

本站收款方式为链上 USDC（稳定币）。根据 2026 年 2 月前后中国大陆关于虚拟货币与稳定币业务的监管规定，境内主体经营性收取加密货币可能被认定为非法金融活动，相关风险包括但不限于：收款、兑换、结汇环节的合规风险与银行账户风险。**上线收款前请自行评估**：运营主体注册地、收款钱包归属、USDC 变现路径（境外交易所/OTC 均有各自风险）、以及是否需要通过境外主体运营本产品。本 README 不构成法律意见；如有疑问请咨询专业律师。在完成评估前，可保持 `PAYTO_ADDRESS` 未设置——站点照常上线，仅 `?demo=1` 提供免费演示结果。

## Files

```
sites/x402/
├── wrangler.jsonc        # name "x402", route x402.agiscorecard.com, assets binding
├── src/worker.js         # x402 v2+v1 gateway: dual 402 challenge → /verify → scan → /settle
├── public/
│   ├── index.html        # landing page (humans + agents): prices, curl/@x402/fetch examples (+ legacy v1 note)
│   ├── llms.txt          # AI-crawler summary
│   ├── agents.md         # machine instructions incl. full payment walkthrough
│   ├── robots.txt        # allow all + AI crawlers, sitemap ref
│   ├── sitemap.xml
│   └── 404.html
└── README.md             # this runbook
```

Env vars: `PAYTO_ADDRESS` (required to charge), `FACILITATOR_URL` (required for mainnet; defaults to the testnet-only x402.org facilitator), `FACILITATOR_URL_V1` (optional; separate facilitator for legacy v1 payments if your main facilitator is v2-only — falls back to `FACILITATOR_URL`).
