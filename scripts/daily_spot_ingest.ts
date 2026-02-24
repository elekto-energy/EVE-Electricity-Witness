#!/usr/bin/env npx tsx
/**
 * Daily Spot Ingest — Fetch + Merge + Rebuild
 *
 * Runs daily via cron at 14:00 CET (after Nord Pool publication ~12:45 CET).
 *
 * Pipeline:
 *   1. Fetch yesterday's day-ahead prices from ENTSO-E A44 (per zone, with retry)
 *   2. Merge into monthly canonical file: data/canonical/entsoe/entsoe_dayahead_SE_{YYYYMM}/day_ahead_prices.json
 *   3. Run build_timeseries_v2.ts for current month (rebuilds NDJSON)
 *   4. Restart PM2 process
 *
 * Usage:
 *   npx tsx scripts/daily_spot_ingest.ts
 *   npx tsx scripts/daily_spot_ingest.ts --date 2026-02-24   # backfill specific date
 *
 * Environment:
 *   ENTSOE_TOKEN (or reads from apps/web/.env.local)
 *
 * TR1: No source, no number.
 * TR6: Code fetches — never invents.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { execSync } from "child_process";

const PROJECT_ROOT = resolve(__dirname, "..");
const CANONICAL_DIR = join(PROJECT_ROOT, "data", "canonical", "entsoe");
const SE_ZONES = ["SE1", "SE2", "SE3", "SE4"];
const EU_ZONES = ["FI", "DE_LU", "NO1", "NO2", "EE", "LT", "LV", "NL", "PL", "FR", "ES"];

// ─── Config ──────────────────────────────────────────────────────────────────

function getToken(): string {
  if (process.env.ENTSOE_TOKEN) return process.env.ENTSOE_TOKEN;
  // Read from .env.local
  const envPath = join(PROJECT_ROOT, "apps", "web", ".env.local");
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const m = line.match(/^ENTSOE_TOKEN=(.+)$/);
      if (m) return m[1].trim();
    }
  }
  throw new Error("ENTSOE_TOKEN not found in env or .env.local");
}

function parseArgs(): { date: string; zones: string[] } {
  const args = process.argv.slice(2);
  let dateArg = "";
  let zonesArg = "SE"; // default SE zones only

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--date" && args[i + 1]) dateArg = args[++i];
    if (args[i] === "--zones" && args[i + 1]) zonesArg = args[++i];
  }

  // Default: yesterday UTC
  if (!dateArg) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    dateArg = d.toISOString().slice(0, 10);
  }

  let zones: string[];
  if (zonesArg === "SE") zones = SE_ZONES;
  else if (zonesArg === "ALL") zones = [...SE_ZONES, ...EU_ZONES];
  else zones = zonesArg.split(",").map(s => s.trim());

  return { date: dateArg, zones };
}

// ─── ENTSO-E Fetch (inline, no import dependency issues) ─────────────────────

const ZONE_EIC: Record<string, string> = {
  SE1: "10Y1001A1001A44P", SE2: "10Y1001A1001A45N",
  SE3: "10Y1001A1001A46L", SE4: "10Y1001A1001A47J",
  FI: "10YFI-1--------U", DE_LU: "10Y1001A1001A82H",
  NO1: "10YNO-1--------2", NO2: "10YNO-2--------T",
  EE: "10Y1001A1001A39I", LT: "10YLT-1001A0008Q",
  LV: "10YLV-1001A00074", NL: "10YNL----------L",
  PL: "10YPL-AREA-----S", FR: "10YFR-RTE------C",
  ES: "10YES-REE------0",
};

interface FetchedZoneData {
  zone_code: string;
  zone_eic: string;
  period_start: string;
  period_end: string;
  resolution: string;
  currency: string;
  unit: string;
  prices: Array<{ position: number; price_eur_mwh: number }>;
  evidence_id: string;
  source: { name: string; publisher: string; dataset_id: string; uri: string };
  fetched_at_utc: string;
}

async function fetchZoneDay(
  token: string, zone: string, date: string, retries: number = 3
): Promise<FetchedZoneData[]> {
  const eic = ZONE_EIC[zone];
  if (!eic) { console.error(`  Unknown zone: ${zone}`); return []; }

  const periodStart = date.replace(/-/g, "") + "0000";
  const nextDay = new Date(date + "T00:00:00Z");
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const periodEnd = nextDay.toISOString().slice(0, 10).replace(/-/g, "") + "0000";

  const url = `https://web-api.tp.entsoe.eu/api?securityToken=${token}` +
    `&documentType=A44&in_Domain=${eic}&out_Domain=${eic}` +
    `&periodStart=${periodStart}&periodEnd=${periodEnd}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        console.error(`  ${zone} attempt ${attempt}: HTTP ${res.status}`);
        if (attempt < retries) { await sleep(5000 * attempt); continue; }
        return [];
      }

      const xml = await res.text();

      if (xml.includes("Acknowledgement_MarketDocument")) {
        const errText = xml.match(/<text>([^<]*)<\/text>/)?.[1] ?? "unknown";
        console.error(`  ${zone} attempt ${attempt}: API error — ${errText}`);
        if (attempt < retries) { await sleep(5000 * attempt); continue; }
        return [];
      }

      // Parse periods
      const records: FetchedZoneData[] = [];
      const tsParts = xml.split("<TimeSeries>");

      for (let ti = 1; ti < tsParts.length; ti++) {
        const tsBlock = tsParts[ti];
        const periods = tsBlock.split("<Period>");

        for (let pi = 1; pi < periods.length; pi++) {
          const period = periods[pi];
          const startMatch = period.match(/<start>(.*?)<\/start>/);
          const endMatch = period.match(/<end>(.*?)<\/end>/);
          const resMatch = period.match(/<resolution>(.*?)<\/resolution>/);
          if (!startMatch || !endMatch) continue;

          const prices: Array<{ position: number; price_eur_mwh: number }> = [];
          const points = period.split("<Point>");
          for (let i = 1; i < points.length; i++) {
            const posM = points[i].match(/<position>(\d+)<\/position>/);
            const priceM = points[i].match(/<price\.amount>([\d.\-]+)<\/price\.amount>/);
            if (posM && priceM) {
              prices.push({ position: parseInt(posM[1]), price_eur_mwh: parseFloat(priceM[1]) });
            }
          }

          if (prices.length > 0) {
            records.push({
              zone_code: zone,
              zone_eic: eic,
              period_start: startMatch[1],
              period_end: endMatch[1],
              resolution: resMatch?.[1] ?? "PT60M",
              currency: "EUR",
              unit: "MWH",
              prices,
              evidence_id: `evr:entsoe:day_ahead_a44:daily_${date}:${zone}`,
              source: {
                name: "ENTSO-E Transparency Platform",
                publisher: "ENTSO-E",
                dataset_id: "day_ahead_prices_A44",
                uri: `https://transparency.entsoe.eu/`,
              },
              fetched_at_utc: new Date().toISOString(),
            });
          }
        }
      }

      return records;
    } catch (err: any) {
      console.error(`  ${zone} attempt ${attempt}: ${err.message}`);
      if (attempt < retries) { await sleep(5000 * attempt); continue; }
      return [];
    }
  }
  return [];
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Merge into monthly file ─────────────────────────────────────────────────

function mergeIntoMonthly(records: FetchedZoneData[], date: string, zones: string[]): string {
  const yyyymm = date.slice(0, 4) + date.slice(5, 7); // 202602

  // Determine run_id prefix based on zones
  const isSEonly = zones.every(z => SE_ZONES.includes(z));
  const prefix = isSEonly ? "SE" : "EU";
  const runId = `entsoe_dayahead_${prefix}_${yyyymm}`;
  const runDir = join(CANONICAL_DIR, runId);
  const filePath = join(runDir, "day_ahead_prices.json");

  mkdirSync(runDir, { recursive: true });

  // Load existing
  let existing: FetchedZoneData[] = [];
  if (existsSync(filePath)) {
    try {
      let raw = readFileSync(filePath, "utf-8");
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      existing = JSON.parse(raw);
    } catch (err) {
      console.error(`  Warning: could not parse existing ${filePath}, starting fresh`);
    }
  }

  // Remove existing records for same date + zones (to allow re-runs)
  const datePrefix = date; // YYYY-MM-DD
  const newZones = new Set(records.map(r => r.zone_code));
  const filtered = existing.filter(r => {
    // Keep if different zone or different date
    if (!newZones.has(r.zone_code)) return true;
    // Check if period overlaps with target date
    const recDate = r.period_start.slice(0, 10);
    const recEndDate = r.period_end.slice(0, 10);
    // ENTSO-E periods: start is previous day 23:00Z, end is target day 23:00Z
    // So check if the record's period covers our target date
    const targetStart = new Date(datePrefix + "T00:00:00Z").getTime();
    const targetEnd = targetStart + 86400_000;
    const recStart = new Date(r.period_start).getTime();
    const recEnd = new Date(r.period_end).getTime();
    // If periods overlap, remove (will be replaced by new data)
    if (recStart < targetEnd && recEnd > targetStart) return false;
    return true;
  });

  // Merge
  const merged = [...filtered, ...records];

  // Sort by zone_code, then period_start
  merged.sort((a, b) => {
    if (a.zone_code !== b.zone_code) return a.zone_code.localeCompare(b.zone_code);
    return a.period_start.localeCompare(b.period_start);
  });

  writeFileSync(filePath, JSON.stringify(merged, null, 2), "utf-8");
  console.log(`  Merged ${records.length} records into ${runId} (total: ${merged.length})`);
  return runId;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { date, zones } = parseArgs();
  const token = getToken();

  console.log(`[daily-ingest] date: ${date}`);
  console.log(`[daily-ingest] zones: ${zones.join(", ")}`);
  console.log();

  // Step 1: Fetch each zone
  const allRecords: FetchedZoneData[] = [];
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    console.log(`[daily-ingest] (${i + 1}/${zones.length}) Fetching ${zone}...`);
    const records = await fetchZoneDay(token, zone, date);
    if (records.length > 0) {
      const totalPts = records.reduce((s, r) => s + r.prices.length, 0);
      console.log(`  ✅ ${zone}: ${records.length} period(s), ${totalPts} price points`);
      allRecords.push(...records);
    } else {
      console.log(`  ❌ ${zone}: no data`);
    }
    // Rate limit between zones — ENTSO-E needs breathing room
    if (i < zones.length - 1) await sleep(3000);
  }

  if (allRecords.length === 0) {
    console.error("\n[daily-ingest] No data fetched. Aborting.");
    process.exit(1);
  }

  // Step 2: Merge into monthly canonical
  console.log("\n[daily-ingest] Merging into monthly canonical...");
  const runId = mergeIntoMonthly(allRecords, date, zones);

  // Step 3: Hash pipeline (TR2 compliance)
  console.log("\n[daily-ingest] Hashing canonical (TR2)...");
  const runDir = join(CANONICAL_DIR, runId);
  const manifestDir = join(PROJECT_ROOT, "manifests", "entsoe");
  try {
    execSync(
      `python3 scripts/hash_tree.py --run_id "${runId}_canonical" --input_dir "${runDir}" --out_dir "${manifestDir}"`,
      { cwd: PROJECT_ROOT, stdio: "inherit", timeout: 30_000 },
    );
  } catch (err: any) {
    console.error(`[daily-ingest] hash_tree.py failed: ${err.message}`);
  }

  // Step 4: Rebuild timeseries_v2 for current month
  const year = date.slice(0, 4);
  const buildZones = [...new Set(allRecords.map(r => r.zone_code))].join(",");
  console.log(`\n[daily-ingest] Rebuilding timeseries_v2 for ${buildZones} ${year}...`);
  try {
    execSync(
      `npx tsx packages/evidence/src/build_timeseries_v2.ts --zones ${buildZones} --from ${year} --to ${year} --skip-vault`,
      { cwd: PROJECT_ROOT, stdio: "inherit", timeout: 120_000 },
    );
  } catch (err: any) {
    console.error(`[daily-ingest] build_timeseries_v2 failed: ${err.message}`);
    // Don't exit — partial update is still useful
  }

  // Step 5: Restart PM2
  console.log("\n[daily-ingest] Restarting PM2...");
  try {
    execSync("pm2 restart elekto-eu 2>/dev/null || true", { stdio: "inherit" });
  } catch { /* ignore */ }

  console.log("\n[daily-ingest] ✅ Done");
}

main().catch((err) => {
  console.error("[daily-ingest] FATAL:", err);
  process.exit(1);
});
