# Superteam Earn agent pipeline

Precision-over-volume pipeline for winning USDC bounties on [Superteam Earn](https://superteam.fun/earn)
via its official Agent API. Build/scout/draft only — **submission is always a
deliberate human-reviewed step**, never automated.

API contract verified 2026-08-21 against the open-source app
([SuperteamDAO/earn](https://github.com/SuperteamDAO/earn), `public/skill.md`
v0.5.1 + `src/pages/api/agents/*`). Re-check <https://superteam.fun/skill.md>
before the one-time registration; the spec is versioned.

## Files

| File | Purpose |
|---|---|
| `register.mjs` | One-time `POST /api/agents` (with `--yes`). Prints `apiKey` + `claimCode` to stdout only. |
| `scout.mjs` | Fetches live agent-eligible listings, filters + scores against our asset profile, writes `out/matches.{json,md}`. |
| `draft.mjs` | Scaffolds `out/draft-<id>.md` for one match. Real content is authored by Claude in-session. |
| `lib.mjs` | Shared fetch/config helpers. |
| `../../.github/workflows/superteam-scout.yml` | Weekly scout (Mon 02:00 UTC) + manual dispatch; uploads `matches.md` artifact; no-op success without the secret. |

`out/` is generated output — do not commit it (see `.gitignore` here).

## The zero-KYC path (why we filter sponsors)

- Listings sponsored by **external companies** pay winners in USDC directly to
  the Solana wallet on the claimed talent profile — **no KYC**.
- Listings where **Superteam or the Solana Foundation** pays (sponsor name
  matches, or `isFndnPaying=true` on the details endpoint) **require KYC** —
  `scout.mjs` filters these OUT unconditionally.
- We also skip: non-stable-token rewards, rewards < $100, deadlines < 3 days
  out, region-restricted listings, and anything scoring below the keyword
  threshold.

## One-time human steps

1. `node scripts/superteam/register.mjs --yes` (from a network that can reach
   superteam.fun; the CC sandbox egress-blocks it). Copy the output immediately.
2. Store the `apiKey`: `gh secret set SUPERTEAM_API_KEY` — never in the repo.
3. Keep the `claimCode` private. Before (or right after) the first win, a human
   signs in at `https://superteam.fun/earn/claim/<claimCode>`, completes the
   talent profile **including a Solana wallet**, and confirms the claim. That
   wallet receives all payouts.
4. For `project`-type listings a human operator Telegram URL
   (`http://t.me/<username>`) is required in the submission payload.

## Workflow

```
node scripts/superteam/scout.mjs          # or wait for the Monday CI artifact
# read out/matches.md, pick at most the top 1–2
node scripts/superteam/draft.mjs <id>
# Claude authors the actual deliverable in-session against the listing brief
# human reviews draft-<id>.md + the live deliverable
# human (or supervised session) POSTs /api/agents/submissions/create manually
```

## Anti-spray policy (hard rules)

Superteam bans accounts that spam low-quality submissions, and one agent
identity is all we have.

- **Max 2 submissions per week**, total, across all listings.
- Only submit matches with **score >= the threshold in `scout.mjs`** (currently 6).
  Never lower the threshold to manufacture a match.
- Every submission ships a **working deliverable at a live link** — no
  "proposal-only" submissions to bounty-type listings.
- No plagiarism, no looking at other submissions (code-of-conduct
  disqualification), no X/Twitter links we don't control.
- Rate limits for reference: 60 submissions/hour/agent (we will never get near
  this — the constraint is quality, not throughput).

## Honest expected value

From our competitive research: **$0–1,500/月, 高方差**. Most weeks the scout
finds zero listings clearing the bar; agent-eligible listings are still few and
strong matches (MCP/x402/agent-readiness/scraping) are episodic. Treat wins as
upside and proof-of-capability for AgentFront marketing, not as baseline
revenue. Kill criterion: if 8+ weeks pass with 0 matches scoring above
threshold, stop the cron and revisit whether the listing supply changed.
