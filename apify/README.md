# Apify Actors — publish runbook

Three pay-per-event (PPE) actors live here, built as vertical niches for the AI-agent ecosystem (deliberately *not* head-to-head with the big generic scrapers):

| Directory | Actor | Charged event | Suggested price |
|---|---|---|---|
| `agent-readiness-auditor/` | Agent Readiness Auditor — AI visibility checker | `site-audited` | $0.01 |
| `mcp-server-health-checker/` | MCP Server Health Checker & Monitor | `server-checked` | $0.008 |
| `llms-txt-extractor/` | llms.txt Extractor & AI crawler policy parser | `domain-extracted` | $0.005 |

All three are plain Node 20 + `apify` SDK v3, no browsers, no third-party deps — cheap to run, fast to build.

## 1. Prerequisites

```bash
npm install -g apify-cli
apify login        # paste the API token from https://console.apify.com/settings/integrations
```

## 2. Local smoke test (optional but recommended)

```bash
cd apify/agent-readiness-auditor
npm install
apify run --purge -i '{"websites": ["https://www.apify.com"]}'
# inspect ./storage/datasets/default/*.json
```

Same pattern for the other two (`-i '{"serverUrls": ["https://mcp.deepwiki.com/mcp"]}'` and `-i '{"domains": ["anthropic.com"]}'`). `Actor.charge()` no-ops locally, so PPE code paths are safe to test offline.

Validate the input schemas before pushing:

```bash
apify validate-schema .actor/input_schema.json
```

## 3. Push each actor

```bash
cd apify/agent-readiness-auditor   && apify push
cd ../mcp-server-health-checker    && apify push
cd ../llms-txt-extractor           && apify push
```

`apify push` builds the Docker image from `.actor/Dockerfile` and creates/updates the actor under your account. The actor name in `.actor/actor.json` determines the actor ID (`<username>/<name>`).

## 4. Enable PPE monetization (Apify Console)

For each actor, in the Console:

1. Actor → **Publication** tab → fill in categories, and set **SEO title / SEO description** (values are pre-written in each `.actor/actor.json` as `seoTitle`/`seoDescription` — copy them if the CLI/platform version doesn't sync them automatically). The Store search weights these fields heavily.
2. **Monetization** → *Set up monetization* → choose **Pay per event**. **Never choose the rental (monthly subscription) model — Apify retired rental pricing in October 2026; rental actors were forcibly migrated and new ones are rejected.**
3. Define the events exactly as in the actor's `.actor/pay_per_event.json` (event name, title, description, price). The event **name must match** the `eventName` the code passes to `Actor.charge()` — `site-audited`, `server-checked`, `domain-extracted` respectively — or nothing gets billed.
4. Publish to the Store.

Price changes for existing paid actors take 14 days to apply to existing users — get the price right before launch.

### PPE pricing rationale (must cover compute)

Developer payout under PPE is `(revenue − platform usage costs) × 0.8`, so every event price must comfortably exceed the compute it triggers. All three actors do only a handful of HTTP fetches + in-memory parsing per result on a small (≤1 GB) container:

- ~2–5 s per result at ≤1 GB ≈ **$0.0003–0.001 platform cost per event**
- Suggested prices ($0.005–0.01) are 5–20× compute → margin is safe even with slow origins and retries.
- If Apify's per-run overhead changes, keep every event ≥ $0.005; never price below $0.002.

## 5. Survival-conditions checklist (verify before and after publish)

- [ ] **Vertical niche, not head-to-head**: these audit/monitor/parse the *AI-agent policy layer* — none of them competes with generic web scrapers on price or scale.
- [ ] **PPE covers compute**: see rationale above; re-check after any change that adds fetches per result.
- [ ] **SEO fields set**: `seoTitle` + `seoDescription` in Console Publication tab; README H1 carries the primary keyword ("agent readiness audit", "MCP server monitor", "llms.txt parser").
- [ ] **Daily automated tests pass**: Apify runs each published actor daily with its **prefill input**. An actor that fails 3 days straight gets flagged/unpublished. Defenses already built in:
  - prefill inputs point at reliable public endpoints (apify.com, shopify.com, mcp.deepwiki.com, anthropic.com, …);
  - per-item try/catch: one bad URL can never crash a run;
  - per-fetch AbortController timeouts (default 10 s) — no hung runs;
  - the run **succeeds even if individual items fail** (failures become dataset items with an `error` field);
  - the run only fails on genuinely invalid input (empty URL list).
  If a prefill endpoint ever dies (e.g. DeepWiki shuts down), swap the prefill URL and `apify push` again the same day.
- [ ] **Accountability**: every input URL/domain produces exactly one dataset item, success or failure; failures are never charged.

## 6. After publish

- Add a 200×200+ actor icon and a demo video/GIF in Publication settings (Store ranking rewards completeness).
- Watch the first week of runs in Console → Monitoring: charge events vs. dataset items should track 1:1 for successful items.
- Bump `version` in `.actor/actor.json` and the README changelog on every functional change; `apify push` re-publishes.
