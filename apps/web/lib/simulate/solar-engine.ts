/**
 * solar-engine.ts — Solproduktionsprofil
 *
 * Genererar syntetisk solproduktion per timme baserat på:
 * - Installerad kapacitet (kWp)
 * - Takriktning/lutning (schablon per orientering)
 * - Månatlig PVGIS-baserad produktion för Stockholm (SE3)
 * - Dygnsprofil (solens bana, max kring 12-13)
 *
 * Returnerar samma antal datapunkter som spotpris-arrayen.
 *
 * ⚠ Schablon — inte PVGIS API-anrop. Tillräckligt för simulering.
 */

import { Resolution } from "./resolution-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SolarOrientation = "south_30" | "south_45" | "east_west" | "flat";

export interface SolarInput {
  kWp: number;                  // Total installerad effekt
  orientation: SolarOrientation;
  timestamps: string[];         // Matchar spotpris-array
  resolution: Resolution;
}

export interface SolarOutput {
  productionKwh: number[];     // kWh per intervall (samma längd som timestamps)
  totalKwh: number;            // Total produktion i perioden
  monthlyKwh: number[];        // Aggregerad per månad (1-12)
}

// ─── Monthly kWh per kWp ──────────────────────────────────────────────────────
// Stockholm (SE3), typical values from PVGIS

const MONTHLY_KWH_PER_KWP: Record<SolarOrientation, number[]> = {
  south_30:  [15, 35, 75, 110, 135, 140, 135, 110, 70, 35, 15, 8],   // 883 kWh/kWp/år
  south_45:  [13, 32, 72, 105, 128, 132, 128, 105, 65, 32, 13, 7],   // 832
  east_west: [11, 28, 62,  95, 120, 125, 120,  95, 58, 28, 11, 6],   // 759
  flat:      [10, 25, 58,  88, 115, 120, 115,  88, 55, 25, 10, 5],   // 714
};

// ─── Daylight hours per month (Stockholm) ─────────────────────────────────────
// Approximate sunrise/sunset → solar production window

const DAYLIGHT: { sunrise: number; sunset: number }[] = [
  { sunrise: 9,  sunset: 15 },  // Jan
  { sunrise: 8,  sunset: 16 },  // Feb
  { sunrise: 7,  sunset: 18 },  // Mar
  { sunrise: 6,  sunset: 19 },  // Apr
  { sunrise: 5,  sunset: 21 },  // May
  { sunrise: 4,  sunset: 22 },  // Jun
  { sunrise: 4,  sunset: 22 },  // Jul
  { sunrise: 5,  sunset: 21 },  // Aug
  { sunrise: 7,  sunset: 19 },  // Sep
  { sunrise: 8,  sunset: 17 },  // Oct
  { sunrise: 8,  sunset: 15 },  // Nov
  { sunrise: 9,  sunset: 15 },  // Dec
];

// ─── Generate solar profile ──────────────────────────────────────────────────

export function generateSolarProfile(input: SolarInput): SolarOutput {
  const { kWp, orientation, timestamps, resolution } = input;
  const monthlyKwhPerKwp = MONTHLY_KWH_PER_KWP[orientation];
  const intervalHours = resolution === "PT15M" ? 0.25 : 1.0;

  const productionKwh: number[] = new Array(timestamps.length).fill(0);

  // Count intervals per month (for distributing monthly kWh)
  const monthIntervalCounts = new Array(12).fill(0);
  const monthIndices: number[][] = Array.from({ length: 12 }, () => []);

  for (let i = 0; i < timestamps.length; i++) {
    const d = new Date(timestamps[i]);
    const month = d.getUTCMonth(); // 0-11
    monthIntervalCounts[month]++;
    monthIndices[month].push(i);
  }

  // For each month, distribute production using solar bell curve
  for (let m = 0; m < 12; m++) {
    if (monthIntervalCounts[m] === 0) continue;

    const totalMonthKwh = monthlyKwhPerKwp[m] * kWp;
    const { sunrise, sunset } = DAYLIGHT[m];
    const solarNoon = (sunrise + sunset) / 2;
    const halfDay = (sunset - sunrise) / 2;

    // Build weight per interval based on solar bell curve
    const weights: number[] = [];
    let weightSum = 0;

    for (const idx of monthIndices[m]) {
      const d = new Date(timestamps[idx]);
      const hour = d.getUTCHours() + d.getUTCMinutes() / 60;

      // Solar production: bell curve centered on solar noon
      let w = 0;
      if (hour >= sunrise && hour <= sunset) {
        // Cosine distribution: peaks at noon, zero at sunrise/sunset
        const x = (hour - solarNoon) / halfDay; // -1 to 1
        w = Math.max(0, Math.cos(x * Math.PI / 2)); // cos(0)=1 at noon, cos(π/2)=0 at edges
      }

      weights.push(w);
      weightSum += w;
    }

    // Distribute monthly kWh proportionally
    if (weightSum > 0) {
      for (let j = 0; j < monthIndices[m].length; j++) {
        const idx = monthIndices[m][j];
        productionKwh[idx] = (weights[j] / weightSum) * totalMonthKwh;
      }
    }
  }

  // Aggregate monthly totals
  const monthlyKwh = new Array(12).fill(0);
  for (let i = 0; i < timestamps.length; i++) {
    const m = new Date(timestamps[i]).getUTCMonth();
    monthlyKwh[m] += productionKwh[i];
  }

  const totalKwh = productionKwh.reduce((s, v) => s + v, 0);

  return { productionKwh, totalKwh, monthlyKwh };
}

// ─── Apply solar to load ─────────────────────────────────────────────────────

export interface SolarNetResult {
  /** Nätuttag efter egenförbrukning (kWh per intervall) */
  netGridLoad: number[];
  /** Egenförbrukning = min(sol, last) per intervall */
  selfConsumption: number[];
  /** Överskott sol → nätinmatning (kWh per intervall) */
  gridExport: number[];
  /** Totaler */
  totalSelfConsumptionKwh: number;
  totalGridExportKwh: number;
  totalGridImportKwh: number;
  selfConsumptionRatio: number; // 0-1, andel sol som används direkt
}

/**
 * Beräkna nettolast efter solproduktion.
 * Överskott exporteras till nät (kan sedan gå genom batteri först).
 */
export function applySolarToLoad(
  loadKwh: number[],
  solarKwh: number[]
): SolarNetResult {
  const n = loadKwh.length;
  const netGridLoad: number[] = new Array(n);
  const selfConsumption: number[] = new Array(n);
  const gridExport: number[] = new Array(n);

  let totalSelfConsumption = 0;
  let totalGridExport = 0;
  let totalGridImport = 0;
  let totalSolar = 0;

  for (let i = 0; i < n; i++) {
    const load = loadKwh[i];
    const solar = solarKwh[i];
    totalSolar += solar;

    // Egenförbrukning: min av last och solproduktion
    const selfUse = Math.min(load, solar);
    selfConsumption[i] = selfUse;
    totalSelfConsumption += selfUse;

    // Överskott → nätinmatning
    const excess = Math.max(0, solar - load);
    gridExport[i] = excess;
    totalGridExport += excess;

    // Nätuttag = last - egenförbrukning
    const gridImport = Math.max(0, load - solar);
    netGridLoad[i] = gridImport;
    totalGridImport += gridImport;
  }

  return {
    netGridLoad,
    selfConsumption,
    gridExport,
    totalSelfConsumptionKwh: totalSelfConsumption,
    totalGridExportKwh: totalGridExport,
    totalGridImportKwh: totalGridImport,
    selfConsumptionRatio: totalSolar > 0 ? totalSelfConsumption / totalSolar : 0,
  };
}
