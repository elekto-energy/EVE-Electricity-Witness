/**
 * GET /api/energy/pmm?zone=SE3&date=2026-02-18
 * GET /api/energy/pmm?zone=SE3&month=2026-02
 *
 * Returns PMM data: system price proxy, intern diff proxy, share proxy.
 * Model-based decomposition — NOT observation.
 *
 * Formula:
 *   S*(t) = Σ w_z · P_z(t)          (weighted average of all SE zone prices)
 *   F*(z,t) = P_z(t) − S*(t)        (proxy intern diff)
 *   Share*(z,t) = F*(z,t) / P_z(t)  (proxy share)
 *
 * Data sources:
 *   🟢 CMD: timeseries_v2/{zone}/{YYYY-MM}.ndjson (zonpris per zone)
 *   🟡 PMM: params/system_proxy_weights_v1.0.json (static weights)
 *
 * Layer: PMM (Parameterized Model Module)
 * methodology_version: PMM_v1.0_SE_STATIC_LOAD
 *
 * IMPORTANT: This is a MODEL, not observation.
 * It does NOT represent Nord Pool official system price (SYS).
 * DDM v1.1 §5: "Ingen proxy används i DDM."
 *
 * TR1: No source, no number.
 * TR6: Code computes from parameters — never invents.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";

// ─── Data directory resolution ───────────────────────────────────────────────

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
const PARAMS_DIR = resolveDataDir("canonical/params");

// ─── Types ───────────────────────────────────────────────────────────────────

interface TSRow {
  ts: string;
  zone: string;
  spot: number | null;
}

interface ParamFile {
  version: string;
  methodology_version: string;
  weights: Record<string, number>;
  param_hash: string;
  legal_notice: string;
}

interface PMMRow {
  ts: string;
  zone: string;
  zone_price_eur_mwh: number;
  system_proxy_eur_mwh: number;
  intern_diff_proxy_eur_mwh: number;
  share_proxy_pct: number;
}

// ─── Zones ───────────────────────────────────────────────────────────────────

const SE_ZONES = ["SE1", "SE2", "SE3", "SE4"] as const;

// ─── Load params ─────────────────────────────────────────────────────────────

function loadParams(): ParamFile | null {
  const path = resolve(PARAMS_DIR, "system_proxy_weights_v1.0.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

// ─── Load spot prices for a zone + month ─────────────────────────────────────

function loadSpotMonth(zone: string, month: string): Map<string, number> {
  const path = resolve(TS_DIR, zone, `${month}.ndjson`);
  if (!existsSync(path)) return new Map();
  const map = new Map<string, number>();
  try {
    const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      const row: TSRow = JSON.parse(line);
      if (row.spot !== null && row.spot !== undefined) {
        map.set(row.ts, row.spot);
      }
    }
  } catch { /* skip */ }
  return map;
}

// ─── Compute query hash ──────────────────────────────────────────────────────

function computeQueryHash(zone: string, from: string, to: string, paramHash: string, methodologyVersion: string): string {
  const input = JSON.stringify({ zone, from, to, param_hash: paramHash, methodology_version: methodologyVersion }, null, 0);
  return "sha256:" + createHash("sha256").update(input).digest("hex");
}

// ─── GET handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const zone = searchParams.get("zone")?.toUpperCase() ?? "";
  const dateParam = searchParams.get("date");
  const monthParam = searchParams.get("month");

  // Validate zone
  if (!SE_ZONES.includes(zone as any)) {
    return NextResponse.json({ error: `Invalid zone: ${zone}. Must be SE1-SE4.` }, { status: 400 });
  }

  // Determine month range
  let months: string[] = [];
  let filterStart: string | null = null;
  let filterEnd: string | null = null;

  if (dateParam) {
    // Single date → single month
    months = [dateParam.slice(0, 7)];
    filterStart = dateParam;
    filterEnd = dateParam;
  } else if (monthParam) {
    months = [monthParam];
  } else {
    return NextResponse.json({ error: "Provide ?date=YYYY-MM-DD or ?month=YYYY-MM" }, { status: 400 });
  }

  // Load params
  const params = loadParams();
  if (!params) {
    return NextResponse.json({ error: "PMM parameter file not found" }, { status: 500 });
  }

  // Load spot prices for ALL SE zones for requested months
  const zoneSpots = new Map<string, Map<string, number>>();
  for (const z of SE_ZONES) {
    const combined = new Map<string, number>();
    for (const m of months) {
      const mSpots = loadSpotMonth(z, m);
      for (const [ts, price] of mSpots) combined.set(ts, price);
    }
    zoneSpots.set(z, combined);
  }

  // Collect all timestamps where ALL zones have spot data
  const targetZoneSpots = zoneSpots.get(zone);
  if (!targetZoneSpots || targetZoneSpots.size === 0) {
    return NextResponse.json({
      error: `No spot data for ${zone} in ${months.join(", ")}`,
      methodology_version: params.methodology_version,
    }, { status: 404 });
  }

  // Compute PMM rows
  const rows: PMMRow[] = [];
  const allTs = [...targetZoneSpots.keys()].sort();
  const weights = params.weights;
  const dataset_eve_ids: string[] = [];

  for (const ts of allTs) {
    // Date filter
    if (filterStart && ts.slice(0, 10) < filterStart) continue;
    if (filterEnd && ts.slice(0, 10) > filterEnd) continue;

    // Check all zones have data for this timestamp
    let allZonesHaveData = true;
    let systemProxy = 0;

    for (const z of SE_ZONES) {
      const price = zoneSpots.get(z)?.get(ts);
      if (price === undefined || price === null) {
        allZonesHaveData = false;
        break;
      }
      systemProxy += (weights[z] ?? 0) * price;
    }

    if (!allZonesHaveData) continue;

    const zonePrice = targetZoneSpots.get(ts)!;
    const internDiff = +(zonePrice - systemProxy).toFixed(4);
    const sharePct = zonePrice > 0 ? +((internDiff / zonePrice) * 100).toFixed(2) : 0;

    rows.push({
      ts,
      zone,
      zone_price_eur_mwh: +zonePrice.toFixed(4),
      system_proxy_eur_mwh: +systemProxy.toFixed(4),
      intern_diff_proxy_eur_mwh: internDiff,
      share_proxy_pct: sharePct,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({
      error: `No complete zone data for PMM calculation in ${months.join(", ")}`,
      methodology_version: params.methodology_version,
    }, { status: 404 });
  }

  // Summary
  const n = rows.length;
  const avgProxy = +(rows.reduce((s, r) => s + r.system_proxy_eur_mwh, 0) / n).toFixed(4);
  const avgDiff = +(rows.reduce((s, r) => s + r.intern_diff_proxy_eur_mwh, 0) / n).toFixed(4);
  const avgShare = +(rows.reduce((s, r) => s + r.share_proxy_pct, 0) / n).toFixed(2);

  // Query hash for proof pack
  const periodStart = rows[0].ts.slice(0, 10);
  const periodEnd = rows[rows.length - 1].ts.slice(0, 10);
  const queryHash = computeQueryHash(zone, periodStart, periodEnd, params.param_hash, params.methodology_version);

  return NextResponse.json({
    zone,
    period: dateParam ?? monthParam,
    count: rows.length,
    methodology_version: params.methodology_version,
    param_version: params.version,
    param_hash: params.param_hash,
    query_hash: queryHash,
    model_type: "weighted_average",
    weights: params.weights,
    legal_notice: params.legal_notice,
    summary: {
      avg_system_proxy_eur_mwh: avgProxy,
      avg_intern_diff_proxy_eur_mwh: avgDiff,
      avg_share_proxy_pct: avgShare,
    },
    rows,
    sources: ["ENTSO-E A44 (zone prices)", `PMM params v${params.version}`],
    warnings: [],
  });
}
