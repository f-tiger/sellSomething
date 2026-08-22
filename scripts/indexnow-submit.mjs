#!/usr/bin/env node
/**
 * IndexNow bulk submitter for the sellSomething site network.
 *
 * For each host: fetch its sitemap.xml, extract <loc> URLs, and POST them to
 * https://api.indexnow.org/indexnow (one call per host, max 10,000 URLs/call
 * per the IndexNow spec). Bing/Seznam/Naver/Yandex share submissions; Bing's
 * index feeds ChatGPT search & Copilot citations.
 *
 * The key is PUBLIC by design (IndexNow verifies ownership by fetching
 * https://<host>/<key>.txt, which each site serves from its public/ dir).
 *
 * Env overrides:
 *   HOSTS=a.com,b.com   Limit/override the host list.
 *   DRY_RUN=1           Print payloads, do not POST.
 *   LOCAL_SITES_DIR=sites
 *                       Read sitemaps from <dir>/<site>/public/sitemap.xml on
 *                       disk instead of fetching over HTTP (site = first label
 *                       of the host). Only changes where sitemaps come from;
 *                       combine with DRY_RUN=1 to also skip posting (the usual
 *                       sandbox validation combo).
 *
 * Exit code: 0 unless every host failed (fail-soft per host).
 * Node 18+, zero dependencies.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const INDEXNOW_KEY = "ad507fbb239efebd673cabe2a2a683db";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS_PER_CALL = 10000;

const DEFAULT_HOSTS = [
  "agentready.agiscorecard.com",
  "selltoagents.agiscorecard.com",
  "closecalc.agiscorecard.com",
  "agentfront.agiscorecard.com",
  "mcppulse.agiscorecard.com",
  "glossary.agiscorecard.com",
  "tools.agiscorecard.com",
  "x402.agiscorecard.com",
];

const hosts = (process.env.HOSTS
  ? process.env.HOSTS.split(",").map((h) => h.trim()).filter(Boolean)
  : DEFAULT_HOSTS);

const dryRun = process.env.DRY_RUN === "1";
const localSitesDir = process.env.LOCAL_SITES_DIR || "";

/** Extract <loc> values from sitemap XML (urlset or sitemapindex). */
function parseLocs(xml) {
  const locs = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    // Unescape the five predefined XML entities that may appear in URLs.
    const url = m[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    locs.push(url);
  }
  return locs;
}

/** Load sitemap XML for a host, from disk (LOCAL_SITES_DIR) or over HTTP. */
async function loadSitemap(host) {
  if (localSitesDir) {
    const site = host.split(".")[0];
    const path = join(localSitesDir, site, "public", "sitemap.xml");
    return await readFile(path, "utf8");
  }
  const res = await fetch(`https://${host}/sitemap.xml`, {
    headers: { "user-agent": "sellSomething-indexnow-submit/1.0" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`GET /sitemap.xml -> HTTP ${res.status}`);
  return await res.text();
}

/** POST one host's URL list to IndexNow. Returns HTTP status. */
async function submit(host, urlList) {
  const payload = {
    host,
    key: INDEXNOW_KEY,
    keyLocation: `https://${host}/${INDEXNOW_KEY}.txt`,
    urlList,
  };
  if (dryRun) {
    console.log(`[dry-run] POST ${INDEXNOW_ENDPOINT}`);
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }
  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  return res.status;
}

const statusMeaning = {
  200: "OK (accepted)",
  202: "Accepted (key validation pending)",
  400: "Bad Request (invalid format)",
  403: "Forbidden (key not valid / key file missing)",
  422: "Unprocessable Entity (URLs don't belong to host or key mismatch)",
  429: "Too Many Requests (potential spam / rate limited)",
};

let okCount = 0;
let failCount = 0;

for (const host of hosts) {
  let urls;
  try {
    urls = parseLocs(await loadSitemap(host));
  } catch (err) {
    console.warn(`[warn] ${host}: sitemap unavailable, skipping (${err.message})`);
    continue; // missing sitemap = skip, not a failure
  }
  if (urls.length === 0) {
    console.warn(`[warn] ${host}: sitemap has no <loc> entries, skipping`);
    continue;
  }
  if (urls.length > MAX_URLS_PER_CALL) {
    console.warn(
      `[warn] ${host}: ${urls.length} URLs exceeds ${MAX_URLS_PER_CALL}, truncating`
    );
    urls = urls.slice(0, MAX_URLS_PER_CALL);
  }

  try {
    const status = await submit(host, urls);
    if (dryRun) {
      console.log(`[dry-run] ${host}: ${urls.length} URLs (not posted)`);
      okCount++;
    } else if (status === 200 || status === 202) {
      console.log(
        `[ok] ${host}: submitted ${urls.length} URLs -> HTTP ${status} ${statusMeaning[status]}`
      );
      okCount++;
    } else {
      console.error(
        `[fail] ${host}: ${urls.length} URLs -> HTTP ${status} ${statusMeaning[status] ?? ""}`
      );
      failCount++;
    }
  } catch (err) {
    console.error(`[fail] ${host}: submit error (${err.message})`);
    failCount++;
  }
}

console.log(`\nDone: ${okCount} host(s) submitted, ${failCount} failed.`);
// Fail-soft: only exit non-zero when every attempted host failed.
if (failCount > 0 && okCount === 0) {
  process.exit(1);
}
