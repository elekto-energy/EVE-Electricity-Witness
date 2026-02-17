/**
 * GET /api/witness/weather-correlation
 *
 * Returns merged spot price + weather data at requested resolution.
 *
 * Query params:
 *   zone      = SE1|SE2|SE3|SE4       (required)
 *   res       = day|week|month|year   (required)
 *   from      = YYYY-MM-DD            (optional, default 2016-01-01)
 *   to        = YYYY-MM-DD            (optional, default 2025-12-31)
 *
 * Spot source: ENTSO-E bulk ingest (EUR/MWh → öre/kWh @ 11.49 SEK/EUR)
 * Weather source: Open-Meteo ERA5 daily
 *
 * Witness-mode: no interpretation. Correlation ≠ causation.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, join } from "path";

/* ── Project root ── */
function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps/web") || cwd.endsWith("apps\\web")) return resolve(cwd, "../..");
  return cwd;
}
const ROOT = getProjectRoot();

/* ── EUR→SEK fixed rate (Riksbank 2024 avg) ── */
const EUR_SEK = 11.49;
const MWH_TO_KWH = 1000;
const eurMwhToOreKwh = (eurMwh: number) => (eurMwh * EUR_SEK / MWH_TO_KWH) * 100;

/* ── Types ── */
interface SpotDay { date: string; spot_ore_kwh: number; }

interface WeatherDay {
  d: string;
  t: number | null;
  s: number | null;
  sh: number | null;
  w: number | null;
}

interface MergedRow {
  period: string;
  spot_ore_kwh: number | null;
  temp_avg_c: number | null;
  solar_kwh_m2: number | null;
  sunshine_hours: number | null;
  wind_avg_ms: number | null;
  spot_days: number;
  weather_days: number;
}

/* ── Load ENTSO-E spot → daily avg per zone ── */
function loadSpotDaily(zone: string, from: string, to: string): SpotDay[] {
  const entsoeDir = join(ROOT, "data", "canonical", "entsoe");
  if (!existsSync(entsoeDir)) return [];

  const dirs = readdirSync(entsoeDir).filter(d => d.startsWith("entsoe_dayahead_SE_")).sort();
  const dayAccum: Map<string, { sum: number; count: number }> = new Map();

  for (const dir of dirs) {
    const pricePath = join(entsoeDir, dir, "day_ahead_prices.json");
    if (!existsSync(pricePath)) continue;

    try {
      const records = JSON.parse(readFileSync(pricePath, "utf-8")) as any[];
      for (const rec of records) {
        if (rec.zone_code !== zone) continue;
        const periodStart = new Date(rec.period_start);
        // delivery day = period_start + 1h (handles 23:00Z → next day)
        const deliveryDate = new Date(periodStart.getTime() + 3600000).toISOString().slice(0, 10);
        if (deliveryDate < from || deliveryDate > to) continue;

        const prices: number[] = (rec.prices || []).map((p: any) => p.price_eur_mwh).filter((p: number) => !isNaN(p));
        if (prices.length === 0) continue;

        const dayAvgEur = prices.reduce((s: number, v: number) => s + v, 0) / prices.length;
        const ore = eurMwhToOreKwh(dayAvgEur);

        const existing = dayAccum.get(deliveryDate);
        if (existing) { existing.sum += ore; existing.count++; }
        else dayAccum.set(deliveryDate, { sum: ore, count: 1 });
      }
    } catch { /* skip */ }
  }

  return Array.from(dayAccum.entries())
    .map(([date, { sum, count }]) => ({ date, spot_ore_kwh: Math.round(sum / count * 10) / 10 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* ── Load weather daily ── */
function loadWeatherDaily(zone: string): WeatherDay[] {
  const path = join(ROOT, "data", "canonical", "weather", `weather_${zone}_daily.json`);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf-8")).daily || [];
  } catch { return []; }
}

/* ── ISO week ── */
function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y = d.getUTCFullYear();
  const start = new Date(Date.UTC(y, 0, 1));
  const wk = Math.ceil(((d.getTime() - start.getTime()) / 86400000 + 1) / 7);
  return `${y}-W${String(wk).padStart(2, "0")}`;
}

/* ── Merge & aggregate ── */
function mergeAndAggregate(
  spot: SpotDay[], weather: WeatherDay[], res: string, from: string, to: string
): MergedRow[] {
  const wxMap = new Map(weather.map(w => [w.d, w]));

  const pk = (date: string): string => {
    if (res === "day") return date;
    if (res === "week") return isoWeek(date);
    if (res === "month") return date.slice(0, 7);
    return date.slice(0, 4); // year
  };

  const allDates = new Set<string>();
  for (const s of spot) allDates.add(s.date);
  for (const w of weather) if (w.d >= from && w.d <= to) allDates.add(w.d);

  const groups: Record<string, {
    spots: number[]; temps: number[]; sols: number[];
    suns: number[]; winds: number[];
    sd: number; wd: number;
  }> = {};

  const spotMap = new Map(spot.map(s => [s.date, s.spot_ore_kwh]));

  for (const date of allDates) {
    const key = pk(date);
    const g = groups[key] ??= { spots: [], temps: [], sols: [], suns: [], winds: [], sd: 0, wd: 0 };

    const sp = spotMap.get(date);
    if (sp !== undefined) { g.spots.push(sp); g.sd++; }

    const wx = wxMap.get(date);
    if (wx) {
      g.wd++;
      if (wx.t !== null) g.temps.push(wx.t);
      if (wx.s !== null) g.sols.push(wx.s);
      if (wx.sh !== null) g.suns.push(wx.sh);
      if (wx.w !== null) g.winds.push(wx.w);
    }
  }

  const avg = (a: number[]) => a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length * 10) / 10 : null;
  const sum = (a: number[]) => a.length ? Math.round(a.reduce((s, v) => s + v, 0) * 10) / 10 : null;

  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, g]) => ({
      period,
      spot_ore_kwh: avg(g.spots),
      temp_avg_c: avg(g.temps),
      solar_kwh_m2: res === "day" ? avg(g.sols) : sum(g.sols),
      sunshine_hours: res === "day" ? avg(g.suns) : sum(g.suns),
      wind_avg_ms: avg(g.winds),
      spot_days: g.sd,
      weather_days: g.wd,
    }));
}

/* ── Handler ── */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const zone = sp.get("zone") || "SE3";
  const res = sp.get("res") || "month";
  const from = sp.get("from") || "2016-01-01";
  const to = sp.get("to") || "2025-12-31";

  if (!["SE1", "SE2", "SE3", "SE4"].includes(zone)) {
    return NextResponse.json({ error: "Invalid zone" }, { status: 400 });
  }
  if (!["day", "week", "month", "year"].includes(res)) {
    return NextResponse.json({ error: "Invalid res. Use: day|week|month|year" }, { status: 400 });
  }

  const spot = loadSpotDaily(zone, from, to);
  const weather = loadWeatherDaily(zone);
  const merged = mergeAndAggregate(spot, weather, res, from, to);

  return NextResponse.json({
    zone,
    resolution: res,
    period: { from, to },
    count: merged.length,
    rows: merged,
    sources: {
      spot: "ENTSO-E Day-Ahead (EUR/MWh → öre/kWh @ 11.49 SEK/EUR)",
      weather: "Open-Meteo ERA5 (Copernicus/ECMWF)",
    },
    witness: "Correlation ≠ causation. Weather is one of many price drivers.",
  });
}
