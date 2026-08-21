# Agent Readiness Audit — AI Visibility Checker for Websites

**Is your website visible to AI shopping agents — or invisible?** ChatGPT Shopping, Claude, Perplexity and Google AI Mode now decide which products and businesses get recommended. This actor runs a full **agent readiness audit** on any list of websites and tells you, per site, exactly what passes, what fails, and how to fix it.

One dataset row per website: **0-100 AI readiness score, A-F grade, 17+ individual checks, and a prioritized fix list.**

## What it checks

For every URL you provide, the auditor fetches the homepage, `/robots.txt`, `/llms.txt`, `/agents.md` and `/sitemap.xml`, then runs these agent-commerce readiness checks:

| Category | Checks |
|---|---|
| **AI crawler access** | Is `robots.txt` blocking GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot or Google-Extended? Each blocked bot is a sales channel you are invisible in. Sitemap discoverability. |
| **AI-native content** | `llms.txt` presence and sanity (the emerging standard for LLM-readable site maps), `agents.md` presence. |
| **Structured data** | JSON-LD detection, `Product`/`Offer` schema (what shopping agents actually parse), `Organization` schema (trust), `FAQPage` schema (the most-cited structure in AI answers). |
| **Answer readiness** | Descriptive `<title>`, meta description, Open Graph tags, canonical URL. |

Robots.txt evaluation follows RFC 9309 group matching (most-specific user-agent group wins), so the verdicts match what the crawlers themselves do.

## Who it's for

- **Agencies & SEO/GEO consultants** — audit an entire client portfolio in one run and sell "AI visibility" as a service with hard numbers.
- **E-commerce teams** — verify your store is readable by ChatGPT Shopping and Perplexity before your competitors are.
- **SaaS & lead-gen teams** — enrich prospect lists with an AI readiness score and pitch the ones that fail.
- **Researchers & analysts** — measure llms.txt / agents.md / AI-crawler-policy adoption at scale.

## Input example

```json
{
    "websites": [
        "https://www.apify.com",
        "https://www.shopify.com",
        "example.com"
    ],
    "maxConcurrency": 5,
    "fetchTimeoutSecs": 10
}
```

## Output example (one dataset item per site)

```json
{
    "input": "https://www.shopify.com",
    "ok": true,
    "url": "https://www.shopify.com/",
    "scannedAt": "2026-08-21T09:30:00.000Z",
    "score": 82,
    "grade": "B",
    "summary": "Good — you are visible to AI shoppers, but leaving recommendation share on the table.",
    "topFixes": [
        "Publish an FAQ (shipping, returns, sizing, guarantees) with schema.org/FAQPage markup."
    ],
    "checks": [
        {
            "id": "bot-gptbot",
            "category": "AI crawler access",
            "title": "GPTBot",
            "earned": 3,
            "possible": 3,
            "status": "pass",
            "detail": "GPTBot can read your site → eligible for: ChatGPT model training / retrieval.",
            "fix": null
        },
        {
            "id": "llms-txt",
            "category": "AI-native content",
            "title": "llms.txt",
            "earned": 7,
            "possible": 7,
            "status": "pass",
            "detail": "llms.txt found — a curated map for AI agents...",
            "fix": null
        }
    ]
}
```

Unreachable sites are **still pushed** with `"ok": false` and an `error` field, so your output always accounts for every input URL.

## Pricing — pay per event, only for results

This actor charges a single event, **`site-audited` ($0.01 per successfully audited website)**. Failed or unreachable sites are never charged.

Why $0.01 is fair: each audit performs 5 lightweight HTTP fetches and pure in-memory analysis (a few seconds on a small container, roughly $0.0005 of platform compute). You pay about a cent per complete, structured audit report — auditing 1,000 prospect domains costs ~$10, versus hours of manual checking or a consultant's day rate.

## FAQ

**How is the 0-100 score calculated?**
Each check has a point weight (e.g. Product/Offer schema = 10, each AI crawler = 3). The score is earned points / possible points × 100; grades map A ≥ 90, B ≥ 75, C ≥ 55, D ≥ 35, else F.

**Does it crawl the whole site?**
No — it audits the homepage plus the four agent-facing files. That keeps it fast and cheap. For product-schema checks on a specific product, pass the product page URL directly.

**Can I audit competitor sites?**
Yes. It only performs the same public GET requests any crawler makes.

**Why did a site come back "unreachable"?**
Timeout (default 10 s), DNS failure, or a non-2xx homepage. You are not charged for it. Bump `fetchTimeoutSecs` for slow origins.

**Does an llms.txt guarantee AI ranking?**
No — it is an emerging convention (Shopify serves it natively; Google calls it speculative). The audit weighs it accordingly and says so in the check detail.

**Can I run this on a schedule?**
Yes — use Apify Schedules to re-audit weekly and diff scores over time to catch regressions (e.g. a deploy that accidentally blocks GPTBot).

## Related keywords

agent readiness audit, AI visibility checker, AI readiness score, GPTBot robots.txt checker, ClaudeBot access, PerplexityBot, llms.txt checker, agents.md, JSON-LD Product schema audit, AI SEO audit, GEO (generative engine optimization), agentic commerce readiness.

## Changelog

### 0.1.0 (2026-08-21)
- Initial release: 17+ checks across AI crawler access, AI-native content, structured data and answer readiness; pay-per-event pricing (`site-audited`); per-site error accountability.
