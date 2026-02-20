/**
 * GET /api/energy/forex
 * GET /api/energy/forex?date=2026-02-20
 *
 * Returns EUR/SEK exchange rate from ECB canonical data.
 *
 * Without ?date: returns latest available rate.
 * With ?date: returns rate for that date (or nearest prior business day).
 *
 * Source: ECB SDW — EXR/D.SEK.EUR.SP00.A
 * Data:   data/canonical/ecb/eur_sek_daily.ndjson
 *
 * Layer: CMD (canonical market data)
 * TR1: No source, no number.
 * TR6: Code reads — never invents.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// ─── Data resolution ─────────────────────────────────────────────────────────

function resolveDataDir(subpath: string): string {
  const candidates = [
    resolve(process.cwd(), "data", subpath),
    resolve(process.cwd(), "../../data", subpath),
    resolve(__dirname, "../../../../../data", subpath),
    resolve(__dirname, "../../../../../../../data", subpath),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}

interface ForexRow {
  date: string;
  rate: number;
  source: string;
}

// ─── Load + cache ────────────────────────────────────────────────────────────

let cache: { rows: ForexRow[]; byDate: Map<string, number>; loadedAt: number } | null = null;

function loadForex(): typeof cache {
  // Reload every 5 minutes
  if (cache && Date.now() - cache.loadedAt < 300_000) return cache;

  const dir = resolveDataDir("canonical/ecb");
  const path = resolve(dir, "eur_sek_daily.ndjson");
  if (!existsSync(path)) return null;

  const rows: ForexRow[] = [];
  const byDate = new Map<string, number>();
  const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const row: ForexRow = JSON.parse(line);
      rows.push(row);
      byDate.set(row.date, row.rate);
    } catch { /* skip */ }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  cache = { rows, byDate, loadedAt: Date.now() };
  return cache;
}

// Find rate for a date (or nearest prior business day)
function rateForDate(data: NonNullable<typeof cache>, date: string): { date: string; rate: number } | null {
  // Exact match
  const exact = data.byDate.get(date);
  if (exact !== undefined) return { date, rate: exact };

  // Walk backwards up to 7 days (weekends, holidays)
  const d = new Date(date + "T12:00:00Z");
  for (let i = 1; i <= 7; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    const key = d.toISOString().slice(0, 10);
    const rate = data.byDate.get(key);
    if (rate !== undefined) return { date: key, rate };
  }
  return null;
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const data = loadForex();
  if (!data || data.rows.length === 0) {
    return NextResponse.json({
      error: "No forex data available. Run: npx tsx packages/evidence/src/ingest_ecb_forex.ts",
    }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");

  const latest = data.rows[data.rows.length - 1];

  if (dateParam) {
    const found = rateForDate(data, dateParam);
    if (!found) {
      return NextResponse.json({
        error: `No EUR/SEK rate found near ${dateParam}`,
        latest: { date: latest.date, rate: latest.rate },
      }, { status: 404 });
    }
    return NextResponse.json({
      pair: "EUR/SEK",
      date: found.date,
      rate: found.rate,
      source: "ECB",
      requested_date: dateParam,
      is_exact: found.date === dateParam,
      data_range: { first: data.rows[0].date, last: latest.date, count: data.rows.length },
    });
  }

  // No date → return latest
  return NextResponse.json({
    pair: "EUR/SEK",
    date: latest.date,
    rate: latest.rate,
    source: "ECB",
    data_range: { first: data.rows[0].date, last: latest.date, count: data.rows.length },
  });
}
