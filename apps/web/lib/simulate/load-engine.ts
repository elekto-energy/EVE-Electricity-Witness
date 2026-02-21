/**
 * load-engine.ts — Syntetisk lastprofil-generator
 *
 * Genererar 15-min (eller tim-) lastprofil baserat på:
 * - Årsförbrukning (kWh/år)
 * - Säsong (vinter/sommar via månad)
 * - Dygnsprofil (morgon/kväll-toppar)
 * - Temperaturkorrelation (värmepump-faktor)
 *
 * Designad för att generera exakt samma antal punkter som spot-arrayen.
 * Ingen extern datakälla — ren matematik.
 *
 * Framtida: CSV-import, HAN/P1-data.
 */

import { Resolution } from "./resolution-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LoadProfile {
  loadKwh: number[];       // kWh per intervall
  timestamps: string[];    // ISO timestamps
  resolution: Resolution;
  totalKwh: number;
  peakKw: number;
}

export interface LoadInput {
  annualKwh: number;           // Årsförbrukning, t.ex. 20000
  timestamps: string[];        // Ska matcha spot-arrayens timestamps exakt
  resolution: Resolution;
  fuseAmps?: number;           // Säkring, default 20A (3-fas)
  hasHeatPump?: boolean;       // Värmepump → mer vinterlast
  hasEV?: boolean;             // Elbil → kvällsladdning
  tempCelsius?: number[];      // Temperatur per intervall (optional, future)
}

// ─── Seasonal factors ─────────────────────────────────────────────────────────

/**
 * Månadsfördelning av årsförbrukning.
 * Källa: typisk svensk villa med värmepump.
 * Jan=toppförbrukning, Jul=lägst.
 */
const MONTH_WEIGHT_HEATPUMP: Record<number, number> = {
  0: 0.135,  // jan
  1: 0.125,  // feb
  2: 0.110,  // mar
  3: 0.090,  // apr
  4: 0.065,  // maj
  5: 0.045,  // jun
  6: 0.035,  // jul
  7: 0.035,  // aug
  8: 0.055,  // sep
  9: 0.085,  // okt
  10: 0.110, // nov
  11: 0.110, // dec
};

/** Utan värmepump — jämnare fördelning */
const MONTH_WEIGHT_STANDARD: Record<number, number> = {
  0: 0.095,  1: 0.090, 2: 0.088, 3: 0.082,
  4: 0.078,  5: 0.072, 6: 0.068, 7: 0.068,
  8: 0.075,  9: 0.085, 10: 0.092, 11: 0.095,
};

// ─── Hourly profile ───────────────────────────────────────────────────────────

/**
 * Timfördelning inom dygnet (0-23).
 * Normaliserad shape — skalas med dagsförbrukning.
 * Villa med VP: hög morgon (06-08), hög kväll (17-21), låg natt.
 */
const HOUR_SHAPE: number[] = [
  0.020, 0.018, 0.016, 0.016,  // 00-03: natt (låg)
  0.018, 0.025, 0.055, 0.065,  // 04-07: morgon start
  0.060, 0.048, 0.042, 0.040,  // 08-11: förmiddag
  0.042, 0.044, 0.042, 0.040,  // 12-15: eftermiddag
  0.048, 0.065, 0.072, 0.068,  // 16-19: kvällstopp
  0.058, 0.048, 0.035, 0.025,  // 20-23: kväll → natt
];

/** Med elbil: extra laddning 22-06 */
const HOUR_SHAPE_EV: number[] = [
  0.035, 0.035, 0.032, 0.030,  // 00-03: nattladdning
  0.028, 0.025, 0.050, 0.060,  // 04-07
  0.055, 0.045, 0.040, 0.038,  // 08-11
  0.040, 0.042, 0.040, 0.038,  // 12-15
  0.045, 0.060, 0.065, 0.062,  // 16-19
  0.052, 0.042, 0.038, 0.035,  // 20-23: börjar ladda
];

// ─── Generator ────────────────────────────────────────────────────────────────

/**
 * Generera lastprofil som matchar timestamps exakt.
 * Antal output-punkter = timestamps.length.
 */
export function generateLoadProfile(input: LoadInput): LoadProfile {
  const {
    annualKwh,
    timestamps,
    resolution,
    hasHeatPump = true,
    hasEV = false,
  } = input;

  const monthWeights = hasHeatPump ? MONTH_WEIGHT_HEATPUMP : MONTH_WEIGHT_STANDARD;
  const hourShape = hasEV ? HOUR_SHAPE_EV : HOUR_SHAPE;

  // Normalisera hourShape
  const hourSum = hourShape.reduce((s, v) => s + v, 0);
  const hourNorm = hourShape.map(v => v / hourSum);

  const intervalsPerHour = resolution === "PT15M" ? 4 : 1;

  // Räkna ut hur många intervall per månad vi har i timestamps
  const monthIntervalCount: Record<string, number> = {};
  const parsedDates = timestamps.map(ts => new Date(ts));

  for (const d of parsedDates) {
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    monthIntervalCount[key] = (monthIntervalCount[key] ?? 0) + 1;
  }

  // Beräkna total dagar i datasetet
  const firstTs = parsedDates[0];
  const lastTs = parsedDates[parsedDates.length - 1];
  const spanMs = lastTs.getTime() - firstTs.getTime();
  const spanDays = Math.max(1, spanMs / 86_400_000);

  // Skala årsförbrukning till periodens längd
  const periodKwh = annualKwh * (spanDays / 365);

  // Fördela periodKwh proportionellt per intervall
  const loadKwh: number[] = new Array(timestamps.length);

  // Steg 1: beräkna rå vikt per intervall (månad × timme)
  let totalWeight = 0;
  const weights: number[] = new Array(timestamps.length);

  for (let i = 0; i < timestamps.length; i++) {
    const d = parsedDates[i];
    const month = d.getUTCMonth();
    const hour = d.getUTCHours();

    const mw = monthWeights[month] ?? (1 / 12);
    const hw = hourNorm[hour];

    // Vikt = månadsandel × timandel
    weights[i] = mw * hw;
    totalWeight += weights[i];
  }

  // Steg 2: normalisera till periodKwh
  let actualTotal = 0;
  let peakKw = 0;
  const kwhToKw = resolution === "PT15M" ? 4 : 1; // kWh per intervall → kW

  for (let i = 0; i < timestamps.length; i++) {
    const kwh = (weights[i] / totalWeight) * periodKwh;
    loadKwh[i] = kwh;
    actualTotal += kwh;

    const kw = kwh * kwhToKw;
    if (kw > peakKw) peakKw = kw;
  }

  return {
    loadKwh,
    timestamps,
    resolution,
    totalKwh: actualTotal,
    peakKw,
  };
}
