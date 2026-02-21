/**
 * tariff-engine.ts — Effekttariff-beräkning
 *
 * Helt frikopplad från API, spotkälla, load-engine, UI.
 * Bara matematik + regler.
 *
 * Resolution-agnostisk (PT15M / PT60M)
 * Regelbaserad (top3, top5, max_hour)
 * Period-medveten (dag/vecka = pedagogisk, månad/år = full debitering)
 * Testbar isolerat
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Resolution = "PT15M" | "PT60M";
export type Period = "day" | "week" | "month" | "year";

export type EffectRule =
  | "max_hour"
  | "top3_hourly_avg"
  | "top5_hourly_avg";

export interface TariffConfig {
  effectRule: EffectRule;
  effectRateKrPerKw: number;     // kr per kW per månad
  energyRateOrePerKwh: number;   // nätavgift rörlig del, öre/kWh
  taxOrePerKwh: number;          // energiskatt, öre/kWh
  fixedMonthlyKr: number;        // fast månadsavgift, kr
  vatRate: number;               // moms, 0.25 = 25%
}

export interface TariffInput {
  loadKwh: number[];             // kWh per intervall (samma längd som spot)
  spotPriceSekPerKwh: number[];  // SEK per kWh per intervall
  timestamps: string[];          // ISO timestamps, samma längd
  resolution: Resolution;
  period: Period;
  tariff: TariffConfig;
}

export interface MonthPeak {
  month: string;                 // "2026-2" etc
  peakKw: number;
  topHours: number[];            // de timmar som ingick i beräkningen
}

export interface TariffResult {
  totalCost: number;             // kr, inkl moms
  spotCost: number;              // kr
  energyFee: number;             // kr (nätavgift rörlig)
  effectFee: number;             // kr (effektavgift)
  fixedFee: number;              // kr (fast avgift)
  tax: number;                   // kr (energiskatt)
  vat: number;                   // kr
  totalKwh: number;
  peakKw: number;                // högsta effekttopp (kW)
  monthlyPeaks: MonthPeak[];
  avgCostOrePerKwh: number;      // totalkostnad / totalKwh, öre/kWh
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Konvertera intervall-kWh till timmedel-kW.
 * PT15M: 4 intervall → 1 timme. kWh per 15-min × 4 = kW timmedel.
 * PT60M: kWh per timme = kW timmedel direkt.
 */
function toHourlyKw(
  loadKwh: number[],
  resolution: Resolution
): number[] {
  if (resolution === "PT60M") {
    // kWh per timme = kW timmedel
    return loadKwh.slice();
  }

  // PT15M → 4 intervall per timme
  const hourly: number[] = [];
  for (let i = 0; i + 3 < loadKwh.length; i += 4) {
    // Summa kWh för 4×15min = kWh per timme = kW timmedel
    const hourKwh = loadKwh[i] + loadKwh[i + 1] + loadKwh[i + 2] + loadKwh[i + 3];
    hourly.push(hourKwh);
  }
  return hourly;
}

/**
 * Gruppera timvärden per månad.
 * Returnerar { "2026-2": number[], ... }
 */
function groupByMonth(
  hourlyKw: number[],
  hourlyTimestamps: string[]
): Record<string, number[]> {
  const groups: Record<string, number[]> = {};

  hourlyKw.forEach((v, i) => {
    const ts = hourlyTimestamps[i];
    if (!ts) return;
    // Använd UTC för konsistens med ENTSO-E timestamps
    const d = new Date(ts);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(v);
  });

  return groups;
}

/**
 * Generera tim-timestamps från intervall-timestamps.
 * PT15M: plocka var 4:e. PT60M: returnera som det är.
 */
function toHourlyTimestamps(
  timestamps: string[],
  resolution: Resolution
): string[] {
  if (resolution === "PT60M") return timestamps.slice();
  const hourly: string[] = [];
  for (let i = 0; i < timestamps.length; i += 4) {
    hourly.push(timestamps[i]);
  }
  return hourly;
}

// ─── Effect fee ───────────────────────────────────────────────────────────────

function calculateEffectFee(
  hourlyKw: number[],
  hourlyTimestamps: string[],
  config: TariffConfig,
  period: Period
): { effectFee: number; peakKw: number; monthlyPeaks: MonthPeak[] } {

  // Dag/Vecka: pedagogiskt läge — visa peak men debitera inte
  if (period === "day" || period === "week") {
    const peak = hourlyKw.length > 0 ? Math.max(...hourlyKw) : 0;
    return { effectFee: 0, peakKw: peak, monthlyPeaks: [] };
  }

  const months = groupByMonth(hourlyKw, hourlyTimestamps);
  const monthlyPeaks: MonthPeak[] = [];
  let totalEffectFee = 0;
  let globalPeak = 0;

  for (const month of Object.keys(months).sort()) {
    const values = months[month];
    const sorted = [...values].sort((a, b) => b - a);

    let peakKw: number;
    let topN: number;

    switch (config.effectRule) {
      case "max_hour":
        topN = 1;
        peakKw = sorted[0] ?? 0;
        break;
      case "top3_hourly_avg":
        topN = Math.min(3, sorted.length);
        peakKw = sorted.slice(0, topN).reduce((s, v) => s + v, 0) / topN;
        break;
      case "top5_hourly_avg":
        topN = Math.min(5, sorted.length);
        peakKw = sorted.slice(0, topN).reduce((s, v) => s + v, 0) / topN;
        break;
    }

    monthlyPeaks.push({
      month,
      peakKw,
      topHours: sorted.slice(0, topN),
    });

    totalEffectFee += peakKw * config.effectRateKrPerKw;
    if (peakKw > globalPeak) globalPeak = peakKw;
  }

  return { effectFee: totalEffectFee, peakKw: globalPeak, monthlyPeaks };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function calculateTariff(input: TariffInput): TariffResult {
  const { loadKwh, spotPriceSekPerKwh, timestamps, resolution, period, tariff } = input;

  // Validering
  if (loadKwh.length !== spotPriceSekPerKwh.length || loadKwh.length !== timestamps.length) {
    throw new Error(
      `Array length mismatch: load=${loadKwh.length}, spot=${spotPriceSekPerKwh.length}, ts=${timestamps.length}`
    );
  }

  // Spotkostnad + nätavgift + totalförbrukning
  let spotCost = 0;
  let energyFee = 0;
  let totalKwh = 0;

  for (let i = 0; i < loadKwh.length; i++) {
    const kwh = loadKwh[i];
    totalKwh += kwh;
    spotCost += kwh * spotPriceSekPerKwh[i];
    energyFee += kwh * (tariff.energyRateOrePerKwh / 100); // öre → kr
  }

  // Effekttariff
  const hourlyKw = toHourlyKw(loadKwh, resolution);
  const hourlyTs = toHourlyTimestamps(timestamps, resolution);

  const { effectFee, peakKw, monthlyPeaks } = calculateEffectFee(
    hourlyKw, hourlyTs, tariff, period
  );

  // Fast avgift
  const fixedFee =
    period === "month" ? tariff.fixedMonthlyKr
    : period === "year" ? tariff.fixedMonthlyKr * 12
    : 0; // dag/vecka: ingen fast

  // Energiskatt
  const tax = totalKwh * (tariff.taxOrePerKwh / 100); // öre → kr

  // Subtotal exkl moms
  const subtotal = spotCost + energyFee + effectFee + fixedFee + tax;

  // Moms
  const vat = subtotal * tariff.vatRate;

  // Totalt
  const totalCost = subtotal + vat;

  return {
    totalCost,
    spotCost,
    energyFee,
    effectFee,
    fixedFee,
    tax,
    vat,
    totalKwh,
    peakKw,
    monthlyPeaks,
    avgCostOrePerKwh: totalKwh > 0 ? (totalCost / totalKwh) * 100 : 0,
  };
}
