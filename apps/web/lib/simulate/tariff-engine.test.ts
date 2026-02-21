/**
 * tariff-engine.test.ts — Verifikation av effekttariff-beräkning
 *
 * Test: 30 dagar, konstant 10 kWh/timme, top3 rule, effectRate = 100 kr/kW
 *
 * Förväntat:
 *   Peak = 10 kW (alla timmar lika → top3 avg = 10)
 *   Effektavgift = 10 × 100 = 1000 kr (1 månad)
 *   Spotcost = 720h × 10 kWh × 0.50 SEK/kWh = 3600 kr
 *   Energiavgift = 7200 kWh × 28 öre / 100 = 2016 kr
 *   Skatt = 7200 × 36 öre / 100 = 2592 kr
 *   Fast = 450 kr
 *   Subtotal = 3600 + 2016 + 1000 + 450 + 2592 = 9658 kr
 *   Moms = 9658 × 0.25 = 2414.50
 *   Totalt = 12072.50 kr
 */

import { calculateTariff, TariffConfig, TariffInput } from "./tariff-engine";

function generateConstantMonth(): {
  loadKwh: number[];
  spotPriceSekPerKwh: number[];
  timestamps: string[];
} {
  const loadKwh: number[] = [];
  const spotPriceSekPerKwh: number[] = [];
  const timestamps: string[] = [];

  // 28 dagar × 24 timmar = 672 intervall (PT60M) — ren februari
  for (let d = 0; d < 28; d++) {
    for (let h = 0; h < 24; h++) {
      const date = new Date(Date.UTC(2026, 1, d + 1, h, 0, 0)); // feb 2026
      timestamps.push(date.toISOString());
      loadKwh.push(10);            // 10 kWh per timme = 10 kW konstant
      spotPriceSekPerKwh.push(0.50); // 50 öre/kWh = 0.50 SEK/kWh
    }
  }

  return { loadKwh, spotPriceSekPerKwh, timestamps };
}

function runTest() {
  const { loadKwh, spotPriceSekPerKwh, timestamps } = generateConstantMonth();

  const tariff: TariffConfig = {
    effectRule: "top3_hourly_avg",
    effectRateKrPerKw: 100,
    energyRateOrePerKwh: 28,
    taxOrePerKwh: 36,
    fixedMonthlyKr: 450,
    vatRate: 0.25,
  };

  const input: TariffInput = {
    loadKwh,
    spotPriceSekPerKwh,
    timestamps,
    resolution: "PT60M",
    period: "month",
    tariff,
  };

  const result = calculateTariff(input);

  const totalKwh = 672 * 10;         // 6720
  const spotCost = 6720 * 0.50;      // 3360
  const energyFee = 6720 * 0.28;     // 1881.60
  const effectFee = 10 * 100;        // 1000 (1 månad)
  const fixedFee = 450;
  const tax = 6720 * 0.36;           // 2419.20
  const subtotal = spotCost + energyFee + effectFee + fixedFee + tax;
  const vat = subtotal * 0.25;
  const total = subtotal + vat;

  console.log("═══ TARIFF ENGINE TEST ═══");
  console.log("");
  console.log("Input: 28 dagar (feb), 10 kWh/h konstant, spot 50 öre/kWh, top3 rule");
  console.log("");

  const checks = [
    { name: "totalKwh",   got: result.totalKwh,   expected: totalKwh },
    { name: "spotCost",   got: result.spotCost,    expected: spotCost },
    { name: "energyFee",  got: result.energyFee,   expected: energyFee },
    { name: "effectFee",  got: result.effectFee,    expected: effectFee },
    { name: "fixedFee",   got: result.fixedFee,     expected: fixedFee },
    { name: "tax",        got: result.tax,          expected: tax },
    { name: "vat",        got: result.vat,          expected: vat },
    { name: "totalCost",  got: result.totalCost,    expected: total },
    { name: "peakKw",     got: result.peakKw,       expected: 10 },
  ];

  let pass = true;
  for (const c of checks) {
    const ok = Math.abs(c.got - c.expected) < 0.01;
    const icon = ok ? "✓" : "✗";
    console.log(`  ${icon} ${c.name.padEnd(12)} got: ${c.got.toFixed(2).padStart(10)}  expected: ${c.expected.toFixed(2).padStart(10)}`);
    if (!ok) pass = false;
  }

  console.log("");
  console.log(`  Monthly peaks: ${result.monthlyPeaks.map(m => `${m.month}=${m.peakKw.toFixed(1)}kW`).join(", ")}`);
  console.log(`  Avg cost: ${result.avgCostOrePerKwh.toFixed(1)} öre/kWh`);
  console.log("");
  console.log(pass ? "══ ALL TESTS PASSED ══" : "══ TESTS FAILED ══");

  return pass;
}

// ─── Test 2: PT15M resolution ────────────────────────────────────────────────

function runTestPT15M() {
  const loadKwh: number[] = [];
  const spotPriceSekPerKwh: number[] = [];
  const timestamps: string[] = [];

  // 28 dagar × 96 intervall = 2688 (PT15M)
  for (let d = 0; d < 28; d++) {
    for (let q = 0; q < 96; q++) {
      const h = Math.floor(q / 4);
      const m = (q % 4) * 15;
      const date = new Date(Date.UTC(2026, 1, d + 1, h, m, 0));
      timestamps.push(date.toISOString());
      loadKwh.push(2.5);            // 2.5 kWh per 15-min × 4 = 10 kWh/h = 10 kW
      spotPriceSekPerKwh.push(0.50);
    }
  }

  const tariff: TariffConfig = {
    effectRule: "top3_hourly_avg",
    effectRateKrPerKw: 100,
    energyRateOrePerKwh: 28,
    taxOrePerKwh: 36,
    fixedMonthlyKr: 450,
    vatRate: 0.25,
  };

  const result = calculateTariff({
    loadKwh, spotPriceSekPerKwh, timestamps,
    resolution: "PT15M", period: "month", tariff,
  });

  console.log("");
  console.log("═══ PT15M TEST ═══");
  console.log(`  Peak: ${result.peakKw.toFixed(1)} kW (expected 10.0)`);
  const expectedTotal = ((6720*0.50) + (6720*0.28) + 1000 + 450 + (6720*0.36)) * 1.25;
  console.log(`  Total: ${result.totalCost.toFixed(2)} kr (expected ${expectedTotal.toFixed(2)})`);
  console.log(`  Effect: ${result.effectFee.toFixed(2)} kr (expected 1000.00)`);

  const ok = Math.abs(result.totalCost - expectedTotal) < 0.01 && Math.abs(result.peakKw - 10) < 0.01;
  console.log(ok ? "══ PT15M PASSED ══" : "══ PT15M FAILED ══");
  return ok;
}

// ─── Test 3: Dag-period (pedagogisk, ingen effektdebitering) ─────────────────

function runTestDay() {
  const loadKwh: number[] = [];
  const spotPriceSekPerKwh: number[] = [];
  const timestamps: string[] = [];

  // 1 dag, 96 intervall PT15M
  for (let q = 0; q < 96; q++) {
    const h = Math.floor(q / 4);
    const m = (q % 4) * 15;
    const date = new Date(Date.UTC(2026, 1, 15, h, m, 0));
    timestamps.push(date.toISOString());
    loadKwh.push(2.5);
    spotPriceSekPerKwh.push(0.50);
  }

  const tariff: TariffConfig = {
    effectRule: "top3_hourly_avg",
    effectRateKrPerKw: 100,
    energyRateOrePerKwh: 28,
    taxOrePerKwh: 36,
    fixedMonthlyKr: 450,
    vatRate: 0.25,
  };

  const result = calculateTariff({
    loadKwh, spotPriceSekPerKwh, timestamps,
    resolution: "PT15M", period: "day", tariff,
  });

  console.log("");
  console.log("═══ DAY PERIOD TEST ═══");
  console.log(`  effectFee: ${result.effectFee} (expected 0)`);
  console.log(`  fixedFee: ${result.fixedFee} (expected 0)`);
  console.log(`  peakKw: ${result.peakKw.toFixed(1)} (shown but not charged)`);

  const ok = result.effectFee === 0 && result.fixedFee === 0 && Math.abs(result.peakKw - 10) < 0.01;
  console.log(ok ? "══ DAY PASSED ══" : "══ DAY FAILED ══");
  return ok;
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const t1 = runTest();
const t2 = runTestPT15M();
const t3 = runTestDay();

console.log("");
console.log("════════════════════════");
console.log(t1 && t2 && t3 ? "ALL 3 TESTS PASSED ✓" : "SOME TESTS FAILED ✗");
