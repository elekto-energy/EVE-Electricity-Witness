/**
 * tariffs.ts — Nätbolags-tariffkonfigurationer
 *
 * Alla värden är PLACEHOLDER tills verifierade mot prisblad.
 * Strukturen är generisk: fler nätbolag läggs till utan kodändring.
 *
 * Källa: Ska verifieras mot respektive nätbolags prisblad.
 * Status: UNVERIFIED — markerade med kommentar.
 */

import { TariffConfig, EffectRule } from "./tariff-engine";

export interface TariffProfile {
  name: string;
  region: string;
  operator: string;
  verified: boolean;          // false = placeholder, true = verifierat mot prisblad
  verifiedDate?: string;      // YYYY-MM-DD
  sourceUrl?: string;         // länk till prisblad
  fuses: Record<string, TariffConfig>;
}

/**
 * PLACEHOLDER — Vattenfall Eldistribution, Stockholm
 * Effekttariff 16-63A, steg 2 (höst 2026)
 * ALLA SIFFROR ÄR OBEKRÄFTADE — kräver verifiering mot prisblad.
 */
const vattenfall_stockholm: TariffProfile = {
  name: "Vattenfall Stockholm",
  region: "SE3",
  operator: "Vattenfall Eldistribution",
  verified: false,
  fuses: {
    "16A": {
      effectRule: "top3_hourly_avg",
      effectRateKrPerKw: 75,        // UNVERIFIED
      energyRateOrePerKwh: 28,      // UNVERIFIED
      taxOrePerKwh: 36,             // Energiskatt 2026: verifieras mot SKV
      fixedMonthlyKr: 450,          // UNVERIFIED
      vatRate: 0.25,
    },
    "20A": {
      effectRule: "top3_hourly_avg",
      effectRateKrPerKw: 75,
      energyRateOrePerKwh: 28,
      taxOrePerKwh: 36,
      fixedMonthlyKr: 520,          // UNVERIFIED
      vatRate: 0.25,
    },
    "25A": {
      effectRule: "top3_hourly_avg",
      effectRateKrPerKw: 75,
      energyRateOrePerKwh: 28,
      taxOrePerKwh: 36,
      fixedMonthlyKr: 620,          // UNVERIFIED
      vatRate: 0.25,
    },
    "35A": {
      effectRule: "top3_hourly_avg",
      effectRateKrPerKw: 75,
      energyRateOrePerKwh: 28,
      taxOrePerKwh: 36,
      fixedMonthlyKr: 780,          // UNVERIFIED
      vatRate: 0.25,
    },
  },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

const tariffs: Record<string, TariffProfile> = {
  vattenfall_stockholm,
};

export default tariffs;

/**
 * Hämta TariffConfig för nätbolag + säkring.
 * Returnerar null om kombination saknas.
 */
export function getTariffConfig(
  tariffId: string,
  fuse: string
): TariffConfig | null {
  const profile = tariffs[tariffId];
  if (!profile) return null;
  return profile.fuses[fuse] ?? null;
}

/**
 * Lista tillgängliga tariff-profiler.
 */
export function listTariffs(): Array<{
  id: string;
  name: string;
  region: string;
  verified: boolean;
  fuses: string[];
}> {
  return Object.entries(tariffs).map(([id, p]) => ({
    id,
    name: p.name,
    region: p.region,
    verified: p.verified,
    fuses: Object.keys(p.fuses),
  }));
}
