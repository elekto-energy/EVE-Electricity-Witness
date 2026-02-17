/**
 * ENTSO-E Bulk Historical Ingest — 10 years of day-ahead prices
 *
 * Fetches month-by-month for SE1-SE4, stores each month as a separate run.
 * ENTSO-E API max period = 1 year, we use 1-month chunks for reliability.
 *
 * Usage:
 *   npx tsx packages/evidence/src/ingest_entsoe_bulk.ts \
 *     --token 57cf3423-a2c2-4af4-8f4a-1a5d63e8c8e2 \
 *     --from 2016-01 \
 *     --to 2026-02 \
 *     --zones SE
 *
 * Rate limit: 200ms between zone requests, 1s between months.
 * ENTSO-E allows 400 req/min.
 *
 * TR1: No source, no number.
 * TR6: Code fetches — never invents.
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";
import {
  fetchDayAheadPrices,
  isSpotPriceResponse,
  isSpotPriceError,
  type SpotPriceResponse,
  type SpotPriceError,
} from "./entsoe_client";
import { zonesByCountry, BIDDING_ZONES } from "./entsoe_zones";

// --- CLI ---
function parseArgs() {
  const args = process.argv.slice(2);
  let token = "";
  let fromArg = "";
  let toArg = "";
  let zonesArg = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--token" && args[i + 1]) token = args[++i];
    if (args[i] === "--from" && args[i + 1]) fromArg = args[++i];
    if (args[i] === "--to" && args[i + 1]) toArg = args[++i];
    if (args[i] === "--zones" && args[i + 1]) zonesArg = args[++i];
  }

  if (!token) throw new Error("--token required");
  if (!fromArg) throw new Error("--from required (YYYY-MM)");
  if (!toArg) throw new Error("--to required (YYYY-MM)");
  if (!zonesArg) throw new Error("--zones required (SE or comma-separated)");

  let zoneCodes: string[];
  if (zonesArg.length === 2 && !zonesArg.includes(",")) {
    zoneCodes = zonesByCountry(zonesArg).map(z => z.code);
    if (zoneCodes.length === 0) throw new Error(`No zones for country: ${zonesArg}`);
  } else {
    zoneCodes = zonesArg.split(",").map(s => s.trim());
    for (const z of zoneCodes) {
      if (!BIDDING_ZONES[z]) throw new Error(`Unknown zone: ${z}`);
    }
  }

  return { token, fromArg, toArg, zoneCodes };
}

/** Generate months between from (YYYY-MM) and to (YYYY-MM) inclusive */
function generateMonths(from: string, to: string): { year: number; month: number }[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const months: { year: number; month: number }[] = [];

  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    months.push({ year: y, month: m });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

interface CanonicalPriceRecord {
  zone_code: string;
  zone_eic: string;
  zone_name: string;
  country: string;
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

function toCanonical(resp: SpotPriceResponse, run_id: string): CanonicalPriceRecord[] {
  const records: CanonicalPriceRecord[] = [];
  for (const period of resp.periods) {
    const contentHash = createHash("sha256")
      .update(`${resp.zone.code}:${period.start}:${period.end}:${JSON.stringify(period.points)}`)
      .digest("hex").slice(0, 12);

    records.push({
      zone_code: resp.zone.code,
      zone_eic: resp.zone.eic,
      zone_name: resp.zone.name,
      country: resp.zone.country,
      period_start: period.start,
      period_end: period.end,
      resolution: period.resolution,
      currency: resp.currency,
      unit: resp.unit,
      prices: period.points,
      evidence_id: `evr:entsoe:day_ahead_a44:${run_id}:${contentHash}`,
      source: {
        name: "ENTSO-E Transparency Platform",
        publisher: "ENTSO-E",
        dataset_id: "day_ahead_prices_A44",
        uri: `https://transparency.entsoe.eu/`,
      },
      fetched_at_utc: resp.fetched_at_utc,
    });
  }
  return records;
}

async function main() {
  const { token, fromArg, toArg, zoneCodes } = parseArgs();
  const projectRoot = resolve(__dirname, "../../..");
  const months = generateMonths(fromArg, toArg);

  console.log(`[bulk-ingest] ${months.length} months × ${zoneCodes.length} zones = ${months.length * zoneCodes.length} requests`);
  console.log(`[bulk-ingest] Zones: ${zoneCodes.join(", ")}`);
  console.log(`[bulk-ingest] Period: ${fromArg} → ${toArg}`);
  console.log();

  let totalRecords = 0;
  let totalErrors = 0;

  for (let mi = 0; mi < months.length; mi++) {
    const { year, month } = months[mi];
    const mm = month.toString().padStart(2, "0");
    // Use EU_ prefix when fetching non-SE zones, SE_ for SE zones
    const hasNonSE = zoneCodes.some(z => !z.startsWith("SE"));
    const hasSE = zoneCodes.some(z => z.startsWith("SE"));
    const run_id = hasNonSE && !hasSE
      ? `entsoe_dayahead_EU_${year}${mm}`
      : `entsoe_dayahead_SE_${year}${mm}`;

    // Period: first day 00:00 UTC → first day of next month 00:00 UTC
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 1)); // month is 0-based, so month = next month

    const canonicalDir = join(projectRoot, "data", "canonical", "entsoe", run_id);
    const rawDir = join(projectRoot, "data", "raw", "entsoe", run_id);

    // Skip if already ingested with data for all requested zones
    const canonicalPath = join(canonicalDir, "day_ahead_prices.json");
    if (existsSync(canonicalPath)) {
      try {
        const existing = JSON.parse(require("fs").readFileSync(canonicalPath, "utf-8"));
        const existingZones = new Set(existing.map((r: any) => r.zone_code));
        const allPresent = zoneCodes.every(z => existingZones.has(z));
        if (allPresent && existing.length > 0) {
          console.log(`[bulk-ingest] (${mi + 1}/${months.length}) ${year}-${mm} SKIP (already exists)`);
          continue;
        }
        // Missing zones or empty file — re-fetch
        const missing = zoneCodes.filter(z => !existingZones.has(z));
        console.log(`[bulk-ingest] (${mi + 1}/${months.length}) ${year}-${mm} RE-FETCH (missing: ${missing.join(",")})`);
      } catch {
        // Corrupt file — re-fetch
      }
    }

    mkdirSync(canonicalDir, { recursive: true });
    mkdirSync(rawDir, { recursive: true });

    console.log(`[bulk-ingest] (${mi + 1}/${months.length}) ${year}-${mm} fetching...`);

    const allCanonical: CanonicalPriceRecord[] = [];
    const errors: SpotPriceError[] = [];

    for (let zi = 0; zi < zoneCodes.length; zi++) {
      const zoneCode = zoneCodes[zi];
      const result = await fetchDayAheadPrices(
        { securityToken: token, timeoutMs: 30000 },
        zoneCode,
        periodStart,
        periodEnd,
      );

      if (isSpotPriceResponse(result)) {
        // Write raw XML
        writeFileSync(join(rawDir, `${zoneCode}.xml`), result.raw_xml, "utf-8");
        const canonical = toCanonical(result, run_id);
        allCanonical.push(...canonical);
        const pts = result.periods.reduce((s, p) => s + p.points.length, 0);
        console.log(`  ✅ ${zoneCode}: ${pts} price points`);
      } else if (isSpotPriceError(result)) {
        errors.push(result);
        console.log(`  ❌ ${zoneCode}: ${result.error_code} — ${result.error_text}`);
      }

      // Rate limit between zones
      if (zi < zoneCodes.length - 1) {
        await new Promise(r => setTimeout(r, 250));
      }
    }

    // Write canonical
    writeFileSync(canonicalPath, JSON.stringify(allCanonical, null, 2), "utf-8");
    totalRecords += allCanonical.length;
    totalErrors += errors.length;

    if (errors.length > 0) {
      writeFileSync(join(canonicalDir, "errors.json"), JSON.stringify(errors, null, 2), "utf-8");
    }

    // Summary per month
    const summary = {
      run_id,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      zones_success: allCanonical.map(r => r.zone_code).filter((v, i, a) => a.indexOf(v) === i),
      zones_failed: errors.map(e => e.zone.code),
      total_records: allCanonical.length,
      completed_at_utc: new Date().toISOString(),
    };
    writeFileSync(join(canonicalDir, "summary.json"), JSON.stringify(summary, null, 2), "utf-8");

    // Rate limit between months (1s)
    if (mi < months.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n[bulk-ingest] === DONE ===`);
  console.log(`[bulk-ingest] Total records: ${totalRecords}`);
  console.log(`[bulk-ingest] Total errors: ${totalErrors}`);
  console.log(`[bulk-ingest] Data in: data/canonical/entsoe/entsoe_dayahead_SE_YYYYMM/`);
}

main().catch((err) => {
  console.error("[bulk-ingest] FATAL:", err);
  process.exit(1);
});
