/**
 * GET /api/energy/ddm?zone=SE3&date=2026-02-18
 * GET /api/energy/ddm?zone=SE3&month=2026-02
 *
 * Returns DDM data: zonpris, systempris, flaskhals, flöden, constraint rent.
 * All computed server-side from canonical CMD data — no parameters, pure algebra.
 *
 * Data sources:
 *   🟢 CMD: timeseries_v2/{zone}/{YYYY-MM}.ndjson (zonpris)
 *   🟢 CMD: system_price/{YYYY-MM}.ndjson (systempris)  — if exists
 *   🟢 CMD: entsoe_flows/{run_id}/flows.json (fysiska flöden)
 *   🔵 DDM: flaskhals = zonpris - systempris (computed here)
 *
 * Resolution: PT60M (V1). PT15M planned for V2.
 *
 * Layer: CMD + DDM
 * TR1: No source, no number.
 * TR6: Code reads — never invents.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

// ─── Data directory resolution ───────────────────────────────────────────────

function resolveDataDir(subpath: string): string {
  const candidates = [
    resolve(process.cwd(), "data", subpath),
    resolve(process.cwd(), "../../data", subpath),
    // __dirname fallback (same pattern as /api/spot/v2)
    resolve(__dirname, "../../../../../data", subpath),
    resolve(__dirname, "../../../../../../../data", subpath),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Return first candidate for error reporting
  return candidates[0];
}

const TS_DIR = resolveDataDir("canonical/timeseries_v2");
const SYS_DIR = resolveDataDir("canonical/system_price");
const FLOWS_DIR = resolveDataDir("canonical/entsoe_flows");

// ─── Types ───────────────────────────────────────────────────────────────────

interface TSRow {
  ts: string;
  zone: string;
  spot: number | null;
  net_import_mw: number | null;
  [key: string]: unknown;
}

interface SysRow {
  ts: string;
  price_eur_mwh: number;
  // Also accepts legacy field name
  sys_eur_mwh?: number;
}

interface FlowEntry {
  in_zone: string;
  out_zone: string;
  direction: string;
  resolution: string;
  unit: string;
  points: { position: number; quantity_mw: number }[];
}

interface DDMRow {
  ts: string;
  zone: string;
  zonpris_eur_mwh: number;
  systempris_eur_mwh: number | null;
  flaskhals_eur_mwh: number | null;
  flaskhals_pct: number | null;
  net_import_mw: number | null;
  flows_in: Record<string, number>;
  flows_out: Record<string, number>;
  layer: "DDM";
  resolution: "PT60M";
}

interface DDMResponse {
  zone: string;
  period: string;
  count: number;
  resolution: "PT60M";
  rows: DDMRow[];
  daily_summary: {
    avg_zonpris: number | null;
    avg_systempris: number | null;
    avg_flaskhals: number | null;
    max_flaskhals: number | null;
    max_flaskhals_pct: number | null;
    avg_net_import_mw: number | null;
    total_import_mw: number | null;
    total_export_mw: number | null;
    constraint_rent: { border: string; total_eur: number; avg_delta: number }[];
    total_rent_eur: number;
  };
  sources: string[];
  warnings: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadNdjson<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").filter(Boolean).map(line => JSON.parse(line));
}

function avg(arr: number[]): number | null {
  return arr.length ? +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2) : null;
}

// Find the latest flow run for a given month
function findFlowRun(month: string): string | null {
  if (!existsSync(FLOWS_DIR)) return null;
  const runs = readdirSync(FLOWS_DIR)
    .filter(d => {
      const p = join(FLOWS_DIR, d);
      return statSync(p).isDirectory() && d.includes(month.replace("-", ""));
    })
    .sort()
    .reverse();
  return runs.length > 0 ? runs[0] : null;
}

// Load flows for a zone on a specific date
function loadFlows(zone: string, month: string, date: string): { flowsIn: Map<string, Map<string, number>>, flowsOut: Map<string, Map<string, number>> } {
  const flowsIn = new Map<string, Map<string, number>>();
  const flowsOut = new Map<string, Map<string, number>>();

  const runId = findFlowRun(month);
  if (!runId) return { flowsIn, flowsOut };

  const flowFile = join(FLOWS_DIR, runId, "flows.json");
  if (!existsSync(flowFile)) return { flowsIn, flowsOut };

  try {
    const data: FlowEntry[] = JSON.parse(readFileSync(flowFile, "utf-8"));

    for (const entry of data) {
      // direction = "SE2→SE3" means flow FROM SE2 TO SE3
      // in_zone = receiving end, out_zone = sending end
      // For SE3: incoming = entries where direction ends with →SE3
      //          outgoing = entries where direction starts with SE3→
      const parts = entry.direction.split("→");
      if (parts.length !== 2) continue;
      const [fromZ, toZ] = parts;

      const isIncoming = toZ === zone;
      const isOutgoing = fromZ === zone;
      if (!isIncoming && !isOutgoing) continue;

      const border = entry.direction;
      const resolution = entry.resolution || "PT60M";
      const stepsPerHour = resolution === "PT15M" ? 4 : 1;

      for (const pt of entry.points) {
        if (pt.quantity_mw === 0) continue; // skip sparse zeros

        const hourIndex = Math.floor((pt.position - 1) / stepsPerHour);
        const dayIndex = Math.floor(hourIndex / 24);
        const hourInDay = hourIndex % 24;

        const monthStart = new Date(month + "-01T00:00:00Z");
        const tsDate = new Date(monthStart.getTime() + dayIndex * 86400000 + hourInDay * 3600000);
        const tsStr = tsDate.toISOString().slice(0, 13) + ":00:00Z";

        if (!tsStr.startsWith(date)) continue;

        const map = isIncoming ? flowsIn : flowsOut;
        if (!map.has(tsStr)) map.set(tsStr, new Map());
        const hourMap = map.get(tsStr)!;

        // Aggregate PT15M → PT60M (average)
        const existing = hourMap.get(border) || 0;
        if (stepsPerHour > 1) {
          hourMap.set(border, existing + pt.quantity_mw / stepsPerHour);
        } else {
          hourMap.set(border, pt.quantity_mw);
        }
      }
    }
  } catch {
    // Flow loading failure is non-fatal
  }

  return { flowsIn, flowsOut };
}

// ─── Systempris: Nord Pool CMD data only ─────────────────────────────────────
// NO fallback. NO approximation. NO proxy.
// If system_price NDJSON doesn't exist, systempris = null → flaskhals = null.
// Flaskhals(z,t) = Zonpris(z,t) − Systempris(t) — requires official Nord Pool data.

function loadSystemPrices(month: string): { prices: Map<string, number>; available: boolean } {
  const map = new Map<string, number>();

  const sysFile = join(SYS_DIR, `${month}.ndjson`);
  if (!existsSync(sysFile)) {
    return { prices: map, available: false };
  }

  const rows = loadNdjson<SysRow>(sysFile);
  for (const r of rows) {
    const price = r.price_eur_mwh ?? r.sys_eur_mwh;
    if (price !== undefined && price !== null) {
      map.set(r.ts, price);
    }
  }
  return { prices: map, available: rows.length > 0 };
}

// ─── Main handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const zone = searchParams.get("zone")?.toUpperCase() || "SE3";
  const date = searchParams.get("date");   // YYYY-MM-DD
  const month = searchParams.get("month"); // YYYY-MM

  const warnings: string[] = [];
  const sources: string[] = [];

  // Determine target
  let targetMonth: string;
  let targetDate: string | null = null;

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    targetMonth = date.slice(0, 7);
    targetDate = date;
  } else if (month && /^\d{4}-\d{2}$/.test(month)) {
    targetMonth = month;
  } else {
    // Default: yesterday
    const d = new Date();
    d.setDate(d.getDate() - 1);
    targetDate = d.toISOString().slice(0, 10);
    targetMonth = targetDate.slice(0, 7);
  }

  // Load zonpris (CMD)
  const tsFile = join(TS_DIR, zone, `${targetMonth}.ndjson`);
  let tsRows = loadNdjson<TSRow>(tsFile);
  if (targetDate) {
    tsRows = tsRows.filter(r => r.ts.startsWith(targetDate!));
  }

  if (tsRows.length === 0) {
    return NextResponse.json(
      {
        error: `No timeseries data for ${zone} on ${targetDate ?? targetMonth}`,
        debug: {
          ts_dir: TS_DIR,
          ts_dir_exists: existsSync(TS_DIR),
          ts_file: tsFile,
          ts_file_exists: existsSync(tsFile),
          cwd: process.cwd(),
        },
      },
      { status: 404 },
    );
  }
  sources.push(`timeseries_v2/${zone}/${targetMonth}.ndjson`);

  // Load systempris (CMD) — Nord Pool official data only, no fallback
  const { prices: sysPrices, available: hasSysData } = loadSystemPrices(targetMonth);
  if (hasSysData) {
    sources.push(`system_price/${targetMonth}.ndjson [Nord Pool]`);
  } else {
    warnings.push("Systempris ej tillg\u00e4ngligt f\u00f6r denna period. Nord Pool l\u00e5ser historisk data bakom betalv\u00e4gg (pre-2026). ENTSO-E, EEA, ECB och Riksdagen \u00e4r \u00f6ppna \u2014 Nord Pool \u00e4r undantaget.");
  }

  // Load flows (CMD)
  let flowsIn: Map<string, Map<string, number>> | undefined;
  let flowsOut: Map<string, Map<string, number>> | undefined;
  if (targetDate) {
    const flows = loadFlows(zone, targetMonth, targetDate);
    flowsIn = flows.flowsIn;
    flowsOut = flows.flowsOut;
    const runId = findFlowRun(targetMonth);
    if (runId) sources.push(`entsoe_flows/${runId}/flows.json`);
  }

  // ─── Compute DDM rows ───────────────────────────────────────────────────

  const ddmRows: DDMRow[] = [];
  const rentAccum = new Map<string, { sum: number; count: number; deltaSum: number }>();

  for (const ts of tsRows) {
    if (ts.spot === null) continue;

    const sys = sysPrices.get(ts.ts) ?? null;
    const flask = sys !== null ? +(ts.spot - sys).toFixed(2) : null;
    const flaskPct = flask !== null && ts.spot > 0
      ? +((Math.max(0, flask) / ts.spot) * 100).toFixed(1)
      : null;

    // Flows for this hour
    const fIn: Record<string, number> = {};
    const fOut: Record<string, number> = {};

    if (flowsIn?.has(ts.ts)) {
      for (const [border, mw] of flowsIn.get(ts.ts)!) {
        fIn[border] = +mw.toFixed(0);
      }
    }
    if (flowsOut?.has(ts.ts)) {
      for (const [border, mw] of flowsOut.get(ts.ts)!) {
        fOut[border] = +mw.toFixed(0);
      }
    }

    // Constraint rent per border (DDM)
    if (sys !== null) {
      // For outgoing borders: price difference * flow
      for (const [border, mw] of Object.entries(fOut)) {
        // Get destination zone price
        const destZone = border.split("→")[1];
        if (!destZone) continue;

        // Load dest zone price from timeseries
        const destFile = join(TS_DIR, destZone, `${targetMonth}.ndjson`);
        const destRows = loadNdjson<TSRow>(destFile).filter(r => r.ts === ts.ts);
        if (destRows.length > 0 && destRows[0].spot !== null) {
          const delta = destRows[0].spot - ts.spot;
          const rent = Math.max(0, delta * mw);
          const key = border;
          const entry = rentAccum.get(key) || { sum: 0, count: 0, deltaSum: 0 };
          entry.sum += rent;
          entry.count += 1;
          entry.deltaSum += delta;
          rentAccum.set(key, entry);
        }
      }
      // Also incoming borders
      for (const [border, mw] of Object.entries(fIn)) {
        const srcZone = border.split("→")[0];
        if (!srcZone) continue;
        const srcFile = join(TS_DIR, srcZone, `${targetMonth}.ndjson`);
        const srcRows = loadNdjson<TSRow>(srcFile).filter(r => r.ts === ts.ts);
        if (srcRows.length > 0 && srcRows[0].spot !== null) {
          const delta = ts.spot - srcRows[0].spot;
          const rent = Math.max(0, delta * mw);
          const key = border;
          const entry = rentAccum.get(key) || { sum: 0, count: 0, deltaSum: 0 };
          entry.sum += rent;
          entry.count += 1;
          entry.deltaSum += delta;
          rentAccum.set(key, entry);
        }
      }
    }

    ddmRows.push({
      ts: ts.ts,
      zone,
      zonpris_eur_mwh: ts.spot,
      systempris_eur_mwh: sys,
      flaskhals_eur_mwh: flask,
      flaskhals_pct: flaskPct,
      net_import_mw: ts.net_import_mw,
      flows_in: fIn,
      flows_out: fOut,
      layer: "DDM",
      resolution: "PT60M",
    });
  }

  // ─── Daily summary ─────────────────────────────────────────────────────

  const zonArr = ddmRows.map(r => r.zonpris_eur_mwh);
  const sysArr = ddmRows.map(r => r.systempris_eur_mwh).filter((v): v is number => v !== null);
  const fArr = ddmRows.map(r => r.flaskhals_eur_mwh).filter((v): v is number => v !== null);
  const fpArr = fArr.map(f => Math.max(0, f));
  const fPctArr = ddmRows.map(r => r.flaskhals_pct).filter((v): v is number => v !== null);
  const niArr = ddmRows.map(r => r.net_import_mw).filter((v): v is number => v !== null);

  // Import = sum of all flows_in per hour; Export = sum of all flows_out
  let totalImport = 0, totalExport = 0;
  for (const r of ddmRows) {
    totalImport += Object.values(r.flows_in).reduce((s, v) => s + v, 0);
    totalExport += Object.values(r.flows_out).reduce((s, v) => s + v, 0);
  }

  const constraintRent = [...rentAccum.entries()]
    .map(([border, { sum, count, deltaSum }]) => ({
      border,
      total_eur: +sum.toFixed(0),
      avg_delta: +(deltaSum / count).toFixed(2),
    }))
    .sort((a, b) => b.total_eur - a.total_eur);

  const response: DDMResponse = {
    zone,
    period: targetDate ?? targetMonth,
    count: ddmRows.length,
    resolution: "PT60M",
    rows: ddmRows,
    daily_summary: {
      avg_zonpris: avg(zonArr),
      avg_systempris: avg(sysArr),
      avg_flaskhals: avg(fpArr),
      max_flaskhals: fArr.length ? +Math.max(...fArr).toFixed(2) : null,
      max_flaskhals_pct: fPctArr.length ? +Math.max(...fPctArr).toFixed(1) : null,
      avg_net_import_mw: avg(niArr),
      total_import_mw: +totalImport.toFixed(0),
      total_export_mw: +totalExport.toFixed(0),
      constraint_rent: constraintRent,
      total_rent_eur: constraintRent.reduce((s, r) => s + r.total_eur, 0),
    },
    sources,
    warnings,
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=600",
    },
  });
}
