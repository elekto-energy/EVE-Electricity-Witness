/**
 * Enrich raw statements with fulltext from per-anförande HTML endpoint.
 *
 * Usage:
 *   npx tsx packages/evidence/src/enrich_riksdagen_fulltext.ts \
 *     --raw_dir data/raw/riksdagen/riksdagen_anf_20260215
 *
 * Reads anforanden_raw.json, fetches fulltext for items where anforandetext is empty,
 * writes enriched file back (overwrites raw with text added).
 *
 * CODEFACTORY scope.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import https from "https";

const args = process.argv.slice(2);
function getArg(name: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  throw new Error(`Missing --${name}`);
}

const rawDir = resolve(getArg("raw_dir"));
const rawFile = resolve(rawDir, "anforanden_raw.json");

const items = JSON.parse(readFileSync(rawFile, "utf-8"));
console.log(`Loaded ${items.length} raw anföranden`);

const needText = items.filter((i: any) => !i.anforandetext || i.anforandetext.trim() === "");
console.log(`Need fulltext: ${needText.length}/${items.length}`);

async function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "Accept": "text/html" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (loc) return fetchText(loc).then(resolve).catch(reject);
      }
      let data = "";
      res.setEncoding("utf-8");
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          resolve(""); // empty on error, don't crash
        }
      });
      res.on("error", () => resolve(""));
    }).on("error", () => resolve(""));
  });
}

function extractTextFromHtml(html: string): string {
  // Strip HTML tags, decode entities, trim
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  let enriched = 0;
  let failed = 0;

  for (let i = 0; i < needText.length; i++) {
    const item = needText[i];
    const url = item.anforande_url_html;
    if (!url) { failed++; continue; }

    process.stdout.write(`\r(${i + 1}/${needText.length}) ${item.dok_id}-${item.anforande_nummer}...`);

    const html = await fetchText(url);
    if (html.length > 50) {
      const text = extractTextFromHtml(html);
      item.anforandetext = text;
      enriched++;
    } else {
      failed++;
    }

    await sleep(400); // polite
  }

  console.log(`\n\nEnriched: ${enriched}, Failed: ${failed}`);

  // Write back
  writeFileSync(rawFile, JSON.stringify(items, null, 2));
  console.log(`Saved: ${rawFile}`);
}

run().catch(e => { console.error(e); process.exit(1); });
