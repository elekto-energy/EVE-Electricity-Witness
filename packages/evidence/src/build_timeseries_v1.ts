/**
 * Build Timeseries V1 — Unified NDJSON
 *
 * Merges ENTSO-E spot prices (hourly) with ERA5 weather (hourly)
 * into canonical NDJSON files: data/canonical/timeseries_v1/{zone}/{YYYY-MM}.ndjson
 *
 * Row schema:
 *   {"ts":"2024-01-15T13:00:00Z","zone":"SE3","spot":115.82,"temp":7.8,"wind":5.1,"solar":120,"hdd":10.2}
 *
 * Data sources:
 *   - ENTSO-E: data/canonical/entsoe/entsoe_dayahead_SE_YYYYMM/day_ahead_prices.json  (SE zones)
 *              data/canonical/entsoe/entsoe_dayahead_EU_YYYYMM/day_ahead_prices.json  (EU zones)
 *   - Weather: data/canonical/weather_v1/{zone}/weather_{zone}_{YYYY}.json (hourly ERA5)
 *
 * For SE zones, also tries legacy dir naming: entsoe_dayahead_SE_YYYYMM
 * For EU zones, tries: entsoe_dayahead_EU_YYYYMM
 *
 * HDD: max(0, 18 - temp_c), calculated inline. No external source.
 *
 * Usage:
 *   npx tsx packages/evidence/src/build_timeseries_v1.ts [--zones SE3,FI] [--year 2024]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";
import {
  TIMESERIES_V1_ZONES,
  V1_ZONE_CODES,
  SE_ZONES,
  EU_ZONES,
  calcHDD,
} from "./timeseries_v1_config";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SpotRecord {
  zone_code: string;
  period_start: string;   // ISO 8601
  period_end: string;
  resolution: string;     // "PT60M"
  prices: Array<{ position: number; price_eur_mwh: number }>;
}

interface WeatherHourly {
  ts: string;   // "2024-01-01T00:00:00Z"
  temp: number | null;
  wind: number | null;
  solar: number | null;
}

interface TimeseriesRow {
  ts: string;
  zone: string;
  spot: number | null;
  temp: number | null;
  wind: number | null;
  solar: number | null;
  hdd: number | null;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(): { zones: string[]; years: number[] } {
  const args = process.argv.slice(2);
  let zones = V1_ZONE_CODES;
  let years = Array.from({ length: 10 }, (_, i) => 2016 + i);

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--zones" && args[i + 1]) {
      zones = args[++i].split(",").map(s => s.trim());
    }
    if (args[i] === "--year" && args[i + 1]) {
      years = [parseInt(args[++i])];
    }
    if (args[i] === "--from" && args[i + 1]) {
      const from = parseInt(args[++i]);
      years = years.filter(y => y >= from);
    }
    if (args[i] === "--to" && args[i + 1]) {
      const to = parseInt(args[++i]);
      years = years.filter(y => y <= to);
    }
  }

  return { zones, years };
}

// ─── Spot Price Loader ───────────────────────────────────────────────────────

/**
 * Load ENTSO-E spot prices for a zone+month into a Map<ts_utc, price>.
 * Returns null if no data found.
 *
 * ENTSO-E canonical structure:
 *   period_start = "2023-12-31T23:00Z" (UTC)
 *   position 1 = first hour starting at period_start
 *   Each record covers one day (24 positions for PT60M)
 */
function loadSpotMonth(
  dataDir: string,
  zone: string,
  year: number,
  month: number,
): Map<string, number> | null {
  const mm = month.toString().padStart(2, "0");

  // Try multiple directory naming patterns
  const prefixes = SE_ZONES.includes(zone)
    ? [`entsoe_dayahead_SE_${year}${mm}`]
    : [`entsoe_dayahead_EU_${year}${mm}`, `entsoe_dayahead_${zone}_${year}${mm}`];

  let records: SpotRecord[] | null = null;

  for (const prefix of prefixes) {
    const filePath = join(dataDir, "entsoe", prefix, "day_ahead_prices.json");
    if (existsSync(filePath)) {
      try {
        const all: SpotRecord[] = JSON.parse(readFileSync(filePath, "utf-8"));
        records = all.filter(r => r.zone_code === zone);
        if (records.length > 0) break;
      } catch {
        // Skip corrupt files
      }
    }
  }

  if (!records || records.length === 0) return null;

  const priceMap = new Map<string, number>();

  for (const rec of records) {
    const start = new Date(rec.period_start);

    if (rec.resolution === "PT60M") {
      // Hourly: position 1 = first hour from period_start
      for (const pt of rec.prices) {
        const hourMs = start.getTime() + (pt.position - 1) * 3600_000;
        const ts = new Date(hourMs).toISOString().replace(".000Z", "Z");
        const normalized = ts.slice(0, 13) + ":00:00Z";
        priceMap.set(normalized, pt.price_eur_mwh);
      }
    } else if (rec.resolution === "PT15M") {
      // Quarter-hourly: 96 positions per day, 4 per hour.
      // Aggregate to hourly by averaging each group of 4.
      // Position 1-4 = hour 0, 5-8 = hour 1, etc.
      const byHour = new Map<number, number[]>();
      for (const pt of rec.prices) {
        const hourIdx = Math.floor((pt.position - 1) / 4);
        const arr = byHour.get(hourIdx) ?? [];
        arr.push(pt.price_eur_mwh);
        byHour.set(hourIdx, arr);
      }

      for (const [hourIdx, prices] of byHour) {
        const hourMs = start.getTime() + hourIdx * 3600_000;
        const ts = new Date(hourMs).toISOString().replace(".000Z", "Z");
        const normalized = ts.slice(0, 13) + ":00:00Z";
        const avg = Math.round(prices.reduce((s, v) => s + v, 0) / prices.length * 100) / 100;
        priceMap.set(normalized, avg);
      }
    } else {
      console.warn(`  ⚠️ Unknown resolution ${rec.resolution} for ${zone} — skipping record`);
      continue;
    }
  }

  return priceMap.size > 0 ? priceMap : null;
}

// ─── Weather Loader ──────────────────────────────────────────────────────────

/**
 * Load ERA5 hourly weather for a zone+year into a Map<ts_utc, {temp, wind, solar}>.
 */
function loadWeatherYear(
  dataDir: string,
  zone: string,
  year: number,
): Map<string, { temp: number | null; wind: number | null; solar: number | null }> | null {
  const filePath = join(dataDir, "weather_v1", zone, `weather_${zone}_${year}.json`);
  if (!existsSync(filePath)) return null;

  try {
    const data = JSON.parse(readFileSync(filePath, "utf-8"));
    const rows: WeatherHourly[] = data.hourly;

    const map = new Map<string, { temp: number | null; wind: number | null; solar: number | null }>();

    for (const row of rows) {
      // Normalize timestamp: ensure "YYYY-MM-DDTHH:00:00Z"
      const ts = row.ts.slice(0, 13) + ":00:00Z";
      map.set(ts, { temp: row.temp, wind: row.wind, solar: row.solar });
    }

    return map.size > 0 ? map : null;
  } catch {
    return null;
  }
}

// ─── Main Builder ────────────────────────────────────────────────────────────

async function main() {
  const { zones, years } = parseArgs();
  const projectRoot = resolve(__dirname, "../../..");
  const dataDir = join(projectRoot, "data", "canonical");
  const outBase = join(dataDir, "timeseries_v1");

  console.log("[build-v1] Timeseries V1 Builder");
  console.log(`[build-v1] Zones: ${zones.join(", ")}`);
  console.log(`[build-v1] Years: ${years[0]}–${years[years.length - 1]}`);
  console.log();

  let totalRows = 0;
  let totalFiles = 0;
  const missingSpot: string[] = [];
  const missingWeather: string[] = [];

  for (const zone of zones) {
    const zoneOutDir = join(outBase, zone);
    mkdirSync(zoneOutDir, { recursive: true });

    console.log(`[build-v1] === ${zone} ===`);

    for (const year of years) {
      // Load weather for full year (one file)
      const weatherMap = loadWeatherYear(dataDir, zone, year);
      if (!weatherMap) {
        missingWeather.push(`${zone}/${year}`);
        console.log(`  ⚠️ No weather data for ${zone}/${year}`);
      }

      // Process each month
      for (let month = 1; month <= 12; month++) {
        const mm = month.toString().padStart(2, "0");
        const monthKey = `${year}-${mm}`;

        const spotMap = loadSpotMonth(dataDir, zone, year, month);
        if (!spotMap) {
          missingSpot.push(`${zone}/${monthKey}`);
        }

        // Generate all hours for this month
        const firstDay = new Date(Date.UTC(year, month - 1, 1));
        const lastDay = new Date(Date.UTC(year, month, 1)); // First day of next month

        const rows: string[] = [];
        let dt = firstDay;

        while (dt < lastDay) {
          const ts = dt.toISOString().replace(".000Z", "Z").replace(/\.(\d{3})Z/, "Z");
          const normalized = ts.slice(0, 13) + ":00:00Z";

          const spot = spotMap?.get(normalized) ?? null;
          const weather = weatherMap?.get(normalized) ?? null;

          const temp = weather?.temp ?? null;
          const wind = weather?.wind ?? null;
          const solar = weather?.solar ?? null;
          const hdd = calcHDD(temp);

          const row: TimeseriesRow = {
            ts: normalized,
            zone,
            spot,
            temp,
            wind,
            solar,
            hdd,
          };

          rows.push(JSON.stringify(row));
          dt = new Date(dt.getTime() + 3600_000);
        }

        // Write NDJSON
        const outPath = join(zoneOutDir, `${monthKey}.ndjson`);
        writeFileSync(outPath, rows.join("\n") + "\n", "utf-8");
        totalRows += rows.length;
        totalFiles++;
      }

      console.log(`  ${year}: 12 months written`);
    }
  }

  // ─── Manifest ────────────────────────────────────────────────────────────

  const manifest = {
    version: "1.0.0",
    schema: {
      ts: "ISO 8601 UTC",
      zone: "Bidding zone code",
      spot: "EUR/MWh (ENTSO-E day-ahead A44)",
      temp: "°C (ERA5 temperature_2m)",
      wind: "m/s (ERA5 wind_speed_10m, converted from km/h)",
      solar: "W/m² (ERA5 shortwave_radiation)",
      hdd: "Heating Degree Day = max(0, 18 - temp)",
    },
    zones: zones.map(z => ({
      code: z,
      city: TIMESERIES_V1_ZONES[z].city,
      lat: TIMESERIES_V1_ZONES[z].lat,
      lon: TIMESERIES_V1_ZONES[z].lon,
    })),
    period: {
      from: `${years[0]}-01`,
      to: `${years[years.length - 1]}-12`,
    },
    sources: {
      spot: {
        name: "ENTSO-E Transparency Platform",
        dataset: "Day-ahead Prices (A44)",
        resolution: "PT60M (PT15M averaged to hourly where applicable)",
        url: "https://transparency.entsoe.eu/",
      },
      weather: {
        name: "Open-Meteo Historical Weather API",
        model: "ERA5 (Copernicus/ECMWF)",
        resolution: "hourly, 0.25° grid",
        url: "https://open-meteo.com/en/docs/historical-weather-api",
        license: "CC BY 4.0",
        methodology: "Representative capital city point per zone. v1 approximation.",
      },
    },
    format: "NDJSON, one file per zone per month",
    total_files: totalFiles,
    total_rows: totalRows,
    built_at_utc: new Date().toISOString(),
  };

  // Root hash: hash of all zone+month file hashes
  const fileHashes: string[] = [];
  for (const zone of zones) {
    const zoneDir = join(outBase, zone);
    const files = readdirSync(zoneDir).filter(f => f.endsWith(".ndjson")).sort();
    for (const f of files) {
      const content = readFileSync(join(zoneDir, f), "utf-8");
      const hash = createHash("sha256").update(content).digest("hex");
      fileHashes.push(`${zone}/${f}:${hash}`);
    }
  }

  const rootHash = createHash("sha256")
    .update(fileHashes.join("\n"))
    .digest("hex");

  const manifestWithHash = {
    ...manifest,
    root_hash: rootHash,
    file_count_in_hash: fileHashes.length,
  };

  writeFileSync(join(outBase, "manifest.json"), JSON.stringify(manifestWithHash, null, 2), "utf-8");

  // ─── Summary ─────────────────────────────────────────────────────────────

  console.log();
  console.log("[build-v1] === DONE ===");
  console.log(`[build-v1] Files: ${totalFiles}`);
  console.log(`[build-v1] Total rows: ${totalRows.toLocaleString()}`);
  console.log(`[build-v1] Root hash: ${rootHash.slice(0, 16)}...`);
  console.log(`[build-v1] Output: data/canonical/timeseries_v1/`);

  if (missingSpot.length > 0) {
    console.log(`\n[build-v1] ⚠️ Missing spot data (${missingSpot.length} zone-months):`);
    // Show first 10
    for (const m of missingSpot.slice(0, 10)) console.log(`  - ${m}`);
    if (missingSpot.length > 10) console.log(`  ... and ${missingSpot.length - 10} more`);
  }
  if (missingWeather.length > 0) {
    console.log(`\n[build-v1] ⚠️ Missing weather data (${missingWeather.length} zone-years):`);
    for (const m of missingWeather) console.log(`  - ${m}`);
  }
}

main().catch((err) => {
  console.error("[build-v1] FATAL:", err);
  process.exit(1);
});
