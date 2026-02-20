/**
 * GET /api/energy/spreads?date=YYYY-MM-DD
 * GET /api/energy/spreads?month=YYYY-MM
 *
 * Returns per-hour zonpris for all SE1–SE4 plus computed link spreads.
 *
 * Spreads (DDM):
 *   SE1→SE2: max(0, SE2 - SE1)  per hour
 *   SE2→SE3: max(0, SE3 - SE2)  per hour
 *   SE3→SE4: max(0, SE4 - SE3)  per hour
 *
 * No systempris needed. Pure ENTSO-E algebra.
 * Negative spread = lower zone is cheaper than upper = 0 (no upstream congestion cost).
 *
 * Layer: CMD + DDM
 * TR1: No source, no number.
 * TR6: Code reads — never invents.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

// ─── Data directory resolution (mirrors ddm/route.ts) ────────────────────────

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

const TS_DIR = resolveDataDir("canonical/timeseries_v2");

// ─── Types ────────────────────────────────────────────────────────────────────

interface TSRow {
  ts: string;
  zone: string;
  spot: number | null;
  [key: string]: unknown;
}

export interface SpreadRow {
  ts: string;
  /** max(0, higher - lower) in EUR/MWh */
  delta_eur_mwh: number;
}

export interface ZoneRow {
  ts: string;
  spot_eur_mwh: number;
}

export interface LinkSummary {
  link: string;       // e.g. "SE1→SE2"
  from: string;       // "SE1"
  to: string;         // "SE2"
  rows: SpreadRow[];
  avg_delta_eur_mwh: number | null;
  avg_delta_kr_kwh: number | null;
  max_delta_eur_mwh: number | null;
  /** Hours where delta > 0 */
  congested_hours: number;
}

export interface SpreadsResponse {
  period: string;
  zones: Record<string, ZoneRow[]>;  // SE1..SE4
  links: LinkSummary[];
  sources: string[];
  warnings: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EUR_SEK = 11.2;
const toKr = (eur: number) => +((eur * EUR_SEK) / 1000).toFixed(4);

function loadNdjson<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").filter(Boolean).map(line => JSON.parse(line));
}

function avg(arr: number[]): number | null {
  return arr.length ? +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(4) : null;
}

function loadZone(zone: string, month: string, dateFilter: string | null): ZoneRow[] {
  const file = join(TS_DIR, zone, `${month}.ndjson`);
  let rows = loadNdjson<TSRow>(file);
  if (dateFilter) rows = rows.filter(r => r.ts.startsWith(dateFilter));
  return rows
    .filter(r => r.spot !== null)
    .map(r => ({ ts: r.ts, spot_eur_mwh: r.spot as number }));
}

// ─── SE link definitions ──────────────────────────────────────────────────────
// Chain: SE1 → SE2 → SE3 → SE4
// Spread on link X→Y = max(0, Y_price - X_price)
// Positive = Y is more expensive than X = congestion cost flowing into Y

const SE_LINKS: { link: string; from: string; to: string }[] = [
  { link: "SE1→SE2", from: "SE1", to: "SE2" },
  { link: "SE2→SE3", from: "SE2", to: "SE3" },
  { link: "SE3→SE4", from: "SE3", to: "SE4" },
];

// ─── Main handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const date = searchParams.get("date");
  const month = searchParams.get("month");

  const warnings: string[] = [];
  const sources: string[] = [];

  let targetMonth: string;
  let targetDate: string | null = null;

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    targetMonth = date.slice(0, 7);
    targetDate = date;
  } else if (month && /^\d{4}-\d{2}$/.test(month)) {
    targetMonth = month;
  } else {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    targetDate = d.toISOString().slice(0, 10);
    targetMonth = targetDate.slice(0, 7);
  }

  // ─── Load all four zones ──────────────────────────────────────────────────

  const ZONES = ["SE1", "SE2", "SE3", "SE4"] as const;
  const zoneData: Record<string, ZoneRow[]> = {};
  const missingZones: string[] = [];

  for (const z of ZONES) {
    const rows = loadZone(z, targetMonth, targetDate);
    zoneData[z] = rows;
    if (rows.length > 0) {
      sources.push(`timeseries_v2/${z}/${targetMonth}.ndjson`);
    } else {
      missingZones.push(z);
    }
  }

  if (missingZones.length === 4) {
    return NextResponse.json(
      { error: `No timeseries data for any SE zone on ${targetDate ?? targetMonth}` },
      { status: 404 }
    );
  }

  if (missingZones.length > 0) {
    warnings.push(`Saknar data för: ${missingZones.join(", ")}`);
  }

  // ─── Build timestamp-indexed lookup ──────────────────────────────────────

  const byTs: Map<string, Partial<Record<string, number>>> = new Map();

  for (const z of ZONES) {
    for (const row of zoneData[z]) {
      if (!byTs.has(row.ts)) byTs.set(row.ts, {});
      byTs.get(row.ts)![z] = row.spot_eur_mwh;
    }
  }

  // ─── Compute link spreads ─────────────────────────────────────────────────

  const links: LinkSummary[] = SE_LINKS.map(({ link, from, to }) => {
    const rows: SpreadRow[] = [];

    for (const [ts, prices] of [...byTs.entries()].sort()) {
      const pFrom = prices[from];
      const pTo = prices[to];
      if (pFrom === undefined || pTo === undefined) continue;

      // delta = max(0, to - from)
      // Positive: "to" zone is more expensive → congestion cost for consumers in "to"
      const delta = Math.max(0, +(pTo - pFrom).toFixed(4));
      rows.push({ ts, delta_eur_mwh: delta });
    }

    const deltas = rows.map(r => r.delta_eur_mwh);
    const nonZero = deltas.filter(d => d > 0);

    return {
      link,
      from,
      to,
      rows,
      avg_delta_eur_mwh: avg(deltas),
      avg_delta_kr_kwh: deltas.length
        ? +(deltas.reduce((s, v) => s + toKr(v), 0) / deltas.length).toFixed(4)
        : null,
      max_delta_eur_mwh: nonZero.length ? +Math.max(...nonZero).toFixed(4) : null,
      congested_hours: nonZero.length,
    };
  });

  const response: SpreadsResponse = {
    period: targetDate ?? targetMonth,
    zones: zoneData,
    links,
    sources,
    warnings,
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=600",
    },
  });
}
