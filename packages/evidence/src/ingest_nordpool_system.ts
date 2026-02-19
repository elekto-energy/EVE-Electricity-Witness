/**
 * ingest_nordpool_system.ts — Nord Pool System Price Ingest (CMD)
 *
 * Fetches the official Nordic Day-Ahead System Price from Nord Pool's
 * public dataportal API. Stores as CMD (Certified Market Data).
 *
 * Source: Nord Pool (https://dataportal-api.nordpoolgroup.com)
 * Area: SYS (Nordic System Price)
 * Market: Day-Ahead
 * Resolution: PT60M
 *
 * Usage:
 *   npx tsx packages/evidence/src/ingest_nordpool_system.ts --from 2024-01 --to 2026-02
 *   npx tsx packages/evidence/src/ingest_nordpool_system.ts --date 2026-02-18
 *
 * Output:
 *   data/raw/nordpool_system_price/{YYYY-MM}.json          (raw API response)
 *   data/canonical/system_price/{YYYY-MM}.ndjson            (canonical NDJSON)
 *   data/manifests/system_price_{YYYY-MM}.manifest.json     (manifest with hashes)
 *
 * CMD Classification:
 *   Layer: CMD — Certified Market Data
 *   Source: Nord Pool
 *   Area: SYS
 *   Market: Day-Ahead
 *   Resolution: PT60M
 *
 * TR1: No source, no number.
 * TR6: Code fetches — never invents.
 *
 * ⚠ EVE CMD POLICY: No fallback. No approximation. No proxy.
 *   If fetch fails or validation fails, the dataset is NOT written.
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";

// ─── Configuration ───────────────────────────────────────────────────────────

const API_BASE = "https://dataportal-api.nordpoolgroup.com/api";
const DELIVERY_AREA = "SYS";
const MARKET = "DayAhead";
const CURRENCY = "EUR";
const SOURCE = "Nord Pool";

const PROJECT_ROOT = resolve(__dirname, "../../..");
const RAW_DIR = join(PROJECT_ROOT, "data", "raw", "nordpool_system_price");
const CANONICAL_DIR = join(PROJECT_ROOT, "data", "canonical", "system_price");
const MANIFEST_DIR = join(PROJECT_ROOT, "data", "manifests");

// ─── Types ───────────────────────────────────────────────────────────────────

interface NordPoolPriceEntry {
  deliveryStart: string;   // ISO 8601 with CET offset, e.g. "2026-01-12T00:00:00+01:00"
  deliveryEnd: string;
  entryPerArea: { [area: string]: number | null };
  // There may be additional fields
}

interface NordPoolResponse {
  deliveryDateCET: string;
  version: number;
  updatedAt: string;
  deliveryAreas: string[];
  market: string;
  multiAreaEntries: NordPoolPriceEntry[];
}

interface CanonicalRow {
  ts: string;                 // CET delivery hour ISO 8601 (hour start)
  delivery_date: string;      // YYYY-MM-DD
  delivery_hour: number;      // 0-23
  price_eur_mwh: number;      // Hourly price (avg of PT15M if source is 15-min)
  currency: string;
  unit: string;
  market: string;
  delivery_area: string;
  source: string;
  source_resolution: string;  // "PT15M" or "PT60M" — what API actually returned
  canonical_resolution: string; // Always "PT60M" — what we store
  aggregation: string;        // "none" if PT60M source, "mean_4x15" if PT15M→PT60M
  retrieved_at: string;       // UTC ISO 8601
  dataset_eve_id: string;
  raw_hash: string;           // sha256 of raw response
  canonical_hash: string;     // sha256 of this canonical row (sorted keys)
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(): { dates: string[] } {
  const args = process.argv.slice(2);
  let fromArg = "";
  let toArg = "";
  let dateArg = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from" && args[i + 1]) fromArg = args[++i];
    if (args[i] === "--to" && args[i + 1]) toArg = args[++i];
    if (args[i] === "--date" && args[i + 1]) dateArg = args[++i];
  }

  if (dateArg) {
    return { dates: [dateArg] };
  }

  if (!fromArg || !toArg) {
    console.error("Usage: --from YYYY-MM --to YYYY-MM  OR  --date YYYY-MM-DD");
    process.exit(1);
  }

  // Generate month list
  const months: string[] = [];
  const [fy, fm] = fromArg.split("-").map(Number);
  const [ty, tm] = toArg.split("-").map(Number);
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return { dates: months };
}

// ─── Hashing ─────────────────────────────────────────────────────────────────

function sha256(data: string): string {
  return "sha256:" + createHash("sha256").update(data, "utf-8").digest("hex");
}

/**
 * Convert a CET/CEST timestamp to UTC ISO 8601.
 * Input: "2026-02-18T14:00:00+01:00" or "2026-07-18T14:00:00+02:00"
 * Output: "2026-02-18T13:00:00Z" or "2026-07-18T12:00:00Z"
 *
 * If input is already UTC (ends with Z), return as-is.
 * If input has no timezone, treat as CET (+01:00).
 */
function cetToUtc(ts: string): string {
  if (ts.endsWith("Z")) return ts;

  // Parse with Date — handles offset correctly
  const d = new Date(ts);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid timestamp: ${ts}`);
  }

  // Format as UTC ISO 8601 matching timeseries_v2 format: YYYY-MM-DDTHH:00:00Z
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Get CET date and hour from a timestamp (UTC or with offset).
 * Used to determine delivery date/hour in Nordic market terms.
 *
 * CET = UTC+1, CEST = UTC+2 (last Sunday March to last Sunday October).
 *
 * For Feb 18: CET (UTC+1), so 2026-02-17T23:00:00Z = 2026-02-18 hour 0 CET.
 */
function toCetDateHour(ts: string): { date: string; hour: number } {
  const d = new Date(ts);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid timestamp: ${ts}`);
  }

  // Determine if CEST applies
  // CEST: last Sunday of March 02:00 UTC to last Sunday of October 03:00 UTC
  const year = d.getUTCFullYear();
  const marchLast = new Date(Date.UTC(year, 2, 31)); // March 31
  while (marchLast.getUTCDay() !== 0) marchLast.setUTCDate(marchLast.getUTCDate() - 1);
  const cestStart = new Date(marchLast.getTime()); // Already on Sunday
  cestStart.setUTCHours(2, 0, 0, 0); // 02:00 UTC

  const octLast = new Date(Date.UTC(year, 9, 31)); // October 31
  while (octLast.getUTCDay() !== 0) octLast.setUTCDate(octLast.getUTCDate() - 1);
  const cestEnd = new Date(octLast.getTime());
  cestEnd.setUTCHours(3, 0, 0, 0); // 03:00 UTC (back to CET)

  const isCest = d >= cestStart && d < cestEnd;
  const offsetHours = isCest ? 2 : 1;

  const cetTime = new Date(d.getTime() + offsetHours * 3600000);
  return {
    date: cetTime.toISOString().slice(0, 10),
    hour: cetTime.getUTCHours(),
  };
}

function canonicalJson(obj: Record<string, unknown>): string {
  const sorted = Object.keys(obj).sort().reduce((acc, key) => {
    acc[key] = obj[key];
    return acc;
  }, {} as Record<string, unknown>);
  return JSON.stringify(sorted);
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

async function fetchDay(date: string): Promise<{ raw: string; data: NordPoolResponse | null }> {
  const url = `${API_BASE}/DayAheadPrices?date=${date}&market=${MARKET}&deliveryArea=${DELIVERY_AREA}&currency=${CURRENCY}`;

  const resp = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "EVE-Ingest/1.0 (Organiq Sweden AB)",
    },
  });

  const raw = await resp.text();

  if (!resp.ok) {
    return { raw, data: null };
  }

  try {
    const data = JSON.parse(raw);
    return { raw, data };
  } catch {
    return { raw, data: null };
  }
}

// ─── Validation ──────────────────────────────────────────────────────────────

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateDay(rows: CanonicalRow[], date: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Row count: expect 24 (or 23/25 for DST transitions)
  if (rows.length < 23) {
    errors.push(`Row count ${rows.length} < 23 for ${date}`);
  } else if (rows.length > 25) {
    errors.push(`Row count ${rows.length} > 25 for ${date}`);
  } else if (rows.length !== 24) {
    warnings.push(`Row count ${rows.length} (DST transition?) for ${date}`);
  }

  // 2. No null prices
  for (const r of rows) {
    if (r.price_eur_mwh === null || r.price_eur_mwh === undefined || isNaN(r.price_eur_mwh)) {
      errors.push(`Null/NaN price at ${r.ts}`);
    }
  }

  // 3. No duplicate hours
  const hours = new Set<number>();
  for (const r of rows) {
    if (hours.has(r.delivery_hour)) {
      errors.push(`Duplicate hour ${r.delivery_hour} at ${r.ts}`);
    }
    hours.add(r.delivery_hour);
  }

  // 4. Price sanity: >= -500 and <= 5000 EUR/MWh
  for (const r of rows) {
    if (r.price_eur_mwh < -500) {
      errors.push(`Price ${r.price_eur_mwh} < -500 at ${r.ts}`);
    }
    if (r.price_eur_mwh > 5000) {
      errors.push(`Price ${r.price_eur_mwh} > 5000 at ${r.ts}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Process ─────────────────────────────────────────────────────────────────

async function processMonth(month: string): Promise<{
  rowCount: number;
  rawHash: string;
  canonicalHash: string;
  errors: string[];
}> {
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);
  const retrievedAt = new Date().toISOString();
  const datasetEveId = `cmd_system_price_${month}`;

  const allRawResponses: string[] = [];
  const allCanonicalRows: CanonicalRow[] = [];
  let totalErrors: string[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    if (date > today) break; // Don't fetch future dates

    const { raw, data } = await fetchDay(date);
    allRawResponses.push(raw);

    if (!data || !data.multiAreaEntries || data.multiAreaEntries.length === 0) {
      console.log(`  ⚠ ${date}: no data`);
      continue;
    }

    const rawHashForDay = sha256(raw);

    // Detect resolution: PT15M if >24 entries, PT60M if <=25
    const entryCount = data.multiAreaEntries.length;
    const sourceResolution = entryCount > 25 ? "PT15M" : "PT60M";
    const aggregation = sourceResolution === "PT15M" ? "mean_4x15" : "none";

    if (sourceResolution === "PT15M") {
      console.log(`  ℹ ${date}: API returned ${entryCount} entries (PT15M) → aggregating to PT60M`);
    }

    // Parse all entries, keyed by hour for aggregation
    const hourBuckets = new Map<string, { prices: number[]; ts: string; date: string; hour: number }>();

    for (const entry of data.multiAreaEntries) {
      const price = entry.entryPerArea?.[DELIVERY_AREA] ??
                    entry.entryPerArea?.["SYSTEM"] ??
                    entry.entryPerArea?.["SYS"] ?? null;

      if (price === null || price === undefined) continue;

      const deliveryTs = entry.deliveryStart;

      // Parse delivery date/hour in CET (Nordic market convention)
      const { date: deliveryDate, hour: deliveryHour } = toCetDateHour(deliveryTs);

      // Key = CET date + hour → groups PT15M into hourly buckets
      const hourKey = `${deliveryDate}T${String(deliveryHour).padStart(2, "0")}`;

      if (!hourBuckets.has(hourKey)) {
        // Match timeseries_v2 ts convention:
        // CET delivery hour stored as "{date}T{HH}:00:00Z" (pseudo-UTC = CET hour with Z suffix)
        // This matches how ENTSO-E data is stored in timeseries_v2
        const pseudoUtcTs = `${deliveryDate}T${String(deliveryHour).padStart(2, "0")}:00:00Z`;
        hourBuckets.set(hourKey, {
          prices: [],
          ts: pseudoUtcTs,
          date: deliveryDate,
          hour: deliveryHour,
        });
      }
      hourBuckets.get(hourKey)!.prices.push(price);
    }

    // Build canonical rows from hourly buckets
    const dayRows: CanonicalRow[] = [];
    for (const [, bucket] of hourBuckets) {
      // Skip hours from previous delivery date (API may include hour 23 of day before)
      if (bucket.date !== date) continue;

      // Aggregate: mean of all sub-periods in this hour
      const avgPrice = bucket.prices.reduce((s, v) => s + v, 0) / bucket.prices.length;

      const row: CanonicalRow = {
        ts: bucket.ts, // Already UTC, matching timeseries_v2 format
        delivery_date: bucket.date,
        delivery_hour: bucket.hour,
        price_eur_mwh: +avgPrice.toFixed(2),
        currency: CURRENCY,
        unit: "MWh",
        market: "Day-Ahead",
        delivery_area: DELIVERY_AREA,
        source: SOURCE,
        source_resolution: sourceResolution,
        canonical_resolution: "PT60M",
        aggregation,
        retrieved_at: retrievedAt,
        dataset_eve_id: datasetEveId,
        raw_hash: rawHashForDay,
        canonical_hash: "",
      };

      const { canonical_hash: _, ...hashInput } = row;
      row.canonical_hash = sha256(canonicalJson(hashInput as unknown as Record<string, unknown>));

      dayRows.push(row);
    }

    // Validate day
    const validation = validateDay(dayRows, date);
    if (!validation.valid) {
      console.log(`  ❌ ${date}: VALIDATION FAILED`);
      for (const e of validation.errors) console.log(`     ERROR: ${e}`);
      totalErrors.push(...validation.errors.map(e => `${date}: ${e}`));
      // Skip this day — EVE CMD never uses invalid data
      continue;
    }
    if (validation.warnings.length > 0) {
      for (const w of validation.warnings) console.log(`  ⚠ ${date}: ${w}`);
    }

    allCanonicalRows.push(...dayRows);
    process.stdout.write(`  ✅ ${date}: ${dayRows.length}h`);
    if (dayRows.length > 0) {
      const avg = dayRows.reduce((s, r) => s + r.price_eur_mwh, 0) / dayRows.length;
      process.stdout.write(` avg=${avg.toFixed(2)} EUR/MWh`);
    }
    process.stdout.write("\n");

    // Rate limit: 500ms between requests
    await new Promise(r => setTimeout(r, 500));
  }

  if (allCanonicalRows.length === 0) {
    console.log(`  ❌ ${month}: no valid data, skipping write`);
    return { rowCount: 0, rawHash: "", canonicalHash: "", errors: totalErrors };
  }

  // Sort by timestamp
  allCanonicalRows.sort((a, b) => a.ts.localeCompare(b.ts));

  // Write raw
  const rawCombined = JSON.stringify(allRawResponses, null, 2);
  const rawHash = sha256(rawCombined);
  mkdirSync(RAW_DIR, { recursive: true });
  writeFileSync(join(RAW_DIR, `${month}.json`), rawCombined, "utf-8");

  // Write canonical NDJSON
  mkdirSync(CANONICAL_DIR, { recursive: true });
  const ndjson = allCanonicalRows.map(r => JSON.stringify(r)).join("\n") + "\n";
  const canonicalHash = sha256(ndjson);
  writeFileSync(join(CANONICAL_DIR, `${month}.ndjson`), ndjson, "utf-8");

  // Write manifest
  mkdirSync(MANIFEST_DIR, { recursive: true });
  const manifest = {
    dataset_eve_id: `cmd_system_price_${month}`,
    source: SOURCE,
    market: "Day-Ahead",
    delivery_area: DELIVERY_AREA,
    currency: CURRENCY,
    resolution: "PT60M",
    period: month,
    row_count: allCanonicalRows.length,
    days_with_data: new Set(allCanonicalRows.map(r => r.delivery_date)).size,
    raw_file: `raw/nordpool_system_price/${month}.json`,
    raw_hash: rawHash,
    canonical_file: `canonical/system_price/${month}.ndjson`,
    canonical_hash: canonicalHash,
    validation_errors: totalErrors,
    created_at: new Date().toISOString(),
    layer: "CMD",
    classification: "Certified Market Data",
    policy: "No fallback. No approximation. No proxy.",
  };
  writeFileSync(
    join(MANIFEST_DIR, `system_price_${month}.manifest.json`),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );

  return { rowCount: allCanonicalRows.length, rawHash, canonicalHash, errors: totalErrors };
}

async function processSingleDate(date: string): Promise<void> {
  const month = date.slice(0, 7);
  const retrievedAt = new Date().toISOString();
  const datasetEveId = `cmd_system_price_${month}`;

  console.log(`[nordpool-sys] Fetching ${date}...`);
  const { raw, data } = await fetchDay(date);

  if (!data || !data.multiAreaEntries || data.multiAreaEntries.length === 0) {
    console.error(`[nordpool-sys] ❌ No data for ${date}`);
    process.exit(1);
  }

  const rawHash = sha256(raw);

  // Detect resolution
  const entryCount = data.multiAreaEntries.length;
  const sourceResolution = entryCount > 25 ? "PT15M" : "PT60M";
  const aggregation = sourceResolution === "PT15M" ? "mean_4x15" : "none";

  if (sourceResolution === "PT15M") {
    console.log(`[nordpool-sys] ℹ API returned ${entryCount} entries (PT15M) → aggregating to PT60M`);
  }

  // Group by hour
  const hourBuckets = new Map<string, { prices: number[]; ts: string; date: string; hour: number }>();

  for (const entry of data.multiAreaEntries) {
    const price = entry.entryPerArea?.[DELIVERY_AREA] ??
                  entry.entryPerArea?.["SYSTEM"] ??
                  entry.entryPerArea?.["SYS"] ?? null;

    if (price === null || price === undefined) continue;

    const deliveryTs = entry.deliveryStart;
    const { date: deliveryDate, hour: deliveryHour } = toCetDateHour(deliveryTs);
    const hourKey = `${deliveryDate}T${String(deliveryHour).padStart(2, "0")}`;

    if (!hourBuckets.has(hourKey)) {
      // Match timeseries_v2 ts convention: CET hour as pseudo-UTC
      const pseudoUtcTs = `${deliveryDate}T${String(deliveryHour).padStart(2, "0")}:00:00Z`;
      hourBuckets.set(hourKey, { prices: [], ts: pseudoUtcTs, date: deliveryDate, hour: deliveryHour });
    }
    hourBuckets.get(hourKey)!.prices.push(price);
  }

  // Build canonical rows
  const dayRows: CanonicalRow[] = [];
  for (const [, bucket] of hourBuckets) {
    if (bucket.date !== date) continue;

    const avgPrice = bucket.prices.reduce((s, v) => s + v, 0) / bucket.prices.length;

    const row: CanonicalRow = {
      ts: bucket.ts, // Already UTC
      delivery_date: bucket.date,
      delivery_hour: bucket.hour,
      price_eur_mwh: +avgPrice.toFixed(2),
      currency: CURRENCY,
      unit: "MWh",
      market: "Day-Ahead",
      delivery_area: DELIVERY_AREA,
      source: SOURCE,
      source_resolution: sourceResolution,
      canonical_resolution: "PT60M",
      aggregation,
      retrieved_at: retrievedAt,
      dataset_eve_id: datasetEveId,
      raw_hash: rawHash,
      canonical_hash: "",
    };

    const { canonical_hash: _, ...hashInput } = row;
    row.canonical_hash = sha256(canonicalJson(hashInput as unknown as Record<string, unknown>));
    dayRows.push(row);
  }

  const validation = validateDay(dayRows, date);
  if (!validation.valid) {
    console.error(`[nordpool-sys] ❌ VALIDATION FAILED for ${date}:`);
    for (const e of validation.errors) console.error(`  ${e}`);
    console.error("[nordpool-sys] Dataset NOT written. EVE CMD never uses invalid data.");
    process.exit(1);
  }

  // Write raw
  mkdirSync(RAW_DIR, { recursive: true });
  writeFileSync(join(RAW_DIR, `${date}.json`), raw, "utf-8");

  // Append or merge with existing canonical
  const canonicalFile = join(CANONICAL_DIR, `${month}.ndjson`);
  mkdirSync(CANONICAL_DIR, { recursive: true });

  let existingRows: CanonicalRow[] = [];
  if (existsSync(canonicalFile)) {
    const content = readFileSync(canonicalFile, "utf-8").trim();
    if (content) {
      existingRows = content.split("\n").filter(Boolean).map(l => JSON.parse(l));
    }
  }

  // Remove any existing rows for this date, add new ones
  const filtered = existingRows.filter(r => r.delivery_date !== date);
  const merged = [...filtered, ...dayRows].sort((a, b) => a.ts.localeCompare(b.ts));

  const ndjson = merged.map(r => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(canonicalFile, ndjson, "utf-8");

  console.log(`[nordpool-sys] ✅ ${date}: ${dayRows.length} hours written`);
  if (dayRows.length > 0) {
    const avg = dayRows.reduce((s, r) => s + r.price_eur_mwh, 0) / dayRows.length;
    console.log(`[nordpool-sys]    avg=${avg.toFixed(2)} EUR/MWh`);
  }
  console.log(`[nordpool-sys]    raw_hash: ${rawHash}`);
  console.log(`[nordpool-sys]    file: ${canonicalFile}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { dates } = parseArgs();

  // Single date mode
  if (dates.length === 1 && dates[0].length === 10) {
    await processSingleDate(dates[0]);
    return;
  }

  // Month-range mode
  console.log(`[nordpool-sys] === Nord Pool System Price Ingest ===`);
  console.log(`[nordpool-sys] Layer: CMD (Certified Market Data)`);
  console.log(`[nordpool-sys] Source: ${SOURCE}`);
  console.log(`[nordpool-sys] Area: ${DELIVERY_AREA}`);
  console.log(`[nordpool-sys] Market: Day-Ahead`);
  console.log(`[nordpool-sys] Months: ${dates.length}`);
  console.log(`[nordpool-sys] Policy: No fallback. No approximation. No proxy.`);
  console.log();

  let totalRows = 0;
  let totalErrors = 0;

  for (let i = 0; i < dates.length; i++) {
    const month = dates[i];

    // Skip if already ingested
    const manifestFile = join(MANIFEST_DIR, `system_price_${month}.manifest.json`);
    if (existsSync(manifestFile)) {
      try {
        const existing = JSON.parse(readFileSync(manifestFile, "utf-8"));
        if (existing.row_count > 0 && existing.validation_errors.length === 0) {
          console.log(`[${i + 1}/${dates.length}] ${month} SKIP (already ingested: ${existing.row_count} rows)`);
          totalRows += existing.row_count;
          continue;
        }
      } catch {
        // Corrupt manifest — re-ingest
      }
    }

    console.log(`[${i + 1}/${dates.length}] ${month} fetching...`);
    const result = await processMonth(month);
    totalRows += result.rowCount;
    totalErrors += result.errors.length;

    // Rate limit between months (2s)
    if (i < dates.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log();
  console.log(`[nordpool-sys] === DONE ===`);
  console.log(`[nordpool-sys] Total rows: ${totalRows}`);
  console.log(`[nordpool-sys] Total validation errors: ${totalErrors}`);
  console.log(`[nordpool-sys] Raw: ${RAW_DIR}`);
  console.log(`[nordpool-sys] Canonical: ${CANONICAL_DIR}`);
  console.log(`[nordpool-sys] Manifests: ${MANIFEST_DIR}`);
}

main().catch((err) => {
  console.error("[nordpool-sys] FATAL:", err);
  process.exit(1);
});
