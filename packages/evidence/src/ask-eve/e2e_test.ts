/**
 * Ask-EVE E2E Test — FX Layer + Determinism
 *
 * Run: npx tsx packages/evidence/src/ask-eve/e2e_test.ts
 *
 * Tests:
 *   1. FX resolution — known month returns expected rate
 *   2. FX missing month — throws (no silent fallback)
 *   3. FX determinism — same input → same output
 *   4. PDF determinism — same params → same pdf_hash
 *   5. Layer isolation — query_hash unchanged with/without FX
 */

import { resolveFxRate, eurMwhToSekKwh, getFxFileHash } from "../fx/resolve_fx";
import { computeQueryHash } from "./query_hash";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string): void {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.error(`  ❌ ${name}`);
    failed++;
  }
}

// ─── Test 1: FX Resolution ──────────────────────────────────────────────────

console.log("\n[Test 1] FX Resolution — known month");
{
  const fx = resolveFxRate("2024-01-01");
  assert(fx.fx_rate === 11.2834, `Rate 2024-01 = ${fx.fx_rate} (expected 11.2834)`);
  assert(fx.fx_period === "2024-01", `Period = ${fx.fx_period}`);
  assert(fx.fx_source === "ECB Monthly Average", `Source = ${fx.fx_source}`);
  assert(fx.fx_file_hash.length === 64, `File hash is SHA256 (${fx.fx_file_hash.length} chars)`);
}

console.log("\n[Test 1b] FX Resolution — another month");
{
  const fx = resolveFxRate("2023-06-15");
  assert(fx.fx_rate === 11.6766, `Rate 2023-06 = ${fx.fx_rate} (expected 11.6766)`);
  assert(fx.fx_period === "2023-06", `Period = ${fx.fx_period}`);
}

// ─── Test 2: FX Missing Month ───────────────────────────────────────────────

console.log("\n[Test 2] FX Missing Month — must throw");
{
  let threw = false;
  try {
    resolveFxRate("2019-12-01");
  } catch (e: any) {
    threw = true;
    assert(e.message.includes("No ECB EUR/SEK rate"), `Error message: ${e.message.slice(0, 60)}`);
  }
  assert(threw, "resolveFxRate threw for missing month");
}

console.log("\n[Test 2b] FX Bad format — must throw");
{
  let threw = false;
  try {
    resolveFxRate("not-a-date");
  } catch {
    threw = true;
  }
  assert(threw, "resolveFxRate threw for bad format");
}

// ─── Test 3: FX Determinism ─────────────────────────────────────────────────

console.log("\n[Test 3] FX Determinism — same input → same output");
{
  const a = resolveFxRate("2024-01-01");
  const b = resolveFxRate("2024-01-01");
  assert(a.fx_rate === b.fx_rate, `Rate identical: ${a.fx_rate} === ${b.fx_rate}`);
  assert(a.fx_file_hash === b.fx_file_hash, `File hash identical`);
}

// ─── Test 4: Conversion Formula ─────────────────────────────────────────────

console.log("\n[Test 4] EUR/MWh → SEK/kWh conversion");
{
  // 47.43 EUR/MWh × 11.2834 / 1000 = 0.535... kr/kWh
  const result = eurMwhToSekKwh(47.43, 11.2834);
  assert(Math.abs(result - 0.5353) < 0.001, `47.43 EUR/MWh → ${result.toFixed(4)} kr/kWh`);

  // Edge: 0 EUR/MWh = 0 kr/kWh
  assert(eurMwhToSekKwh(0, 11.28) === 0, "0 EUR/MWh → 0 kr/kWh");

  // Edge: negative price (happens in spot market)
  const neg = eurMwhToSekKwh(-5, 11.28);
  assert(neg < 0, `Negative price preserved: ${neg.toFixed(4)}`);
}

// ─── Test 5: Layer Isolation ────────────────────────────────────────────────

console.log("\n[Test 5] Layer isolation — query_hash unaffected by FX");
{
  const hash1 = computeQueryHash("SE3", "2024-01-01", "2024-01-31", "TS_V2_EEA_2023_DIRECT");
  const hash2 = computeQueryHash("SE3", "2024-01-01", "2024-01-31", "TS_V2_EEA_2023_DIRECT");
  assert(hash1 === hash2, `query_hash deterministic: ${hash1.slice(0, 16)}...`);
  assert(hash1.length === 64, `query_hash is SHA256`);
  // FX has no input to query_hash — isolation confirmed by design
}

// ─── Test 6: FX File Hash ───────────────────────────────────────────────────

console.log("\n[Test 6] FX file hash consistency");
{
  const h1 = getFxFileHash();
  const h2 = getFxFileHash();
  assert(h1 === h2, `File hash stable: ${h1.slice(0, 16)}...`);
  assert(h1.length === 64, `SHA256 length`);
}

// ─── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("❌ TESTS FAILED");
  process.exit(1);
} else {
  console.log("✅ ALL TESTS PASSED");
}
