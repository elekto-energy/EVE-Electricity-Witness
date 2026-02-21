/**
 * battery-engine-lp.test.ts — Verify LP battery dispatch
 *
 * Run: npx tsx lib/simulate/battery-engine-lp.test.ts
 */

import { optimizeBatteryLP } from "./battery-engine-lp";

async function test() {
  console.log("=== Battery LP Engine Tests ===\n");

  // ─── Test 1: Simple arbitrage (4 hours) ─────────────────────────────
  {
    console.log("Test 1: Simple arbitrage (4 intervals, PT60M)");
    // Prices: low, low, high, high
    // Battery should charge during low, discharge during high
    const result = await optimizeBatteryLP({
      prices: [0.50, 0.50, 2.00, 2.00],  // SEK/kWh
      load: [1.0, 1.0, 1.0, 1.0],        // 1 kWh per hour
      capacityKwh: 2.0,
      maxKw: 2.0,
      efficiency: 1.0,  // Perfect efficiency for easy verification
      intervalHours: 1.0,
      effectRateKrPerKw: 0,  // No peak cost for this test
    });

    console.log(`  Status: ${result.status}`);
    console.log(`  Solve: ${result.solveTimeMs}ms, ${result.numVars} vars, ${result.numConstraints} constraints`);
    console.log(`  Grid:  [${result.adjustedLoad.map(v => v.toFixed(2)).join(", ")}]`);
    console.log(`  SoC:   [${result.soc.map(v => v.toFixed(2)).join(", ")}]`);
    console.log(`  Peak before: ${result.peakKwBefore.toFixed(2)} kW, after: ${result.peakKwAfter.toFixed(2)} kW`);

    // With perfect efficiency and no peak cost:
    // Optimal: charge 2 kWh in intervals 0-1, discharge in intervals 2-3
    // Grid: [3, 1, 0, 0] or similar (total grid cost minimized)
    const totalCostBefore = [0.50, 0.50, 2.00, 2.00].reduce((s, p) => s + p * 1.0, 0); // 5.00
    const totalCostAfter = result.adjustedLoad.reduce((s, v, i) => s + v * [0.50, 0.50, 2.00, 2.00][i], 0);
    console.log(`  Cost before: ${totalCostBefore.toFixed(2)} SEK, after: ${totalCostAfter.toFixed(2)} SEK`);
    console.log(`  Savings: ${(totalCostBefore - totalCostAfter).toFixed(2)} SEK`);

    const ok = result.status === "optimal" && totalCostAfter < totalCostBefore;
    console.log(`  ${ok ? "✅ PASS" : "❌ FAIL"}\n`);
  }

  // ─── Test 2: Peak shaving ───────────────────────────────────────────
  {
    console.log("Test 2: Peak shaving (8 intervals, high effect rate)");
    // Load has a spike at interval 4
    const result = await optimizeBatteryLP({
      prices: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],  // Flat price
      load: [1.0, 1.0, 1.0, 1.0, 5.0, 1.0, 1.0, 1.0],    // Spike at t=4
      capacityKwh: 4.0,
      maxKw: 3.0,
      efficiency: 0.95,
      intervalHours: 1.0,
      effectRateKrPerKw: 100,  // High effect rate → incentivize peak shaving
    });

    console.log(`  Status: ${result.status}`);
    console.log(`  Solve: ${result.solveTimeMs}ms`);
    console.log(`  Grid:  [${result.adjustedLoad.map(v => v.toFixed(2)).join(", ")}]`);
    console.log(`  Peak before: ${result.peakKwBefore.toFixed(2)} kW, after: ${result.peakKwAfter.toFixed(2)} kW`);
    console.log(`  Peak reduction: ${(result.peakKwBefore - result.peakKwAfter).toFixed(2)} kW`);

    const ok = result.status === "optimal" && result.peakKwAfter < result.peakKwBefore;
    console.log(`  ${ok ? "✅ PASS" : "❌ FAIL"}\n`);
  }

  // ─── Test 3: SoC cycle constraint ──────────────────────────────────
  {
    console.log("Test 3: SoC cycle (start = end)");
    const result = await optimizeBatteryLP({
      prices: [0.50, 0.50, 2.00, 2.00, 0.50, 0.50, 2.00, 2.00],
      load: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
      capacityKwh: 2.0,
      maxKw: 2.0,
      efficiency: 0.90,
      intervalHours: 1.0,
      effectRateKrPerKw: 50,
    });

    console.log(`  Status: ${result.status}`);
    console.log(`  SoC start: ${result.soc[0].toFixed(3)}, SoC end: ${result.soc[result.soc.length - 1].toFixed(3)}`);

    // SoC[0] should approximately equal final SoC (within solver tolerance)
    const socDiff = Math.abs(result.soc[0] - result.soc[result.soc.length - 1]);
    const ok = result.status === "optimal" && socDiff < 0.01;
    console.log(`  SoC diff: ${socDiff.toFixed(6)} (should be ~0)`);
    console.log(`  ${ok ? "✅ PASS" : "❌ FAIL"}\n`);
  }

  // ─── Test 4: No battery → passthrough ──────────────────────────────
  {
    console.log("Test 4: Zero capacity → error");
    try {
      await optimizeBatteryLP({
        prices: [1.0, 1.0],
        load: [1.0, 1.0],
        capacityKwh: 0,
        maxKw: 5,
        efficiency: 0.90,
        intervalHours: 1.0,
        effectRateKrPerKw: 50,
      });
      console.log("  ❌ FAIL — should have thrown\n");
    } catch (e: any) {
      console.log(`  Threw: "${e.message}"`);
      console.log("  ✅ PASS\n");
    }
  }

  // ─── Test 5: Realistic month (simulated) ───────────────────────────
  {
    console.log("Test 5: Realistic month (744 hourly intervals)");
    const n = 744; // 31 days × 24h
    const prices: number[] = [];
    const load: number[] = [];

    for (let t = 0; t < n; t++) {
      const hour = t % 24;
      // Spot pattern: low at night, high during day
      const basePrice = hour >= 6 && hour <= 20 ? 1.5 : 0.3;
      const noise = (Math.sin(t * 0.1) * 0.3);
      prices.push(Math.max(0.1, basePrice + noise));

      // Load: morning/evening peaks
      const baseLoad = hour >= 7 && hour <= 9 ? 3.0 :
                       hour >= 17 && hour <= 21 ? 4.0 : 1.0;
      load.push(baseLoad + Math.random() * 0.5);
    }

    const result = await optimizeBatteryLP({
      prices,
      load,
      capacityKwh: 20,
      maxKw: 5,
      efficiency: 0.90,
      intervalHours: 1.0,
      effectRateKrPerKw: 75,
    });

    console.log(`  Status: ${result.status}`);
    console.log(`  Solve: ${result.solveTimeMs}ms`);
    console.log(`  Vars: ${result.numVars}, Constraints: ${result.numConstraints}`);
    console.log(`  Peak before: ${result.peakKwBefore.toFixed(2)} kW`);
    console.log(`  Peak after:  ${result.peakKwAfter.toFixed(2)} kW`);
    console.log(`  Peak reduction: ${(result.peakKwBefore - result.peakKwAfter).toFixed(2)} kW`);
    console.log(`  Grid total: ${result.totalGridKwh.toFixed(1)} kWh`);

    const costBefore = prices.reduce((s, p, i) => s + p * load[i], 0) + 75 * Math.max(...load.map(l => l));
    const costAfter = prices.reduce((s, p, i) => s + p * result.adjustedLoad[i], 0) + 75 * result.peakKwAfter;
    console.log(`  Cost before: ${costBefore.toFixed(0)} SEK`);
    console.log(`  Cost after:  ${costAfter.toFixed(0)} SEK`);
    console.log(`  Savings: ${(costBefore - costAfter).toFixed(0)} SEK (${((costBefore - costAfter) / costBefore * 100).toFixed(1)}%)`);

    const ok = result.status === "optimal" && result.solveTimeMs < 10000;
    console.log(`  ${ok ? "✅ PASS" : "❌ FAIL"}\n`);
  }

  console.log("=== Done ===");
}

test().catch(console.error);
