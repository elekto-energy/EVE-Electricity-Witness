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

/**
 * PLACEHOLDER — Ellevio, Stockholm/Uppsala
 * Effekttariff 16-63A
 * ALLA SIFFROR ÄR OBEKRÄFTADE.
 */
const ellevio_stockholm: TariffProfile = {
  name: "Ellevio Stockholm",
  region: "SE3",
  operator: "Ellevio",
  verified: false,
  fuses: {
    "16A": { effectRule: "top3_hourly_avg", effectRateKrPerKw: 68, energyRateOrePerKwh: 25, taxOrePerKwh: 36, fixedMonthlyKr: 430, vatRate: 0.25 },
    "20A": { effectRule: "top3_hourly_avg", effectRateKrPerKw: 68, energyRateOrePerKwh: 25, taxOrePerKwh: 36, fixedMonthlyKr: 490, vatRate: 0.25 },
    "25A": { effectRule: "top3_hourly_avg", effectRateKrPerKw: 68, energyRateOrePerKwh: 25, taxOrePerKwh: 36, fixedMonthlyKr: 590, vatRate: 0.25 },
    "35A": { effectRule: "top3_hourly_avg", effectRateKrPerKw: 68, energyRateOrePerKwh: 25, taxOrePerKwh: 36, fixedMonthlyKr: 740, vatRate: 0.25 },
  },
};

/**
 * PLACEHOLDER — E.ON Malmö
 * Effekttariff
 * ALLA SIFFROR ÄR OBEKRÄFTADE.
 */
const eon_malmo: TariffProfile = {
  name: "E.ON Malmö",
  region: "SE4",
  operator: "E.ON Energidistribution",
  verified: false,
  fuses: {
    "16A": { effectRule: "top3_hourly_avg", effectRateKrPerKw: 72, energyRateOrePerKwh: 24, taxOrePerKwh: 36, fixedMonthlyKr: 420, vatRate: 0.25 },
    "20A": { effectRule: "top3_hourly_avg", effectRateKrPerKw: 72, energyRateOrePerKwh: 24, taxOrePerKwh: 36, fixedMonthlyKr: 480, vatRate: 0.25 },
    "25A": { effectRule: "top3_hourly_avg", effectRateKrPerKw: 72, energyRateOrePerKwh: 24, taxOrePerKwh: 36, fixedMonthlyKr: 580, vatRate: 0.25 },
    "35A": { effectRule: "top3_hourly_avg", effectRateKrPerKw: 72, energyRateOrePerKwh: 24, taxOrePerKwh: 36, fixedMonthlyKr: 720, vatRate: 0.25 },
  },
};

/**
 * PLACEHOLDER — Göteborg Energi Nät
 * Effekttariff
 * ALLA SIFFROR ÄR OBEKRÄFTADE.
 */
const goteborg_energi: TariffProfile = {
  name: "Göteborg Energi",
  region: "SE3",
  operator: "Göteborg Energi Nät",
  verified: false,
  fuses: {
    "16A": { effectRule: "top3_hourly_avg", effectRateKrPerKw: 70, energyRateOrePerKwh: 26, taxOrePerKwh: 36, fixedMonthlyKr: 440, vatRate: 0.25 },
    "20A": { effectRule: "top3_hourly_avg", effectRateKrPerKw: 70, energyRateOrePerKwh: 26, taxOrePerKwh: 36, fixedMonthlyKr: 500, vatRate: 0.25 },
    "25A": { effectRule: "top3_hourly_avg", effectRateKrPerKw: 70, energyRateOrePerKwh: 26, taxOrePerKwh: 36, fixedMonthlyKr: 600, vatRate: 0.25 },
    "35A": { effectRule: "top3_hourly_avg", effectRateKrPerKw: 70, energyRateOrePerKwh: 26, taxOrePerKwh: 36, fixedMonthlyKr: 750, vatRate: 0.25 },
  },
};

/**
 * PLACEHOLDER — Jämtkraft, Östersund
 * Effekttariff
 * ALLA SIFFROR ÄR OBEKRÄFTADE.
 */
const jamtkraft: TariffProfile = {
  name: "Jämtkraft",
  region: "SE2",
  operator: "Jämtkraft Elnät",
  verified: false,
  fuses: {
    "16A": { effectRule: "top3_hourly_avg", effectRateKrPerKw: 65, energyRateOrePerKwh: 22, taxOrePerKwh: 36, fixedMonthlyKr: 380, vatRate: 0.25 },
    "20A": { effectRule: "top3_hourly_avg", effectRateKrPerKw: 65, energyRateOrePerKwh: 22, taxOrePerKwh: 36, fixedMonthlyKr: 440, vatRate: 0.25 },
    "25A": { effectRule: "top3_hourly_avg", effectRateKrPerKw: 65, energyRateOrePerKwh: 22, taxOrePerKwh: 36, fixedMonthlyKr: 530, vatRate: 0.25 },
  },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

const tariffs: Record<string, TariffProfile> = {
  vattenfall_stockholm,
  ellevio_stockholm,
  eon_malmo,
  goteborg_energi,
  jamtkraft,
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
