/**
 * SMHI Meteorological Observations Ingest v2
 *
 * Step 1: Discover available stations per parameter
 * Step 2: Pick best station per zone per parameter
 * Step 3: Fetch corrected-archive + latest-months, merge
 * Step 4: Aggregate to daily + monthly canonical
 *
 * No API key — SMHI Open Data is fully public.
 *
 * Usage:
 *   npx tsx packages/evidence/src/ingest_smhi_weather.ts
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";

const API_BASE = "https://opendata-download-metobs.smhi.se/api/version/1.0";

/** Zone center coordinates for finding closest station */
const ZONE_CENTERS: Record<string, { lat: number; lon: number }> = {
  SE1: { lat: 65.58, lon: 22.15 },  // Luleå
  SE2: { lat: 62.39, lon: 17.31 },  // Sundsvall
  SE3: { lat: 59.33, lon: 18.07 },  // Stockholm
  SE4: { lat: 55.61, lon: 13.00 },  // Malmö
};

const PARAMS = [
  { key: 1,  name: "temperature",      unit: "celsius", description: "Lufttemperatur momentan 1/tim" },
  { key: 11, name: "solar_irradiance", unit: "W/m2",    description: "Global Irradians medel 1 tim" },
  { key: 4,  name: "wind_speed",       unit: "m/s",     description: "Vindhastighet medel 10 min, 1/tim" },
];

interface StationInfo {
  id: number;
  name: string;
  lat: number;
  lon: number;
  active: boolean;
  from: number;  // timestamp ms
  to: number;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Discover stations for a parameter */
async function discoverStations(paramKey: number): Promise<StationInfo[]> {
  const url = `${API_BASE}/parameter/${paramKey}.json`;
  console.log(`  Discovering stations for param ${paramKey}...`);
  try {
    const resp = await fetch(url);
    if (!resp.ok) { console.log(`  ⚠ HTTP ${resp.status}`); return []; }
    const data = await resp.json() as any;
    if (!data.station) return [];
    return data.station.map((s: any) => ({
      id: parseInt(s.key),
      name: s.name,
      lat: s.latitude,
      lon: s.longitude,
      active: s.active,
      from: s.from,
      to: s.to,
    }));
  } catch (err: any) {
    console.log(`  ❌ ${err.message}`);
    return [];
  }
}

/** Find best station for a zone: active, long history, closest */
function pickStation(stations: StationInfo[], zone: string): StationInfo | null {
  const center = ZONE_CENTERS[zone];
  const cutoff2016 = new Date("2016-01-01").getTime();

  // Filter: active, has data from before 2016
  const candidates = stations
    .filter(s => s.active && s.from < cutoff2016)
    .map(s => ({ ...s, dist: haversine(center.lat, center.lon, s.lat, s.lon) }))
    .sort((a, b) => a.dist - b.dist);

  return candidates[0] ?? null;
}

interface SmhiValue { date: number; value: string; quality: string; }

async function fetchData(paramKey: number, stationId: number, period: string): Promise<SmhiValue[]> {
  const url = `${API_BASE}/parameter/${paramKey}/station/${stationId}/period/${period}/data.json`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json() as any;
    return data.value ?? [];
  } catch { return []; }
}

interface DailyRecord {
  date: string;
  temp_avg_c: number | null;
  temp_min_c: number | null;
  temp_max_c: number | null;
  solar_wh_m2: number | null;
  solar_hours: number | null;
  wind_avg_ms: number | null;
}

function aggregateDaily(tempVals: SmhiValue[], solarVals: SmhiValue[], windVals: SmhiValue[]): DailyRecord[] {
  const byDate: Record<string, { temps: number[]; solar: number[]; wind: number[] }> = {};
  const add = (vals: SmhiValue[], field: "temps" | "solar" | "wind") => {
    for (const v of vals) {
      const d = new Date(v.date).toISOString().slice(0, 10);
      if (!byDate[d]) byDate[d] = { temps: [], solar: [], wind: [] };
      const num = parseFloat(v.value);
      if (!isNaN(num)) byDate[d][field].push(num);
    }
  };
  add(tempVals, "temps"); add(solarVals, "solar"); add(windVals, "wind");

  return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({
    date,
    temp_avg_c: d.temps.length > 0 ? Math.round(d.temps.reduce((s, v) => s + v, 0) / d.temps.length * 10) / 10 : null,
    temp_min_c: d.temps.length > 0 ? Math.round(Math.min(...d.temps) * 10) / 10 : null,
    temp_max_c: d.temps.length > 0 ? Math.round(Math.max(...d.temps) * 10) / 10 : null,
    solar_wh_m2: d.solar.length > 0 ? Math.round(d.solar.reduce((s, v) => s + v, 0)) : null,
    solar_hours: d.solar.length > 0 ? d.solar.filter(v => v > 50).length : null,
    wind_avg_ms: d.wind.length > 0 ? Math.round(d.wind.reduce((s, v) => s + v, 0) / d.wind.length * 10) / 10 : null,
  }));
}

interface MonthlyRecord {
  month: string;
  temp_avg_c: number | null;
  temp_min_c: number | null;
  temp_max_c: number | null;
  solar_kwh_m2: number | null;
  solar_hours: number | null;
  wind_avg_ms: number | null;
  days: number;
}

function aggregateMonthly(daily: DailyRecord[]): MonthlyRecord[] {
  const byMonth: Record<string, DailyRecord[]> = {};
  for (const d of daily) { const m = d.date.slice(0, 7); if (!byMonth[m]) byMonth[m] = []; byMonth[m].push(d); }

  return Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, days]) => {
    const t = days.filter(d => d.temp_avg_c !== null).map(d => d.temp_avg_c!);
    const tmin = days.filter(d => d.temp_min_c !== null).map(d => d.temp_min_c!);
    const tmax = days.filter(d => d.temp_max_c !== null).map(d => d.temp_max_c!);
    const sol = days.filter(d => d.solar_wh_m2 !== null).map(d => d.solar_wh_m2!);
    const solH = days.filter(d => d.solar_hours !== null).map(d => d.solar_hours!);
    const w = days.filter(d => d.wind_avg_ms !== null).map(d => d.wind_avg_ms!);
    return {
      month,
      temp_avg_c: t.length > 0 ? Math.round(t.reduce((s, v) => s + v, 0) / t.length * 10) / 10 : null,
      temp_min_c: tmin.length > 0 ? Math.round(Math.min(...tmin) * 10) / 10 : null,
      temp_max_c: tmax.length > 0 ? Math.round(Math.max(...tmax) * 10) / 10 : null,
      solar_kwh_m2: sol.length > 0 ? Math.round(sol.reduce((s, v) => s + v, 0) / 1000 * 10) / 10 : null,
      solar_hours: solH.length > 0 ? solH.reduce((s, v) => s + v, 0) : null,
      wind_avg_ms: w.length > 0 ? Math.round(w.reduce((s, v) => s + v, 0) / w.length * 10) / 10 : null,
      days: days.length,
    };
  });
}

async function main() {
  const projectRoot = resolve(__dirname, "../../..");
  const outDir = join(projectRoot, "data", "canonical", "smhi");
  mkdirSync(outDir, { recursive: true });

  console.log("[smhi-ingest] v2 — Auto-discover stations per parameter");
  console.log();

  // Step 1: Discover stations per parameter
  const stationsByParam: Record<number, StationInfo[]> = {};
  for (const param of PARAMS) {
    stationsByParam[param.key] = await discoverStations(param.key);
    console.log(`  param ${param.key} (${param.name}): ${stationsByParam[param.key].length} stations`);
    await new Promise(r => setTimeout(r, 300));
  }

  // Step 2: Pick best station per zone per parameter
  const zones = ["SE1", "SE2", "SE3", "SE4"];
  for (const zone of zones) {
    console.log(`\n[smhi-ingest] === ${zone} ===`);

    const stationPicks: Record<string, StationInfo | null> = {};
    for (const param of PARAMS) {
      const pick = pickStation(stationsByParam[param.key], zone);
      stationPicks[param.name] = pick;
      if (pick) {
        console.log(`  ${param.name}: ${pick.name} (id=${pick.id}, ${haversine(ZONE_CENTERS[zone].lat, ZONE_CENTERS[zone].lon, pick.lat, pick.lon).toFixed(0)} km)`);
      } else {
        console.log(`  ${param.name}: ⚠ No suitable station found`);
      }
    }

    // Step 3: Fetch data
    const cutoff = new Date("2016-01-01T00:00:00Z").getTime();

    const fetchMerged = async (paramKey: number, stationId: number): Promise<SmhiValue[]> => {
      const all: SmhiValue[] = [];
      for (const period of ["corrected-archive", "latest-months"]) {
        console.log(`  Fetching param=${paramKey} station=${stationId} period=${period}...`);
        const vals = await fetchData(paramKey, stationId, period);
        if (vals.length > 0) {
          const filtered = vals.filter(v => v.date >= cutoff);
          all.push(...filtered);
          console.log(`    ✅ ${filtered.length} values`);
        } else {
          console.log(`    ⚠ No data`);
        }
        await new Promise(r => setTimeout(r, 400));
      }
      // Dedup
      const seen = new Set<number>();
      return all.filter(v => { if (seen.has(v.date)) return false; seen.add(v.date); return true; }).sort((a, b) => a.date - b.date);
    };

    let tempVals: SmhiValue[] = [];
    let solarVals: SmhiValue[] = [];
    let windVals: SmhiValue[] = [];

    if (stationPicks.temperature) tempVals = await fetchMerged(1, stationPicks.temperature.id);
    if (stationPicks.solar_irradiance) solarVals = await fetchMerged(11, stationPicks.solar_irradiance.id);
    if (stationPicks.wind_speed) windVals = await fetchMerged(4, stationPicks.wind_speed.id);

    // Step 4: Aggregate
    const daily = aggregateDaily(tempVals, solarVals, windVals);
    const monthly = aggregateMonthly(daily);

    const canonical = {
      zone,
      stations: {
        temperature: stationPicks.temperature ? { id: stationPicks.temperature.id, name: stationPicks.temperature.name } : null,
        solar_irradiance: stationPicks.solar_irradiance ? { id: stationPicks.solar_irradiance.id, name: stationPicks.solar_irradiance.name } : null,
        wind_speed: stationPicks.wind_speed ? { id: stationPicks.wind_speed.id, name: stationPicks.wind_speed.name } : null,
      },
      period: { from: daily[0]?.date ?? null, to: daily[daily.length - 1]?.date ?? null },
      daily_records: daily.length,
      monthly,
      source: { name: "SMHI Open Data Meteorological Observations", publisher: "SMHI", url: "https://opendata-download-metobs.smhi.se/", license: "CC BY 4.0" },
      evidence_id: `evr:smhi:metobs:${zone}:${createHash("sha256").update(JSON.stringify(monthly)).digest("hex").slice(0, 12)}`,
      ingested_at_utc: new Date().toISOString(),
    };

    writeFileSync(join(outDir, `weather_${zone}_monthly.json`), JSON.stringify(canonical, null, 2), "utf-8");
    writeFileSync(join(outDir, `weather_${zone}_daily.json`), JSON.stringify({ zone, stations: canonical.stations, daily, source: canonical.source }, null, 2), "utf-8");

    console.log(`  📊 ${daily.length} daily, ${monthly.length} monthly records`);
    await new Promise(r => setTimeout(r, 500));
  }

  console.log("\n[smhi-ingest] ✅ Done");
}

main().catch((err) => { console.error("[smhi-ingest] FATAL:", err); process.exit(1); });
