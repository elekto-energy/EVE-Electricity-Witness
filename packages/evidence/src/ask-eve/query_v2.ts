/**
 * Ask-EVE Query Engine — Deterministic V2 Dataset Reader
 *
 * Methodology: TS_V2_CMD_DDM_NP_V1
 *
 * Reads canonical NDJSON and computes summary statistics.
 * No AI. No interpretation. Pure computation on locked data.
 *
 * Data sources:
 *   CMD: timeseries_v2/{zone}/{YYYY-MM}.ndjson   (ENTSO-E: zonpris, generation, CO₂, weather)
 *   CMD: system_price/{YYYY-MM}.ndjson            (Nord Pool: official system price)
 *   CMD: entsoe_flows/{run_id}/flows.json         (ENTSO-E: physical cross-border flows)
 *   DDM: flaskhals = zonpris − systempris         (computed here, pure algebra)
 *
 * Every query result can be reproduced with:
 *   npx tsx packages/evidence/src/ask-eve/query_v2.ts --zone SE3 --from 2024-01-01 --to 2024-01-31
 *
 * TR1: No source, no number.
 * TR6: Code reads — never invents.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";

const PROJECT_ROOT = resolve(__dirname, "../../../..");
const TS_DIR = join(PROJECT_ROOT, "data", "canonical", "timeseries_v2");
const SYS_DIR = join(PROJECT_ROOT, "data", "canonical", "system_price");
const FLOWS_DIR = join(PROJECT_ROOT, "data", "canonical", "entsoe_flows");
const VAULT_PATH = join(PROJECT_ROOT, "data", "xvault", "elekto_v2_worm.jsonl");
const REGISTRY_LOCK = join(PROJECT_ROOT, "config", "method_registry.lock.json");

const METHODOLOGY_VERSION = "TS_V2_CMD_DDM_NP_V1";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface V2Row {
  ts: string;
  zone: string;
  spot: number | null;
  temp: number | null;
  wind_speed: number | null;
  solar_rad: number | null;
  hdd: number | null;
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
  net_import_mw: number | null;
  production_co2_g_kwh: number | null;
  consumption_co2_g_kwh: number | null;
  emission_scope: string;
  resolution_source: string;
  dataset_eve_id: string;
}

interface SysRow {
  ts: string;
  price_eur_mwh?: number;
  sys_eur_mwh?: number;
}

interface FlowEntry {
  in_zone: string;
  out_zone: string;
  direction: string;
  resolution: string;
  unit: string;
  period_start?: string;
  period_end?: string;
  points: { position: number; quantity_mw: number }[];
}

export interface QueryParams {
  zone: string;
  from: string;  // ISO date YYYY-MM-DD
  to: string;    // ISO date YYYY-MM-DD
}

export interface QueryResult {
  zone: string;
  period: { from: string; to: string };
  rows_count: number;
  hours_total: number;

  // ── ENTSO-E CMD ──
  spot: { mean: number | null; min: number | null; max: number | null; median: number | null };
  production_co2: { mean: number | null; min: number | null; max: number | null };
  consumption_co2: { mean: number | null; min: number | null; max: number | null };
  net_import: { mean: number | null; sum_mwh: number | null };
  temperature: { mean: number | null; min: number | null; max: number | null };
  hdd: { sum: number | null };

  generation_mix_avg_mw: {
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

  // ── Nord Pool CMD: System Price ──
  system_price: {
    available: boolean;
    mean: number | null;
    min: number | null;
    max: number | null;
    hours_matched: number;
    source: "Nord Pool" | null;
    dataset_eve_id: string | null;
    canonical_hash: string | null;
  };

  // ── DDM: Bottleneck (computed) ──
  bottleneck: {
    available: boolean;
    mean: number | null;
    min: number | null;
    max: number | null;
    mean_pct: number | null;
    max_pct: number | null;
    hours_positive: number;
    hours_negative: number;
    hours_zero: number;
  };

  // ── ENTSO-E CMD: Cross-border Flows ──
  flows: {
    available: boolean;
    total_import_mwh: number | null;
    total_export_mwh: number | null;
    net_mwh: number | null;
    top_borders_in: { border: string; total_mwh: number }[];
    top_borders_out: { border: string; total_mwh: number }[];
    dataset_ids: string[];
  };

  // ── Methodology warnings ──
  methodology_warnings: string[];

  // ── Provenance ──
  dataset_eve_id: string | null;
  methodology_version: string;
  emission_scope: string;
  registry_hash: string | null;
  vault: { chain_hash: string; event_index: number; root_hash: string } | null;

  // ── Reproducibility ──
  query_command: string;
  generated_at_utc: string;
}

// ─── Data Reader: Timeseries V2 ──────────────────────────────────────────────

export function readRows(zone: string, from: string, to: string): V2Row[] {
  const zoneDir = join(TS_DIR, zone);
  if (!existsSync(zoneDir)) throw new Error(`Zone directory not found: ${zone}`);

  const fromDate = new Date(from + "T00:00:00Z");
  const toDate = new Date(to + "T23:59:59Z");

  const files = readdirSync(zoneDir)
    .filter(f => f.endsWith(".ndjson"))
    .sort();

  const rows: V2Row[] = [];

  for (const file of files) {
    const match = file.match(/^(\d{4})-(\d{2})\.ndjson$/);
    if (!match) continue;
    const fileYear = parseInt(match[1]);
    const fileMonth = parseInt(match[2]);

    const fileStart = new Date(Date.UTC(fileYear, fileMonth - 1, 1));
    const fileEnd = new Date(Date.UTC(fileYear, fileMonth, 0, 23, 59, 59));
    if (fileEnd < fromDate || fileStart > toDate) continue;

    const content = readFileSync(join(zoneDir, file), "utf-8").trim();
    if (!content) continue;

    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      const row: V2Row = JSON.parse(line);
      const rowDate = new Date(row.ts);
      if (rowDate >= fromDate && rowDate <= toDate) {
        rows.push(row);
      }
    }
  }

  return rows;
}

// ─── Data Reader: System Price (Nord Pool CMD) ───────────────────────────────

function readSystemPrices(from: string, to: string): {
  prices: Map<string, number>;
  available: boolean;
  datasetIds: Set<string>;
  canonicalHash: string | null;
} {
  const prices = new Map<string, number>();
  const datasetIds = new Set<string>();
  const hashInput: string[] = [];

  // Determine months to read
  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);

  const fromDate = new Date(from + "T00:00:00Z");
  const toDate = new Date(to + "T23:59:59Z");

  // Iterate months
  const cursor = new Date(fromMonth + "-01T00:00:00Z");
  const endMonth = new Date(toMonth + "-01T00:00:00Z");

  while (cursor <= endMonth) {
    const month = cursor.toISOString().slice(0, 7);
    const sysFile = join(SYS_DIR, `${month}.ndjson`);

    if (existsSync(sysFile)) {
      const content = readFileSync(sysFile, "utf-8").trim();
      if (content) {
        // Hash the canonical file for provenance
        const fileHash = createHash("sha256").update(content).digest("hex");
        hashInput.push(fileHash);

        for (const line of content.split("\n")) {
          if (!line.trim()) continue;
          const row: SysRow = JSON.parse(line);
          const rowDate = new Date(row.ts);
          if (rowDate >= fromDate && rowDate <= toDate) {
            const price = row.price_eur_mwh ?? row.sys_eur_mwh;
            if (price !== undefined && price !== null) {
              prices.set(row.ts, price);
            }
            // Extract dataset_eve_id if present
            const r = row as Record<string, unknown>;
            if (r.dataset_eve_id) datasetIds.add(r.dataset_eve_id as string);
          }
        }
      }
    }

    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  // Combine file hashes into single canonical hash
  let canonicalHash: string | null = null;
  if (hashInput.length > 0) {
    canonicalHash = createHash("sha256").update(hashInput.join("|")).digest("hex");
  }

  return {
    prices,
    available: prices.size > 0,
    datasetIds,
    canonicalHash,
  };
}

// ─── Data Reader: Cross-border Flows (ENTSO-E CMD) ──────────────────────────

interface FlowAggregation {
  totalIn: Map<string, number>;   // border → total MWh imported
  totalOut: Map<string, number>;  // border → total MWh exported
  datasetIds: string[];
  available: boolean;
}

function readFlows(zone: string, from: string, to: string): FlowAggregation {
  const totalIn = new Map<string, number>();
  const totalOut = new Map<string, number>();
  const datasetIds: string[] = [];

  if (!existsSync(FLOWS_DIR)) {
    return { totalIn, totalOut, datasetIds, available: false };
  }

  const fromDate = new Date(from + "T00:00:00Z");
  const toDate = new Date(to + "T23:59:59Z");

  // Determine months
  const fromMonth = from.slice(0, 7).replace("-", "");
  const toMonth = to.slice(0, 7).replace("-", "");

  // Find matching flow runs
  const runs = readdirSync(FLOWS_DIR)
    .filter(d => {
      const p = join(FLOWS_DIR, d);
      if (!statSync(p).isDirectory()) return false;
      const m = d.match(/entsoe_flows_(\d{6})/);
      if (!m) return false;
      return m[1] >= fromMonth && m[1] <= toMonth;
    })
    .sort();

  for (const runId of runs) {
    const flowFile = join(FLOWS_DIR, runId, "flows.json");
    if (!existsSync(flowFile)) continue;

    datasetIds.push(runId);

    try {
      const data: FlowEntry[] = JSON.parse(readFileSync(flowFile, "utf-8"));

      for (const entry of data) {
        const parts = entry.direction.split("→");
        if (parts.length !== 2) continue;
        const [fromZ, toZ] = parts;

        const isIncoming = toZ === zone;
        const isOutgoing = fromZ === zone;
        if (!isIncoming && !isOutgoing) continue;

        const resolution = entry.resolution || "PT60M";
        const stepsPerHour = resolution === "PT15M" ? 4 : 1;
        const monthMatch = runId.match(/entsoe_flows_(\d{4})(\d{2})/);
        if (!monthMatch) continue;

        const monthStart = new Date(Date.UTC(
          parseInt(monthMatch[1]),
          parseInt(monthMatch[2]) - 1,
          1,
        ));

        for (const pt of entry.points) {
          if (pt.quantity_mw === 0) continue;

          const hourIndex = Math.floor((pt.position - 1) / stepsPerHour);
          const dayIndex = Math.floor(hourIndex / 24);
          const hourInDay = hourIndex % 24;

          const tsDate = new Date(monthStart.getTime() + dayIndex * 86400000 + hourInDay * 3600000);
          if (tsDate < fromDate || tsDate > toDate) continue;

          // Convert MW per period to MWh:
          // PT60M: 1 MW * 1h = 1 MWh
          // PT15M: 1 MW * 0.25h = 0.25 MWh
          const mwh = pt.quantity_mw / stepsPerHour;

          const border = entry.direction;
          const map = isIncoming ? totalIn : totalOut;
          map.set(border, (map.get(border) || 0) + mwh);
        }
      }
    } catch {
      // Flow loading failure is non-fatal
    }
  }

  return {
    totalIn,
    totalOut,
    datasetIds,
    available: datasetIds.length > 0,
  };
}

// ─── Statistics ──────────────────────────────────────────────────────────────

function stats(values: (number | null)[]): { mean: number | null; min: number | null; max: number | null } {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return { mean: null, min: null, max: null };
  const sum = valid.reduce((a, b) => a + b, 0);
  return {
    mean: Math.round(sum / valid.length * 100) / 100,
    min: Math.round(Math.min(...valid) * 100) / 100,
    max: Math.round(Math.max(...valid) * 100) / 100,
  };
}

function median(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : Math.round((valid[mid - 1] + valid[mid]) / 2 * 100) / 100;
}

function meanOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length * 100) / 100;
}

// ─── Vault Lookup ────────────────────────────────────────────────────────────

function findVaultEntry(datasetId: string): { chain_hash: string; event_index: number; root_hash: string } | null {
  if (!existsSync(VAULT_PATH)) return null;
  try {
    const lines = readFileSync(VAULT_PATH, "utf-8").trim().split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const record = JSON.parse(lines[i]);
      if (record.event.dataset_eve_id === datasetId ||
          record.event.supersedes === datasetId) {
        return {
          chain_hash: record.chain_hash,
          event_index: record.event_index,
          root_hash: record.event.root_hash,
        };
      }
    }
  } catch { /* */ }
  return null;
}

// ─── Query ───────────────────────────────────────────────────────────────────

export function query(params: QueryParams): QueryResult {
  const methodologyWarnings: string[] = [];

  // ── 1. Read ENTSO-E timeseries (CMD) ──
  const rows = readRows(params.zone, params.from, params.to);

  if (rows.length === 0) {
    throw new Error(`No data for ${params.zone} between ${params.from} and ${params.to}`);
  }

  const datasetEveId = rows[0].dataset_eve_id;

  // ── 2. Read Nord Pool system price (CMD) ──
  const sysPriceData = readSystemPrices(params.from, params.to);

  if (!sysPriceData.available) {
    methodologyWarnings.push(
      "Systempris ej tillgängligt för denna period. " +
      "Nord Pool låser historisk data bakom betalvägg (pre-2026). " +
      "ENTSO-E, EEA, ECB och Riksdagen är öppna — Nord Pool är undantaget."
    );
  }

  // ── 3. Read cross-border flows (CMD) ──
  const flowData = readFlows(params.zone, params.from, params.to);

  if (!flowData.available) {
    methodologyWarnings.push(
      "Cross-border flow dataset missing — flow aggregation not available. " +
      "Requires ENTSO-E physical flow data (CMD layer)."
    );
  }

  // ── 4. Compute ENTSO-E statistics ──

  // Spot
  const spotValues = rows.map(r => r.spot);
  const spotStats = stats(spotValues);

  // CO₂
  const prodCo2 = stats(rows.map(r => r.production_co2_g_kwh));
  const consCo2 = stats(rows.map(r => r.consumption_co2_g_kwh));

  // Net import
  const netImportValues = rows.map(r => r.net_import_mw);
  const netImportValid = netImportValues.filter((v): v is number => v !== null);
  const netImportSum = netImportValid.length > 0
    ? Math.round(netImportValid.reduce((a, b) => a + b, 0) * 100) / 100
    : null;

  // Temperature + HDD
  const tempStats = stats(rows.map(r => r.temp));
  const hddValues = rows.map(r => r.hdd).filter((v): v is number => v !== null);
  const hddSum = hddValues.length > 0 ? Math.round(hddValues.reduce((a, b) => a + b, 0) * 100) / 100 : null;

  // Generation mix averages
  const genMix = {
    nuclear: meanOrNull(rows.map(r => r.nuclear_mw)),
    hydro: meanOrNull(rows.map(r => r.hydro_mw)),
    wind_onshore: meanOrNull(rows.map(r => r.wind_onshore_mw)),
    wind_offshore: meanOrNull(rows.map(r => r.wind_offshore_mw)),
    solar: meanOrNull(rows.map(r => r.solar_mw)),
    gas: meanOrNull(rows.map(r => r.gas_mw)),
    coal: meanOrNull(rows.map(r => r.coal_mw)),
    lignite: meanOrNull(rows.map(r => r.lignite_mw)),
    oil: meanOrNull(rows.map(r => r.oil_mw)),
    other: meanOrNull(rows.map(r => r.other_mw)),
    total: meanOrNull(rows.map(r => r.total_gen_mw)),
  };

  // ── 5. Compute System Price + Bottleneck (DDM) ──

  const sysValues: (number | null)[] = [];
  const bottleneckValues: number[] = [];
  const bottleneckPctValues: number[] = [];
  let hoursMatched = 0;
  let hoursPositive = 0;
  let hoursNegative = 0;
  let hoursZero = 0;

  for (const row of rows) {
    if (row.spot === null) {
      sysValues.push(null);
      continue;
    }

    const sys = sysPriceData.prices.get(row.ts) ?? null;
    sysValues.push(sys);

    if (sys !== null) {
      hoursMatched++;
      const bn = +(row.spot - sys).toFixed(2);
      bottleneckValues.push(bn);

      if (bn > 0.01) hoursPositive++;
      else if (bn < -0.01) hoursNegative++;
      else hoursZero++;

      if (row.spot > 0) {
        bottleneckPctValues.push(+((Math.max(0, bn) / row.spot) * 100).toFixed(1));
      }
    }
  }

  const sysStats = stats(sysValues);
  const bnStats = stats(bottleneckValues);
  const bnPctMean = bottleneckPctValues.length > 0
    ? +(bottleneckPctValues.reduce((a, b) => a + b, 0) / bottleneckPctValues.length).toFixed(1)
    : null;
  const bnPctMax = bottleneckPctValues.length > 0
    ? +Math.max(...bottleneckPctValues).toFixed(1)
    : null;

  // ── 6. Compute Flow aggregation ──

  let flowTotalImportMwh: number | null = null;
  let flowTotalExportMwh: number | null = null;

  const topBordersIn: { border: string; total_mwh: number }[] = [];
  const topBordersOut: { border: string; total_mwh: number }[] = [];

  if (flowData.available) {
    let imp = 0;
    for (const [border, mwh] of flowData.totalIn) {
      imp += mwh;
      topBordersIn.push({ border, total_mwh: +mwh.toFixed(0) });
    }
    flowTotalImportMwh = +imp.toFixed(0);

    let exp = 0;
    for (const [border, mwh] of flowData.totalOut) {
      exp += mwh;
      topBordersOut.push({ border, total_mwh: +mwh.toFixed(0) });
    }
    flowTotalExportMwh = +exp.toFixed(0);

    topBordersIn.sort((a, b) => b.total_mwh - a.total_mwh);
    topBordersOut.sort((a, b) => b.total_mwh - a.total_mwh);
  }

  // ── 7. Provenance ──

  let registryHash: string | null = null;
  try {
    const lock = JSON.parse(readFileSync(REGISTRY_LOCK, "utf-8"));
    registryHash = lock.registry_hash;
  } catch { /* */ }

  const vault = findVaultEntry(datasetEveId);

  const sysDsId = sysPriceData.datasetIds.size > 0
    ? [...sysPriceData.datasetIds].join(", ")
    : null;

  // ── 8. Build result ──

  return {
    zone: params.zone,
    period: { from: params.from, to: params.to },
    rows_count: rows.length,
    hours_total: rows.length,

    // ENTSO-E CMD
    spot: { ...spotStats, median: median(spotValues) },
    production_co2: prodCo2,
    consumption_co2: consCo2,
    net_import: { mean: meanOrNull(netImportValues), sum_mwh: netImportSum },
    temperature: tempStats,
    hdd: { sum: hddSum },
    generation_mix_avg_mw: genMix,

    // Nord Pool CMD
    system_price: {
      available: sysPriceData.available,
      mean: sysStats.mean,
      min: sysStats.min,
      max: sysStats.max,
      hours_matched: hoursMatched,
      source: sysPriceData.available ? "Nord Pool" : null,
      dataset_eve_id: sysDsId,
      canonical_hash: sysPriceData.canonicalHash,
    },

    // DDM: Bottleneck
    bottleneck: {
      available: sysPriceData.available && hoursMatched > 0,
      mean: bnStats.mean,
      min: bnStats.min,
      max: bnStats.max,
      mean_pct: bnPctMean,
      max_pct: bnPctMax,
      hours_positive: hoursPositive,
      hours_negative: hoursNegative,
      hours_zero: hoursZero,
    },

    // ENTSO-E CMD: Flows
    flows: {
      available: flowData.available,
      total_import_mwh: flowTotalImportMwh,
      total_export_mwh: flowTotalExportMwh,
      net_mwh: flowTotalImportMwh !== null && flowTotalExportMwh !== null
        ? +(flowTotalImportMwh - flowTotalExportMwh).toFixed(0)
        : null,
      top_borders_in: topBordersIn.slice(0, 5),
      top_borders_out: topBordersOut.slice(0, 5),
      dataset_ids: flowData.datasetIds,
    },

    // Methodology warnings
    methodology_warnings: methodologyWarnings,

    // Provenance
    dataset_eve_id: datasetEveId,
    methodology_version: METHODOLOGY_VERSION,
    emission_scope: "direct_combustion_only",
    registry_hash: registryHash,
    vault,

    // Reproducibility
    query_command: `npx tsx packages/evidence/src/ask-eve/query_v2.ts --zone ${params.zone} --from ${params.from} --to ${params.to}`,
    generated_at_utc: new Date().toISOString(),
  };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  let zone = "", from = "", to = "";
  let jsonOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--zone" && args[i + 1]) zone = args[++i];
    if (args[i] === "--from" && args[i + 1]) from = args[++i];
    if (args[i] === "--to" && args[i + 1]) to = args[++i];
    if (args[i] === "--json") jsonOnly = true;
  }

  if (!zone || !from || !to) {
    console.error("Usage: query_v2.ts --zone SE3 --from 2024-01-01 --to 2024-01-31 [--json]");
    process.exit(1);
  }

  const result = query({ zone, from, to });
  console.log(JSON.stringify(result, null, jsonOnly ? undefined : 2));
}
