#!/usr/bin/env node
// draft.mjs — scaffold a submission draft for one scouted listing.
//
// Usage:  node scripts/superteam/draft.mjs <listing-id-or-slug>
// Input:  scripts/superteam/out/matches.json  (run scout.mjs first)
// Output: scripts/superteam/out/draft-<id>.md
//
// This emits a SCAFFOLD only. The actual work product must be produced by
// Claude in-session against the real listing brief — never templated.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OUT_DIR, ensureOutDir } from './lib.mjs';

const ASSETS = [
  { name: 'AgentReady — AI sales visibility scanner (live /api/scan)', url: 'https://agentready.agiscorecard.com' },
  { name: 'MCPPulse — MCP ecosystem tracker', url: 'https://mcppulse.agiscorecard.com' },
  { name: 'x402 — HTTP 402 machine-payments demo on Cloudflare Workers', url: 'https://x402.agiscorecard.com' },
  { name: 'SellToAgents — ACP/UCP/MCP/llms.txt merchant guides', url: 'https://selltoagents.agiscorecard.com' },
  { name: 'GitHub repo (multi-site Worker fleet, CI deploys)', url: 'https://github.com/f-tiger/sellSomething' },
];

async function main() {
  const key = process.argv[2];
  if (!key) {
    console.error('Usage: node scripts/superteam/draft.mjs <listing-id-or-slug>');
    console.error('Run scout.mjs first, then pick an id from out/matches.json.');
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(await readFile(join(OUT_DIR, 'matches.json'), 'utf8'));
  } catch (err) {
    console.error(`Could not read ${join(OUT_DIR, 'matches.json')}: ${err.message}`);
    console.error('Run: node scripts/superteam/scout.mjs');
    process.exit(1);
  }

  const m = parsed.matches.find((x) => x.id === key || x.slug === key);
  if (!m) {
    console.error(`No match with id or slug "${key}" in matches.json. Available:`);
    for (const x of parsed.matches) console.error(`  ${x.id}  ${x.slug}`);
    process.exit(1);
  }

  const lines = [
    `<!--`,
    `  SUBMISSION DRAFT SCAFFOLD — NOT a finished submission.`,
    `  The actual deliverable and all prose below the "Work product" heading must be`,
    `  produced by Claude in-session against the real listing brief (${m.url}).`,
    `  Do NOT submit templated boilerplate — quality bar: would a human reviewer`,
    `  shortlist this without knowing an agent wrote it?`,
    `-->`,
    ``,
    `# Draft: ${m.title}`,
    ``,
    `- Listing: ${m.url}`,
    `- Listing id: \`${m.id}\` (needed for POST /api/agents/submissions/create)`,
    `- Sponsor: ${m.sponsor} · Reward: $${m.rewardUsd} ${m.token} · Deadline: ${m.deadline} (${m.daysLeft}d left)`,
    `- Type/access: ${m.type} / ${m.agentAccess} · Score: ${m.score} (${m.categories.join('; ')})`,
    `- Proposed angle: ${m.angle ?? 'TBD'}`,
    ``,
    `## Relevant assets to cite`,
    ``,
    ...ASSETS.map((a) => `- [${a.name}](${a.url})`),
    ``,
    `## Work product (author in-session — replace everything below)`,
    ``,
    `1. **Read the full listing brief** (description, requirements, judging criteria) — fetch`,
    `   \`GET /api/agents/listings/details/${m.slug}\` or open ${m.url}.`,
    `2. **Deliverable**: <what we will actually build/write — must directly satisfy the brief>`,
    `3. **Proof of work**: <live URL / repo / demo — prefer something running on our Workers infra>`,
    `4. **otherInfo text** (goes in the submission payload): <2–5 tight paragraphs: what it is,`,
    `   how it works, why it is useful to the sponsor. No filler.>`,
    ``,
    `## Eligibility questions to answer`,
    ``,
    ...(m.eligibilityQuestions?.length
      ? m.eligibilityQuestions.map((q) => `- [ ] ${typeof q === 'string' ? q : JSON.stringify(q)}: <answer>`)
      : ['- (none found on the listing — re-check the details endpoint before submitting)']),
    ``,
    `## Pre-submission checklist`,
    ``,
    `- [ ] Work is original — no reuse of other submissions (plagiarism = disqualification per Earn code of conduct)`,
    `- [ ] Every explicit listing requirement is addressed, point by point`,
    `- [ ] \`link\` points to a live, working deliverable (not a doc about a future deliverable)`,
    `- [ ] Sponsor is external (not Superteam / Solana Foundation) — no-KYC payout path confirmed`,
    `- [ ] ${m.type === 'project' ? 'REQUIRED: `telegram` (human operator, http://t.me/<username> format) included' : '`telegram` optional for this listing type; include if we want contactability'}`,
    `- [ ] compensationType is \`${m.compensationType}\`${m.compensationType !== 'fixed' ? ' — REQUIRED: set `ask` (our quote) in the payload' : ' — `ask` stays null'}`,
    `- [ ] Anti-spray policy respected: ≤ 2 submissions this week, score ≥ threshold (see README.md)`,
    ``,
    `## Submission payload skeleton`,
    ``,
    '```json',
    JSON.stringify(
      {
        listingId: m.id,
        link: '<live deliverable URL>',
        tweet: '',
        otherInfo: '<authored in-session>',
        eligibilityAnswers: (m.eligibilityQuestions ?? []).map((q) => ({
          question: typeof q === 'string' ? q : (q.question ?? String(q)),
          answer: '<answer>',
        })),
        ask: m.compensationType === 'fixed' ? null : '<numeric quote — required for range/variable comp>',
        telegram: m.type === 'project' ? 'http://t.me/<human-operator>' : '',
      },
      null,
      2,
    ),
    '```',
    ``,
    `Submit with: \`curl -X POST "$SUPERTEAM_BASE_URL/api/agents/submissions/create" -H "Authorization: Bearer $SUPERTEAM_API_KEY" -H "Content-Type: application/json" -d @payload.json\``,
    `(Manual step, deliberately not scripted — a human reviews the finished draft first.)`,
    ``,
  ];

  const outDir = await ensureOutDir();
  const file = join(outDir, `draft-${m.id}.md`);
  await writeFile(file, lines.join('\n'));
  console.log(`Wrote ${file}`);
  console.log('Now author the actual work product in-session before any submission.');
}

main().catch((err) => {
  console.error('draft.mjs failed:', err);
  process.exit(1);
});
