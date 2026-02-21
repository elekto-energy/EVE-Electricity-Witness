/**
 * tariff-registry.ts — Client-side tariff config
 *
 * Single source of truth for tariff values used in:
 *   - Hero "Elpris inkl avgifter" 
 *   - SimulatePanel result cards
 *   - /api/simulate (server-side has its own copy in lib/simulate/tariffs.ts)
 *
 * These MUST stay in sync with lib/simulate/tariffs.ts.
 * Values are UNVERIFIED until confirmed against official price sheets.
 */

export interface ClientTariffConfig {
  /** Nät rörlig avgift, öre/kWh (exkl moms) */
  energyRateOrePerKwh: number;
  /** Energiskatt, öre/kWh (exkl moms) */
  taxOrePerKwh: number;
  /** Moms-multiplikator (1.25 = 25%) */
  vatMultiplier: number;
  /** Effektavgift kr/kW/månad (exkl moms) */
  effectRateKrPerKw: number;
  /** Fast månadsavgift kr (exkl moms) */
  fixedMonthlyKr: number;
  /** Verified against official price sheet */
  verified: boolean;
}

export interface ClientTariffProfile {
  id: string;
  name: string;
  region: string;
  fuses: Record<string, ClientTariffConfig>;
}

const PROFILES: ClientTariffProfile[] = [
  {
    id: "vattenfall_stockholm",
    name: "Vattenfall Stockholm",
    region: "SE3",
    fuses: {
      "16A": {
        energyRateOrePerKwh: 28,
        taxOrePerKwh: 36,
        vatMultiplier: 1.25,
        effectRateKrPerKw: 75,
        fixedMonthlyKr: 450,
        verified: false,
      },
      "20A": {
        energyRateOrePerKwh: 28,
        taxOrePerKwh: 36,
        vatMultiplier: 1.25,
        effectRateKrPerKw: 75,
        fixedMonthlyKr: 520,
        verified: false,
      },
      "25A": {
        energyRateOrePerKwh: 28,
        taxOrePerKwh: 36,
        vatMultiplier: 1.25,
        effectRateKrPerKw: 75,
        fixedMonthlyKr: 620,
        verified: false,
      },
      "35A": {
        energyRateOrePerKwh: 28,
        taxOrePerKwh: 36,
        vatMultiplier: 1.25,
        effectRateKrPerKw: 75,
        fixedMonthlyKr: 780,
        verified: false,
      },
    },
  },
];

/**
 * Get tariff config for a specific tariff + fuse combo.
 * Returns null if not found.
 */
export function getClientTariff(tariffId: string, fuse: string): ClientTariffConfig | null {
  const profile = PROFILES.find(p => p.id === tariffId);
  if (!profile) return null;
  return profile.fuses[fuse] ?? null;
}

/**
 * List available tariff profiles for UI selects.
 */
export function listClientTariffs(): Array<{ id: string; name: string; region: string; fuses: string[] }> {
  return PROFILES.map(p => ({
    id: p.id,
    name: p.name,
    region: p.region,
    fuses: Object.keys(p.fuses),
  }));
}

/**
 * Calculate "Spot inkl rörliga avgifter" (B-value)
 * 
 * B = (spotOrePerKwh + energyRate + tax) × vatMultiplier
 * 
 * No fixed fee, no effect fee — pure per-kWh comparable cost.
 */
export function calcSpotInklRorligt(spotOrePerKwh: number, cfg: ClientTariffConfig): number {
  return (spotOrePerKwh + cfg.energyRateOrePerKwh + cfg.taxOrePerKwh) * cfg.vatMultiplier;
}
