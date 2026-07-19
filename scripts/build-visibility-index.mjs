#!/usr/bin/env node
/**
 * Builds the DTC AI Visibility Index by scanning a fixed brand list
 * through the live AgentReady API, then writing the results JSON that
 * the index page renders. Run from CI (open network required).
 */

const API = process.env.SCAN_API || "https://agentready.agiscorecard.com/api/scan";
const OUT = new URL("../sites/selltoagents/public/data/visibility-index.json", import.meta.url);

const BRANDS = [
  ["Allbirds", "allbirds.com"], ["Gymshark", "gymshark.com"], ["Warby Parker", "warbyparker.com"],
  ["Casper", "casper.com"], ["Glossier", "glossier.com"], ["Bombas", "bombas.com"],
  ["Brooklinen", "brooklinen.com"], ["Ridge", "ridge.com"], ["Chubbies", "chubbiesshorts.com"],
  ["MVMT", "mvmt.com"], ["Away", "awaytravel.com"], ["Everlane", "everlane.com"],
  ["Outdoor Voices", "outdoorvoices.com"], ["Rothy's", "rothys.com"], ["Mejuri", "mejuri.com"],
  ["Ruggable", "ruggable.com"], ["Parachute", "parachutehome.com"], ["Quince", "quince.com"],
  ["Vuori", "vuoriclothing.com"], ["Skims", "skims.com"], ["Fenty Beauty", "fentybeauty.com"],
  ["Liquid Death", "liquiddeath.com"], ["Athletic Greens", "drinkag1.com"], ["HexClad", "hexclad.com"],
  ["Our Place", "fromourplace.com"], ["Caraway", "carawayhome.com"], ["Nuggets of Wisdom", "solostove.com"],
  ["Yeti", "yeti.com"], ["Stanley", "stanley1913.com"], ["Owala", "owalalife.com"],
  ["Cotopaxi", "cotopaxi.com"], ["Tecovas", "tecovas.com"], ["Buck Mason", "buckmason.com"],
  ["True Classic", "trueclassictees.com"], ["Cuts", "cutsclothing.com"], ["Jones Road", "jonesroadbeauty.com"],
  ["Olipop", "drinkolipop.com"], ["Graza", "graza.co"], ["Fly By Jing", "flybyjing.com"],
  ["Magic Spoon", "magicspoon.com"],
];

async function scan(domain) {
  const res = await fetch(API + "?url=" + encodeURIComponent("https://" + domain), {
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error("scan " + domain + " -> HTTP " + res.status);
  return res.json();
}

const results = [];
for (const [name, domain] of BRANDS) {
  try {
    const r = await scan(domain);
    const failing = r.checks.filter((c) => c.status === "fail").map((c) => c.title);
    results.push({ name, domain, score: r.score, grade: r.grade, failing: failing.slice(0, 4) });
    console.log(`${name} (${domain}): ${r.score} ${r.grade}`);
  } catch (e) {
    console.warn(`SKIP ${name} (${domain}): ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 1500)); // be polite to the API + targets
}

results.sort((a, b) => b.score - a.score);
const avg = Math.round(results.reduce((s, r) => s + r.score, 0) / Math.max(results.length, 1));
const payload = {
  updatedAt: new Date().toISOString().slice(0, 10),
  brandCount: results.length,
  averageScore: avg,
  results,
};

const fs = await import("node:fs");
fs.mkdirSync(new URL("./", OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`\nWrote ${results.length} brands, average ${avg} -> ${OUT.pathname}`);
