/**
 * Build Timeseries V2 — Unified NDJSON with Generation Mix + CO₂
 *
 * Extends V1 (spot + weather + HDD) with:
 *   - Generation mix (ENTSO-E A75): 10 aggregated fuel type MW fields
 *   - Cross-border flows (ENTSO-E A11): net import MW
 *   - Production CO₂ (gCO₂/kWh): direct combustion, EEA 2023 / IPCC 2006
 *   - Consumption CO₂ (gCO₂/kWh): import-adjusted
 *
 * EVE Integration:
 *   - dataset_eve_id per zone build
 *   - X-Vault sealing (append-only WORM)
 *   - methodology_version locked
 *   - manifest with root_hash
 *
 * Pipeline order (deterministic, no reordering):
 *   1. Aggregate per hour (PT15M → PT60M where needed)
 *   2. Calculate production CO₂
 *   3. Calculate consumption CO₂ (import-adjusted)
 *   4. Attach HDD
 *
 * Output: data/canonical/timeseries_v2/{zone}/{YYYY-MM}.ndjson
 *
 * Usage:
 *   npx tsx packages/evidence/src/build_timeseries_v2.ts [--zones SE3,DE_LU,FI] [--from 2022] [--to 2025]
 *
 * TR1: No source, no number.
 * TR6: Code merges — never invents.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";
import { V2_ZONE_CODES, V2_PERIOD_START, calcHDD } from "./timeseries_v2_config";
import { SE_ZONES, EU_ZONES } from "./timeseries_v1_config";
import { V2_GENERATION_FIELDS, type PsrTypeCode } from "./entsoe_generation_client";
import {
  publishToVault,
  readVault,
  generateDatasetEveId,
  METHODOLOGY_VERSION,
  EMISSION_SCOPE,
  type VaultEventPayload,
  type WormRecord,
} from "../../xvault-ts/index";

// ─── Constants ───────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(__dirname, "../../..");
const DATA_DIR = join(PROJECT_ROOT, "data", "canonical");
const OUTPUT_DIR = join(PROJECT_ROOT, "data", "canonical", "timeseries_v2");
const VAULT_PATH = join(PROJECT_ROOT, "data", "xvault", "elekto_v2_worm.jsonl");

// ─── Types ───────────────────────────────────────────────────────────────────

interface SpotRecord {
  zone_code: string;
  period_start: string;
  period_end: string;
  resolution: string;
  prices: Array<{ position: number; price_eur_mwh: number }>;
}

interface GenerationCanonical {
  zone_code: string;
  psr_type: string;
  period_start: string;
  period_end: string;
  resolution: string;
  points: Array<{ position: number; quantity_mw: number }>;
}

interface FlowCanonical {
  in_zone: string;
  out_zone: string;
  direction: string;
  period_start: string;
  period_end: string;
  resolution: string;
  points: Array<{ position: number; quantity_mw: number }>;
}

interface EmissionFactor {
  psr_name: string;
  gco2_kwh: number;
}

interface V2Row {
  ts: string;
  zone: string;
  // V1 fields
  spot: number | null;
  temp: number | null;
  wind_speed: number | null;
  solar_rad: number | null;
  hdd: number | null;
  // V2: generation mix (MW)
  nuclear_mw: number | null;
  hydro_mw: number | null;
  wind_onshore_mw: number | null;
  wind_offshore_mw: number | null;
  solar_mw: number | null;
  gas_mw: number | null;
  coal_mw: number | null;
  lignite_mw: number | null;
  oil_mw: number | null;
  other_mw: number | null;
  total_gen_mw: number | null;
  // V2: flows
  net_import_mw: number | null;
  // V2: CO₂
  production_co2_g_kwh: number | null;
  consumption_co2_g_kwh: number | null;
  // V2: metadata (24 fields total — schema locked)
  emission_scope: string;
  resolution_source: string;
  dataset_eve_id: string;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(): { zones: string[]; years: number[]; skipVault: boolean; forceReseal: boolean } {
  const args = process.argv.slice(2);
  let zones = V2_ZONE_CODES;
  const startYear = parseInt(V2_PERIOD_START.split("-")[0]);
  let years = Array.from({ length: new Date().getUTCFullYear() - startYear + 1 }, (_, i) => startYear + i);
  let skipVault = false;
  let forceReseal = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--zones" && args[i + 1]) zones = args[++i].split(",").map(s => s.trim());
    if (args[i] === "--from" && args[i + 1]) { const f = parseInt(args[++i]); years = years.filter(y => y >= f); }
    if (args[i] === "--to" && args[i + 1]) { const t = parseInt(args[++i]); years = years.filter(y => y <= t); }
    if (args[i] === "--skip-vault") skipVault = true;
    if (args[i] === "--force-reseal") forceReseal = true;
  }

  return { zones, years, skipVault, forceReseal };
}

// ─── Emission Factors Loader ─────────────────────────────────────────────────

function loadEmissionFactors(): Map<string, number> {
  const path = join(DATA_DIR, "emission_factors_v1.json");
  if (!existsSync(path)) throw new Error(`emission_factors_v1.json not found at ${path}`);
  const data = JSON.parse(readFileSync(path, "utf-8"));
  const factors = new Map<string, number>();
  for (const [psrCode, entry] of Object.entries(data.factors)) {
    factors.set(psrCode, (entry as EmissionFactor).gco2_kwh);
  }
  return factors;
}

// ─── Spot Price Loader (reused from V1) ──────────────────────────────────────

function loadSpotMonth(
  zone: string, year: number, month: number,
): Map<string, number> | null {
  const mm = month.toString().padStart(2, "0");
  // Search order: EU_ prefix first for non-SE zones, then SE_ as fallback
  // (bulk ingest stored all zones under SE_ prefix historically)
  const prefixes = SE_ZONES.includes(zone)
    ? [`entsoe_dayahead_SE_${year}${mm}`]
    : [
        `entsoe_dayahead_EU_${year}${mm}`,
        `entsoe_dayahead_SE_${year}${mm}`,
        `entsoe_dayahead_${zone}_${year}${mm}`,
      ];

  for (const prefix of prefixes) {
    const filePath = join(DATA_DIR, "entsoe", prefix, "day_ahead_prices.json");
    if (!existsSync(filePath)) continue;
    try {
      const all: SpotRecord[] = JSON.parse(readFileSync(filePath, "utf-8"));
      const records = all.filter(r => r.zone_code === zone);
      if (records.length === 0) continue;

      const priceMap = new Map<string, number>();
      for (const rec of records) {
        const start = new Date(rec.period_start);
        if (rec.resolution === "PT60M") {
          for (const pt of rec.prices) {
            const hourMs = start.getTime() + (pt.position - 1) * 3600_000;
            const ts = new Date(hourMs).toISOString().slice(0, 13) + ":00:00Z";
            priceMap.set(ts, pt.price_eur_mwh);
          }
        } else if (rec.resolution === "PT15M") {
          const byHour = new Map<number, number[]>();
          for (const pt of rec.prices) {
            const hourIdx = Math.floor((pt.position - 1) / 4);
            const arr = byHour.get(hourIdx) ?? [];
            arr.push(pt.price_eur_mwh);
            byHour.set(hourIdx, arr);
          }
          for (const [hourIdx, prices] of byHour) {
            const hourMs = start.getTime() + hourIdx * 3600_000;
            const ts = new Date(hourMs).toISOString().slice(0, 13) + ":00:00Z";
            const avg = Math.round(prices.reduce((s, v) => s + v, 0) / prices.length * 100) / 100;
            priceMap.set(ts, avg);
          }
        }
      }
      if (priceMap.size > 0) return priceMap;
    } catch { /* skip */ }
  }
  return null;
}

// ─── Weather Loader (reused from V1) ─────────────────────────────────────────

function loadWeatherYear(
  zone: string, year: number,
): Map<string, { temp: number | null; wind: number | null; solar: number | null }> | null {
  const filePath = join(DATA_DIR, "weather_v1", zone, `weather_${zone}_${year}.json`);
  if (!existsSync(filePath)) return null;
  try {
    const data = JSON.parse(readFileSync(filePath, "utf-8"));
    const map = new Map<string, { temp: number | null; wind: number | null; solar: number | null }>();
    for (const row of data.hourly) {
      const ts = (row.ts as string).slice(0, 13) + ":00:00Z";
      map.set(ts, { temp: row.temp, wind: row.wind, solar: row.solar });
    }
    return map.size > 0 ? map : null;
  } catch { return null; }
}

// ─── Generation Loader ───────────────────────────────────────────────────────

/**
 * Load A75 generation for a zone + month.
 * Returns Map<ts_utc, Map<psr_type, mw>>.
 */
function loadGenerationMonth(
  zone: string, year: number, month: number,
): Map<string, Map<string, number>> | null {
  const mm = month.toString().padStart(2, "0");
  const runId = `entsoe_generation_${year}${mm}`;
  const filePath = join(DATA_DIR, "entsoe_generation", runId, "generation.json");
  if (!existsSync(filePath)) return null;

  try {
    const records: GenerationCanonical[] = JSON.parse(readFileSync(filePath, "utf-8"));
    const zoneRecords = records.filter(r => r.zone_code === zone);
    if (zoneRecords.length === 0) return null;

    const result = new Map<string, Map<string, number>>();

    for (const rec of zoneRecords) {
      const start = new Date(rec.period_start);

      if (rec.resolution === "PT60M") {
        for (const pt of rec.points) {
          const hourMs = start.getTime() + (pt.position - 1) * 3600_000;
          const ts = new Date(hourMs).toISOString().slice(0, 13) + ":00:00Z";
          if (!result.has(ts)) result.set(ts, new Map());
          const existing = result.get(ts)!.get(rec.psr_type) ?? 0;
          result.get(ts)!.set(rec.psr_type, existing + pt.quantity_mw);
        }
      } else if (rec.resolution === "PT15M") {
        // Aggregate 4 quarters → hourly mean
        const byHour = new Map<number, number[]>();
        for (const pt of rec.points) {
          const hourIdx = Math.floor((pt.position - 1) / 4);
          const arr = byHour.get(hourIdx) ?? [];
          arr.push(pt.quantity_mw);
          byHour.set(hourIdx, arr);
        }
        for (const [hourIdx, values] of byHour) {
          const hourMs = start.getTime() + hourIdx * 3600_000;
          const ts = new Date(hourMs).toISOString().slice(0, 13) + ":00:00Z";
          const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length * 100) / 100;
          if (!result.has(ts)) result.set(ts, new Map());
          const existing = result.get(ts)!.get(rec.psr_type) ?? 0;
          result.get(ts)!.set(rec.psr_type, existing + avg);
        }
      }
    }

    return result.size > 0 ? result : null;
  } catch { return null; }
}

// ─── Flow Loader ─────────────────────────────────────────────────────────────

/**
 * Load A11 flows for a zone + month.
 * Calculates net import: sum(inflows) - sum(outflows).
 * Returns Map<ts_utc, net_import_mw>.
 */
function loadFlowsMonth(
  zone: string, year: number, month: number,
): Map<string, number> | null {
  const mm = month.toString().padStart(2, "0");
  const runId = `entsoe_flows_${year}${mm}`;
  const filePath = join(DATA_DIR, "entsoe_flows", runId, "flows.json");
  if (!existsSync(filePath)) return null;

  try {
    const allRecords: FlowCanonical[] = JSON.parse(readFileSync(filePath, "utf-8"));

    // Imports: in_zone = zone (flow TO this zone)
    const imports = allRecords.filter(r => r.in_zone === zone);
    // Exports: out_zone = zone (flow FROM this zone)
    const exports = allRecords.filter(r => r.out_zone === zone);

    const netMap = new Map<string, number>();

    const processFlows = (records: FlowCanonical[], sign: number) => {
      for (const rec of records) {
        const start = new Date(rec.period_start);
        if (rec.resolution === "PT60M") {
          for (const pt of rec.points) {
            const hourMs = start.getTime() + (pt.position - 1) * 3600_000;
            const ts = new Date(hourMs).toISOString().slice(0, 13) + ":00:00Z";
            netMap.set(ts, (netMap.get(ts) ?? 0) + sign * pt.quantity_mw);
          }
        } else if (rec.resolution === "PT15M") {
          const byHour = new Map<number, number[]>();
          for (const pt of rec.points) {
            const hourIdx = Math.floor((pt.position - 1) / 4);
            const arr = byHour.get(hourIdx) ?? [];
            arr.push(pt.quantity_mw);
            byHour.set(hourIdx, arr);
          }
          for (const [hourIdx, values] of byHour) {
            const hourMs = start.getTime() + hourIdx * 3600_000;
            const ts = new Date(hourMs).toISOString().slice(0, 13) + ":00:00Z";
            const avg = values.reduce((s, v) => s + v, 0) / values.length;
            netMap.set(ts, (netMap.get(ts) ?? 0) + sign * avg);
          }
        }
      }
    };

    processFlows(imports, +1);  // Inflows = positive
    processFlows(exports, -1);  // Outflows = negative

    return netMap.size > 0 ? netMap : null;
  } catch { return null; }
}

// ─── CO₂ Calculation ─────────────────────────────────────────────────────────

/**
 * Production CO₂ (gCO₂/kWh) = sum(gen_type_MW * factor_gCO₂/kWh) / total_gen_MW
 *
 * Since MW cancel: this is a weighted average of emission factors by generation share.
 */
function calcProductionCO2(
  genByPsr: Map<string, number>,
  emissionFactors: Map<string, number>,
): number | null {
  let weightedSum = 0;
  let totalMw = 0;

  for (const [psrType, mw] of genByPsr) {
    if (mw <= 0) continue;
    const factor = emissionFactors.get(psrType);
    if (factor === undefined) continue; // Unknown PSR type — skip
    weightedSum += mw * factor;
    totalMw += mw;
  }

  if (totalMw <= 0) return null;
  return Math.round(weightedSum / totalMw * 100) / 100;
}

/**
 * Consumption CO₂ (gCO₂/kWh):
 *   If net_import <= 0 (net exporter): consumption_co2 = production_co2
 *   If net_import > 0: consumption_co2 = (prod_co2 * gen + import_co2 * net_import) / (gen + net_import)
 *
 * V2 simplification: import_co2 = EU average (242 gCO₂/kWh, Ember 2023).
 * This is a known approximation documented in methodology.
 */
const EU_AVERAGE_CO2_G_KWH = 242; // Ember European Electricity Review 2024 (2023 data)

function calcConsumptionCO2(
  productionCo2: number | null,
  totalGenMw: number | null,
  netImportMw: number | null,
): number | null {
  if (productionCo2 === null || totalGenMw === null || totalGenMw <= 0) return null;
  if (netImportMw === null || netImportMw <= 0) return productionCo2;

  const numerator = productionCo2 * totalGenMw + EU_AVERAGE_CO2_G_KWH * netImportMw;
  const denominator = totalGenMw + netImportMw;
  if (denominator <= 0) return productionCo2;
  return Math.round(numerator / denominator * 100) / 100;
}

// ─── Aggregate Generation to V2 Fields ───────────────────────────────────────

interface GenV2Fields {
  nuclear_mw: number | null;
  hydro_mw: number | null;
  wind_onshore_mw: number | null;
  wind_offshore_mw: number | null;
  solar_mw: number | null;
  gas_mw: number | null;
  coal_mw: number | null;
  lignite_mw: number | null;
  oil_mw: number | null;
  other_mw: number | null;
  total_gen_mw: number | null;
}

function aggregateGeneration(genByPsr: Map<string, number> | null): GenV2Fields {
  const empty: GenV2Fields = {
    nuclear_mw: null, hydro_mw: null, wind_onshore_mw: null,
    wind_offshore_mw: null, solar_mw: null, gas_mw: null,
    coal_mw: null, lignite_mw: null, oil_mw: null, other_mw: null,
    total_gen_mw: null,
  };
  if (!genByPsr || genByPsr.size === 0) return empty;

  const result: Record<string, number> = {};
  let total = 0;

  for (const [fieldName, psrCodes] of Object.entries(V2_GENERATION_FIELDS)) {
    let sum = 0;
    let hasData = false;
    for (const psr of psrCodes) {
      const val = genByPsr.get(psr);
      if (val !== undefined) { sum += val; hasData = true; }
    }
    result[fieldName] = hasData ? Math.round(sum * 100) / 100 : 0;
    total += result[fieldName];
  }

  return {
    nuclear_mw: result.nuclear_mw ?? null,
    hydro_mw: result.hydro_mw ?? null,
    wind_onshore_mw: result.wind_onshore_mw ?? null,
    wind_offshore_mw: result.wind_offshore_mw ?? null,
    solar_mw: result.solar_mw ?? null,
    gas_mw: result.gas_mw ?? null,
    coal_mw: result.coal_mw ?? null,
    lignite_mw: result.lignite_mw ?? null,
    oil_mw: result.oil_mw ?? null,
    other_mw: result.other_mw ?? null,
    total_gen_mw: total > 0 ? Math.round(total * 100) / 100 : null,
  };
}

// ─── Build Zone Month ────────────────────────────────────────────────────────

function buildZoneMonth(
  zone: string,
  year: number,
  month: number,
  emissionFactors: Map<string, number>,
  weatherCache: Map<string, Map<string, { temp: number | null; wind: number | null; solar: number | null }> | null>,
  datasetEveId: string,
): { rows: V2Row[]; resolutionSource: string } {
  // Load data sources
  const spotMap = loadSpotMonth(zone, year, month);
  const genMap = loadGenerationMonth(zone, year, month);
  const flowMap = loadFlowsMonth(zone, year, month);

  const weatherKey = `${zone}_${year}`;
  if (!weatherCache.has(weatherKey)) {
    weatherCache.set(weatherKey, loadWeatherYear(zone, year));
  }
  const weatherMap = weatherCache.get(weatherKey)!;

  // Generate all hours for the month
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  const rows: V2Row[] = [];
  let resolutionSource = "PT60M";

  for (let t = monthStart.getTime(); t < monthEnd.getTime(); t += 3600_000) {
    const ts = new Date(t).toISOString().slice(0, 13) + ":00:00Z";

    // V1: spot, weather, HDD
    const spot = spotMap?.get(ts) ?? null;
    const wx = weatherMap?.get(ts);
    const temp = wx?.temp ?? null;
    const windSpeed = wx?.wind ?? null;
    const solarRad = wx?.solar ?? null;
    const hdd = temp !== null ? calcHDD(temp) : null;

    // V2: generation mix
    const genByPsr = genMap?.get(ts) ?? null;
    const genFields = aggregateGeneration(genByPsr);

    // V2: flows
    const netImport = flowMap?.get(ts) ?? null;

    // V2: CO₂ — pipeline step 2: production CO₂
    const productionCo2 = genByPsr ? calcProductionCO2(genByPsr, emissionFactors) : null;

    // V2: CO₂ — pipeline step 3: consumption CO₂ (import-adjusted)
    const consumptionCo2 = calcConsumptionCO2(productionCo2, genFields.total_gen_mw, netImport);

    rows.push({
      ts, zone,
      spot, temp, wind_speed: windSpeed, solar_rad: solarRad, hdd,
      ...genFields,
      net_import_mw: netImport !== null ? Math.round(netImport * 100) / 100 : null,
      production_co2_g_kwh: productionCo2,
      consumption_co2_g_kwh: consumptionCo2,
      emission_scope: EMISSION_SCOPE,
      resolution_source: resolutionSource,
      dataset_eve_id: datasetEveId,
    });
  }

  return { rows, resolutionSource };
}

// ─── SHA-256 Helpers ─────────────────────────────────────────────────────────

function fileSha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { zones, years, skipVault, forceReseal } = parseArgs();
  const emissionFactors = loadEmissionFactors();
  const buildDate = new Date();

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  BUILD TIMESERIES V2 — EVE-Sealed Canonical Pipeline       ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Zones: ${zones.join(", ").padEnd(52)}║`);
  console.log(`║  Years: ${years[0]}–${years[years.length - 1]}`.padEnd(63) + "║");
  console.log(`║  Methodology: ${METHODOLOGY_VERSION}`.padEnd(63) + "║");
  console.log(`║  Emission scope: ${EMISSION_SCOPE}`.padEnd(63) + "║");
  console.log(`║  Vault: ${skipVault ? "SKIPPED" : VAULT_PATH.replace(PROJECT_ROOT, ".")}`.padEnd(63) + "║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log();

  let totalRows = 0;
  let totalFiles = 0;
  const weatherCache = new Map();

  for (const zone of zones) {
    const zoneDir = join(OUTPUT_DIR, zone);
    mkdirSync(zoneDir, { recursive: true });

    const fileHashes: Array<{ file: string; sha256: string }> = [];
    let zoneRows = 0;
    let firstTs: string | null = null;
    let lastTs: string | null = null;

    // Generate dataset_eve_id BEFORE building rows — every row carries this ID (24-field schema)
    const datasetEveId = generateDatasetEveId(zone, buildDate);

    console.log(`[v2] Building ${zone}...`);

    for (const year of years) {
      for (let month = 1; month <= 12; month++) {
        // Skip future months (but include current month)
        const monthStart_check = new Date(Date.UTC(year, month - 1, 1));
        if (monthStart_check > buildDate) continue;

        // V2 period start
        const periodStartDate = new Date(V2_PERIOD_START);
        const monthStart = new Date(Date.UTC(year, month - 1, 1));
        if (monthStart < periodStartDate) continue;

        const mm = month.toString().padStart(2, "0");
        const fileName = `${year}-${mm}.ndjson`;
        const filePath = join(zoneDir, fileName);

        const { rows } = buildZoneMonth(zone, year, month, emissionFactors, weatherCache, datasetEveId);

        if (rows.length === 0) continue;

        // Write NDJSON
        const ndjson = rows.map(r => JSON.stringify(r)).join("\n") + "\n";
        writeFileSync(filePath, ndjson, "utf-8");

        // Track hashes
        const hash = fileSha256(ndjson);
        fileHashes.push({ file: `${zone}/${fileName}`, sha256: hash });

        zoneRows += rows.length;
        if (!firstTs) firstTs = rows[0].ts;
        lastTs = rows[rows.length - 1].ts;
        totalFiles++;
      }
    }

    totalRows += zoneRows;

    if (fileHashes.length === 0) {
      console.log(`  ⚪ ${zone}: no data`);
      continue;
    }

    // ─── Manifest ───
    const rootHashInput = fileHashes.map(f => f.sha256).join("");
    const rootHash = createHash("sha256").update(rootHashInput).digest("hex");
    // datasetEveId already generated before row building (24-field schema requirement)

    const manifest = {
      dataset_eve_id: datasetEveId,
      methodology_version: METHODOLOGY_VERSION,
      emission_scope: EMISSION_SCOPE,
      zone,
      period_start: firstTs,
      period_end: lastTs,
      build_timestamp_utc: buildDate.toISOString(),
      root_hash: rootHash,
      total_rows: zoneRows,
      total_files: fileHashes.length,
      source_refs: ["entsoe_a44", "entsoe_a75", "entsoe_a11", "era5_weather", "eea_2023"],
      files: fileHashes,
    };

    const manifestPath = join(zoneDir, `manifest_${datasetEveId}.json`);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

    const sha256Path = join(zoneDir, `files_${datasetEveId}.sha256`);
    const sha256Content = fileHashes.map(f => `${f.sha256}  ${f.file}`).join("\n") + "\n";
    writeFileSync(sha256Path, sha256Content, "utf-8");

    // ─── X-Vault Seal ───
    if (!skipVault) {
      let sealId = datasetEveId;

      // Check if already sealed and if hash matches
      const existingVault: WormRecord[] = readVault(VAULT_PATH);
      const existingEntry = existingVault.find((r: WormRecord) => r.event.dataset_eve_id === datasetEveId);

      if (existingEntry && existingEntry.event.root_hash === rootHash) {
        // Data unchanged — no action needed
        console.log(`  ✅ ${zone}: ${zoneRows} rows — vault hash MATCH (no re-seal needed)`);
        console.log(`     root_hash: ${rootHash.slice(0, 16)}...`);
        console.log(`     vault_index: ${existingEntry.event_index}`);
      } else if (existingEntry && existingEntry.event.root_hash !== rootHash && forceReseal) {
        // Data changed + force-reseal → append new entry with revision suffix
        // WORM rule: old entry stays (it was true at that time). New entry supersedes.
        const revCount = existingVault.filter((r: WormRecord) => r.event.dataset_eve_id.startsWith(datasetEveId)).length;
        sealId = `${datasetEveId}_R${revCount}`;
        console.log(`  🔄 ${zone}: root_hash CHANGED — re-sealing as ${sealId}`);
        console.log(`     old_hash: ${existingEntry.event.root_hash.slice(0, 16)}...`);
        console.log(`     new_hash: ${rootHash.slice(0, 16)}...`);

        try {
          const vaultEvent: VaultEventPayload = {
            dataset_eve_id: sealId,
            root_hash: rootHash,
            files_sha256_path: sha256Path.replace(PROJECT_ROOT, "."),
            methodology_version: METHODOLOGY_VERSION,
            emission_scope: EMISSION_SCOPE,
            zone,
            period_start: firstTs!,
            period_end: lastTs!,
            source_refs: ["entsoe_a44", "entsoe_a75", "entsoe_a11", "era5_weather", "eea_2023"],
            supersedes: datasetEveId,
          };

          const record = publishToVault(vaultEvent, VAULT_PATH);
          console.log(`  ✅ ${zone}: re-sealed → ${sealId}`);
          console.log(`     chain_hash: ${record.chain_hash.slice(0, 16)}...`);
          console.log(`     vault_index: ${record.event_index}`);
        } catch (err: any) {
          console.error(`  ❌ ${zone}: vault re-seal error — ${err.message}`);
        }
      } else if (existingEntry && existingEntry.event.root_hash !== rootHash && !forceReseal) {
        // Data changed but no --force-reseal
        console.log(`  ⚠️ ${zone}: ${zoneRows} rows — root_hash MISMATCH (use --force-reseal)`);
        console.log(`     vault_hash:   ${existingEntry.event.root_hash.slice(0, 16)}...`);
        console.log(`     current_hash: ${rootHash.slice(0, 16)}...`);
      } else {
        // New entry
        try {
          const vaultEvent: VaultEventPayload = {
            dataset_eve_id: sealId,
            root_hash: rootHash,
            files_sha256_path: sha256Path.replace(PROJECT_ROOT, "."),
            methodology_version: METHODOLOGY_VERSION,
            emission_scope: EMISSION_SCOPE,
            zone,
            period_start: firstTs!,
            period_end: lastTs!,
            source_refs: ["entsoe_a44", "entsoe_a75", "entsoe_a11", "era5_weather", "eea_2023"],
          };

          const record = publishToVault(vaultEvent, VAULT_PATH);
          console.log(`  ✅ ${zone}: ${zoneRows} rows, ${fileHashes.length} files → ${sealId}`);
          console.log(`     root_hash: ${rootHash.slice(0, 16)}...`);
          console.log(`     chain_hash: ${record.chain_hash.slice(0, 16)}...`);
          console.log(`     vault_index: ${record.event_index}`);
        } catch (err: any) {
          console.error(`  ❌ ${zone}: vault error — ${err.message}`);
        }
      }
    } else {
      console.log(`  ✅ ${zone}: ${zoneRows} rows, ${fileHashes.length} files → ${datasetEveId} (vault skipped)`);
      console.log(`     root_hash: ${rootHash.slice(0, 16)}...`);
    }
  }

  console.log();
  console.log("════════════════════════════════════════════════════════════════");
  console.log(`  TOTAL: ${totalRows} rows, ${totalFiles} files`);
  console.log(`  Output: ${OUTPUT_DIR.replace(PROJECT_ROOT, ".")}`);
  console.log("════════════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("[v2] FATAL:", err);
  process.exit(1);
});
