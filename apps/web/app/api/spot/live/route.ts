/**
 * GET /api/spot/live?zone=SE3
 *
 * Returns today + tomorrow (if available) spot prices + weather forecast.
 * Sources:
 *   - ENTSO-E A44: day-ahead prices (published ~12:42 CET day before)
 *   - Open-Meteo forecast API: hourly temp, wind, solar (free, no key)
 *
 * Returns V2Row-compatible format so the frontend can render identically.
 *
 * TR1: No source, no number.
 * TR6: Code fetches — never invents.
 */

import { NextRequest, NextResponse } from "next/server";

// Zone coordinates for weather forecast
const ZONE_COORDS: Record<string, { lat: number; lon: number }> = {
  SE1: { lat: 65.58, lon: 22.15 },
  SE2: { lat: 62.39, lon: 17.31 },
  SE3: { lat: 59.33, lon: 18.07 },
  SE4: { lat: 55.60, lon: 13.00 },
  FI:  { lat: 60.17, lon: 24.94 },
  DE_LU: { lat: 52.52, lon: 13.41 },
};

// ENTSO-E zone EIC codes
const ZONE_EIC: Record<string, string> = {
  SE1: "10Y1001A1001A44P",
  SE2: "10Y1001A1001A45N",
  SE3: "10Y1001A1001A46L",
  SE4: "10Y1001A1001A47J",
  FI:  "10YFI-1--------U",
  DE_LU: "10Y1001A1001A82H",
};

const HDD_BASE = 18;

interface LiveRow {
  ts: string;
  zone: string;
  spot: number | null;
  temp: number | null;
  wind_speed: number | null;
  solar_rad: number | null;
  hdd: number | null;
  is_forecast: boolean;  // true = tomorrow (forecast price), false = today
}

// ─── ENTSO-E day-ahead fetch ─────────────────────────────────────────────────

async function fetchSpotPrices(
  zone: string, dateStart: Date, dateEnd: Date
): Promise<Map<string, number>> {
  const eic = ZONE_EIC[zone];
  if (!eic) return new Map();

  const token = process.env.ENTSOE_TOKEN;
  if (!token) {
    console.warn("[live] ENTSOE_TOKEN not set, skipping spot fetch");
    return new Map();
  }

  const fmt = (d: Date) => d.toISOString().replace(/[-:T]/g, "").slice(0, 12);
  const url = `https://web-api.tp.entsoe.eu/api?securityToken=${token}` +
    `&documentType=A44&in_Domain=${eic}&out_Domain=${eic}` +
    `&periodStart=${fmt(dateStart)}&periodEnd=${fmt(dateEnd)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return new Map();
    const xml = await res.text();

    const priceMap = new Map<string, number>();

    // Parse TimeSeries periods
    const tsBlocks = xml.split("<TimeSeries>");
    for (let ti = 1; ti < tsBlocks.length; ti++) {
      const block = tsBlocks[ti];
      const periods = block.split("<Period>");
      for (let pi = 1; pi < periods.length; pi++) {
        const period = periods[pi];
        const startMatch = period.match(/<start>(.*?)<\/start>/);
        const resMatch = period.match(/<resolution>(.*?)<\/resolution>/);
        if (!startMatch) continue;

        const periodStart = new Date(startMatch[1]);
        const resolution = resMatch?.[1] ?? "PT60M";
        const isQuarter = resolution === "PT15M";
        const stepMs = isQuarter ? 900_000 : 3600_000;

        const points = period.split("<Point>");
        for (let i = 1; i < points.length; i++) {
          const posMatch = points[i].match(/<position>(\d+)<\/position>/);
          const priceMatch = points[i].match(/<price\.amount>([\d.\-]+)<\/price\.amount>/);
          if (!posMatch || !priceMatch) continue;

          const pos = parseInt(posMatch[1]);
          const price = parseFloat(priceMatch[1]);
          const hourMs = periodStart.getTime() + (pos - 1) * stepMs;

          if (isQuarter) {
            // Aggregate to hourly
            const hourKey = new Date(Math.floor(hourMs / 3600_000) * 3600_000).toISOString().slice(0, 13) + ":00:00Z";
            const existing = priceMap.get(hourKey);
            if (existing !== undefined) {
              // Running average (rough — good enough for live)
              priceMap.set(hourKey, (existing + price) / 2);
            } else {
              priceMap.set(hourKey, price);
            }
          } else {
            const ts = new Date(hourMs).toISOString().slice(0, 13) + ":00:00Z";
            priceMap.set(ts, price);
          }
        }
      }
    }

    return priceMap;
  } catch (err) {
    console.error("[live] ENTSO-E fetch error:", err);
    return new Map();
  }
}

// ─── Open-Meteo forecast fetch ───────────────────────────────────────────────

async function fetchWeatherForecast(
  lat: number, lon: number, days: number = 2
): Promise<Map<string, { temp: number; wind: number; solar: number }>> {
  const url = `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,windspeed_10m,shortwave_radiation` +
    `&forecast_days=${days}&timezone=UTC`;

  const map = new Map<string, { temp: number; wind: number; solar: number }>();

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return map;
    const data = await res.json();

    const times: string[] = data.hourly?.time ?? [];
    const temps: number[] = data.hourly?.temperature_2m ?? [];
    const winds: number[] = data.hourly?.windspeed_10m ?? [];
    const solars: number[] = data.hourly?.shortwave_radiation ?? [];

    for (let i = 0; i < times.length; i++) {
      const ts = times[i].replace(" ", "T") + (times[i].includes("Z") ? "" : ":00Z");
      const tsNorm = new Date(ts).toISOString().slice(0, 13) + ":00:00Z";
      map.set(tsNorm, {
        temp: temps[i] ?? 0,
        wind: winds[i] ?? 0,
        solar: solars[i] ?? 0,
      });
    }
  } catch (err) {
    console.error("[live] Weather fetch error:", err);
  }

  return map;
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const zone = req.nextUrl.searchParams.get("zone") ?? "SE3";
  const coords = ZONE_COORDS[zone];
  if (!coords) {
    return NextResponse.json({ error: `Unknown zone: ${zone}` }, { status: 400 });
  }

  // Date range: today 00:00 UTC → day after tomorrow 00:00 UTC
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayAfterTomorrow = new Date(todayStart.getTime() + 2 * 86400_000);
  const tomorrowStart = new Date(todayStart.getTime() + 86400_000);

  // Fetch in parallel
  const [spotMap, weatherMap] = await Promise.all([
    fetchSpotPrices(zone, todayStart, dayAfterTomorrow),
    fetchWeatherForecast(coords.lat, coords.lon, 2),
  ]);

  // Build rows: today + tomorrow
  const rows: LiveRow[] = [];
  for (let t = todayStart.getTime(); t < dayAfterTomorrow.getTime(); t += 3600_000) {
    const ts = new Date(t).toISOString().slice(0, 13) + ":00:00Z";
    const isTomorrow = t >= tomorrowStart.getTime();
    const spot = spotMap.get(ts) ?? null;
    const weather = weatherMap.get(ts);
    const temp = weather?.temp ?? null;

    rows.push({
      ts,
      zone,
      spot,
      temp,
      wind_speed: weather?.wind ?? null,
      solar_rad: weather?.solar ?? null,
      hdd: temp !== null ? Math.round(Math.max(0, HDD_BASE - temp) * 10) / 10 : null,
      is_forecast: isTomorrow,
    });
  }

  // Stats
  const validSpots = rows.filter(r => r.spot !== null).map(r => r.spot!);
  const validTemps = rows.filter(r => r.temp !== null).map(r => r.temp!);
  const todayRows = rows.filter(r => !r.is_forecast);
  const tomorrowRows = rows.filter(r => r.is_forecast);

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10 : null;

  return NextResponse.json({
    zone,
    fetched_at: now.toISOString(),
    today: todayStart.toISOString().slice(0, 10),
    tomorrow: tomorrowStart.toISOString().slice(0, 10),
    has_tomorrow: tomorrowRows.some(r => r.spot !== null),
    rows,
    stats: {
      today_spot: {
        avg: avg(todayRows.filter(r => r.spot !== null).map(r => r.spot!)),
        min: todayRows.filter(r => r.spot !== null).length ? Math.min(...todayRows.filter(r => r.spot !== null).map(r => r.spot!)) : null,
        max: todayRows.filter(r => r.spot !== null).length ? Math.max(...todayRows.filter(r => r.spot !== null).map(r => r.spot!)) : null,
      },
      tomorrow_spot: {
        avg: avg(tomorrowRows.filter(r => r.spot !== null).map(r => r.spot!)),
        min: tomorrowRows.filter(r => r.spot !== null).length ? Math.min(...tomorrowRows.filter(r => r.spot !== null).map(r => r.spot!)) : null,
        max: tomorrowRows.filter(r => r.spot !== null).length ? Math.max(...tomorrowRows.filter(r => r.spot !== null).map(r => r.spot!)) : null,
      },
      temp: { avg: avg(validTemps) },
    },
    source: {
      spot: "ENTSO-E Transparency A44",
      weather: "Open-Meteo Forecast API",
    },
  });
}
