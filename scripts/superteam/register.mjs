#!/usr/bin/env node
// register.mjs — one-time registration of our agent identity on Superteam Earn.
//
// Usage:
//   node scripts/superteam/register.mjs              # dry-run: prints the plan
//   node scripts/superteam/register.mjs --yes        # actually registers
//   node scripts/superteam/register.mjs --yes --name "my-agent-name"
//
// SECURITY: the API key and claim code are printed to STDOUT ONLY and are never
// written to any file. Copy them immediately — they cannot be retrieved again.
//
// Contract (verified against SuperteamDAO/earn src/pages/api/agents/index.ts,
// 2026-08-21):
//   POST {BASE_URL}/api/agents   body: { "name": string }   (no auth)
//     name: 2–80 chars after trim, must not contain "<" or ">"
//   201 → { agentId, userId, name, username, apiKey, claimCode }
//   Rate limit: 60 registrations per IP per hour.
// TODO-VERIFY: contract re-checked from the open-source repo at build time;
// re-confirm against https://superteam.fun/skill.md before running for real —
// the spec is versioned (was v0.5.1) and may have moved.

import { BASE_URL, fetchJson } from './lib.mjs';

const DEFAULT_NAME = 'agentfront-scout';

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  const yes = process.argv.includes('--yes');
  const name = getArg('--name') || DEFAULT_NAME;

  if (name.trim().length < 2 || name.trim().length > 80 || /[<>]/.test(name)) {
    console.error('Invalid --name: must be 2-80 chars and contain no "<" or ">".');
    process.exit(1);
  }

  if (!yes) {
    console.log('DRY RUN — nothing was sent. With --yes this script would:');
    console.log(`  POST ${BASE_URL}/api/agents`);
    console.log(`  body: ${JSON.stringify({ name })}`);
    console.log('');
    console.log('Expected 201 response: { agentId, userId, name, username, apiKey, claimCode }');
    console.log('');
    console.log('After a successful run you must, by hand:');
    console.log('  1. Store the apiKey as GitHub Actions secret SUPERTEAM_API_KEY');
    console.log('     (repo settings → Secrets and variables → Actions). Never commit it.');
    console.log('  2. Keep the claimCode somewhere private. Later, a human binds it to a');
    console.log(`     talent profile at ${BASE_URL}/earn/claim/<claimCode> — that profile's`);
    console.log('     Solana wallet receives USDC payouts (no KYC for external sponsors).');
    console.log('');
    console.log('Run once only — each run creates a NEW agent identity (60/IP/hour rate limit).');
    return;
  }

  console.log(`Registering agent "${name}" at ${BASE_URL}/api/agents ...`);
  const res = await fetchJson(`${BASE_URL}/api/agents`, {
    method: 'POST',
    body: { name },
  });

  if (!res.ok) {
    console.error(`Registration failed: ${res.error}`);
    if (res.status === 429) console.error('Rate limited (60 registrations/IP/hour). Wait and retry.');
    process.exit(1);
  }

  const { agentId, userId, username, apiKey, claimCode } = res.data ?? {};
  if (!apiKey || !claimCode) {
    console.error('Unexpected response shape (no apiKey/claimCode):');
    console.error(JSON.stringify(res.data, null, 2));
    console.error('TODO-VERIFY: the response contract may have changed — check superteam.fun/skill.md');
    process.exit(1);
  }

  console.log('');
  console.log('=== REGISTERED — copy these NOW; they are not stored anywhere ===');
  console.log(`agentId:   ${agentId}`);
  console.log(`userId:    ${userId}`);
  console.log(`username:  ${username}`);
  console.log(`apiKey:    ${apiKey}`);
  console.log(`claimCode: ${claimCode}`);
  console.log('================================================================');
  console.log('');
  console.log('Next steps (human):');
  console.log('  1. gh secret set SUPERTEAM_API_KEY   (paste the apiKey)');
  console.log(`  2. Later, claim payouts: sign in and open ${BASE_URL}/earn/claim/${claimCode}`);
  console.log('     Complete the talent profile (with your Solana wallet) before claiming.');
  console.log('  3. Never commit the apiKey or claimCode to the repo.');
}

main().catch((err) => {
  console.error('register.mjs failed:', err);
  process.exit(1);
});
