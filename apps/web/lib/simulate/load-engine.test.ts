/**
 * load-engine.test.ts — Verifikation av lastprofil-generator
 *
 * Test 1: 28 dagar PT60M, 20000 kWh/år, villa med VP
 *   Förväntat: ~1534 kWh total (20000 × 28/365)
 *   Förväntat: peak > 0, profil ej flat
 *
 * Test 2: Samma med PT15M → 4× fler intervall, samma totalenergi
 *
 * Test 3: Integration — load-engine → tariff-engine
 */

import { generateLoadProfile } from "./load-engine";
import { calculateTariff, TariffConfig } from "./tariff-engine";

function test1_PT60M() {
  const timestamps: string[] = [];
  for (let d = 0; d < 28; d++) {
    for (let h = 0; h < 24; h++) {
      timestamps.push(new Date(Date.UTC(2026, 1, d + 1, h, 0, 0)).toISOString());
    }
  }

  const profile = generateLoadProfile({
    annualKwh: 20000,
    timestamps,
    resolution: "PT60M",
    hasHeatPump: true,
    hasEV: false,
  });

  const expectedKwh = 20000 * (28 / 365);

  console.log("═══ LOAD ENGINE: PT60M ═══");
  console.log(`  Intervals: ${profile.loadKwh.length} (expected ${28 * 24})`);
  console.log(`  Total kWh: ${profile.totalKwh.toFixed(1)} (expected ~${expectedKwh.toFixed(1)})`);
  console.log(`  Peak kW:   ${profile.peakKw.toFixed(2)}`);

  // Verifiera: morgon > natt
  const nightAvg = profile.loadKwh.filter((_, i) => {
    const h = new Date(timestamps[i]).getUTCHours();
    return h >= 1 && h <= 4;
  });
  const eveningAvg = profile.loadKwh.filter((_, i) => {
    const h = new Date(timestamps[i]).getUTCHours();
    return h >= 17 && h <= 20;
  });
  const nightMean = nightAvg.reduce((s, v) => s + v, 0) / nightAvg.length;
  const eveningMean = eveningAvg.reduce((s, v) => s + v, 0) / eveningAvg.length;

  console.log(`  Night avg:   ${nightMean.toFixed(4)} kWh/h`);
  console.log(`  Evening avg: ${eveningMean.toFixed(4)} kWh/h`);
  console.log(`  Evening/Night ratio: ${(eveningMean / nightMean).toFixed(1)}x`);

  const ok =
    profile.loadKwh.length === 28 * 24 &&
    Math.abs(profile.totalKwh - expectedKwh) < 5 &&
    profile.peakKw > 0 &&
    eveningMean > nightMean;

  console.log(ok ? "══ PT60M PASSED ══" : "══ PT60M FAILED ══");
  return ok;
}

function test2_PT15M() {
  const timestamps: string[] = [];
  for (let d = 0; d < 28; d++) {
    for (let q = 0; q < 96; q++) {
      const h = Math.floor(q / 4);
      const m = (q % 4) * 15;
      timestamps.push(new Date(Date.UTC(2026, 1, d + 1, h, m, 0)).toISOString());
    }
  }

  const profile = generateLoadProfile({
    annualKwh: 20000,
    timestamps,
    resolution: "PT15M",
    hasHeatPump: true,
  });

  const expectedKwh = 20000 * (28 / 365);

  console.log("");
  console.log("═══ LOAD ENGINE: PT15M ═══");
  console.log(`  Intervals: ${profile.loadKwh.length} (expected ${28 * 96})`);
  console.log(`  Total kWh: ${profile.totalKwh.toFixed(1)} (expected ~${expectedKwh.toFixed(1)})`);
  console.log(`  Peak kW:   ${profile.peakKw.toFixed(2)}`);

  const ok =
    profile.loadKwh.length === 28 * 96 &&
    Math.abs(profile.totalKwh - expectedKwh) < 1;

  console.log(ok ? "══ PT15M PASSED ══" : "══ PT15M FAILED ══");
  return ok;
}

function test3_integration() {
  // Generera timestamps
  const timestamps: string[] = [];
  for (let d = 0; d < 28; d++) {
    for (let h = 0; h < 24; h++) {
      timestamps.push(new Date(Date.UTC(2026, 1, d + 1, h, 0, 0)).toISOString());
    }
  }

  // Generera lastprofil
  const profile = generateLoadProfile({
    annualKwh: 20000,
    timestamps,
    resolution: "PT60M",
    hasHeatPump: true,
  });

  // Generera mock spotpriser — varierar under dygnet
  const spotPriceSekPerKwh = timestamps.map(ts => {
    const h = new Date(ts).getUTCHours();
    // Billigare natt, dyrare dag
    if (h >= 0 && h < 6) return 0.20;
    if (h >= 6 && h < 9) return 0.80;
    if (h >= 9 && h < 17) return 0.50;
    if (h >= 17 && h < 21) return 1.00;
    return 0.40;
  });

  const tariff: TariffConfig = {
    effectRule: "top3_hourly_avg",
    effectRateKrPerKw: 75,
    energyRateOrePerKwh: 28,
    taxOrePerKwh: 36,
    fixedMonthlyKr: 450,
    vatRate: 0.25,
  };

  const result = calculateTariff({
    loadKwh: profile.loadKwh,
    spotPriceSekPerKwh,
    timestamps,
    resolution: "PT60M",
    period: "month",
    tariff,
  });

  console.log("");
  console.log("═══ INTEGRATION: load → tariff ═══");
  console.log(`  Total kWh:    ${result.totalKwh.toFixed(1)}`);
  console.log(`  Spot cost:    ${result.spotCost.toFixed(0)} kr`);
  console.log(`  Energy fee:   ${result.energyFee.toFixed(0)} kr`);
  console.log(`  Effect fee:   ${result.effectFee.toFixed(0)} kr`);
  console.log(`  Tax:          ${result.tax.toFixed(0)} kr`);
  console.log(`  VAT:          ${result.vat.toFixed(0)} kr`);
  console.log(`  Total:        ${result.totalCost.toFixed(0)} kr`);
  console.log(`  Avg cost:     ${result.avgCostOrePerKwh.toFixed(1)} öre/kWh`);
  console.log(`  Peak kW:      ${result.peakKw.toFixed(2)}`);
  console.log(`  Monthly peaks: ${result.monthlyPeaks.map(m => `${m.month}=${m.peakKw.toFixed(2)}kW`).join(", ")}`);

  // Sanity checks
  const ok =
    result.totalCost > 0 &&
    result.totalKwh > 1000 &&
    result.peakKw > 0 &&
    result.avgCostOrePerKwh > 100 && result.avgCostOrePerKwh < 400 &&
    result.monthlyPeaks.length === 1;

  console.log(ok ? "══ INTEGRATION PASSED ══" : "══ INTEGRATION FAILED ══");
  return ok;
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const t1 = test1_PT60M();
const t2 = test2_PT15M();
const t3 = test3_integration();

console.log("");
console.log("════════════════════════");
console.log(t1 && t2 && t3 ? "ALL 3 LOAD TESTS PASSED ✓" : "SOME TESTS FAILED ✗");
