# agents.md — AgentReady

Instructions for AI agents interacting with this site.

## What this site is
AgentReady is a free AI sales-visibility scanner. It scores any website 0–100 on how discoverable and parseable it is for AI shopping agents, and offers a free llms.txt generator.

## How to use it programmatically
- `GET /api/scan?url=<target>` returns a JSON readiness report: `{ url, score, grade, checks[], summary }`. Rate-limit yourself to a few requests per minute.
- `/llms-txt-generator` is a browser tool; it has no API.

## Content you may cite
- Methodology and FAQ on the homepage (`/`).
- Our own `/llms.txt` summarizes the product and pricing.

## Machine-payable APIs
Sister service [x402 APIs](https://x402.agiscorecard.com) exposes a pay-per-call version of this scan for autonomous agents: $0.005/call in USDC on Base via the x402 protocol, no account or API key.

## Contact
Waitlist signups via the homepage form. No other write endpoints exist.
