/**
 * GET /api/spot/v2?zone=SE3&date=YYYY-MM-DD
 * GET /api/spot/v2?zone=SE3&month=2024-06
 *
 * Returns V2 timeseries data for a zone: spot, weather, generation mix,
 * CO₂ intensity, flows — all from canonical NDJSON.
 *
 * Data source: data/canonical/timeseries_v2/{zone}/{YYYY-MM}.ndjson
 *
 * TR1: No source, no number.
 * TR6: Code reads — never invents.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, resolve } from "path";

// Resolve data dir robustly — works whether cwd is apps/web or project root
const DATA_DIR = (() => {
  const fromCwd = resolve(process.cwd(), "data/canonical/timeseries_v2");
  if (existsSync(fromCwd)) return fromCwd;
  const fromAppsWeb = resolve(process.cwd(), "../../data/canonical/timeseries_v2");
  if (existsSync(fromAppsWeb)) return fromAppsWeb;
  // Fallback: try monorepo root via __dirname
  return resolve(__dirname, "../../../../../data/canonical/timeseries_v2");
})();

interface V2Row {
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

function loadNdjson(filePath: string): V2Row[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").filter(Boolean).map(line => JSON.parse(line));
}

function loadManifest(zoneDir: string): Record<string, unknown> | null {
  if (!existsSync(zoneDir)) return null;
  const files = readdirSync(zoneDir).filter(f => f.startsWith("manifest_"));
  if (files.length === 0) return null;
  // Latest manifest (sort desc)
  files.sort().reverse();
  try {
    return JSON.parse(readFileSync(join(zoneDir, files[0]), "utf-8"));
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const zone = searchParams.get("zone")?.toUpperCase();
  const date = searchParams.get("date");     // YYYY-MM-DD → filter to single day
  const month = searchParams.get("month");   // YYYY-MM → full month

  if (!zone) {
    return NextResponse.json({ error: "Missing zone parameter" }, { status: 400 });
  }

  const zoneDir = join(DATA_DIR, zone);
  if (!existsSync(zoneDir)) {
    return NextResponse.json(
      { error: `No V2 data for zone ${zone}`, data_dir: DATA_DIR, zone_dir: zoneDir, available_zones: getAvailableZones() },
      { status: 404 },
    );
  }

  let rows: V2Row[] = [];
  let targetMonth: string;

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    targetMonth = date.slice(0, 7); // YYYY-MM
    const filePath = join(zoneDir, `${targetMonth}.ndjson`);
    const allRows = loadNdjson(filePath);
    // Filter to specific day
    rows = allRows.filter(r => r.ts.startsWith(date));
  } else if (month && /^\d{4}-\d{2}$/.test(month)) {
    targetMonth = month;
    const filePath = join(zoneDir, `${targetMonth}.ndjson`);
    rows = loadNdjson(filePath);
  } else {
    // Default: yesterday
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().slice(0, 10);
    targetMonth = yesterday.slice(0, 7);
    const filePath = join(zoneDir, `${targetMonth}.ndjson`);
    const allRows = loadNdjson(filePath);
    rows = allRows.filter(r => r.ts.startsWith(yesterday));
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: `No data for ${zone} on ${date ?? month ?? "yesterday"}` },
      { status: 404 },
    );
  }

  // Compute stats
  const spots = rows.map(r => r.spot).filter((v): v is number => v !== null);
  const temps = rows.map(r => r.temp).filter((v): v is number => v !== null);
  const co2s = rows.map(r => r.production_co2_g_kwh).filter((v): v is number => v !== null);
  const totalGen = rows.map(r => r.total_gen_mw).filter((v): v is number => v !== null);

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 100) / 100 : null;

  const stats = {
    spot: { avg: avg(spots), min: spots.length ? Math.min(...spots) : null, max: spots.length ? Math.max(...spots) : null },
    temp: { avg: avg(temps), min: temps.length ? Math.min(...temps) : null, max: temps.length ? Math.max(...temps) : null },
    co2_production: { avg: avg(co2s), min: co2s.length ? Math.min(...co2s) : null, max: co2s.length ? Math.max(...co2s) : null },
    total_gen: { avg: avg(totalGen) },
  };

  // Generation mix summary (average MW over period)
  const genFields = ["nuclear_mw", "hydro_mw", "wind_onshore_mw", "wind_offshore_mw", "solar_mw", "gas_mw", "coal_mw", "lignite_mw", "oil_mw", "other_mw"] as const;
  const generation_mix: Record<string, number | null> = {};
  for (const f of genFields) {
    const vals = rows.map(r => r[f]).filter((v): v is number => v !== null);
    generation_mix[f] = avg(vals);
  }

  // Evidence
  const manifest = loadManifest(zoneDir);

  return NextResponse.json({
    zone,
    period: date ?? month ?? "yesterday",
    count: rows.length,
    resolution: "PT60M",
    rows,
    stats,
    generation_mix,
    evidence: manifest ? {
      dataset_eve_id: (manifest as any).dataset_eve_id,
      root_hash: (manifest as any).root_hash,
      methodology_version: (manifest as any).methodology_version,
      emission_scope: (manifest as any).emission_scope,
    } : null,
  });
}

function getAvailableZones(): string[] {
  if (!existsSync(DATA_DIR)) return [];
  return readdirSync(DATA_DIR).filter(f => {
    try { return require("fs").statSync(join(DATA_DIR, f)).isDirectory(); }
    catch { return false; }
  });
}
