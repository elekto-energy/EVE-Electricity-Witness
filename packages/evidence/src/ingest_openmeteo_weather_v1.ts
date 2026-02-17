/**
 * Open-Meteo ERA5 Weather Ingest — Timeseries V1 (All 10 Zones)
 *
 * Fetches HOURLY weather data for all V1 zones.
 * Unlike the original ingest (daily, SE-only), this produces hourly data
 * needed for the unified timeseries join with ENTSO-E hourly spot prices.
 *
 * API: https://archive-api.open-meteo.com/v1/archive
 * No API key required. CC BY 4.0.
 * Source: ERA5 (Copernicus/ECMWF) via Open-Meteo.
 *
 * Variables (hourly):
 *   temperature_2m       — Hourly temperature (°C)
 *   wind_speed_10m       — Wind speed at 10m (km/h → m/s)
 *   shortwave_radiation  — Solar radiation (W/m²)
 *
 * Output: data/canonical/weather_v1/{zone}/weather_{zone}_{YYYY}.json
 *         Each file contains 8760 (or 8784) hourly rows per year.
 *
 * Usage:
 *   npx tsx packages/evidence/src/ingest_openmeteo_weather_v1.ts [--zones SE3,FI] [--year 2024]
 *
 * Without args: fetches all 10 zones, 2016-2025.
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";
import { TIMESERIES_V1_ZONES, V1_ZONE_CODES, type TimeseriesZone } from "./timeseries_v1_config";

const API = "https://archive-api.open-meteo.com/v1/archive";
const YEARS = Array.from({ length: 10 }, (_, i) => 2016 + i); // 2016-2025

interface HourlyRow {
  ts: string;    // ISO 8601 UTC
  temp: number | null;   // °C
  wind: number | null;   // m/s
  solar: number | null;  // W/m²
}

function parseArgs(): { zones: string[]; years: number[] } {
  const args = process.argv.slice(2);
  let zones = V1_ZONE_CODES;
  let years = YEARS;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--zones" && args[i + 1]) {
      zones = args[++i].split(",").map(s => s.trim());
      for (const z of zones) {
        if (!TIMESERIES_V1_ZONES[z]) throw new Error(`Unknown zone: ${z}`);
      }
    }
    if (args[i] === "--year" && args[i + 1]) {
      years = [parseInt(args[++i])];
      if (isNaN(years[0]) || years[0] < 2016 || years[0] > 2025) {
        throw new Error("--year must be 2016-2025");
      }
    }
    if (args[i] === "--from" && args[i + 1]) {
      const from = parseInt(args[++i]);
      years = YEARS.filter(y => y >= from);
    }
    if (args[i] === "--to" && args[i + 1]) {
      const to = parseInt(args[++i]);
      years = years.filter(y => y <= to);
    }
  }

  return { zones, years };
}

async function fetchHourly(
  zone: string,
  coords: TimeseriesZone,
  year: number,
): Promise<HourlyRow[]> {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const params = new URLSearchParams({
    latitude: coords.lat.toString(),
    longitude: coords.lon.toString(),
    start_date: startDate,
    end_date: endDate,
    hourly: "temperature_2m,wind_speed_10m,shortwave_radiation",
    timezone: "UTC",
    models: "era5",
  });

  const url = `${API}?${params}`;
  console.log(`  GET ${url.slice(0, 120)}...`);

  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`HTTP ${resp.status} for ${zone}/${year}: ${body.slice(0, 200)}`);
  }

  const json = await resp.json() as any;

  const times: string[] = json.hourly.time;           // "2024-01-01T00:00" (local = UTC since tz=UTC)
  const temps: (number | null)[] = json.hourly.temperature_2m;
  const winds: (number | null)[] = json.hourly.wind_speed_10m;      // km/h
  const solars: (number | null)[] = json.hourly.shortwave_radiation; // W/m²

  return times.map((t, i) => ({
    ts: t.length === 16 ? t + ":00Z" : t + "Z",  // Ensure ISO 8601 with seconds and Z
    temp: temps[i] !== null ? Math.round(temps[i]! * 10) / 10 : null,
    wind: winds[i] !== null ? Math.round(winds[i]! / 3.6 * 10) / 10 : null,  // km/h → m/s
    solar: solars[i] !== null ? Math.round(solars[i]!) : null,                 // W/m² integer
  }));
}

async function main() {
  const { zones, years } = parseArgs();
  const projectRoot = resolve(__dirname, "../../..");
  const baseDir = join(projectRoot, "data", "canonical", "weather_v1");

  console.log("[weather-v1] Open-Meteo ERA5 Hourly Weather Ingest");
  console.log(`[weather-v1] Zones: ${zones.join(", ")}`);
  console.log(`[weather-v1] Years: ${years[0]}–${years[years.length - 1]}`);
  console.log(`[weather-v1] Total requests: ${zones.length * years.length}`);
  console.log();

  let totalRows = 0;
  let skipped = 0;

  for (const zoneCode of zones) {
    const coords = TIMESERIES_V1_ZONES[zoneCode];
    const zoneDir = join(baseDir, zoneCode);
    mkdirSync(zoneDir, { recursive: true });

    console.log(`[weather-v1] === ${zoneCode}: ${coords.city} (${coords.lat}, ${coords.lon}) ===`);

    for (const year of years) {
      const outPath = join(zoneDir, `weather_${zoneCode}_${year}.json`);

      // Skip if already fetched
      if (existsSync(outPath)) {
        console.log(`  ${year} SKIP (exists)`);
        skipped++;
        continue;
      }

      const rows = await fetchHourly(zoneCode, coords, year);
      totalRows += rows.length;

      const content = {
        zone: zoneCode,
        location: { lat: coords.lat, lon: coords.lon, city: coords.city },
        year,
        model: "ERA5",
        resolution: "hourly",
        variables: { temp: "°C", wind: "m/s", solar: "W/m²" },
        rows_count: rows.length,
        hourly: rows,
        source: {
          name: "Open-Meteo Historical Weather API",
          model: "ERA5 (Copernicus/ECMWF)",
          url: "https://open-meteo.com/en/docs/historical-weather-api",
          license: "CC BY 4.0",
        },
        evidence_id: `evr:openmeteo:era5_hourly:${zoneCode}:${year}:${createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 12)}`,
        ingested_at_utc: new Date().toISOString(),
      };

      writeFileSync(outPath, JSON.stringify(content), "utf-8");
      console.log(`  ${year}: ${rows.length} hourly rows`);

      // Rate limit: 500ms between requests
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n[weather-v1] === DONE ===`);
  console.log(`[weather-v1] Total hourly rows: ${totalRows.toLocaleString()}`);
  console.log(`[weather-v1] Skipped (existing): ${skipped}`);
  console.log(`[weather-v1] Output: data/canonical/weather_v1/{zone}/weather_{zone}_{year}.json`);
}

main().catch((err) => {
  console.error("[weather-v1] FATAL:", err);
  process.exit(1);
});
