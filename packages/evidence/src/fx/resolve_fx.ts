/**
 * ECB FX Resolver — Deterministic EUR/SEK conversion
 *
 * Rules:
 * - Uses locked ECB monthly averages only
 * - No live API calls
 * - No fallback — missing month = hard error
 * - FX rate is locked to report period start month
 * - Presentation layer only — never affects dataset or query hash
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { createHash } from "crypto";
const FX_FILE = resolve(__dirname, "ecb_eur_sek_monthly.json");

let _cache: { data: Record<string, number>; hash: string } | null = null;

function loadFxData(): { data: Record<string, number>; hash: string } {
  if (_cache) return _cache;
  const raw = readFileSync(FX_FILE, "utf-8");
  const hash = createHash("sha256").update(raw).digest("hex");
  const parsed = JSON.parse(raw);
  _cache = { data: parsed.data, hash };
  return _cache;
}

export interface FxResult {
  fx_rate: number;
  fx_period: string;
  fx_source: string;
  fx_file_hash: string;
}

/**
 * Resolve EUR/SEK rate for a given report period.
 * Uses the start month of the period.
 * Throws if month not found — no silent fallback.
 */
export function resolveFxRate(periodStart: string, _periodEnd?: string): FxResult {
  const { data, hash } = loadFxData();

  // Extract YYYY-MM from periodStart (handles "2024-01-01" and "2024-01")
  const match = periodStart.match(/^(\d{4}-\d{2})/);
  if (!match) {
    throw new Error(`[FX] Cannot parse period: ${periodStart}. Expected YYYY-MM or YYYY-MM-DD.`);
  }

  const period = match[1];
  const rate = data[period];

  if (rate === undefined) {
    throw new Error(
      `[FX] No ECB EUR/SEK rate for ${period}. ` +
      `Available range: ${Object.keys(data)[0]} to ${Object.keys(data).pop()}. ` +
      `Update ecb_eur_sek_monthly.json to add new months.`
    );
  }

  return {
    fx_rate: rate,
    fx_period: period,
    fx_source: "ECB Monthly Average",
    fx_file_hash: hash,
  };
}

/**
 * Convert EUR/MWh to SEK/kWh using locked ECB rate.
 * Formula: (EUR/MWh × fx_rate) ÷ 1000 = SEK/kWh
 */
export function eurMwhToSekKwh(eurMwh: number, fxRate: number): number {
  return (eurMwh * fxRate) / 1000;
}

/**
 * Get SHA256 hash of the FX data file.
 */
export function getFxFileHash(): string {
  return loadFxData().hash;
}
