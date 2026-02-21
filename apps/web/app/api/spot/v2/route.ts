/**
 * GET /api/spot/v2?zone=SE3&date=YYYY-MM-DD
 * GET /api/spot/v2?zone=SE3&month=2024-06
 *
 * Returns V2 timeseries data for a zone: spot, weather, generation mix,
 * CO₂ intensity, flows — all from canonical NDJSON.
 *
 * Data source: lib/spot/getSpotV2.ts (shared helper)
 *
 * TR1: No source, no number.
 * TR6: Code reads — never invents.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getSpotV2ByDate,
  getSpotV2ByMonth,
  getAvailableZones,
  V2Row,
} from "@/lib/spot/getSpotV2";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const zone = searchParams.get("zone")?.toUpperCase();
  const date = searchParams.get("date");     // YYYY-MM-DD → filter to single day
  const month = searchParams.get("month");   // YYYY-MM → full month

  if (!zone) {
    return NextResponse.json({ error: "Missing zone parameter" }, { status: 400 });
  }

  let result;

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    result = getSpotV2ByDate({ zone, date });
  } else if (month && /^\d{4}-\d{2}$/.test(month)) {
    result = getSpotV2ByMonth({ zone, month });
  } else {
    // Default: yesterday
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().slice(0, 10);
    result = getSpotV2ByDate({ zone, date: yesterday });
  }

  if (result.rows.length === 0) {
    return NextResponse.json(
      { error: `No data for ${zone} on ${date ?? month ?? "yesterday"}`, available_zones: getAvailableZones() },
      { status: 404 },
    );
  }

  const rows = result.rows;

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
  const manifest = result.manifest;

  return NextResponse.json({
    zone: result.zone,
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
