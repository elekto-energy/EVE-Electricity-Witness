/**
 * ECB EUR/SEK Forex Ingest
 *
 * Fetches daily EUR/SEK exchange rate from ECB Statistical Data Warehouse.
 * Writes canonical NDJSON: one line per business day.
 *
 * Source: ECB SDW — EXR/D.SEK.EUR.SP00.A
 * URL: https://data-api.ecb.europa.eu
 * License: Open (ECB Terms of Use)
 *
 * Output: data/canonical/ecb/eur_sek_daily.ndjson
 *   Each line: { "date": "YYYY-MM-DD", "rate": number, "source": "ECB" }
 *
 * TR1: No source, no number.
 * TR2: Ingest → manifest + SHA256.
 * TR6: Code reads — never invents.
 *
 * Usage:
 *   npx tsx packages/evidence/src/ingest_ecb_forex.ts
 *   npx tsx packages/evidence/src/ingest_ecb_forex.ts --from 2020-01-01
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";

// ─── Config ──────────────────────────────────────────────────────────────────

const ECB_URL = "https://data-api.ecb.europa.eu/service/data/EXR/D.SEK.EUR.SP00.A";
const OUT_DIR = resolve(__dirname, "../../../data/canonical/ecb");
const OUT_FILE = resolve(OUT_DIR, "eur_sek_daily.ndjson");
const MANIFEST_FILE = resolve(OUT_DIR, "eur_sek_manifest.json");

// ─── Types ───────────────────────────────────────────────────────────────────

interface ForexRow {
  date: string;
  rate: number;
  source: "ECB";
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

async function fetchECB(startDate?: string): Promise<ForexRow[]> {
  let url = `${ECB_URL}?format=jsondata`;
  if (startDate) {
    url += `&startPeriod=${startDate}`;
  }

  console.log(`[ECB] Fetching: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ECB API error: ${res.status} ${res.statusText}`);

  const data = await res.json();
  const series = data.dataSets?.[0]?.series?.["0:0:0:0:0"];
  if (!series) throw new Error("No series found in ECB response");

  const observations = series.observations;
  const dates = data.structure.dimensions.observation[0].values;

  const rows: ForexRow[] = [];
  for (const [idx, val] of Object.entries(observations) as [string, any][]) {
    const date = dates[parseInt(idx)]?.id;
    const rate = val[0];
    if (date && typeof rate === "number" && rate > 0) {
      rows.push({ date, rate, source: "ECB" });
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  console.log(`[ECB] Fetched ${rows.length} observations (${rows[0]?.date} → ${rows[rows.length - 1]?.date})`);
  return rows;
}

// ─── Merge with existing ─────────────────────────────────────────────────────

function loadExisting(): Map<string, ForexRow> {
  const map = new Map<string, ForexRow>();
  if (!existsSync(OUT_FILE)) return map;
  const lines = readFileSync(OUT_FILE, "utf-8").split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const row: ForexRow = JSON.parse(line);
      map.set(row.date, row);
    } catch { /* skip malformed */ }
  }
  return map;
}

// ─── Write ───────────────────────────────────────────────────────────────────

function writeCanonical(rows: ForexRow[]) {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const ndjson = rows.map(r => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(OUT_FILE, ndjson, "utf-8");

  // SHA256
  const hash = createHash("sha256").update(ndjson).digest("hex");

  // Manifest
  const manifest = {
    source: "ECB Statistical Data Warehouse",
    api: ECB_URL,
    series: "EXR/D.SEK.EUR.SP00.A",
    description: "Daily EUR/SEK exchange rate (ECB reference rate)",
    license: "ECB Terms of Use (open)",
    file: "eur_sek_daily.ndjson",
    count: rows.length,
    first_date: rows[0]?.date ?? null,
    last_date: rows[rows.length - 1]?.date ?? null,
    last_rate: rows[rows.length - 1]?.rate ?? null,
    sha256: hash,
    ingested_at: new Date().toISOString(),
  };

  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`[ECB] Wrote ${rows.length} rows → ${OUT_FILE}`);
  console.log(`[ECB] SHA256: ${hash}`);
  console.log(`[ECB] Latest: ${manifest.last_date} = ${manifest.last_rate} SEK/EUR`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const fromIdx = args.indexOf("--from");
  const startDate = fromIdx >= 0 ? args[fromIdx + 1] : undefined;

  // Load existing
  const existing = loadExisting();
  console.log(`[ECB] Existing: ${existing.size} rows`);

  // Determine start date: if no --from and we have data, start from last date
  let fetchFrom = startDate;
  if (!fetchFrom && existing.size > 0) {
    const lastDate = [...existing.keys()].sort().pop()!;
    fetchFrom = lastDate;
    console.log(`[ECB] Incremental from ${fetchFrom}`);
  }

  // Fetch
  const fetched = await fetchECB(fetchFrom);

  // Merge
  for (const row of fetched) {
    existing.set(row.date, row); // overwrites if same date
  }

  // Sort and write
  const all = [...existing.values()].sort((a, b) => a.date.localeCompare(b.date));
  writeCanonical(all);
}

main().catch(e => { console.error(e); process.exit(1); });
