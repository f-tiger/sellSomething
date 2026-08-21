# llms.txt Parser — Extract llms.txt, agents.md & AI Crawler Policies at Scale

**The AI-agent policy layer of the web is forming right now — and nobody has structured data on it.** This actor is a bulk **llms.txt parser and AI crawler policy extractor**: give it a list of domains and it fetches `/llms.txt`, `/agents.md`, `/ai.txt` and `/robots.txt`, then parses everything into clean, structured JSON — one dataset item per domain.

Use it as a data source for AI-agent ecosystem analysis: llms.txt adoption studies, AI-bot blocking trends, lead lists of AI-ready (or AI-invisible) companies, or training-data policy research.

## What it extracts

| File | Structured output |
|---|---|
| **`/llms.txt`** | Title (H1), summary (blockquote), intro text, every section (H2/H3) with its `[title](url): notes` link list, total link count. Follows the llmstxt.org convention. |
| **`/agents.md`** | Presence, byte size, heading outline (up to 20), excerpt. |
| **`/ai.txt`** | Presence, robots-style directive groups when present (Spawning.ai convention), excerpt. |
| **`/robots.txt`** | Per-AI-bot allow/deny verdict for **16 AI crawlers** — GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-SearchBot, anthropic-ai, PerplexityBot, Perplexity-User, Google-Extended, Applebot-Extended, Bytespider, CCBot, meta-externalagent, Amazonbot, DuckAssistBot — with the matched rule group (specific vs wildcard, RFC 9309 most-specific matching), Allow/Disallow paths, crawl-delay, plus declared sitemaps. |

Every item also carries a compact **`signals`** block (`hasLlmsTxt`, `aiBotsBlocked`, `aiPolicyStance: open/selective/blocking`, `aiReadinessLevel`) so you can filter and pivot thousands of domains without touching the nested detail.

SPA false positives are handled: a 200 response that is actually the site's HTML shell does **not** count as a found llms.txt.

## Who it's for

- **Researchers & data journalists** — measure llms.txt / agents.md adoption and AI-bot blocking across industries over time.
- **GEO / AI-SEO agencies** — build prospect lists: domains with `aiReadinessLevel: "none"` are your pipeline.
- **AI companies & crawler operators** — know which publishers allow or block your bot before you crawl.
- **Dataset builders** — a structured corpus of curated llms.txt links is a high-signal seed list for vertical crawls.

## Input example

```json
{
    "domains": ["anthropic.com", "vercel.com", "stripe.com"],
    "maxConcurrency": 5,
    "fetchTimeoutSecs": 10,
    "includeRawContent": false
}
```

## Output example (one dataset item per domain)

```json
{
    "input": "vercel.com",
    "ok": true,
    "domain": "vercel.com",
    "origin": "https://vercel.com",
    "fetchedAt": "2026-08-21T09:30:00.000Z",
    "llmsTxt": {
        "found": true,
        "url": "https://vercel.com/llms.txt",
        "bytes": 4812,
        "title": "Vercel",
        "summary": "Vercel is the platform for frontend developers...",
        "sectionCount": 3,
        "linkCount": 42,
        "sections": [
            {
                "name": "Docs",
                "links": [
                    { "title": "Getting Started", "url": "https://vercel.com/docs/getting-started", "notes": "Deploy your first app" }
                ],
                "notes": ""
            }
        ]
    },
    "agentsMd": { "found": false, "url": "https://vercel.com/agents.md", "status": 404, "bytes": 0 },
    "aiTxt": { "found": false, "url": "https://vercel.com/ai.txt", "status": 404, "bytes": 0 },
    "robotsTxt": {
        "found": true,
        "sitemaps": ["https://vercel.com/sitemap.xml"],
        "aiBots": [
            {
                "bot": "GPTBot",
                "operator": "OpenAI",
                "purpose": "model training / retrieval",
                "allowed": true,
                "matchedBy": "wildcard group (*)",
                "allow": [],
                "disallow": ["/api/"],
                "crawlDelay": null
            }
        ]
    },
    "signals": {
        "hasLlmsTxt": true,
        "hasAgentsMd": false,
        "hasAiTxt": false,
        "hasRobotsTxt": true,
        "aiBotsAllowed": 16,
        "aiBotsBlocked": 0,
        "aiPolicyStance": "open",
        "aiReadinessLevel": "basic"
    }
}
```

Unreachable domains are **still pushed** with `"ok": false` and an `error` field — every input domain is accounted for.

## Pricing — pay per event, only for data

This actor charges a single event, **`domain-extracted` ($0.005 per successfully reached domain)**. Domains that fail at the network level (DNS, timeout, connection refused on all four paths) are never charged.

Note: a reachable domain that has *none* of the files **is** charged — "this domain has no llms.txt and blocks 5 AI bots" is exactly the data point adoption studies and lead lists pay for.

Why $0.005 is fair: 4 small text fetches and pure parsing per domain (well under $0.0003 of platform compute). A 10,000-domain ecosystem sweep costs $50 and finishes in well under an hour — versus building and hosting your own fetch-and-parse pipeline.

## FAQ

**How is the per-bot allow/deny decided?**
RFC 9309 group matching, the same way crawlers do it: the most specific matching `User-agent` group wins over the `*` wildcard; a root `Disallow: /` in the winning group means blocked. The matched group and its raw Allow/Disallow paths are included so you can apply your own path-level logic.

**What about subdomains like docs.example.com?**
llms.txt files often live on docs subdomains. Pass the exact host you care about — `docs.stripe.com` and `stripe.com` are separate data points.

**Can I get the raw file contents too?**
Yes — set `includeRawContent: true` to include the raw text (up to 500 KB per file) alongside the parsed fields.

**Is this legal to run?**
It fetches four public, policy-declaration files per domain — the very files sites publish *for* automated readers. No content scraping, no paywalls, no personal data.

**How do I track adoption over time?**
Run it on a weekly Apify Schedule with the same domain list and diff the `signals` block between runs.

## Related keywords

llms.txt parser, llms.txt extractor, agents.md, ai.txt, robots.txt AI bots, GPTBot blocking statistics, ClaudeBot robots.txt, PerplexityBot allow deny, CCBot Common Crawl policy, AI crawler directives dataset, AI agent ecosystem analysis, llms.txt adoption.

## Changelog

### 0.1.0 (2026-08-21)
- Initial release: llms.txt section/link parsing, agents.md outline, ai.txt directives, robots.txt verdicts for 16 AI crawlers with RFC 9309 matching, adoption signals; pay-per-event pricing (`domain-extracted`).
