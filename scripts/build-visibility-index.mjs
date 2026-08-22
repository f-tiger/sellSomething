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
 *
 * After the JSON is written the same run regenerates the programmatic
 * brand-report surface (a pure function of the scan results):
 *   - sites/selltoagents/public/brands/<domain-slug>.html  (one per brand)
 *   - sites/selltoagents/public/brands/category-<slug>.html (one per category)
 *   - sites/selltoagents/public/brands/index.html           (hub)
 *   - sitemap.xml is re-merged (existing non-/brands URLs preserved)
 *   - llms.txt gains a "Brand reports" hub line (idempotent)
 *   - data/brands-manifest.json tracks generated files; pages for brands
 *     that dropped out of the index are deleted on the next run.
 *
 * Set SKIP_SCAN=1 to skip scanning and regenerate pages from the committed
 * data/visibility-index.json (fast path for CI / local validation).
 */

import fs from "node:fs";
import path from "node:path";

const API = process.env.SCAN_API || "https://agentready.agiscorecard.com/api/scan";
const OUT = new URL("../sites/selltoagents/public/data/visibility-index.json", import.meta.url);
const PUBLIC_DIR = new URL("../sites/selltoagents/public/", import.meta.url);
const SITE = "https://selltoagents.agiscorecard.com";
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

let payload;

if (process.env.SKIP_SCAN) {
  // Fast path: regenerate everything from the committed dataset.
  payload = JSON.parse(fs.readFileSync(OUT, "utf8"));
  console.log(`SKIP_SCAN=1: loaded ${payload.results.length} brands from existing ${OUT.pathname}`);
} else {
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

  payload = {
    updatedAt: new Date().toISOString().slice(0, 10),
    brandCount: results.length,
    candidateCount: BRANDS.length,
    averageScore: avg,
    categories,
    results,
  };

  fs.mkdirSync(new URL("./", OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${results.length}/${BRANDS.length} brands, average ${avg} -> ${OUT.pathname}`);
}

/* ------------------------------------------------------------------ */
/* Programmatic brand pages — a pure function of the scan results.     */
/* ------------------------------------------------------------------ */

const pub = (rel) => path.join(PUBLIC_DIR.pathname, rel);
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const brandSlug = (domain) => slugify(domain);
const catSlug = (category) => slugify(category);
const gradeClass = (grade) => "g-" + String(grade || "f").toLowerCase().charAt(0);
const signed = (n) => (n > 0 ? "+" + n : String(n));

function buildModel(data) {
  // Noindex/anti-thin guard: a degenerate scan (score 0 / missing grade)
  // produces no page at all.
  const rows = data.results.filter((r) => Number.isFinite(r.score) && r.score > 0 && r.grade);
  const skipped = data.results.length - rows.length;
  if (skipped) console.warn(`brand pages: skipping ${skipped} degenerate result(s) (score 0 / no checks)`);

  const sorted = [...rows].sort((a, b) => b.score - a.score);
  const brands = sorted.map((r, i) => ({
    ...r,
    failing: Array.isArray(r.failing) ? r.failing : [],
    slug: brandSlug(r.domain),
    rank: i + 1,
  }));

  const cats = new Map();
  for (const b of brands) {
    if (!cats.has(b.category)) {
      cats.set(b.category, { name: b.category, slug: catSlug(b.category), brands: [] });
    }
    cats.get(b.category).brands.push(b);
  }
  for (const c of cats.values()) {
    c.brands.sort((a, b) => b.score - a.score);
    c.avg = Math.round(c.brands.reduce((s, b) => s + b.score, 0) / c.brands.length);
    c.brands.forEach((b, i) => {
      b.catRank = i + 1;
      b.cat = c;
    });
  }
  return {
    updatedAt: data.updatedAt,
    overallAvg: data.averageScore,
    total: brands.length,
    brands,
    categories: [...cats.values()].sort((a, b) => b.brands.length - a.brands.length),
  };
}

// Nearest-score rival within the category (falls back to nearest overall for
// a solo-category brand).
function pickRival(b, model) {
  const pool = b.cat.brands.length > 1 ? b.cat.brands : model.brands;
  let best = null;
  for (const o of pool) {
    if (o.domain === b.domain) continue;
    const d = Math.abs(o.score - b.score);
    if (!best || d < best.d || (d === best.d && o.rank < best.o.rank)) best = { o, d };
  }
  return best ? best.o : null;
}

// Two same-category neighbors (adjacent by category rank), for interlinking.
function pickNeighbors(b, model) {
  const list = b.cat.brands.length > 2 ? b.cat.brands : model.brands;
  const i = list.findIndex((o) => o.domain === b.domain);
  const picks = [];
  for (const j of [i - 1, i + 1, i - 2, i + 2]) {
    if (picks.length >= 2) break;
    if (j >= 0 && j < list.length && j !== i) picks.push(list[j]);
  }
  return picks;
}

// 2-3 data-driven sentences with real branch variance (anti-thin-pSEO: the
// copy is derived from the numbers, not a single fill-in-the-blank template).
function narrative(b, model) {
  const { total, overallAvg } = model;
  const cat = b.cat;
  const catDelta = b.score - cat.avg;
  const allDelta = b.score - overallAvg;
  const pctBand = b.rank / total;
  const parts = [];

  if (b.rank === 1) {
    parts.push(
      `${b.name} tops the entire DTC AI Visibility Index this week: #1 of ${total} brands with a score of ${b.score}/100.`
    );
  } else if (pctBand <= 0.1) {
    parts.push(
      `${b.name} sits in the top 10% of the index — #${b.rank} of ${total} brands scanned — with ${b.score}/100, ${signed(allDelta)} points against the index average of ${overallAvg}.`
    );
  } else if (pctBand <= 0.5) {
    parts.push(
      `At #${b.rank} of ${total}, ${b.name} lands in the upper half of the index with ${b.score}/100 (index average: ${overallAvg}).`
    );
  } else if (pctBand <= 0.75) {
    parts.push(
      `${b.name} ranks #${b.rank} of ${total} — lower mid-table — scoring ${b.score}/100 against an index average of ${overallAvg}.`
    );
  } else {
    parts.push(
      `${b.name} is near the bottom of the index at #${b.rank} of ${total}, scoring ${b.score}/100 — ${Math.abs(allDelta)} points below the ${overallAvg} average, which in practice means AI shopping agents struggle to read this store.`
    );
  }

  if (b.catRank === 1 && cat.brands.length > 1) {
    parts.push(
      `Within ${cat.name} it leads all ${cat.brands.length} brands, beating the category average of ${cat.avg} by ${catDelta} points.`
    );
  } else if (cat.brands.length === 1) {
    parts.push(`It is currently the only ${cat.name} brand in the index, so its category baseline is its own score.`);
  } else if (catDelta >= 8) {
    parts.push(
      `Against its ${cat.name} peers it ranks #${b.catRank} of ${cat.brands.length} and runs well ahead of the category average (${b.score} vs ${cat.avg}).`
    );
  } else if (catDelta > 0) {
    parts.push(
      `In ${cat.name} it holds #${b.catRank} of ${cat.brands.length}, a touch above the category average of ${cat.avg}.`
    );
  } else if (catDelta === 0) {
    parts.push(`In ${cat.name} it sits at #${b.catRank} of ${cat.brands.length}, exactly on the category average of ${cat.avg}.`);
  } else {
    parts.push(
      `It trails its ${cat.name} peers — #${b.catRank} of ${cat.brands.length}, ${Math.abs(catDelta)} points under the category average of ${cat.avg}.`
    );
  }

  if (b.failing.length === 0) {
    parts.push(`Our scan found no failing checks: every machine-readable signal we test for was present.`);
  } else if (b.failing.length === 1) {
    parts.push(`One gap is holding the score back: ${b.failing[0]}.`);
  } else {
    parts.push(
      `The score is capped by ${b.failing.length} failing checks, starting with ${/schema|json-ld/i.test(b.failing[0]) ? "missing structured data" : b.failing[0]} — each one is fixable (see the checklist below).`
    );
  }
  return parts;
}

function pageChrome(title, desc, canonicalPath, ogType, jsonLd, body, extraCss = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${canonicalPath}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="${ogType}">
<meta property="og:url" content="${SITE}${canonicalPath}">
<link rel="stylesheet" href="/style.css">
<script type="application/ld+json">
${JSON.stringify(jsonLd)}
</script>
<style>
.score-pill{display:inline-block;min-width:44px;text-align:center;border-radius:8px;padding:3px 8px;font-weight:800}
.g-a{background:#12352b;color:#38d9a9}.g-b{background:#14304a;color:#5b8cff}.g-c{background:#3a2f14;color:#ffc078}.g-d,.g-f{background:#3a1a1a;color:#ff6b6b}
.rank-table{width:100%;border-collapse:collapse;margin:20px 0;font-size:14.5px}
.rank-table th,.rank-table td{border-bottom:1px solid var(--line);padding:10px 12px;text-align:left;border-left:0;border-right:0;border-top:0}
.rank-table th{background:transparent;color:var(--dim);font-size:12px;text-transform:uppercase;letter-spacing:.07em}
.statrow{display:flex;gap:14px;flex-wrap:wrap;margin:20px 0}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:14px 20px}
.stat b{font-size:22px;display:block}
.stat span{color:var(--dim);font-size:13px}
.scorebar{background:var(--panel2);border:1px solid var(--line);border-radius:99px;height:18px;overflow:hidden;margin:10px 0 4px}
.scorebar i{display:block;height:100%;background:linear-gradient(90deg,var(--acc2),var(--acc))}
${extraCss}</style>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-FZXLMBB5QB"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-FZXLMBB5QB');</script>
</head>
<body>
<div class="wrap">
<header>
  <a class="logo" href="/">Sell<span>To</span>Agents</a>
  <nav><a href="/ai-visibility-index">Index</a><a href="/brands/">Brand reports</a><a href="/brand-battle">⚔️ Battle</a><a href="https://agentready.agiscorecard.com">Scanner</a></nav>
</header>
${body}
<footer>
  <div class="links"><a href="/">All guides</a><a href="/brands/">Brand reports</a><a href="/ai-visibility-index">Full index</a><a href="/data/visibility-index.json">Dataset</a><a href="https://agentready.agiscorecard.com">AgentReady</a></div>
  <div>© 2026 SellToAgents · Scores from the free AgentReady scanner · Cite freely with a link.</div>
</footer>
</div>
</body>
</html>
`;
}

const battleHref = (a, b) =>
  `/brand-battle?a=${encodeURIComponent(a.domain)}&b=${encodeURIComponent(b.domain)}`;

function renderBrandPage(b, model) {
  const cat = b.cat;
  const rival = pickRival(b, model);
  const neighbors = pickNeighbors(b, model);
  const sentences = narrative(b, model);
  const canonical = `/brands/${b.slug}`;
  const title = `Is ${b.name} visible to AI shoppers? — AI Visibility Report`;
  const desc = `${b.name} (${b.domain}) scores ${b.score}/100 (grade ${b.grade}) for AI-shopping-agent readiness — #${b.rank} of ${model.total} brands, #${b.catRank} in ${cat.name}. Re-scanned weekly.`;

  const faq = [
    {
      "@type": "Question",
      name: `Is ${b.name} AI-visible?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `${b.name} (${b.domain}) scores ${b.score}/100 (grade ${b.grade}) on the AgentReady AI-visibility scan as of ${model.updatedAt}. It ranks #${b.rank} of ${model.total} brands in the DTC AI Visibility Index and #${b.catRank} of ${cat.brands.length} in the ${cat.name} category (category average: ${cat.avg}, index average: ${model.overallAvg}).`,
      },
    },
    {
      "@type": "Question",
      name: `What is ${b.name} failing?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: b.failing.length
          ? `As of ${model.updatedAt}, ${b.name} fails these AI-readiness checks: ${b.failing.join("; ")}. Each is a machine-readable signal AI shopping agents rely on to discover and recommend products.`
          : `As of ${model.updatedAt}, ${b.name} passes every AI-readiness check in our scan — no failing signals were found.`,
      },
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: title,
        description: desc,
        dateModified: model.updatedAt,
        author: { "@type": "Organization", name: "SellToAgents" },
        publisher: { "@type": "Organization", name: "SellToAgents" },
        mainEntityOfPage: SITE + canonical,
        about: { "@type": "Organization", name: b.name, url: "https://" + b.domain },
        isBasedOn: SITE + "/data/visibility-index.json",
      },
      {
        "@type": "Dataset",
        name: "DTC AI Visibility Index",
        description:
          "Weekly ranking of leading direct-to-consumer brands by AI-shopping-agent readiness score (0-100).",
        creator: { "@type": "Organization", name: "SellToAgents" },
        distribution: {
          "@type": "DataDownload",
          encodingFormat: "application/json",
          contentUrl: SITE + "/data/visibility-index.json",
        },
      },
      { "@type": "FAQPage", mainEntity: faq },
    ],
  };

  const failingBlock = b.failing.length
    ? `<h2>What ${esc(b.name)} is failing</h2>
<ul>${b.failing.map((f) => `<li><b>${esc(f)}</b> — a signal AI agents check before they can recommend a store.</li>`).join("\n")}</ul>
<p class="meta">Fixes for every one of these are in the <a href="/merchant-checklist">10-step readiness checklist</a>.</p>`
    : `<h2>What ${esc(b.name)} is failing</h2>
<p>Nothing. Our scan found no failing checks — crawler access, structured data and discovery files all passed. That puts ${esc(b.name)} in the minority of DTC brands.</p>`;

  const neighborLinks = neighbors
    .map((n) => `<a href="/brands/${n.slug}">${esc(n.name)} (${n.score})</a>`)
    .join(" · ");

  const body = `
<p class="meta"><a href="/brands/">Brand reports</a> › <a href="/brands/category-${cat.slug}">${esc(cat.name)}</a> › ${esc(b.name)} · Updated ${esc(model.updatedAt)}, re-scanned weekly</p>
<h1>Is ${esc(b.name)} visible to AI shoppers?</h1>
<p class="lead">${esc(b.domain)} · ${esc(cat.name)} · scanned with <a href="https://agentready.agiscorecard.com">AgentReady</a> across crawler access, structured data, llms.txt, sitemap and answer-readiness signals.</p>

<div class="card">
  <b style="font-size:34px">${b.score}/100</b> <span class="score-pill ${gradeClass(b.grade)}">${esc(b.grade)}</span>
  <div class="scorebar" role="img" aria-label="Score ${b.score} out of 100"><i style="width:${Math.max(2, Math.min(100, b.score))}%"></i></div>
  <p class="meta">Index average: ${model.overallAvg} · ${esc(cat.name)} average: ${cat.avg}</p>
</div>

<div class="statrow">
  <div class="stat"><b>#${b.rank} <span style="font-size:13px;color:var(--dim)">of ${model.total}</span></b><span>overall rank</span></div>
  <div class="stat"><b>#${b.catRank} <span style="font-size:13px;color:var(--dim)">of ${cat.brands.length}</span></b><span>in <a href="/brands/category-${cat.slug}">${esc(cat.name)}</a></span></div>
  <div class="stat"><b>${signed(b.score - cat.avg)}</b><span>vs category average</span></div>
  <div class="stat"><b>${signed(b.score - model.overallAvg)}</b><span>vs index average</span></div>
</div>

<p>${sentences.map(esc).join(" ")}</p>

${failingBlock}

${rival ? `<div class="cta">
  <h3>⚔️ Battle ${esc(b.name)}</h3>
  <p>Closest ${esc(cat.brands.length > 1 ? cat.name : "index")} rival by score: <b>${esc(rival.name)}</b> (${rival.score}/100). Watch them fight it out.</p>
  <a class="btn" href="${battleHref(b, rival)}">${esc(b.name)} vs ${esc(rival.name)} →</a>
</div>` : ""}

<div class="tldr"><b>Method:</b> the homepage of ${esc(b.domain)} is scanned live by the free AgentReady scanner every week; the score is a weighted sum of 19 machine-readable signals AI shopping agents rely on. A high score doesn't guarantee recommendations — a low one nearly guarantees invisibility.</div>

<p class="meta">More in ${esc(cat.name)}: ${neighborLinks} · <a href="/brands/category-${cat.slug}">full ${esc(cat.name)} ranking</a> · <a href="/brands/">all ${model.total} brand reports</a></p>

<div class="cta">
  <h3>Scan your own store</h3>
  <p>Same 19-signal scan we ran on ${esc(b.name)} — free, 10 seconds, no signup.</p>
  <a class="btn" href="https://agentready.agiscorecard.com">Scan my store free →</a>
</div>
`;

  return pageChrome(title, desc, canonical, "article", jsonLd, body);
}

function renderCategoryPage(cat, model) {
  const canonical = `/brands/category-${cat.slug}`;
  const best = cat.brands[0];
  const worst = cat.brands[cat.brands.length - 1];
  const title = `${cat.name}: DTC brands ranked by AI visibility`;
  const desc = `${cat.brands.length} ${cat.name} brands ranked by AI-shopping-agent readiness (category average ${cat.avg}/100). ${best.name} leads at ${best.score}. Re-scanned weekly.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description: desc,
    dateModified: model.updatedAt,
    isPartOf: { "@type": "WebSite", name: "SellToAgents", url: SITE },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: cat.brands.length,
      itemListElement: cat.brands.map((b, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: b.name,
        url: SITE + "/brands/" + b.slug,
      })),
    },
  };

  const rows = cat.brands
    .map((b) => {
      const rival = pickRival(b, model);
      return `<tr><td>${b.catRank}</td><td><a href="/brands/${b.slug}"><b>${esc(b.name)}</b></a> <span class="meta">${esc(b.domain)}</span></td><td><span class="score-pill ${gradeClass(b.grade)}">${b.score}</span> ${esc(b.grade)}</td><td class="meta">#${b.rank} overall</td><td>${rival ? `<a href="${battleHref(b, rival)}">⚔️ vs ${esc(rival.name)}</a>` : "—"}</td></tr>`;
    })
    .join("\n");

  const body = `
<p class="meta"><a href="/brands/">Brand reports</a> › ${esc(cat.name)} · Updated ${esc(model.updatedAt)}, re-scanned weekly</p>
<h1>${esc(cat.name)}: ranked by AI visibility</h1>
<p class="lead">${cat.brands.length} ${esc(cat.name)} brands from the <a href="/ai-visibility-index">DTC AI Visibility Index</a>, scored 0–100 on the machine-readable signals AI shopping agents rely on.</p>

<div class="statrow">
  <div class="stat"><b>${cat.avg}/100</b><span>category average (index: ${model.overallAvg})</span></div>
  <div class="stat"><b>${cat.brands.length}</b><span>brands scanned</span></div>
</div>

<div class="card"><span class="tag">Best in category</span> <a class="title" href="/brands/${best.slug}">${esc(best.name)} — ${best.score}/100 (${esc(best.grade)})</a><p>${signed(best.score - cat.avg)} vs the ${esc(cat.name)} average; #${best.rank} of ${model.total} overall.</p></div>
${worst !== best ? `<div class="card"><span class="tag">Most room to gain</span> <a class="title" href="/brands/${worst.slug}">${esc(worst.name)} — ${worst.score}/100 (${esc(worst.grade)})</a><p>${signed(worst.score - cat.avg)} vs the category average${worst.failing.length ? "; failing: " + esc(worst.failing.join(", ")) : ""}.</p></div>` : ""}

<table class="rank-table"><tr><th>#</th><th>Brand</th><th>Score</th><th>Overall</th><th>Battle</th></tr>
${rows}
</table>

<div class="cta">
  <h3>Is your ${esc(cat.name.toLowerCase())} store on this list?</h3>
  <p>Run the same free scan and see where you'd rank.</p>
  <a class="btn" href="https://agentready.agiscorecard.com">Scan my store free →</a>
</div>
`;

  return pageChrome(title, desc, canonical, "website", jsonLd, body);
}

function renderHubPage(model) {
  const canonical = `/brands/`;
  const title = `AI Visibility Brand Reports — ${model.total} DTC brands`;
  const desc = `Individual AI-visibility reports for ${model.total} DTC brands across ${model.categories.length} categories: score, grade, rank, failing checks. Re-scanned weekly.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description: desc,
    dateModified: model.updatedAt,
    isPartOf: { "@type": "WebSite", name: "SellToAgents", url: SITE },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: model.categories.length,
      itemListElement: model.categories.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        url: SITE + "/brands/category-" + c.slug,
      })),
    },
  };

  const sections = model.categories
    .map(
      (c) => `<h2><a href="/brands/category-${c.slug}">${esc(c.name)}</a> <span class="meta">avg ${c.avg}/100 · ${c.brands.length} brands</span></h2>
<table class="rank-table"><tr><th>#</th><th>Brand</th><th>Score</th></tr>
${c.brands.map((b) => `<tr><td>${b.catRank}</td><td><a href="/brands/${b.slug}">Is <b>${esc(b.name)}</b> visible to AI shoppers?</a></td><td><span class="score-pill ${gradeClass(b.grade)}">${b.score}</span> ${esc(b.grade)}</td></tr>`).join("\n")}
</table>`
    )
    .join("\n");

  const body = `
<p class="meta">Brand reports · Updated ${esc(model.updatedAt)}, re-scanned weekly · <a href="/data/visibility-index.json">Raw data (JSON)</a></p>
<h1>AI Visibility Brand Reports</h1>
<p class="lead">One report per brand from the <a href="/ai-visibility-index">DTC AI Visibility Index</a>: score, grade, overall and category rank, exactly which AI-readiness checks fail, and a head-to-head <a href="/brand-battle">battle link</a> against its nearest rival.</p>

<div class="statrow">
  <div class="stat"><b>${model.total}</b><span>brand reports</span></div>
  <div class="stat"><b>${model.categories.length}</b><span>categories</span></div>
  <div class="stat"><b>${model.overallAvg}/100</b><span>index average</span></div>
</div>

${sections}

<div class="cta">
  <h3>Scan your own store</h3>
  <p>The same free 19-signal scan behind every report on this page.</p>
  <a class="btn" href="https://agentready.agiscorecard.com">Scan my store free →</a>
</div>
`;

  return pageChrome(title, desc, canonical, "website", jsonLd, body);
}

/* ---- sitemap: parse + merge, never clobber non-brand URLs ---------- */

function regenerateSitemap(model, generatedPaths) {
  const sitemapFile = pub("sitemap.xml");
  let kept = [];
  if (fs.existsSync(sitemapFile)) {
    const xml = fs.readFileSync(sitemapFile, "utf8");
    const entries = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
    kept = entries.filter((e) => {
      const loc = (e.match(/<loc>([\s\S]*?)<\/loc>/) || [])[1] || "";
      return !loc.startsWith(SITE + "/brands");
    });
  }
  const brandEntries = generatedPaths.map((p) => {
    // p like "brands/xxx.html" -> extensionless URL; hub -> /brands/
    let loc = SITE + "/" + p.replace(/index\.html$/, "").replace(/\.html$/, "");
    const pri = p === "brands/index.html" ? "0.8" : p.startsWith("brands/category-") ? "0.7" : "0.6";
    return `  <url><loc>${esc(loc)}</loc><lastmod>${esc(model.updatedAt)}</lastmod><priority>${pri}</priority></url>`;
  });
  const out =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    kept.map((e) => "  " + e.trim()).join("\n") +
    (kept.length ? "\n" : "") +
    brandEntries.join("\n") +
    `\n</urlset>\n`;
  fs.writeFileSync(sitemapFile, out);
  console.log(`sitemap.xml: kept ${kept.length} existing URLs, added ${brandEntries.length} brand/category URLs`);
}

/* ---- llms.txt: one hub line, idempotent ---------------------------- */

function ensureLlmsTxtLine(model) {
  const file = pub("llms.txt");
  if (!fs.existsSync(file)) return;
  let txt = fs.readFileSync(file, "utf8");
  const line = `- [Brand AI-visibility reports](/brands/): individual weekly report pages for all ${model.total} indexed brands (score, rank, failing checks), grouped by category`;
  if (txt.includes("](/brands/)")) {
    // Refresh the count on the existing line.
    txt = txt.replace(/^- \[Brand AI-visibility reports\]\(\/brands\/\).*$/m, line);
  } else {
    // Insert right after the visibility-index line in the Data section.
    const anchor = txt
      .split("\n")
      .find((l) => l.includes("/ai-visibility-index"));
    if (anchor) txt = txt.replace(anchor, anchor + "\n" + line);
    else txt = txt.trimEnd() + "\n\n## Data\n" + line + "\n";
  }
  fs.writeFileSync(file, txt);
  console.log("llms.txt: brand-reports hub line ensured");
}

/* ---- generation driver + stale-page cleanup via manifest ----------- */

function generateBrandSurface(data) {
  const model = buildModel(data);
  const brandsDir = pub("brands");
  fs.mkdirSync(brandsDir, { recursive: true });

  const written = [];
  const write = (rel, html) => {
    fs.writeFileSync(pub(rel), html);
    written.push(rel);
  };

  for (const b of model.brands) write(`brands/${b.slug}.html`, renderBrandPage(b, model));
  for (const c of model.categories) write(`brands/category-${c.slug}.html`, renderCategoryPage(c, model));
  write("brands/index.html", renderHubPage(model));

  // Remove pages for brands/categories that dropped out since the last run.
  const manifestFile = pub("data/brands-manifest.json");
  let stale = [];
  if (fs.existsSync(manifestFile)) {
    try {
      const prev = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
      const current = new Set(written);
      stale = (prev.files || []).filter((f) => f.startsWith("brands/") && !current.has(f));
      for (const f of stale) fs.rmSync(pub(f), { force: true });
    } catch (e) {
      console.warn("brands-manifest.json unreadable, skipping stale cleanup: " + e.message);
    }
  }
  fs.mkdirSync(pub("data"), { recursive: true });
  fs.writeFileSync(
    manifestFile,
    JSON.stringify({ generatedAt: model.updatedAt, count: written.length, files: written.sort() }, null, 2)
  );

  regenerateSitemap(model, written);
  ensureLlmsTxtLine(model);

  console.log(
    `brand pages: ${model.brands.length} brands + ${model.categories.length} categories + 1 hub = ${written.length} pages` +
      (stale.length ? `; removed ${stale.length} stale page(s)` : "")
  );
  return written;
}

generateBrandSurface(payload);
