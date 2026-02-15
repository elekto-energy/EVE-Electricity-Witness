/**
 * ENTSO-E Day-Ahead Spot Price Ingest
 *
 * Fetches day-ahead prices for specified bidding zones,
 * writes RAW XML + CANONICAL JSON, calls hash pipeline.
 *
 * Usage:
 *   npx tsx packages/evidence/src/ingest_entsoe_dayahead.ts \
 *     --token 57cf3423-... \
 *     --zones SE1,SE2,SE3,SE4 \
 *     --date 2025-02-13 \
 *     --run_id entsoe_dayahead_20250213
 *
 *   # All Swedish zones, yesterday:
 *   npx tsx packages/evidence/src/ingest_entsoe_dayahead.ts \
 *     --token 57cf3423-... \
 *     --zones SE \
 *     --run_id entsoe_dayahead_SE_latest
 *
 *   # All verified EU zones:
 *   npx tsx packages/evidence/src/ingest_entsoe_dayahead.ts \
 *     --token 57cf3423-... \
 *     --zones ALL \
 *     --date 2025-02-13 \
 *     --run_id entsoe_dayahead_EU_20250213
 *
 * TR1: No source, no number.
 * TR2: All ingests produce manifest + SHA256 + root_hash.
 * TR6: Code fetches data — NEVER invents values.
 */

import { mkdirSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { execSync } from "child_process";
import { createHash } from "crypto";
import {
  fetchDayAheadPrices,
  isSpotPriceResponse,
  isSpotPriceError,
  type SpotPriceResponse,
  type SpotPriceError,
} from "./entsoe_client";
import { BIDDING_ZONES, zonesByCountry, verifiedZones } from "./entsoe_zones";

// --- CLI ---
function parseArgs() {
  const args = process.argv.slice(2);
  let token = "";
  let zonesArg = "";
  let dateArg = "";
  let run_id = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--token" && args[i + 1]) token = args[++i];
    if (args[i] === "--zones" && args[i + 1]) zonesArg = args[++i];
    if (args[i] === "--date" && args[i + 1]) dateArg = args[++i];
    if (args[i] === "--run_id" && args[i + 1]) run_id = args[++i];
  }

  if (!token) throw new Error("--token required (ENTSO-E security token)");
  if (!zonesArg) throw new Error("--zones required (SE, ALL, or comma-separated zone codes)");
  if (!run_id) throw new Error("--run_id required");

  // Resolve zone codes
  let zoneCodes: string[];
  if (zonesArg === "ALL") {
    zoneCodes = verifiedZones().map(z => z.code);
  } else if (zonesArg.length === 2 && !zonesArg.includes(",")) {
    // Country code shorthand: SE → SE1,SE2,SE3,SE4
    zoneCodes = zonesByCountry(zonesArg).map(z => z.code);
    if (zoneCodes.length === 0) throw new Error(`No zones found for country: ${zonesArg}`);
  } else {
    zoneCodes = zonesArg.split(",").map(s => s.trim());
    for (const z of zoneCodes) {
      if (!BIDDING_ZONES[z]) throw new Error(`Unknown zone code: ${z}`);
    }
  }

  // Resolve date (default: yesterday UTC)
  let periodStart: Date;
  let periodEnd: Date;
  if (dateArg) {
    periodStart = new Date(dateArg + "T00:00:00Z");
    periodEnd = new Date(dateArg + "T00:00:00Z");
    periodEnd.setUTCDate(periodEnd.getUTCDate() + 1);
  } else {
    const now = new Date();
    periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    periodStart = new Date(periodEnd.getTime());
    periodStart.setUTCDate(periodStart.getUTCDate() - 1);
  }

  return { token, zoneCodes, periodStart, periodEnd, run_id };
}

// --- Canonical format ---
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
  prices: Array<{
    position: number;
    price_eur_mwh: number;
  }>;
  evidence_id: string;
  source: {
    name: string;
    publisher: string;
    dataset_id: string;
    uri: string;
  };
  fetched_at_utc: string;
}

function toCanonical(resp: SpotPriceResponse, run_id: string): CanonicalPriceRecord[] {
  const records: CanonicalPriceRecord[] = [];

  for (const period of resp.periods) {
    const contentHash = createHash("sha256")
      .update(`${resp.zone.code}:${period.start}:${period.end}:${JSON.stringify(period.points)}`)
      .digest("hex")
      .slice(0, 12);

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
        uri: `https://transparency.entsoe.eu/transmission-domain/r2/dayAheadPrices/show?name=&defaultValue=false&viewType=TABLE&areaType=BZN&atch=false&dateTime.dateTime=${period.start}&biddingZone.values=${resp.zone.eic}`,
      },
      fetched_at_utc: resp.fetched_at_utc,
    });
  }

  return records;
}

// --- Main ---
async function main() {
  const { token, zoneCodes, periodStart, periodEnd, run_id } = parseArgs();
  const projectRoot = resolve(__dirname, "../../..");

  const rawDir = join(projectRoot, "data", "raw", "entsoe", run_id);
  const canonicalDir = join(projectRoot, "data", "canonical", "entsoe", run_id);
  const manifestDir = join(projectRoot, "manifests", "entsoe");

  mkdirSync(rawDir, { recursive: true });
  mkdirSync(canonicalDir, { recursive: true });
  mkdirSync(manifestDir, { recursive: true });

  console.log(`[entsoe-ingest] run_id: ${run_id}`);
  console.log(`[entsoe-ingest] zones: ${zoneCodes.join(", ")}`);
  console.log(`[entsoe-ingest] period: ${periodStart.toISOString()} → ${periodEnd.toISOString()}`);

  const allCanonical: CanonicalPriceRecord[] = [];
  const errors: SpotPriceError[] = [];
  let successCount = 0;

  for (let i = 0; i < zoneCodes.length; i++) {
    const zoneCode = zoneCodes[i];
    console.log(`[entsoe-ingest] (${i + 1}/${zoneCodes.length}) fetching ${zoneCode}...`);

    const result = await fetchDayAheadPrices(
      { securityToken: token },
      zoneCode,
      periodStart,
      periodEnd,
    );

    if (isSpotPriceResponse(result)) {
      // Write raw XML
      const rawPath = join(rawDir, `${zoneCode}.xml`);
      writeFileSync(rawPath, result.raw_xml, "utf-8");

      // Build canonical
      const canonical = toCanonical(result, run_id);
      allCanonical.push(...canonical);

      const totalPts = result.periods.reduce((sum, p) => sum + p.points.length, 0);
      console.log(`[entsoe-ingest]   ✅ ${zoneCode}: ${result.periods.length} period(s), ${totalPts} price points`);
      successCount++;
    } else if (isSpotPriceError(result)) {
      errors.push(result);
      console.log(`[entsoe-ingest]   ❌ ${zoneCode}: ${result.error_code} — ${result.error_text}`);
    }

    // Rate limit: 200ms between requests
    if (i < zoneCodes.length - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // Write canonical JSON
  const canonicalPath = join(canonicalDir, "day_ahead_prices.json");
  writeFileSync(canonicalPath, JSON.stringify(allCanonical, null, 2), "utf-8");

  // Write errors log if any
  if (errors.length > 0) {
    const errPath = join(canonicalDir, "errors.json");
    writeFileSync(errPath, JSON.stringify(errors, null, 2), "utf-8");
  }

  // Write ingest summary
  const summary = {
    run_id,
    ingest_type: "entsoe_day_ahead_A44",
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    zones_requested: zoneCodes,
    zones_success: allCanonical.map(r => r.zone_code).filter((v, i, a) => a.indexOf(v) === i),
    zones_failed: errors.map(e => e.zone.code),
    total_records: allCanonical.length,
    total_errors: errors.length,
    completed_at_utc: new Date().toISOString(),
  };
  writeFileSync(join(canonicalDir, "summary.json"), JSON.stringify(summary, null, 2), "utf-8");

  console.log(`\n[entsoe-ingest] === SUMMARY ===`);
  console.log(`[entsoe-ingest] success: ${successCount}/${zoneCodes.length} zones`);
  console.log(`[entsoe-ingest] records: ${allCanonical.length}`);
  console.log(`[entsoe-ingest] errors:  ${errors.length}`);

  // Call Python hash pipeline
  const hashTreeScript = join(projectRoot, "scripts", "hash_tree.py");

  // Hash raw
  console.log(`\n[entsoe-ingest] hashing raw...`);
  execSync(
    `python "${hashTreeScript}" --run_id "${run_id}_raw" --input_dir "${rawDir}" --out_dir "${manifestDir}"`,
    { stdio: "inherit" },
  );

  // Hash canonical
  console.log(`[entsoe-ingest] hashing canonical...`);
  execSync(
    `python "${hashTreeScript}" --run_id "${run_id}_canonical" --input_dir "${canonicalDir}" --out_dir "${manifestDir}"`,
    { stdio: "inherit" },
  );

  console.log(`\n[entsoe-ingest] ✅ done`);
  console.log(`[entsoe-ingest] raw:       ${rawDir}`);
  console.log(`[entsoe-ingest] canonical: ${canonicalDir}`);
  console.log(`[entsoe-ingest] manifests: ${manifestDir}`);

  // Print price comparison if multiple Swedish zones
  const seRecords = allCanonical.filter(r => r.country === "SE");
  if (seRecords.length > 1) {
    console.log(`\n[entsoe-ingest] === SWEDISH ZONE COMPARISON (EUR/MWh) ===`);
    for (const r of seRecords) {
      const prices = r.prices.map(p => p.price_eur_mwh);
      const avg = prices.reduce((s, v) => s + v, 0) / prices.length;
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      console.log(`[entsoe-ingest]   ${r.zone_code} (${r.zone_name}): avg=${avg.toFixed(2)} min=${min.toFixed(2)} max=${max.toFixed(2)}`);
    }
  }
}

main().catch((err) => {
  console.error("[entsoe-ingest] FATAL:", err);
  process.exit(1);
});
