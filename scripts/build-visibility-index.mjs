#!/usr/bin/env node
/**
 * Builds the DTC AI Visibility Index by scanning a fixed brand list
 * through the live AgentReady API, then writing the results JSON that
 * the index page renders. Run from CI (open network required).
 *
 * Scans run through a small concurrency pool (SCAN_CONCURRENCY, default 8)
 * and every brand is fail-soft: a dead domain or scan error is skipped and
 * never fails the build. If fewer than MIN_RESULTS brands succeed the build
 * aborts WITHOUT overwriting the previous good dataset.
 */

const API = process.env.SCAN_API || "https://agentready.agiscorecard.com/api/scan";
const OUT = new URL("../sites/selltoagents/public/data/visibility-index.json", import.meta.url);
const CONCURRENCY = Math.max(1, Number(process.env.SCAN_CONCURRENCY || 8));
const MIN_RESULTS = Math.max(1, Number(process.env.MIN_RESULTS || 20));

// [name, domain, category] — famous DTC / e-commerce brands with unambiguous
// primary domains. Wrong domains poison the index: only add brands whose
// domain you have verified.
const BRANDS = [
  // --- Apparel ---
  ["Gymshark", "gymshark.com", "Apparel"],
  ["Bombas", "bombas.com", "Apparel"],
  ["Chubbies", "chubbiesshorts.com", "Apparel"],
  ["Everlane", "everlane.com", "Apparel"],
  ["Outdoor Voices", "outdoorvoices.com", "Apparel"],
  ["Quince", "quince.com", "Apparel"],
  ["Vuori", "vuoriclothing.com", "Apparel"],
  ["Skims", "skims.com", "Apparel"],
  ["Buck Mason", "buckmason.com", "Apparel"],
  ["True Classic", "trueclassictees.com", "Apparel"],
  ["Cuts", "cutsclothing.com", "Apparel"],
  ["Bonobos", "bonobos.com", "Apparel"],
  ["UNTUCKit", "untuckit.com", "Apparel"],
  ["Faherty", "fahertybrand.com", "Apparel"],
  ["Marine Layer", "marinelayer.com", "Apparel"],
  ["Alo Yoga", "aloyoga.com", "Apparel"],
  ["Reformation", "thereformation.com", "Apparel"],
  ["Fabletics", "fabletics.com", "Apparel"],
  ["Spanx", "spanx.com", "Apparel"],
  ["MeUndies", "meundies.com", "Apparel"],
  ["Tommy John", "tommyjohn.com", "Apparel"],
  ["Knix", "knix.com", "Apparel"],
  ["Savage X Fenty", "savagex.com", "Apparel"],
  // --- Footwear ---
  ["Allbirds", "allbirds.com", "Footwear"],
  ["Rothy's", "rothys.com", "Footwear"],
  ["Tecovas", "tecovas.com", "Footwear"],
  ["Hoka", "hoka.com", "Footwear"],
  ["On Running", "on.com", "Footwear"],
  ["Brooks Running", "brooksrunning.com", "Footwear"],
  ["Vessi", "vessi.com", "Footwear"],
  ["Thursday Boots", "thursdayboots.com", "Footwear"],
  ["Cariuma", "cariuma.com", "Footwear"],
  ["Birkenstock", "birkenstock.com", "Footwear"],
  // --- Beauty & personal care ---
  ["Glossier", "glossier.com", "Beauty"],
  ["Fenty Beauty", "fentybeauty.com", "Beauty"],
  ["Jones Road", "jonesroadbeauty.com", "Beauty"],
  ["Rare Beauty", "rarebeauty.com", "Beauty"],
  ["ColourPop", "colourpop.com", "Beauty"],
  ["The Ordinary", "theordinary.com", "Beauty"],
  ["Drunk Elephant", "drunkelephant.com", "Beauty"],
  ["Tatcha", "tatcha.com", "Beauty"],
  ["Ilia", "iliabeauty.com", "Beauty"],
  ["Kosas", "kosas.com", "Beauty"],
  ["Summer Fridays", "summerfridays.com", "Beauty"],
  ["Curology", "curology.com", "Beauty"],
  ["Prose", "prose.com", "Beauty"],
  ["Olaplex", "olaplex.com", "Beauty"],
  ["Harry's", "harrys.com", "Beauty"],
  ["Dr. Squatch", "drsquatch.com", "Beauty"],
  ["Dollar Shave Club", "dollarshaveclub.com", "Beauty"],
  // --- Home & kitchen ---
  ["Casper", "casper.com", "Home"],
  ["Brooklinen", "brooklinen.com", "Home"],
  ["Ruggable", "ruggable.com", "Home"],
  ["Parachute", "parachutehome.com", "Home"],
  ["HexClad", "hexclad.com", "Home"],
  ["Our Place", "fromourplace.com", "Home"],
  ["Caraway", "carawayhome.com", "Home"],
  ["Article", "article.com", "Home"],
  ["Burrow", "burrow.com", "Home"],
  ["Floyd", "floydhome.com", "Home"],
  ["Tuft & Needle", "tuftandneedle.com", "Home"],
  ["Purple", "purple.com", "Home"],
  ["Helix Sleep", "helixsleep.com", "Home"],
  ["Saatva", "saatva.com", "Home"],
  ["Boll & Branch", "bollandbranch.com", "Home"],
  ["Made In", "madeincookware.com", "Home"],
  ["Eight Sleep", "eightsleep.com", "Home"],
  // --- Outdoor ---
  ["Solo Stove", "solostove.com", "Outdoor"],
  ["Yeti", "yeti.com", "Outdoor"],
  ["Stanley", "stanley1913.com", "Outdoor"],
  ["Owala", "owalalife.com", "Outdoor"],
  ["Cotopaxi", "cotopaxi.com", "Outdoor"],
  ["Patagonia", "patagonia.com", "Outdoor"],
  ["BioLite", "bioliteenergy.com", "Outdoor"],
  ["Rumpl", "rumpl.com", "Outdoor"],
  ["Peak Design", "peakdesign.com", "Outdoor"],
  ["Osprey", "osprey.com", "Outdoor"],
  ["RTIC", "rticoutdoors.com", "Outdoor"],
  ["Igloo", "igloocoolers.com", "Outdoor"],
  ["Hydro Flask", "hydroflask.com", "Outdoor"],
  ["Huckberry", "huckberry.com", "Outdoor"],
  ["BÉIS", "beistravel.com", "Outdoor"],
  // --- Food & beverage ---
  ["Liquid Death", "liquiddeath.com", "Food & Beverage"],
  ["Athletic Greens", "drinkag1.com", "Food & Beverage"],
  ["Olipop", "drinkolipop.com", "Food & Beverage"],
  ["Graza", "graza.co", "Food & Beverage"],
  ["Fly By Jing", "flybyjing.com", "Food & Beverage"],
  ["Magic Spoon", "magicspoon.com", "Food & Beverage"],
  ["Poppi", "drinkpoppi.com", "Food & Beverage"],
  ["Chomps", "chomps.com", "Food & Beverage"],
  ["Athletic Brewing", "athleticbrewing.com", "Food & Beverage"],
  ["Huel", "huel.com", "Food & Beverage"],
  ["Soylent", "soylent.com", "Food & Beverage"],
  ["Daily Harvest", "dailyharvest.com", "Food & Beverage"],
  ["Thrive Market", "thrivemarket.com", "Food & Beverage"],
  ["Brightland", "brightland.co", "Food & Beverage"],
  // --- Electronics ---
  ["Anker", "anker.com", "Electronics"],
  ["Nothing", "nothing.tech", "Electronics"],
  ["Sonos", "sonos.com", "Electronics"],
  ["GoPro", "gopro.com", "Electronics"],
  ["DJI", "dji.com", "Electronics"],
  ["Wyze", "wyze.com", "Electronics"],
  ["Nomad Goods", "nomadgoods.com", "Electronics"],
  // --- Pets ---
  ["Chewy", "chewy.com", "Pets"],
  ["BarkBox", "barkbox.com", "Pets"],
  ["The Farmer's Dog", "thefarmersdog.com", "Pets"],
  ["Ollie", "myollie.com", "Pets"],
  ["Sundays for Dogs", "sundaysfordogs.com", "Pets"],
  ["Wild One", "wildone.com", "Pets"],
  ["Fi", "tryfi.com", "Pets"],
  // --- Jewelry & watches ---
  ["Mejuri", "mejuri.com", "Jewelry"],
  ["MVMT", "mvmt.com", "Jewelry"],
  ["Kendra Scott", "kendrascott.com", "Jewelry"],
  ["Gorjana", "gorjana.com", "Jewelry"],
  ["Ana Luisa", "analuisa.com", "Jewelry"],
  ["Brilliant Earth", "brilliantearth.com", "Jewelry"],
  ["Blue Nile", "bluenile.com", "Jewelry"],
  ["AUrate", "auratenewyork.com", "Jewelry"],
  ["Studs", "studs.com", "Jewelry"],
  ["Pura Vida", "puravidabracelets.com", "Jewelry"],
  // --- Fitness ---
  ["Peloton", "onepeloton.com", "Fitness"],
  ["Tonal", "tonal.com", "Fitness"],
  ["Hydrow", "hydrow.com", "Fitness"],
  ["NordicTrack", "nordictrack.com", "Fitness"],
  ["Rogue Fitness", "roguefitness.com", "Fitness"],
  ["Whoop", "whoop.com", "Fitness"],
  ["Oura", "ouraring.com", "Fitness"],
  ["Therabody", "therabody.com", "Fitness"],
  // --- Wellness ---
  ["Hims", "hims.com", "Wellness"],
  ["Ritual", "ritual.com", "Wellness"],
  ["Seed", "seed.com", "Wellness"],
  ["Nutrafol", "nutrafol.com", "Wellness"],
  // --- Accessories ---
  ["Warby Parker", "warbyparker.com", "Accessories"],
  ["Ridge", "ridge.com", "Accessories"],
  ["Away", "awaytravel.com", "Accessories"],
  ["Goodr", "goodr.com", "Accessories"],
  ["Zenni", "zennioptical.com", "Accessories"],
];

// Guard against copy-paste mistakes: duplicate domains would double-count.
{
  const seen = new Set();
  for (const [name, domain] of BRANDS) {
    if (seen.has(domain)) throw new Error("Duplicate domain in BRANDS: " + domain + " (" + name + ")");
    seen.add(domain);
  }
}

async function scan(domain) {
  const res = await fetch(API + "?url=" + encodeURIComponent("https://" + domain), {
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error("scan " + domain + " -> HTTP " + res.status);
  return res.json();
}

// Simple worker pool: CONCURRENCY scans in flight, fail-soft per brand.
const results = [];
let cursor = 0;
async function worker() {
  while (cursor < BRANDS.length) {
    const [name, domain, category] = BRANDS[cursor++];
    try {
      const r = await scan(domain);
      const failing = r.checks.filter((c) => c.status === "fail").map((c) => c.title);
      results.push({ name, domain, category, score: r.score, grade: r.grade, failing: failing.slice(0, 4) });
      console.log(`${name} (${domain}): ${r.score} ${r.grade}`);
    } catch (e) {
      console.warn(`SKIP ${name} (${domain}): ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 500)); // be polite to the API + targets
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, BRANDS.length) }, worker));

if (results.length < MIN_RESULTS) {
  console.error(`ABORT: only ${results.length}/${BRANDS.length} brands scanned (< ${MIN_RESULTS}); not overwriting existing index.`);
  process.exit(1);
}

results.sort((a, b) => b.score - a.score);
const avg = Math.round(results.reduce((s, r) => s + r.score, 0) / Math.max(results.length, 1));

// Per-category rollup (additive to the original schema).
const byCat = new Map();
for (const r of results) {
  const c = byCat.get(r.category) || { category: r.category, count: 0, total: 0 };
  c.count += 1;
  c.total += r.score;
  byCat.set(r.category, c);
}
const categories = [...byCat.values()]
  .map((c) => ({ category: c.category, count: c.count, averageScore: Math.round(c.total / c.count) }))
  .sort((a, b) => b.count - a.count);

const payload = {
  updatedAt: new Date().toISOString().slice(0, 10),
  brandCount: results.length,
  candidateCount: BRANDS.length,
  averageScore: avg,
  categories,
  results,
};

const fs = await import("node:fs");
fs.mkdirSync(new URL("./", OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`\nWrote ${results.length}/${BRANDS.length} brands, average ${avg} -> ${OUT.pathname}`);
