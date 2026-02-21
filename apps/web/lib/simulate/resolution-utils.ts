/**
 * resolution-utils.ts — Hantering av PT15M / PT60M
 *
 * Regel: Ingen interpolation. Ingen gissning.
 * - PT60M → PT15M: expandera (samma pris/värde för alla 4 kvart)
 * - PT15M → PT60M: aggregera (medel för pris, summa för kWh)
 * - Identifiera native resolution per datum (cutoff: 2025-10-01)
 */

export type Resolution = "PT15M" | "PT60M";

/** SDAC 15-min go-live datum */
const PT15M_CUTOFF = "2025-10-01";

/**
 * Bestäm native resolution för ett datum.
 * >= 2025-10-01: PT15M (SDAC 15-min)
 * <  2025-10-01: PT60M
 */
export function nativeResolution(dateStr: string): Resolution {
  return dateStr >= PT15M_CUTOFF ? "PT15M" : "PT60M";
}

/**
 * Expandera PT60M → PT15M.
 * Varje timvärde dupliceras 4 gånger.
 * Timestamps genereras med 15-min intervall.
 *
 * För priser: samma pris per kvart.
 * För kWh: delas med 4 (energi fördelas jämnt).
 */
export function expandToQuarter(
  values: number[],
  timestamps: string[],
  mode: "price" | "energy"
): { values: number[]; timestamps: string[] } {
  const outValues: number[] = [];
  const outTs: string[] = [];
  const divisor = mode === "energy" ? 4 : 1;

  for (let i = 0; i < values.length; i++) {
    const base = new Date(timestamps[i]);
    for (let q = 0; q < 4; q++) {
      outValues.push(values[i] / divisor);
      const t = new Date(base.getTime() + q * 15 * 60_000);
      outTs.push(t.toISOString());
    }
  }

  return { values: outValues, timestamps: outTs };
}

/**
 * Aggregera PT15M → PT60M.
 * Priser: medelvärde per timme.
 * Energi: summa per timme.
 */
export function aggregateToHour(
  values: number[],
  timestamps: string[],
  mode: "price" | "energy"
): { values: number[]; timestamps: string[] } {
  const outValues: number[] = [];
  const outTs: string[] = [];

  for (let i = 0; i + 3 < values.length; i += 4) {
    const chunk = [values[i], values[i + 1], values[i + 2], values[i + 3]];

    if (mode === "energy") {
      outValues.push(chunk.reduce((s, v) => s + v, 0));
    } else {
      outValues.push(chunk.reduce((s, v) => s + v, 0) / 4);
    }

    outTs.push(timestamps[i]);
  }

  return { values: outValues, timestamps: outTs };
}

/**
 * Normalisera spot + load till samma resolution.
 * Om spot och load har olika resolution, konvertera load till spots resolution.
 *
 * Returnerar arrays i samma resolution + längd.
 */
export function alignResolution(
  spotValues: number[],
  spotTimestamps: string[],
  spotResolution: Resolution,
  loadValues: number[],
  loadTimestamps: string[],
  loadResolution: Resolution
): {
  spot: number[];
  load: number[];
  timestamps: string[];
  resolution: Resolution;
} {
  if (spotResolution === loadResolution) {
    // Redan aligned — verifiera längd
    if (spotValues.length !== loadValues.length) {
      throw new Error(
        `Length mismatch: spot=${spotValues.length} load=${loadValues.length} at ${spotResolution}`
      );
    }
    return {
      spot: spotValues,
      load: loadValues,
      timestamps: spotTimestamps,
      resolution: spotResolution,
    };
  }

  // Spot PT15M, Load PT60M → expandera load
  if (spotResolution === "PT15M" && loadResolution === "PT60M") {
    const expanded = expandToQuarter(loadValues, loadTimestamps, "energy");
    if (spotValues.length !== expanded.values.length) {
      throw new Error(
        `Post-expand mismatch: spot=${spotValues.length} load=${expanded.values.length}`
      );
    }
    return {
      spot: spotValues,
      load: expanded.values,
      timestamps: spotTimestamps,
      resolution: "PT15M",
    };
  }

  // Spot PT60M, Load PT15M → aggregera load
  if (spotResolution === "PT60M" && loadResolution === "PT15M") {
    const aggregated = aggregateToHour(loadValues, loadTimestamps, "energy");
    if (spotValues.length !== aggregated.values.length) {
      throw new Error(
        `Post-aggregate mismatch: spot=${spotValues.length} load=${aggregated.values.length}`
      );
    }
    return {
      spot: spotValues,
      load: aggregated.values,
      timestamps: spotTimestamps,
      resolution: "PT60M",
    };
  }

  throw new Error(`Unexpected resolution pair: spot=${spotResolution} load=${loadResolution}`);
}
