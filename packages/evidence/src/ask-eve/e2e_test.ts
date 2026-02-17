/**
 * E2E Test — Ask-EVE Evidence Engine V1
 *
 * Tests the full chain:
 *   1. Query engine → deterministic result
 *   2. PDF generation → file on disk
 *   3. SHA256 of PDF → report vault seal
 *   4. Report vault lookup by hash → match
 *   5. Dataset vault reference → valid
 *   6. Determinism: re-run query → identical values
 *
 * No server required. No LLM. Pure local verification.
 *
 * Usage:
 *   npx tsx packages/evidence/src/ask-eve/e2e_test.ts
 *
 * Exit 0 = all pass. Exit 1 = failure.
 */

import { readFileSync, existsSync, unlinkSync } from "fs";
import { createHash } from "crypto";
import { resolve } from "path";
import { query } from "./query_v2";
import { findReportByHash } from "./report_vault";

const PROJECT_ROOT = resolve(__dirname, "../../../..");

// ─── Test Infrastructure ─────────────────────────────────────────────────────

interface TestResult {
  name: string;
  pass: boolean;
  detail: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => string | null) {
  try {
    const error = fn();
    if (error) {
      results.push({ name, pass: false, detail: error });
    } else {
      results.push({ name, pass: true, detail: "OK" });
    }
  } catch (err: any) {
    results.push({ name, pass: false, detail: `EXCEPTION: ${err.message}` });
  }
}

async function testAsync(name: string, fn: () => Promise<string | null>) {
  try {
    const error = await fn();
    if (error) {
      results.push({ name, pass: false, detail: error });
    } else {
      results.push({ name, pass: true, detail: "OK" });
    }
  } catch (err: any) {
    results.push({ name, pass: false, detail: `EXCEPTION: ${err.message}` });
  }
}

// ─── Test Data ───────────────────────────────────────────────────────────────

const TEST_ZONE = "SE3";
const TEST_FROM = "2024-01-01";
const TEST_TO = "2024-01-31";
const TEST_PDF = resolve(PROJECT_ROOT, "data", "reports", "pdf", `e2e_test_${Date.now()}.pdf`);

// ─── Test 1: Query Engine Determinism ────────────────────────────────────────

let result1: ReturnType<typeof query>;
let result2: ReturnType<typeof query>;

test("Query Engine: returns valid result", () => {
  result1 = query({ zone: TEST_ZONE, from: TEST_FROM, to: TEST_TO });

  if (!result1.zone) return "Missing zone";
  if (result1.rows_count === 0) return "Zero rows returned";
  if (!result1.dataset_eve_id) return "Missing dataset_eve_id";
  if (!result1.methodology_version) return "Missing methodology_version";
  if (!result1.registry_hash) return "Missing registry_hash";
  if (result1.spot.mean === null) return "Spot mean is null";
  if (result1.production_co2.mean === null) return "Production CO2 mean is null";

  return null;
});

test("Query Engine: deterministic (identical re-run)", () => {
  result2 = query({ zone: TEST_ZONE, from: TEST_FROM, to: TEST_TO });

  // Compare all statistical values (generated_at_utc will differ — that's expected)
  if (result1.rows_count !== result2.rows_count) return `rows_count: ${result1.rows_count} vs ${result2.rows_count}`;
  if (result1.spot.mean !== result2.spot.mean) return `spot.mean: ${result1.spot.mean} vs ${result2.spot.mean}`;
  if (result1.spot.min !== result2.spot.min) return `spot.min differs`;
  if (result1.spot.max !== result2.spot.max) return `spot.max differs`;
  if (result1.production_co2.mean !== result2.production_co2.mean) return `production_co2.mean differs`;
  if (result1.consumption_co2.mean !== result2.consumption_co2.mean) return `consumption_co2.mean differs`;
  if (result1.net_import.mean !== result2.net_import.mean) return `net_import.mean differs`;
  if (result1.dataset_eve_id !== result2.dataset_eve_id) return `dataset_eve_id: ${result1.dataset_eve_id} vs ${result2.dataset_eve_id}`;
  if (result1.registry_hash !== result2.registry_hash) return `registry_hash differs`;
  if (result1.vault?.root_hash !== result2.vault?.root_hash) return `vault.root_hash differs`;

  return null;
});

// ─── Test 2: Vault Reference ─────────────────────────────────────────────────

test("Vault Reference: dataset has vault entry with root_hash", () => {
  if (!result1.vault) return "No vault entry found for dataset";
  if (!result1.vault.root_hash) return "Vault entry missing root_hash";
  if (!result1.vault.chain_hash) return "Vault entry missing chain_hash";
  if (typeof result1.vault.event_index !== "number") return "Vault entry missing event_index";
  return null;
});

// ─── Test 3: Query Schema Validation ─────────────────────────────────────────

test("Query Schema: rejects invalid zone", () => {
  try {
    query({ zone: "INVALID_ZONE", from: TEST_FROM, to: TEST_TO });
    return "Should have thrown for invalid zone";
  } catch (e: any) {
    if (e.message.includes("not found")) return null;
    return `Unexpected error: ${e.message}`;
  }
});

test("Query Schema: rejects future-only range", () => {
  try {
    query({ zone: TEST_ZONE, from: "2099-01-01", to: "2099-12-31" });
    return "Should have thrown for future-only range";
  } catch (e: any) {
    if (e.message.includes("No data")) return null;
    return `Unexpected error: ${e.message}`;
  }
});

// ─── Test 4: PDF Generation + Report Vault ───────────────────────────────────

let pdfHash: string = "";

testAsync("PDF Generation: creates file + seals in report vault", async () => {
  // Dynamic import to handle pdfkit dependency
  let generatePdf: any;
  try {
    const mod = await import("./generate_pdf");
    generatePdf = mod.generatePdf;
  } catch (e: any) {
    return `SKIP: pdfkit not installed (${e.message}). Run: npm install pdfkit`;
  }

  const { mkdirSync } = await import("fs");
  mkdirSync(resolve(PROJECT_ROOT, "data", "reports", "pdf"), { recursive: true });

  const pdfResult = await generatePdf(result1, TEST_PDF, true);

  if (!existsSync(TEST_PDF)) return "PDF file not created";
  if (!pdfResult.pdf_hash) return "No pdf_hash returned";
  if (pdfResult.report_index < 1) return `Invalid report_index: ${pdfResult.report_index}`;
  if (pdfResult.chain_hash === "NOT_SEALED") return "Not sealed in vault";

  pdfHash = pdfResult.pdf_hash;

  // Verify file hash matches
  const fileBuffer = readFileSync(TEST_PDF);
  const computedHash = createHash("sha256").update(fileBuffer).digest("hex");
  if (computedHash !== pdfHash) return `Hash mismatch: computed ${computedHash.slice(0, 16)} vs returned ${pdfHash.slice(0, 16)}`;

  return null;
}).then(() => {

  // ─── Test 5: Report Vault Lookup ─────────────────────────────────────
  test("Report Vault: lookup by PDF hash returns correct entry", () => {
    if (!pdfHash) return "SKIP: no PDF hash (pdfkit not installed)";

    const entry = findReportByHash(pdfHash);
    if (!entry) return `Report not found in vault for hash ${pdfHash.slice(0, 16)}...`;
    if (entry.dataset_eve_id !== result1.dataset_eve_id) {
      return `dataset_eve_id mismatch: ${entry.dataset_eve_id} vs ${result1.dataset_eve_id}`;
    }
    if (entry.root_hash !== result1.vault?.root_hash) {
      return `root_hash mismatch`;
    }

    return null;
  });

  // ─── Test 6: Full Chain Verification ─────────────────────────────────
  test("Full Chain: PDF → report_vault → dataset_vault → canonical", () => {
    if (!pdfHash) return "SKIP: no PDF hash";

    const reportEntry = findReportByHash(pdfHash);
    if (!reportEntry) return "Report not in vault";

    // Verify dataset vault has matching root_hash
    if (reportEntry.root_hash !== result1.vault?.root_hash) {
      return "Root hash mismatch between report vault and dataset vault";
    }

    // Verify chain integrity
    if (!reportEntry.chain_hash) return "Missing chain_hash in report vault";
    if (!reportEntry.event_hash) return "Missing event_hash in report vault";

    return null;
  });

  // ─── Cleanup ───────────────────────────────────────────────────────────
  try { if (existsSync(TEST_PDF)) unlinkSync(TEST_PDF); } catch { /* */ }

  // ─── Output ────────────────────────────────────────────────────────────
  printResults();
});

// ─── Runner ──────────────────────────────────────────────────────────────────

function printResults() {
  console.log();
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  E2E TEST — Ask-EVE Evidence Engine V1                     ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  for (const r of results) {
    const icon = r.pass ? "✅" : "❌";
    console.log(`  ${icon} ${r.name}`);
    if (!r.pass) {
      console.log(`     → ${r.detail}`);
    }
  }

  console.log();
  console.log("════════════════════════════════════════════════════════════════");
  console.log(`  ${passed} passed, ${failed} failed (${results.length} total)`);
  console.log("════════════════════════════════════════════════════════════════");

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("\n  🔒 Ask-EVE E2E: ALL PASS\n");
    process.exit(0);
  }
}
