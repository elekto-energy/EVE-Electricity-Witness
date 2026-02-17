/**
 * Ask-EVE Query Engine — Deterministic V2 Dataset Reader
 *
 * Reads canonical NDJSON and computes summary statistics.
 * No AI. No interpretation. Pure computation on locked data.
 *
 * Every query result can be reproduced with:
 *   npx tsx packages/evidence/src/ask-eve/query_v2.ts --zone SE3 --from 2024-01-01 --to 2024-01-31
 *
 * TR1: No source, no number.
 * TR6: Code reads — never invents.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";

const PROJECT_ROOT = resolve(__dirname, "../../../..");
const TS_DIR = join(PROJECT_ROOT, "data", "canonical", "timeseries_v2");
const VAULT_PATH = join(PROJECT_ROOT, "data", "xvault", "elekto_v2_worm.jsonl");
const REGISTRY_LOCK = join(PROJECT_ROOT, "config", "method_registry.lock.json");

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

  // Provenance
  dataset_eve_id: string | null;
  methodology_version: string;
  emission_scope: string;
  registry_hash: string | null;
  vault: { chain_hash: string; event_index: number; root_hash: string } | null;

  // Reproducibility
  query_command: string;
  generated_at_utc: string;
}

// ─── Data Reader ─────────────────────────────────────────────────────────────

export function readRows(zone: string, from: string, to: string): V2Row[] {
  const zoneDir = join(TS_DIR, zone);
  if (!existsSync(zoneDir)) throw new Error(`Zone directory not found: ${zone}`);

  const fromDate = new Date(from + "T00:00:00Z");
  const toDate = new Date(to + "T23:59:59Z");

  // Determine which monthly files to read
  const files = readdirSync(zoneDir)
    .filter(f => f.endsWith(".ndjson"))
    .sort();

  const rows: V2Row[] = [];

  for (const file of files) {
    // Parse month from filename: 2024-01.ndjson
    const match = file.match(/^(\d{4})-(\d{2})\.ndjson$/);
    if (!match) continue;
    const fileYear = parseInt(match[1]);
    const fileMonth = parseInt(match[2]);

    // Quick month-level filter
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
  const rows = readRows(params.zone, params.from, params.to);

  if (rows.length === 0) {
    throw new Error(`No data for ${params.zone} between ${params.from} and ${params.to}`);
  }

  const datasetEveId = rows[0].dataset_eve_id;

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

  // Registry
  let registryHash: string | null = null;
  try {
    const lock = JSON.parse(readFileSync(REGISTRY_LOCK, "utf-8"));
    registryHash = lock.registry_hash;
  } catch { /* */ }

  // Vault
  const vault = findVaultEntry(datasetEveId);

  return {
    zone: params.zone,
    period: { from: params.from, to: params.to },
    rows_count: rows.length,
    hours_total: rows.length,

    spot: { ...spotStats, median: median(spotValues) },
    production_co2: prodCo2,
    consumption_co2: consCo2,
    net_import: { mean: meanOrNull(netImportValues), sum_mwh: netImportSum },
    temperature: tempStats,
    hdd: { sum: hddSum },

    generation_mix_avg_mw: genMix,

    dataset_eve_id: datasetEveId,
    methodology_version: "TS_V2_EEA_2023_DIRECT",
    emission_scope: "direct_combustion_only",
    registry_hash: registryHash,
    vault,

    query_command: `npx tsx packages/evidence/src/ask-eve/query_v2.ts --zone ${params.zone} --from ${params.from} --to ${params.to}`,
    generated_at_utc: new Date().toISOString(),
  };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  let zone = "", from = "", to = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--zone" && args[i + 1]) zone = args[++i];
    if (args[i] === "--from" && args[i + 1]) from = args[++i];
    if (args[i] === "--to" && args[i + 1]) to = args[++i];
  }

  if (!zone || !from || !to) {
    console.error("Usage: query_v2.ts --zone SE3 --from 2024-01-01 --to 2024-01-31");
    process.exit(1);
  }

  const result = query({ zone, from, to });
  console.log(JSON.stringify(result, null, 2));
}
