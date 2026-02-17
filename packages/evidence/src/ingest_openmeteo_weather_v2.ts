/**
 * Open-Meteo ERA5 Weather Ingest — Timeseries V2 Zones
 *
 * Fetches HOURLY weather data for V2 Golden Scope zones.
 * Reads zone definitions from TIMESERIES_V2_ZONES (not V1).
 *
 * This script exists separately from ingest_openmeteo_weather_v1.ts
 * to maintain architectural isolation: V1 is frozen, V2 is its own scope.
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
 *         Same structure as V1 output — weather_v1 is the canonical weather store.
 *         V2 adds zones, not a new format.
 *
 * Usage:
 *   npx tsx packages/evidence/src/ingest_openmeteo_weather_v2.ts \
 *     --zones NO1,NO2,EE,LV,LT \
 *     --from 2020 \
 *     --to 2026
 *
 * Without --zones: fetches ALL V2 zones (skips existing files).
 * Without --from/--to: defaults to V2_PERIOD_START year through current year.
 *
 * TR1: No source, no number.
 * TR6: Code fetches — never invents.
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";
import { TIMESERIES_V2_ZONES, V2_ZONE_CODES, V2_PERIOD_START, type TimeseriesZone } from "./timeseries_v2_config";

const API = "https://archive-api.open-meteo.com/v1/archive";

// V2 period: 2020-01-01 per Golden Scope decision
const DEFAULT_START_YEAR = 2020;

interface HourlyRow {
  ts: string;    // ISO 8601 UTC
  temp: number | null;   // °C
  wind: number | null;   // m/s
  solar: number | null;  // W/m²
}

function parseArgs(): { zones: string[]; years: number[] } {
  const args = process.argv.slice(2);
  let zones = V2_ZONE_CODES;
  const currentYear = new Date().getUTCFullYear();
  let fromYear = DEFAULT_START_YEAR;
  let toYear = currentYear;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--zones" && args[i + 1]) {
      zones = args[++i].split(",").map(s => s.trim());
      for (const z of zones) {
        if (!TIMESERIES_V2_ZONES[z]) throw new Error(`Unknown V2 zone: ${z}. Valid: ${V2_ZONE_CODES.join(", ")}`);
      }
    }
    if (args[i] === "--from" && args[i + 1]) {
      fromYear = parseInt(args[++i]);
      if (isNaN(fromYear) || fromYear < 1950 || fromYear > currentYear) {
        throw new Error(`--from must be a valid year (got ${fromYear})`);
      }
    }
    if (args[i] === "--to" && args[i + 1]) {
      toYear = parseInt(args[++i]);
      if (isNaN(toYear) || toYear < fromYear || toYear > currentYear) {
        throw new Error(`--to must be >= --from and <= ${currentYear} (got ${toYear})`);
      }
    }
  }

  const years = Array.from({ length: toYear - fromYear + 1 }, (_, i) => fromYear + i);
  return { zones, years };
}

async function fetchHourly(
  zone: string,
  coords: TimeseriesZone,
  year: number,
): Promise<HourlyRow[]> {
  const startDate = `${year}-01-01`;
  // For current year, use yesterday to avoid incomplete data
  const now = new Date();
  const isCurrentYear = year === now.getUTCFullYear();
  let endDate: string;
  if (isCurrentYear) {
    const yesterday = new Date(now.getTime() - 86400_000);
    endDate = yesterday.toISOString().slice(0, 10);
  } else {
    endDate = `${year}-12-31`;
  }

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
    throw new Error(`HTTP ${resp.status} for ${zone}/${year}: ${body.slice(0, 300)}`);
  }

  const json = await resp.json() as any;

  if (!json.hourly?.time) {
    throw new Error(`No hourly data returned for ${zone}/${year}`);
  }

  const times: string[] = json.hourly.time;
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

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  WEATHER INGEST V2 — Open-Meteo ERA5 Hourly                ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Zones: ${zones.join(", ").padEnd(52)}║`);
  console.log(`║  Years: ${years[0]}–${years[years.length - 1]}`.padEnd(63) + "║");
  console.log(`║  Source: ERA5 (Copernicus/ECMWF) via Open-Meteo`.padEnd(63) + "║");
  console.log(`║  Output: data/canonical/weather_v1/{zone}/`.padEnd(63) + "║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log();

  let totalRows = 0;
  let totalFiles = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const zoneCode of zones) {
    const coords = TIMESERIES_V2_ZONES[zoneCode];
    if (!coords) {
      console.error(`  ❌ ${zoneCode}: not in TIMESERIES_V2_ZONES — skipping`);
      failed++;
      errors.push(`${zoneCode}: not in V2 zone config`);
      continue;
    }

    const zoneDir = join(baseDir, zoneCode);
    mkdirSync(zoneDir, { recursive: true });

    console.log(`[weather-v2] === ${zoneCode}: ${coords.city} (${coords.lat}, ${coords.lon}) ===`);

    for (const year of years) {
      const outPath = join(zoneDir, `weather_${zoneCode}_${year}.json`);

      // Skip if already fetched
      if (existsSync(outPath)) {
        console.log(`  ${year} SKIP (exists)`);
        skipped++;
        continue;
      }

      try {
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
        console.log(`  ${year}: ${rows.length} hourly rows ✅`);
        totalFiles++;

        // Rate limit: 500ms between requests (Open-Meteo fair use)
        await new Promise(r => setTimeout(r, 500));
      } catch (err: any) {
        console.error(`  ${year}: ❌ ${err.message}`);
        failed++;
        errors.push(`${zoneCode}/${year}: ${err.message}`);
        // Continue with next year — don't abort
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  console.log();
  console.log("════════════════════════════════════════════════════════════════");
  console.log(`  DONE: ${totalFiles} files, ${totalRows.toLocaleString()} hourly rows`);
  console.log(`  Skipped (existing): ${skipped}`);
  if (failed > 0) {
    console.log(`  FAILED: ${failed}`);
    for (const e of errors) console.log(`    ⚠️ ${e}`);
  }
  console.log(`  Output: data/canonical/weather_v1/{zone}/weather_{zone}_{year}.json`);
  console.log("════════════════════════════════════════════════════════════════");

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[weather-v2] FATAL:", err);
  process.exit(1);
});
