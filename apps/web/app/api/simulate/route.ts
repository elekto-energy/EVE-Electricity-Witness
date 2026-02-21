/**
 * POST /api/simulate
 *
 * 15-min effekttariff-simulering.
 *
 * Delar spotdatakälla med /api/spot/v2 via lib/spot/getSpotV2.
 * Ingen duplicering, ingen intern HTTP-call.
 *
 * Request body:
 * {
 *   "zone": "SE3",
 *   "period": "month",
 *   "start": "2026-02-01",
 *   "end": "2026-02-28",
 *   "annual_kwh": 20000,
 *   "fuse": "20A",
 *   "tariff": "vattenfall_stockholm",
 *   "has_heat_pump": true,
 *   "has_ev": false
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSpotV2ByRange, getSpotV2ByDate, getSpotV2ByMonth } from "@/lib/spot/getSpotV2";
import { generateLoadProfile } from "@/lib/simulate/load-engine";
import { calculateTariff, Period } from "@/lib/simulate/tariff-engine";
import { nativeResolution, Resolution } from "@/lib/simulate/resolution-utils";
import { getTariffConfig, listTariffs } from "@/lib/simulate/tariffs";
import { optimizeBatteryLP } from "@/lib/simulate/battery-engine-lp";

// ─── EUR/SEK ──────────────────────────────────────────────────────────────────

function getEurSek(): number {
  // Same fallback as SpotDashboard — could read from canonical forex later
  try {
    const { readFileSync, existsSync } = require("fs");
    const { resolve } = require("path");
    const forexPath = resolve(process.cwd(), "data/canonical/forex/latest.json");
    if (existsSync(forexPath)) {
      const data = JSON.parse(readFileSync(forexPath, "utf-8"));
      if (data?.rate) return data.rate;
    }
  } catch { /* fallback */ }
  return 11.20;
}

// ─── Normalize spot rows to simulate input ────────────────────────────────────

interface NormalizedSpot {
  prices: number[];      // SEK per kWh
  timestamps: string[];
  resolution: Resolution;
}

function normalizeSpot(
  rows: Array<{ ts: string; spot: number | null }>,
  eurSek: number
): NormalizedSpot {
  // Determine resolution from data
  // If rows have 15-min gaps → PT15M, else PT60M
  let resolution: Resolution = "PT60M";
  if (rows.length >= 2) {
    const gap = new Date(rows[1].ts).getTime() - new Date(rows[0].ts).getTime();
    if (gap <= 15 * 60_000 + 1000) {
      resolution = "PT15M";
    }
  }

  // Filter out rows with null spot, convert EUR/MWh → SEK/kWh
  const filtered = rows.filter(r => r.spot !== null);

  const prices = filtered.map(r => {
    // ENTSO-E spot is EUR/MWh → convert to SEK/kWh
    const eurMwh = r.spot!;
    return (eurMwh * eurSek) / 1000;
  });

  const timestamps = filtered.map(r => r.ts);

  return { prices, timestamps, resolution };
}

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_PERIODS: Period[] = ["day", "week", "month", "year"];
const VALID_ZONES = ["SE1", "SE2", "SE3", "SE4"];

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      zone,
      period,
      start,
      end,
      annual_kwh,
      fuse = "20A",
      tariff = "vattenfall_stockholm",
      has_heat_pump = true,
      has_ev = false,
      load_profile,  // "flat" | "standard" | "heatpump" (optional, overrides has_heat_pump)
      battery_kwh = 0,
      battery_max_kw = 5,
      battery_efficiency = 0.90,
    } = body;

    // ─── Validate ───────────────────────────────────────────────────────

    if (!zone || !VALID_ZONES.includes(zone.toUpperCase())) {
      return NextResponse.json(
        { error: `Invalid zone. Valid: ${VALID_ZONES.join(", ")}` },
        { status: 400 }
      );
    }

    if (!period || !VALID_PERIODS.includes(period)) {
      return NextResponse.json(
        { error: `Invalid period. Valid: ${VALID_PERIODS.join(", ")}` },
        { status: 400 }
      );
    }

    if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      return NextResponse.json(
        { error: "Missing or invalid start (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return NextResponse.json(
        { error: "Missing or invalid end (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const annualKwh = Number(annual_kwh);
    if (!annualKwh || annualKwh < 100 || annualKwh > 500000) {
      return NextResponse.json(
        { error: "annual_kwh must be 100–500000" },
        { status: 400 }
      );
    }

    // ─── 1. Get tariff config ───────────────────────────────────────────

    const tariffConfig = getTariffConfig(tariff, fuse);
    if (!tariffConfig) {
      return NextResponse.json(
        { error: `Unknown tariff/fuse: ${tariff}/${fuse}`, available: listTariffs() },
        { status: 400 }
      );
    }

    // ─── 2. Get spot data (same source as /api/spot/v2) ─────────────────

    const spotResult = getSpotV2ByRange({
      zone: zone.toUpperCase(),
      start,
      end,
    });

    if (spotResult.rows.length === 0) {
      return NextResponse.json(
        { error: `No spot data for ${zone} ${start}..${end}` },
        { status: 404 }
      );
    }

    // ─── 3. Normalize spot ──────────────────────────────────────────────

    const eurSek = getEurSek();
    const { prices, timestamps, resolution } = normalizeSpot(spotResult.rows, eurSek);

    if (prices.length === 0) {
      return NextResponse.json(
        { error: "No valid spot prices in range (all null)" },
        { status: 404 }
      );
    }

    // ─── 4. Generate load profile ───────────────────────────────────────

    // Validate load_profile if provided
    const validProfiles = ["flat", "standard", "heatpump"];
    const loadProfileParam = load_profile && validProfiles.includes(load_profile)
      ? load_profile as "flat" | "standard" | "heatpump"
      : undefined;

    const profile = generateLoadProfile({
      annualKwh,
      timestamps,
      resolution,
      hasHeatPump: has_heat_pump,
      hasEV: has_ev,
      loadProfile: loadProfileParam,
    });

    // ─── 5. Battery optimization (if configured) ──────────────────────

    const batteryCapacity = Number(battery_kwh) || 0;
    const batteryMaxKw = Number(battery_max_kw) || 5;
    const batteryEff = Math.min(Math.max(Number(battery_efficiency) || 0.90, 0.5), 1.0);
    const intervalHours = resolution === "PT15M" ? 0.25 : 1.0;
    const n = prices.length;

    let finalLoad = profile.loadKwh;
    let batteryMeta: Record<string, unknown> | null = null;
    let costWithoutBattery: number | null = null;

    if (batteryCapacity > 0 && (period === "month" || period === "year")) {
      // First: calculate cost WITHOUT battery for comparison
      const baseResult = calculateTariff({
        loadKwh: profile.loadKwh,
        spotPriceSekPerKwh: prices,
        timestamps,
        resolution,
        period: period as Period,
        tariff: tariffConfig,
      });
      costWithoutBattery = Math.round(baseResult.totalCost * 100) / 100;

      try {
        const lpResult = await optimizeBatteryLP({
          prices,
          load: profile.loadKwh,
          capacityKwh: batteryCapacity,
          maxKw: batteryMaxKw,
          efficiency: batteryEff,
          intervalHours,
          effectRateKrPerKw: tariffConfig.effectRateKrPerKw,
        });

        if (lpResult.status === "optimal") {
          finalLoad = lpResult.adjustedLoad;

          // Downsample SoC/charge/discharge for large datasets
          // For month (744h): send all. For year (8760h): sample every 6h
          const step = n > 2000 ? 6 : 1;
          const socSampled: number[] = [];
          const chargeSampled: number[] = [];
          const dischargeSampled: number[] = [];
          const tsSampled: string[] = [];
          for (let i = 0; i < n; i += step) {
            socSampled.push(Math.round(lpResult.soc[i] * 100) / 100);
            chargeSampled.push(Math.round(lpResult.charge[i] * 1000) / 1000);
            dischargeSampled.push(Math.round(lpResult.discharge[i] * 1000) / 1000);
            tsSampled.push(timestamps[i]);
          }

          batteryMeta = {
            status: lpResult.status,
            capacityKwh: batteryCapacity,
            maxKw: batteryMaxKw,
            efficiency: batteryEff,
            peakBefore: Math.round(lpResult.peakKwBefore * 100) / 100,
            peakAfter: Math.round(lpResult.peakKwAfter * 100) / 100,
            peakReductionKw: Math.round((lpResult.peakKwBefore - lpResult.peakKwAfter) * 100) / 100,
            totalGridKwh: Math.round(lpResult.totalGridKwh * 10) / 10,
            solveTimeMs: lpResult.solveTimeMs,
            numVars: lpResult.numVars,
            numConstraints: lpResult.numConstraints,
            costWithoutBattery,
            // Time-series for SoC chart
            soc: socSampled,
            charge: chargeSampled,
            discharge: dischargeSampled,
            timestamps: tsSampled,
            sampleStep: step,
          };
        } else {
          batteryMeta = { status: lpResult.status, error: "LP solver did not find optimal" };
        }
      } catch (e: any) {
        batteryMeta = { status: "error", error: e.message };
      }
    }

    // ─── 6. Calculate tariff ────────────────────────────────────────────

    const result = calculateTariff({
      loadKwh: finalLoad,
      spotPriceSekPerKwh: prices,
      timestamps,
      resolution,
      period: period as Period,
      tariff: tariffConfig,
    });

    // ─── 7. Return ──────────────────────────────────────────────────────

    return NextResponse.json({
      // Tariff result
      totalCost: Math.round(result.totalCost * 100) / 100,
      spotCost: Math.round(result.spotCost * 100) / 100,
      energyFee: Math.round(result.energyFee * 100) / 100,
      effectFee: Math.round(result.effectFee * 100) / 100,
      fixedFee: Math.round(result.fixedFee * 100) / 100,
      tax: Math.round(result.tax * 100) / 100,
      vat: Math.round(result.vat * 100) / 100,
      totalKwh: Math.round(result.totalKwh * 10) / 10,
      peakKw: Math.round(result.peakKw * 100) / 100,
      avgCostOrePerKwh: Math.round(result.avgCostOrePerKwh * 10) / 10,
      monthlyPeaks: result.monthlyPeaks,

      // Battery (null if not configured)
      battery: batteryMeta,

      // Metadata
      meta: {
        zone: zone.toUpperCase(),
        period,
        start,
        end,
        annualKwh,
        fuse,
        tariff,
        resolution,
        spotPoints: prices.length,
        eurSek,
        loadProfile: loadProfileParam ?? (has_heat_pump ? "heatpump" : "standard"),
        tariffVerified: false,  // TODO: read from TariffProfile
      },
    });

  } catch (err: any) {
    console.error("simulate error:", err);
    return NextResponse.json(
      { error: "Simulation failed", detail: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
