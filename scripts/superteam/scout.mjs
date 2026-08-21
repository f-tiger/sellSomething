#!/usr/bin/env node
// scout.mjs — find Superteam Earn listings worth an agent submission.
//
// Usage:   node scripts/superteam/scout.mjs
// Env:     SUPERTEAM_API_KEY   agent bearer key (from register.mjs). Optional:
//                              without it we fall back to the PUBLIC listings
//                              endpoint (same JSON shape, no auth).
//          SUPERTEAM_BASE_URL  override https://superteam.fun
//
// Output:  scripts/superteam/out/matches.json + matches.md
//
// API contract (verified against SuperteamDAO/earn @ main, 2026-08-21):
//   GET /api/agents/listings/live?take=50&deadline=<ISO>   (Bearer auth)
//   GET /api/listings/live?take=50&deadline=<ISO>          (public, same select)
//   GET /api/agents/listings/details/<slug>                (Bearer auth)
//   GET /api/listings/details/<slug>                       (public; adds
//       description, skills, eligibility, region, isFndnPaying, sponsor.entityName)
// List items: { id, title, slug, type, token, rewardAmount, deadline,
//   compensationType, minRewardAsk, maxRewardAsk, agentAccess, status, isPro,
//   _count: { Comments, Submission }, sponsor: { name, slug, logo, isVerified } }
// TODO-VERIFY: the public /api/listings/live feed may omit AGENT_ONLY listings
// (skill.md: "AGENT_ONLY listings are hidden from normal listing feeds") — the
// authenticated agent endpoint is the complete source.

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  API_KEY,
  BASE_URL,
  authHeaders,
  daysUntil,
  ensureOutDir,
  fetchJson,
  sleep,
} from './lib.mjs';

// ---------------------------------------------------------------------------
// CONFIG — weighted profile of our assets. Precision over volume.
// ---------------------------------------------------------------------------
const CONFIG = {
  minUsd: 100, // minimum USD-stable reward
  minDaysToDeadline: 3, // skip listings closing too soon to do quality work
  scoreThreshold: 6, // minimum weighted score to count as a match
  enrichLimit: 15, // fetch full details for at most N pre-filtered listings
  enrichDelayMs: 800, // politeness delay between detail fetches
  take: 50, // max listings per live fetch (server cap is 50)
  stableTokens: ['USDC', 'USDT', 'USD'], // rewards we count at face value
  allowedRegions: ['GLOBAL'], // precision: skip country-restricted listings
  // KYC avoidance: Superteam- / Solana-Foundation-sponsored listings require
  // KYC for payout; externally-sponsored ones pay USDC to the claimed wallet
  // without KYC. `isFndnPaying` (details endpoint) marks Foundation-paid too.
  kycSponsorPattern: /superteam|solana\s*foundation/i,

  // Weighted keyword profile. Each category: weight per keyword hit (a keyword
  // counts once), plus the deliverable angle we would pitch.
  profile: [
    {
      category: 'agent-readiness / AI visibility',
      weight: 5,
      keywords: ['agent readiness', 'agent-readiness', 'ai visibility', 'ai crawler', 'llms.txt', 'llms txt', 'ai seo', 'geo optimization', 'answer engine'],
      angle: 'Ship a working audit/report powered by our AgentReady scanner (agentready.agiscorecard.com /api/scan) — live tool, not a mockup.',
    },
    {
      category: 'MCP tooling',
      weight: 5,
      keywords: ['mcp', 'model context protocol', 'mcp server', 'claude skill', 'agent skill', 'tool use'],
      angle: 'Build/extend an MCP server; cite MCPPulse (mcppulse.agiscorecard.com) and our MCP index as proof of domain depth.',
    },
    {
      category: 'agentic commerce',
      weight: 5,
      keywords: ['agentic commerce', 'acp', 'agentic checkout', 'ai shopping', 'ai commerce', 'commerce agent', 'ucp'],
      angle: 'Lean on SellToAgents guides + AgentFront positioning: practical merchant-side integration writeup or working demo.',
    },
    {
      category: 'x402 / payments',
      weight: 5,
      keywords: ['x402', 'http 402', 'micropayment', 'micropayments', 'pay-per-call', 'machine payments', 'agent payments'],
      angle: 'Working x402 demo on Cloudflare Workers (we run x402.agiscorecard.com); real paid-endpoint integration.',
    },
    {
      category: 'Cloudflare Workers / edge',
      weight: 3,
      keywords: ['cloudflare', 'workers', 'serverless', 'edge function', 'wrangler'],
      angle: 'We deploy a multi-site Worker fleet from one repo with CI; can ship production-grade Worker code fast.',
    },
    {
      category: 'scraping / data analysis',
      weight: 3,
      keywords: ['scrape', 'scraping', 'crawl', 'crawler', 'data extraction', 'dataset', 'dashboard', 'directory', 'index', 'analysis'],
      angle: 'Automated collection + scoring pipeline (same stack as our visibility index builder) with a published dashboard.',
    },
    {
      category: 'technical content',
      weight: 2,
      keywords: ['deep dive', 'tutorial', 'guide', 'technical article', 'research report', 'documentation', 'writeup'],
      angle: 'Only if the topic overlaps a category above — original hands-on content backed by our live tools.',
    },
  ],
  // Hard negatives: listing is about work we should not spray into.
  negativeKeywords: ['design a logo', 'video', 'meme', 'translation', 'ui/ux', 'thread of the week', 'twitter thread', 'graphic design'],
  negativePenalty: -4,
  bonuses: {
    agentOnly: 2, // AGENT_ONLY = smaller field of competitors
    bountyType: 1, // bounties (many winners possible) over projects (pick one)
    fewSubmissions: 1, // < 10 submissions so far
  },
};
// ---------------------------------------------------------------------------

function usdValue(listing) {
  const token = (listing.token || '').toUpperCase();
  if (!CONFIG.stableTokens.includes(token)) return { usd: null, note: `non-stable token ${listing.token || '?'}` };
  if (listing.compensationType && listing.compensationType !== 'fixed') {
    const max = listing.maxRewardAsk ?? listing.minRewardAsk ?? null;
    return { usd: max, note: `${listing.compensationType} comp (max ask)` };
  }
  return { usd: listing.rewardAmount ?? null, note: null };
}

function scoreListing(listing, details) {
  const haystack = [
    listing.title,
    listing.slug,
    details?.description,
    JSON.stringify(details?.skills ?? ''),
    details?.requirements,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  let score = 0;
  const matchedKeywords = [];
  const matchedCategories = [];
  for (const cat of CONFIG.profile) {
    let hit = false;
    for (const kw of cat.keywords) {
      // word-ish boundary match to avoid "mcp" matching inside random words
      const re = new RegExp(`(^|[^a-z0-9])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
      if (re.test(haystack)) {
        matchedKeywords.push(kw);
        hit = true;
      }
    }
    if (hit) {
      score += cat.weight;
      matchedCategories.push(cat);
    }
  }
  for (const neg of CONFIG.negativeKeywords) {
    if (haystack.includes(neg)) {
      score += CONFIG.negativePenalty;
      matchedKeywords.push(`NEGATIVE:${neg}`);
      break;
    }
  }
  if (listing.agentAccess === 'AGENT_ONLY') score += CONFIG.bonuses.agentOnly;
  if (listing.type === 'bounty') score += CONFIG.bonuses.bountyType;
  if ((listing._count?.Submission ?? 99) < 10) score += CONFIG.bonuses.fewSubmissions;

  return { score, matchedKeywords, matchedCategories };
}

function kycRisk(listing, details) {
  const names = [listing.sponsor?.name, details?.sponsor?.name, details?.sponsor?.entityName].filter(Boolean);
  if (names.some((n) => CONFIG.kycSponsorPattern.test(n))) return `sponsor "${names[0]}" matches KYC pattern`;
  if (details?.isFndnPaying === true) return 'isFndnPaying=true (Solana Foundation pays → KYC)';
  return null;
}

async function fetchLiveListings() {
  const deadline = new Date().toISOString();
  const attempts = API_KEY
    ? [
        { label: 'agent API (authenticated)', url: `${BASE_URL}/api/agents/listings/live?take=${CONFIG.take}&deadline=${encodeURIComponent(deadline)}`, headers: authHeaders() },
        { label: 'public listings API (fallback)', url: `${BASE_URL}/api/listings/live?take=${CONFIG.take}&deadline=${encodeURIComponent(deadline)}`, headers: {} },
      ]
    : [
        { label: 'public listings API (no SUPERTEAM_API_KEY set)', url: `${BASE_URL}/api/listings/live?take=${CONFIG.take}&deadline=${encodeURIComponent(deadline)}`, headers: {} },
      ];

  const errors = [];
  for (const a of attempts) {
    console.log(`Fetching live listings via ${a.label} ...`);
    const res = await fetchJson(a.url, { headers: a.headers });
    if (res.ok && Array.isArray(res.data)) return { listings: res.data, source: a.label };
    errors.push(`${a.label}: ${res.ok ? 'unexpected response shape' : res.error}`);
  }
  return { listings: null, errors };
}

async function fetchDetails(slug) {
  const url = API_KEY
    ? `${BASE_URL}/api/agents/listings/details/${encodeURIComponent(slug)}`
    : `${BASE_URL}/api/listings/details/${encodeURIComponent(slug)}`;
  const res = await fetchJson(url, { headers: authHeaders() });
  return res.ok ? res.data : null;
}

function fmtUsd(n) {
  return n == null ? '?' : `$${Number(n).toLocaleString('en-US')}`;
}

async function main() {
  const { listings, source, errors } = await fetchLiveListings();
  if (!listings) {
    console.error('\nCould not fetch listings from any endpoint:');
    for (const e of errors) console.error(`  - ${e}`);
    console.error(
      '\nGraceful exit. Likely causes: no network route to superteam.fun (egress proxy),' +
        '\nor an invalid SUPERTEAM_API_KEY. Set SUPERTEAM_API_KEY (see register.mjs) or' +
        '\nrun from a network that can reach superteam.fun. Nothing was written.',
    );
    process.exit(2);
  }
  console.log(`Got ${listings.length} live listings (${source}).`);

  // Stage 1: cheap pre-filter on list fields.
  const prefiltered = [];
  const rejected = [];
  for (const l of listings) {
    const days = daysUntil(l.deadline);
    const { usd, note } = usdValue(l);
    const reasons = [];
    if (!['AGENT_ALLOWED', 'AGENT_ONLY'].includes(l.agentAccess)) reasons.push(`agentAccess=${l.agentAccess}`);
    if (days == null || days <= CONFIG.minDaysToDeadline) reasons.push(`deadline in ${days?.toFixed(1) ?? '?'}d`);
    if (usd == null || usd < CONFIG.minUsd) reasons.push(`reward ${fmtUsd(usd)}${note ? ` (${note})` : ''} < ${fmtUsd(CONFIG.minUsd)}`);
    const kyc = kycRisk(l, null);
    if (kyc) reasons.push(kyc);
    if (reasons.length) rejected.push({ title: l.title, reasons });
    else prefiltered.push({ listing: l, days, usd, usdNote: note, prelim: scoreListing(l, null).score });
  }
  console.log(`${prefiltered.length} pass base filters; ${rejected.length} rejected.`);

  // Stage 2: enrich the most promising with full details, politely.
  prefiltered.sort((a, b) => b.prelim - a.prelim);
  const toEnrich = prefiltered.slice(0, CONFIG.enrichLimit);
  for (const item of toEnrich) {
    item.details = await fetchDetails(item.listing.slug);
    await sleep(CONFIG.enrichDelayMs);
  }

  // Stage 3: final score + final filters.
  const matches = [];
  for (const item of toEnrich) {
    const { listing, details } = item;
    const kyc = kycRisk(listing, details);
    if (kyc) continue;
    const region = details?.region;
    if (region && !CONFIG.allowedRegions.includes(String(region).toUpperCase())) continue;
    const { score, matchedKeywords, matchedCategories } = scoreListing(listing, details);
    if (score < CONFIG.scoreThreshold) continue;
    matches.push({
      id: listing.id,
      slug: listing.slug,
      url: `${BASE_URL}/earn/listing/${listing.slug}/`,
      title: listing.title,
      type: listing.type,
      agentAccess: listing.agentAccess,
      sponsor: details?.sponsor?.name ?? listing.sponsor?.name ?? '?',
      token: listing.token,
      rewardUsd: item.usd,
      rewardNote: item.usdNote,
      compensationType: listing.compensationType,
      deadline: listing.deadline,
      daysLeft: Number(item.days.toFixed(1)),
      submissionsSoFar: listing._count?.Submission ?? null,
      region: region ?? 'GLOBAL',
      score,
      matchedKeywords: matchedKeywords.filter((k) => !k.startsWith('NEGATIVE:')),
      categories: matchedCategories.map((c) => c.category),
      angle: matchedCategories[0]?.angle ?? null,
      eligibilityQuestions: Array.isArray(details?.eligibility)
        ? details.eligibility.map((q) => q.question ?? q)
        : details?.eligibility ?? null,
      detailsFetched: Boolean(details),
    });
  }
  matches.sort((a, b) => b.score - a.score);

  const outDir = await ensureOutDir();
  const generatedAt = new Date().toISOString();
  await writeFile(
    join(outDir, 'matches.json'),
    JSON.stringify({ generatedAt, source, config: { minUsd: CONFIG.minUsd, minDaysToDeadline: CONFIG.minDaysToDeadline, scoreThreshold: CONFIG.scoreThreshold }, totalLive: listings.length, matches }, null, 2),
  );

  const md = [
    `# Superteam Earn — scout matches`,
    ``,
    `Generated: ${generatedAt} · source: ${source} · ${listings.length} live listings scanned · ${matches.length} matches (threshold ${CONFIG.scoreThreshold})`,
    ``,
    ...(matches.length === 0 ? ['No listings currently clear the bar. Good — precision over volume; do not lower the threshold to force a match.'] : []),
    ...matches.flatMap((m) => [
      `## ${m.title}`,
      ``,
      `- **URL**: ${m.url}`,
      `- **Sponsor**: ${m.sponsor} (external, no-KYC path)`,
      `- **Reward**: ${fmtUsd(m.rewardUsd)} ${m.token}${m.rewardNote ? ` — ${m.rewardNote}` : ''}`,
      `- **Deadline**: ${m.deadline} (${m.daysLeft} days left)`,
      `- **Type / access**: ${m.type} / ${m.agentAccess} · ${m.submissionsSoFar ?? '?'} submissions so far`,
      `- **Score**: ${m.score} — matched: ${m.matchedKeywords.join(', ') || '(bonuses only)'}`,
      `- **Why it matches**: ${m.categories.join('; ') || 'n/a'}`,
      `- **Proposed angle**: ${m.angle ?? 'n/a'}`,
      ...(m.eligibilityQuestions?.length ? [`- **Eligibility questions**: ${JSON.stringify(m.eligibilityQuestions)}`] : []),
      ``,
      `Next: \`node scripts/superteam/draft.mjs ${m.id}\``,
      ``,
    ]),
  ].join('\n');
  await writeFile(join(outDir, 'matches.md'), md);

  console.log(`\nWrote ${matches.length} matches to ${join(outDir, 'matches.json')} and matches.md`);
  for (const m of matches) console.log(`  [${String(m.score).padStart(2)}] ${fmtUsd(m.rewardUsd)} ${m.token}  ${m.title}`);
}

main().catch((err) => {
  console.error('scout.mjs failed:', err);
  process.exit(1);
});
