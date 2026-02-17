/**
 * Open-Meteo Historical Weather Ingest
 *
 * Fetches daily weather data (ERA5 reanalysis) for representative
 * coordinates per Swedish bidding zone, 2016-2025.
 *
 * API: https://archive-api.open-meteo.com/v1/archive
 * No API key required. Non-commercial use. CC BY 4.0.
 * Source: ERA5 (Copernicus/ECMWF) via Open-Meteo.
 *
 * Variables:
 *   temperature_2m_mean  — Daily mean temperature (°C)
 *   shortwave_radiation_sum — Daily total solar radiation (MJ/m²)
 *   wind_speed_10m_max   — Daily max wind speed (km/h)
 *   sunshine_duration    — Sunshine hours (seconds → hours)
 *
 * Usage:
 *   npx tsx packages/evidence/src/ingest_openmeteo_weather.ts
 */

import { mkdirSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";

const API = "https://archive-api.open-meteo.com/v1/archive";

/** Representative coordinates per bidding zone */
const ZONES: Record<string, { lat: number; lon: number; city: string }> = {
  SE1: { lat: 65.58, lon: 22.15, city: "Luleå" },
  SE2: { lat: 62.39, lon: 17.31, city: "Sundsvall" },
  SE3: { lat: 59.33, lon: 18.07, city: "Stockholm" },
  SE4: { lat: 55.60, lon: 13.00, city: "Malmö" },
};

const START = "2016-01-01";
const END   = "2025-12-31";

interface DailyRow {
  date: string;
  temp_avg_c: number | null;
  solar_mj_m2: number | null;
  solar_kwh_m2: number | null;   // MJ → kWh (÷3.6)
  sunshine_hours: number | null;
  wind_max_kmh: number | null;
  wind_max_ms: number | null;     // km/h → m/s (÷3.6)
}

interface MonthlyRow {
  month: string;
  temp_avg_c: number | null;
  solar_kwh_m2: number | null;
  sunshine_hours: number | null;
  wind_avg_max_ms: number | null;
  days: number;
}

interface AnnualRow {
  year: number;
  temp_avg_c: number | null;
  solar_kwh_m2: number | null;
  sunshine_hours: number | null;
  wind_avg_max_ms: number | null;
  days: number;
}

function aggregateMonthly(daily: DailyRow[]): MonthlyRow[] {
  const byM: Record<string, DailyRow[]> = {};
  for (const d of daily) {
    const m = d.date.slice(0, 7);
    (byM[m] ??= []).push(d);
  }
  return Object.entries(byM).sort(([a],[b]) => a.localeCompare(b)).map(([month, rows]) => {
    const temps = rows.map(r => r.temp_avg_c).filter((v): v is number => v !== null);
    const sols  = rows.map(r => r.solar_kwh_m2).filter((v): v is number => v !== null);
    const suns  = rows.map(r => r.sunshine_hours).filter((v): v is number => v !== null);
    const winds = rows.map(r => r.wind_max_ms).filter((v): v is number => v !== null);
    return {
      month,
      temp_avg_c: temps.length ? Math.round(temps.reduce((s,v) => s+v, 0) / temps.length * 10) / 10 : null,
      solar_kwh_m2: sols.length ? Math.round(sols.reduce((s,v) => s+v, 0) * 10) / 10 : null,
      sunshine_hours: suns.length ? Math.round(suns.reduce((s,v) => s+v, 0)) : null,
      wind_avg_max_ms: winds.length ? Math.round(winds.reduce((s,v) => s+v, 0) / winds.length * 10) / 10 : null,
      days: rows.length,
    };
  });
}

function aggregateAnnual(monthly: MonthlyRow[]): AnnualRow[] {
  const byY: Record<number, MonthlyRow[]> = {};
  for (const m of monthly) {
    const y = parseInt(m.month.slice(0, 4));
    (byY[y] ??= []).push(m);
  }
  return Object.entries(byY).sort(([a],[b]) => +a - +b).map(([yr, months]) => {
    const temps = months.map(m => m.temp_avg_c).filter((v): v is number => v !== null);
    return {
      year: parseInt(yr),
      temp_avg_c: temps.length ? Math.round(temps.reduce((s,v) => s+v, 0) / temps.length * 10) / 10 : null,
      solar_kwh_m2: months.reduce((s, m) => s + (m.solar_kwh_m2 ?? 0), 0),
      sunshine_hours: months.reduce((s, m) => s + (m.sunshine_hours ?? 0), 0),
      wind_avg_max_ms: (() => {
        const w = months.map(m => m.wind_avg_max_ms).filter((v): v is number => v !== null);
        return w.length ? Math.round(w.reduce((s,v) => s+v, 0) / w.length * 10) / 10 : null;
      })(),
      days: months.reduce((s, m) => s + m.days, 0),
    };
  });
}

async function fetchZone(zone: string, coords: { lat: number; lon: number; city: string }): Promise<{
  daily: DailyRow[];
  monthly: MonthlyRow[];
  annual: AnnualRow[];
}> {
  const params = new URLSearchParams({
    latitude: coords.lat.toString(),
    longitude: coords.lon.toString(),
    start_date: START,
    end_date: END,
    daily: "temperature_2m_mean,shortwave_radiation_sum,sunshine_duration,wind_speed_10m_max",
    timezone: "UTC",
    models: "era5",
  });

  const url = `${API}?${params}`;
  console.log(`  GET ${url.slice(0, 100)}...`);

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${zone}`);
  const json = await resp.json() as any;

  const dates: string[] = json.daily.time;
  const temps: (number | null)[] = json.daily.temperature_2m_mean;
  const solars: (number | null)[] = json.daily.shortwave_radiation_sum;
  const suns: (number | null)[] = json.daily.sunshine_duration;
  const winds: (number | null)[] = json.daily.wind_speed_10m_max;

  const daily: DailyRow[] = dates.map((date, i) => ({
    date,
    temp_avg_c: temps[i] !== null ? Math.round(temps[i]! * 10) / 10 : null,
    solar_mj_m2: solars[i] !== null ? Math.round(solars[i]! * 100) / 100 : null,
    solar_kwh_m2: solars[i] !== null ? Math.round(solars[i]! / 3.6 * 100) / 100 : null,
    sunshine_hours: suns[i] !== null ? Math.round(suns[i]! / 3600 * 10) / 10 : null,
    wind_max_kmh: winds[i] !== null ? Math.round(winds[i]! * 10) / 10 : null,
    wind_max_ms: winds[i] !== null ? Math.round(winds[i]! / 3.6 * 10) / 10 : null,
  }));

  const monthly = aggregateMonthly(daily);
  const annual = aggregateAnnual(monthly);

  return { daily, monthly, annual };
}

async function main() {
  const projectRoot = resolve(__dirname, "../../..");
  const outDir = join(projectRoot, "data", "canonical", "weather");
  mkdirSync(outDir, { recursive: true });

  console.log("[weather-ingest] Open-Meteo ERA5 Historical Weather");
  console.log(`[weather-ingest] Period: ${START} → ${END}`);
  console.log();

  const allAnnual: Record<string, AnnualRow[]> = {};

  for (const [zone, coords] of Object.entries(ZONES)) {
    console.log(`[weather-ingest] === ${zone}: ${coords.city} (${coords.lat}, ${coords.lon}) ===`);

    const { daily, monthly, annual } = await fetchZone(zone, coords);
    allAnnual[zone] = annual;

    // Write monthly canonical
    const canonical = {
      zone,
      location: coords,
      period: { from: START, to: END },
      model: "ERA5 (Copernicus/ECMWF via Open-Meteo)",
      resolution: "0.25° (~25 km)",
      monthly,
      annual,
      source: {
        name: "Open-Meteo Historical Weather API",
        model: "ERA5",
        publisher: "Open-Meteo (data: Copernicus Climate Change Service / ECMWF)",
        url: "https://open-meteo.com/en/docs/historical-weather-api",
        license: "CC BY 4.0",
      },
      evidence_id: `evr:openmeteo:era5:${zone}:${createHash("sha256").update(JSON.stringify(annual)).digest("hex").slice(0, 12)}`,
      ingested_at_utc: new Date().toISOString(),
    };

    writeFileSync(join(outDir, `weather_${zone}_monthly.json`), JSON.stringify(canonical, null, 2), "utf-8");

    // Write daily (compact: no solar_mj_m2, no wind_max_kmh — save space)
    const dailyCompact = daily.map(d => ({
      d: d.date,
      t: d.temp_avg_c,
      s: d.solar_kwh_m2,
      sh: d.sunshine_hours,
      w: d.wind_max_ms,
    }));
    writeFileSync(join(outDir, `weather_${zone}_daily.json`), JSON.stringify({
      zone,
      location: coords,
      period: { from: START, to: END },
      model: "ERA5",
      keys: { d: "date", t: "temp_avg_c", s: "solar_kwh_m2", sh: "sunshine_hours", w: "wind_max_ms" },
      daily: dailyCompact,
      source: canonical.source,
    }), "utf-8");

    console.log(`  📊 ${daily.length} daily → ${monthly.length} monthly → ${annual.length} annual`);

    // Rate limit
    await new Promise(r => setTimeout(r, 1000));
  }

  // Write combined annual summary (all zones in one file — for the panel)
  const combined = {
    zones: Object.entries(allAnnual).map(([zone, annual]) => ({
      zone,
      location: ZONES[zone],
      annual,
    })),
    period: { from: START, to: END },
    source: {
      name: "Open-Meteo Historical Weather API (ERA5)",
      publisher: "Copernicus Climate Change Service / ECMWF",
      url: "https://open-meteo.com/en/docs/historical-weather-api",
      license: "CC BY 4.0",
    },
    evidence_id: `evr:openmeteo:era5:annual_combined:${createHash("sha256").update(JSON.stringify(allAnnual)).digest("hex").slice(0, 12)}`,
    ingested_at_utc: new Date().toISOString(),
  };

  writeFileSync(join(outDir, "weather_annual_combined.json"), JSON.stringify(combined, null, 2), "utf-8");
  console.log(`\n[weather-ingest] 💾 Combined: data/canonical/weather/weather_annual_combined.json`);
  console.log("[weather-ingest] ✅ Done");
}

main().catch((err) => { console.error("[weather-ingest] FATAL:", err); process.exit(1); });
