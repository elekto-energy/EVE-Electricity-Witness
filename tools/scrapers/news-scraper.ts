/**
 * news-scraper.ts — Fas 2 scraper för Ei, Energimyndigheten, SVK, Second Opinion
 *
 * Hämtar nya nyheter och föreslår poster i curated_v1.json-format.
 * Kör manuellt eller via cron. Skriver INTE direkt till curated_v1.json —
 * skriver till staging-fil för manuell granskning (witness mode).
 *
 * Usage:
 *   npx tsx tools/scrapers/news-scraper.ts
 *
 * Output:
 *   data/canonical/news/staging_YYYY-MM-DD.json
 */

import * as https from "https";
import * as fs from "fs";
import * as path from "path";

// ─── Config ─────────────────────────────────────────────────────────
interface SourceConfig {
  id: string;
  name: string;
  newsUrl: string;
  /** CSS-like hint for extracting news items (used by future DOM parser) */
  selector_hint: string;
  /** Regex patterns to match relevant news URLs */
  urlPatterns: RegExp[];
  /** Categories this source typically covers */
  defaultCategories: string[];
}

const SOURCES: SourceConfig[] = [
  {
    id: "ei",
    name: "Ei",
    newsUrl: "https://ei.se/om-oss/nyheter",
    selector_hint: "article, .news-item, h2 a",
    urlPatterns: [
      /ei\.se\/om-oss\/nyheter\/\d{4}\//,
      /ei\.se\/om-oss\/nyheter\/laget-pa-elmarknaden/,
    ],
    defaultCategories: ["nätreglering", "effektavgifter", "elpris", "systemtjänster"],
  },
  {
    id: "energimyndigheten",
    name: "Energimyndigheten",
    newsUrl: "https://www.energimyndigheten.se/nyhetsarkiv/",
    selector_hint: ".news-list-item, article a",
    urlPatterns: [
      /energimyndigheten\.se\/nyhetsarkiv\/\d{4}\//,
    ],
    defaultCategories: ["produktion", "klimat", "beredskap"],
  },
  {
    id: "svk",
    name: "SVK",
    newsUrl: "https://www.svk.se/press-och-nyheter/nyheter/allmanna-nyheter/",
    selector_hint: ".news-list a",
    urlPatterns: [
      /svk\.se\/press-och-nyheter\/(nyheter|press)\//,
    ],
    defaultCategories: ["flaskhalsar", "systemtjänster", "produktion"],
  },
  {
    id: "second-opinion",
    name: "Second Opinion",
    newsUrl: "https://second-opinion.se/",
    selector_hint: "article h2 a",
    urlPatterns: [
      /second-opinion\.se\/[\w-]+\/?$/,
    ],
    defaultCategories: ["flaskhalsar", "elpris", "produktion"],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────
function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "ELEKTO-EU-Scraper/1.0 (+https://elekto.eu)" } }, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

function extractLinks(html: string, baseUrl: string, patterns: RegExp[]): string[] {
  const linkRegex = /href=["']([^"']+)["']/gi;
  const links: string[] = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    let href = match[1];
    // Make absolute
    if (href.startsWith("/")) {
      const u = new URL(baseUrl);
      href = u.origin + href;
    }
    // Check against patterns
    if (patterns.some((p) => p.test(href))) {
      if (!links.includes(href)) links.push(href);
    }
  }
  return links;
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].replace(/\s*[-–|].+$/, "").trim() : "Untitled";
}

function extractDate(url: string): string {
  // Try to extract from URL pattern like /2026/2026-02-12-...
  const m = url.match(/(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  // Try year-only from URL
  const y = url.match(/\/(\d{4})\//);
  if (y) return `${y[1]}-01-01`;
  return new Date().toISOString().slice(0, 10);
}

function generateId(source: string, date: string, title: string): string {
  const slug = title.toLowerCase().replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/[^a-z0-9]+/g, "_").slice(0, 40);
  return `news_${date.replace(/-/g, "")}_${source}_${slug}`;
}

// ─── Main ───────────────────────────────────────────────────────────
async function scrapeSource(source: SourceConfig): Promise<any[]> {
  console.log(`\n📡 Scraping ${source.name}: ${source.newsUrl}`);
  try {
    const html = await fetchUrl(source.newsUrl);
    const links = extractLinks(html, source.newsUrl, source.urlPatterns);
    console.log(`   Found ${links.length} news links`);

    const results: any[] = [];
    // Only process first 5 newest links to avoid hammering
    for (const link of links.slice(0, 5)) {
      try {
        const pageHtml = await fetchUrl(link);
        const title = extractTitle(pageHtml);
        const date = extractDate(link);
        results.push({
          id: generateId(source.id, date, title),
          date,
          source: source.name,
          source_url: link,
          category: source.defaultCategories[0],
          title,
          summary: "⚠️ AUTO-SCRAPED — sammanfatta manuellt i witness mode",
          platform_link: null,
          platform_context: null,
          _auto_scraped: true,
          _scraped_at: new Date().toISOString(),
        });
        console.log(`   ✅ ${date}: ${title.slice(0, 60)}`);
      } catch (e: any) {
        console.log(`   ❌ Failed: ${link} — ${e.message}`);
      }
    }
    return results;
  } catch (e: any) {
    console.log(`   ❌ Source failed: ${e.message}`);
    return [];
  }
}

async function main() {
  console.log("🔄 ELEKTO EU News Scraper — Fas 2");
  console.log("=" .repeat(50));

  // Load existing IDs to avoid duplicates
  const projectRoot = path.resolve(__dirname, "../..");
  const curatedPath = path.resolve(projectRoot, "data/canonical/news/curated_v1.json");
  let existingIds = new Set<string>();
  if (fs.existsSync(curatedPath)) {
    const existing = JSON.parse(fs.readFileSync(curatedPath, "utf-8"));
    existingIds = new Set((existing.items ?? []).map((i: any) => i.source_url).filter(Boolean));
  }

  const allNew: any[] = [];
  for (const source of SOURCES) {
    const items = await scrapeSource(source);
    for (const item of items) {
      if (!existingIds.has(item.source_url)) {
        allNew.push(item);
      } else {
        console.log(`   ⏭️  Already exists: ${item.title.slice(0, 50)}`);
      }
    }
  }

  if (allNew.length === 0) {
    console.log("\n✅ No new items found. Everything up to date.");
    return;
  }

  // Write staging file
  const today = new Date().toISOString().slice(0, 10);
  const stagingPath = path.resolve(projectRoot, `data/canonical/news/staging_${today}.json`);
  fs.writeFileSync(stagingPath, JSON.stringify({
    _meta: {
      scraped_at: new Date().toISOString(),
      item_count: allNew.length,
      note: "REVIEW REQUIRED: Sammanfatta varje nyhet i egna ord (witness mode) innan du kopierar till curated_v1.json",
    },
    items: allNew,
  }, null, 2), "utf-8");

  console.log(`\n📋 ${allNew.length} new items written to:`);
  console.log(`   ${stagingPath}`);
  console.log(`\n⚠️  REVIEW REQUIRED: Öppna staging-filen, skriv sammanfattningar, flytta till curated_v1.json`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
