/**
 * getSpotV2.ts — Delad NDJSON-läsare för V2 timeseries
 *
 * Används av:
 *   /api/spot/v2 (GET route)
 *   /api/simulate (POST route)
 *
 * Läser canonical NDJSON direkt. Ingen HTTP. Ingen duplicering.
 *
 * TR1: No source, no number.
 * TR6: Code reads — never invents.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

// ─── Data dir resolution ──────────────────────────────────────────────────────

const DATA_DIR = (() => {
  const fromCwd = resolve(process.cwd(), "data/canonical/timeseries_v2");
  if (existsSync(fromCwd)) return fromCwd;
  const fromAppsWeb = resolve(process.cwd(), "../../data/canonical/timeseries_v2");
  if (existsSync(fromAppsWeb)) return fromAppsWeb;
  return resolve(__dirname, "../../../../../data/canonical/timeseries_v2");
})();

// ─── Types ────────────────────────────────────────────────────────────────────

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
}

// ─── NDJSON reader ────────────────────────────────────────────────────────────

function loadNdjson(filePath: string): V2Row[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").filter(Boolean).map(line => JSON.parse(line));
}

// ─── Manifest reader ──────────────────────────────────────────────────────────

export function loadManifest(zoneDir: string): Record<string, unknown> | null {
  if (!existsSync(zoneDir)) return null;
  const files = readdirSync(zoneDir).filter(f => f.startsWith("manifest_"));
  if (files.length === 0) return null;
  files.sort().reverse();
  try {
    return JSON.parse(readFileSync(join(zoneDir, files[0]), "utf-8"));
  } catch { return null; }
}

// ─── Query interfaces ─────────────────────────────────────────────────────────

export interface SpotV2QueryByDate {
  zone: string;
  date: string;   // YYYY-MM-DD
}

export interface SpotV2QueryByMonth {
  zone: string;
  month: string;  // YYYY-MM
}

export interface SpotV2QueryByRange {
  zone: string;
  start: string;  // YYYY-MM-DD
  end: string;    // YYYY-MM-DD
}

export interface SpotV2Result {
  rows: V2Row[];
  zone: string;
  zoneDir: string;
  manifest: Record<string, unknown> | null;
}

// ─── Core query functions ─────────────────────────────────────────────────────

/**
 * Get V2 rows for a single date.
 */
export function getSpotV2ByDate(query: SpotV2QueryByDate): SpotV2Result {
  const zone = query.zone.toUpperCase();
  const zoneDir = join(DATA_DIR, zone);

  if (!existsSync(zoneDir)) {
    return { rows: [], zone, zoneDir, manifest: null };
  }

  const targetMonth = query.date.slice(0, 7);
  const filePath = join(zoneDir, `${targetMonth}.ndjson`);
  const allRows = loadNdjson(filePath);
  const rows = allRows.filter(r => r.ts.startsWith(query.date));

  return { rows, zone, zoneDir, manifest: loadManifest(zoneDir) };
}

/**
 * Get V2 rows for a full month.
 */
export function getSpotV2ByMonth(query: SpotV2QueryByMonth): SpotV2Result {
  const zone = query.zone.toUpperCase();
  const zoneDir = join(DATA_DIR, zone);

  if (!existsSync(zoneDir)) {
    return { rows: [], zone, zoneDir, manifest: null };
  }

  const filePath = join(zoneDir, `${query.month}.ndjson`);
  const rows = loadNdjson(filePath);

  return { rows, zone, zoneDir, manifest: loadManifest(zoneDir) };
}

/**
 * Get V2 rows for a date range (start..end inclusive).
 * Loads all months that overlap the range.
 */
export function getSpotV2ByRange(query: SpotV2QueryByRange): SpotV2Result {
  const zone = query.zone.toUpperCase();
  const zoneDir = join(DATA_DIR, zone);

  if (!existsSync(zoneDir)) {
    return { rows: [], zone, zoneDir, manifest: null };
  }

  // Determine which months to load
  const startMonth = query.start.slice(0, 7);
  const endMonth = query.end.slice(0, 7);

  const months: string[] = [];
  let current = startMonth;
  while (current <= endMonth) {
    months.push(current);
    // Increment month
    const [y, m] = current.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    current = next;
  }

  let allRows: V2Row[] = [];
  for (const month of months) {
    const filePath = join(zoneDir, `${month}.ndjson`);
    allRows = allRows.concat(loadNdjson(filePath));
  }

  // Filter to exact range
  const startTs = query.start + "T00:00:00";
  const endTs = query.end + "T23:59:59";
  const rows = allRows.filter(r => r.ts >= startTs && r.ts <= endTs);

  return { rows, zone, zoneDir, manifest: loadManifest(zoneDir) };
}

// ─── Available zones ──────────────────────────────────────────────────────────

export function getAvailableZones(): string[] {
  if (!existsSync(DATA_DIR)) return [];
  return readdirSync(DATA_DIR).filter(f => {
    try { return statSync(join(DATA_DIR, f)).isDirectory(); }
    catch { return false; }
  });
}

export { DATA_DIR };
