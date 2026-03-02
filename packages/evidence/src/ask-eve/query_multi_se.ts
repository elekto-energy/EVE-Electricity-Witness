/**
 * Ask-EVE Multi-Zone Query — Sverige (SE1–SE4) Aggregate
 *
 * Runs query_v2 for each Swedish zone and produces a composite result.
 * No modification to query_v2.ts — imports and calls it as-is.
 *
 * Composite identity:
 *   composite_query_hash = SHA256("SE1,SE2,SE3,SE4" + "|" + from + "|" + to + "|" + methodology_version)
 *
 * Aggregation rules:
 *   - Spot prices: simple mean across zones (no volume weighting — no consumption data)
 *   - Generation: sum across zones (total Swedish production)
 *   - CO₂: generation-weighted mean (heavier producers weigh more)
 *   - Flows: sum per border (deduplicated — internal SE flows excluded)
 *   - Temperature: simple mean across zones
 *   - HDD: simple mean across zones
 *   - System price: identical across SE zones (one Nordic SYS)
 *   - Bottleneck: per-zone only (not aggregatable — different zone prices)
 *
 * TR1: No source, no number.
 * TR6: Code aggregates — never invents.
 */

import { createHash } from "crypto";
import { query, type QueryResult, type QueryParams } from "./query_v2";

const SE_ZONES = ["SE1", "SE2", "SE3", "SE4"] as const;
const METHODOLOGY_VERSION = "TS_V2_CMD_DDM_NP_V1";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MultiZoneResult {
  type: "multi_zone";
  label: "Sverige (SE1–SE4)";
  zones: typeof SE_ZONES;
  period: { from: string; to: string };

  // Per-zone results (unmodified query_v2 output)
  zone_results: Record<string, QueryResult>;

  // Aggregated statistics
  aggregate: {
    spot: { mean: number | null; min: number | null; max: number | null };
    production_co2: { mean: number | null };
    consumption_co2: { mean: number | null };
    temperature: { mean: number | null };
    hdd: { sum: number | null };
    generation_mix_total_mw: {
      nuclear: number | null;
      hydro: number | null;
      wind_onshore: number | null;
      wind_offshore: number | null;
      solar: number | null;
      gas: number | null;
      coal: number | null;
      lignite: number | null;
      oil: number | null;
      other: number | null;
      total: number | null;
    };
    net_import: { sum_mwh: number | null };
    rows_count: number;
    hours_total: number;
  };

  // System price (shared across SE zones)
  system_price: QueryResult["system_price"];

  // Methodology warnings (merged, deduplicated)
  methodology_warnings: string[];

  // Provenance
  dataset_eve_ids: string[];
  composite_query_hash: string;
  methodology_version: string;
  emission_scope: string;
  query_command: string;
  generated_at_utc: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function weightedMean(
  values: (number | null)[],
  weights: (number | null)[],
): number | null {
  let sumVW = 0;
  let sumW = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const w = weights[i];
    if (v !== null && w !== null && w > 0) {
      sumVW += v * w;
      sumW += w;
    }
  }
  if (sumW <= 0) return null;
  return Math.round(sumVW / sumW * 100) / 100;
}

function simpleMean(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length * 100) / 100;
}

function sumOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) * 100) / 100;
}

function minOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  return Math.round(Math.min(...valid) * 100) / 100;
}

function maxOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  return Math.round(Math.max(...valid) * 100) / 100;
}

// ─── Composite Hash ──────────────────────────────────────────────────────────

export function computeCompositeQueryHash(
  zones: readonly string[],
  from: string,
  to: string,
  methodologyVersion: string,
): string {
  const input = [zones.join(","), from, to, methodologyVersion].join("|");
  return createHash("sha256").update(input, "utf-8").digest("hex");
}

// ─── Query ───────────────────────────────────────────────────────────────────

export function queryMultiSE(from: string, to: string): MultiZoneResult {
  const zoneResults: Record<string, QueryResult> = {};
  const warnings = new Set<string>();

  // Run query_v2 for each zone
  for (const zone of SE_ZONES) {
    try {
      const result = query({ zone, from, to });
      zoneResults[zone] = result;
      for (const w of result.methodology_warnings) warnings.add(w);
    } catch (err: any) {
      warnings.add(`${zone}: ${err.message}`);
    }
  }

  const results = Object.values(zoneResults);
  if (results.length === 0) {
    throw new Error(`No data for any Swedish zone between ${from} and ${to}`);
  }

  // ── Aggregate spot: simple mean of zone means ──
  const spotMeans = results.map(r => r.spot.mean);
  const spotMins = results.map(r => r.spot.min);
  const spotMaxes = results.map(r => r.spot.max);

  // ── Aggregate CO₂: generation-weighted mean ──
  const prodCo2Values = results.map(r => r.production_co2.mean);
  const consCo2Values = results.map(r => r.consumption_co2.mean);
  const genTotals = results.map(r => r.generation_mix_avg_mw.total);

  // ── Aggregate generation: sum across zones ──
  const genFields = ["nuclear", "hydro", "wind_onshore", "wind_offshore", "solar", "gas", "coal", "lignite", "oil", "other", "total"] as const;
  const genTotalMw: Record<string, number | null> = {};
  for (const field of genFields) {
    genTotalMw[field] = sumOrNull(results.map(r => r.generation_mix_avg_mw[field]));
  }

  // ── Aggregate temperature + HDD: simple mean ──
  const tempMeans = results.map(r => r.temperature.mean);
  const hddSums = results.map(r => r.hdd.sum);

  // ── Net import: sum ──
  const netImportSums = results.map(r => r.net_import.sum_mwh);

  // ── System price: take from first available (identical across SE) ──
  const sysResult = results.find(r => r.system_price.available);
  const systemPrice = sysResult?.system_price ?? results[0].system_price;

  // ── Provenance ──
  const datasetEveIds = results
    .map(r => r.dataset_eve_id)
    .filter((v): v is string => v !== null);

  const compositeHash = computeCompositeQueryHash(SE_ZONES, from, to, METHODOLOGY_VERSION);

  return {
    type: "multi_zone",
    label: "Sverige (SE1–SE4)",
    zones: SE_ZONES,
    period: { from, to },

    zone_results: zoneResults,

    aggregate: {
      spot: {
        mean: simpleMean(spotMeans),
        min: minOrNull(spotMins),
        max: maxOrNull(spotMaxes),
      },
      production_co2: { mean: weightedMean(prodCo2Values, genTotals) },
      consumption_co2: { mean: weightedMean(consCo2Values, genTotals) },
      temperature: { mean: simpleMean(tempMeans) },
      hdd: { sum: simpleMean(hddSums) },
      generation_mix_total_mw: genTotalMw as MultiZoneResult["aggregate"]["generation_mix_total_mw"],
      net_import: { sum_mwh: sumOrNull(netImportSums) },
      rows_count: results.reduce((s, r) => s + r.rows_count, 0),
      hours_total: results[0]?.hours_total ?? 0,
    },

    system_price: systemPrice,
    methodology_warnings: [...warnings],

    dataset_eve_ids: datasetEveIds,
    composite_query_hash: compositeHash,
    methodology_version: METHODOLOGY_VERSION,
    emission_scope: "direct_combustion_only",
    query_command: `npx tsx packages/evidence/src/ask-eve/query_multi_se.ts --from ${from} --to ${to}`,
    generated_at_utc: new Date().toISOString(),
  };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  let from = "", to = "";
  let jsonOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from" && args[i + 1]) from = args[++i];
    if (args[i] === "--to" && args[i + 1]) to = args[++i];
    if (args[i] === "--json") jsonOnly = true;
  }

  if (!from || !to) {
    console.error("Usage: query_multi_se.ts --from 2024-01-01 --to 2024-01-31 [--json]");
    process.exit(1);
  }

  const result = queryMultiSE(from, to);
  console.log(JSON.stringify(result, null, jsonOnly ? undefined : 2));
}
