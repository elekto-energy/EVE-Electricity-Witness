/**
 * X-Vault Golden Tests
 *
 * Tests per TASK_EVE_INTEGRATION_V2 phase_6:
 *   1. deterministic_dataset_id — identical input → identical dataset_eve_id
 *   2. vault_append_only — duplicate publish rejected
 *   3. methodology_lock — chain integrity verified
 *   4. verify_tamper_detection — modified record detected
 *
 * Run: npx tsx packages/xvault-ts/__tests__/xvault_golden.test.ts
 */

import { existsSync, unlinkSync, readFileSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";
import {
  publishToVault,
  readVault,
  verifyVault,
  generateDatasetEveId,
  parseDatasetEveId,
  stableStringify,
  METHODOLOGY_VERSION,
  EMISSION_SCOPE,
  type VaultEventPayload,
} from "../index";

const TEST_VAULT = resolve(__dirname, "test_vault.jsonl");

function cleanup() {
  if (existsSync(TEST_VAULT)) unlinkSync(TEST_VAULT);
}

function makeEvent(zone: string, dateStr: string): VaultEventPayload {
  return {
    dataset_eve_id: generateDatasetEveId(zone, new Date(dateStr)),
    root_hash: createHash("sha256").update(`test_${zone}_${dateStr}`).digest("hex"),
    files_sha256_path: `./data/canonical/timeseries_v2/${zone}/files.sha256`,
    methodology_version: METHODOLOGY_VERSION,
    emission_scope: EMISSION_SCOPE,
    zone,
    period_start: "2022-01-01T00:00:00Z",
    period_end: "2025-12-31T23:00:00Z",
    source_refs: ["entsoe_a44", "entsoe_a75", "entsoe_a11", "eea_2023"],
  };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    failed++;
  }
}

// ─── Test 1: Deterministic Dataset ID ────────────────────────────────────────

console.log("\n[TEST 1] Deterministic dataset_eve_id");

const id1 = generateDatasetEveId("SE3", new Date("2025-02-13T00:00:00Z"));
const id2 = generateDatasetEveId("SE3", new Date("2025-02-13T12:34:56Z")); // Same UTC date
const id3 = generateDatasetEveId("DE_LU", new Date("2025-02-13T00:00:00Z"));

assert(id1 === "EVE-TSV2-SE3-20250213-TS_V2_EEA_2023_DIRECT", "format correct");
assert(id1 === id2, "same zone + date → same ID (time-of-day ignored)");
assert(id1 !== id3, "different zone → different ID");

const parsed = parseDatasetEveId(id1);
assert(parsed !== null, "parseable");
assert(parsed?.zone === "SE3", "zone parsed");
assert(parsed?.date === "20250213", "date parsed");
assert(parsed?.methodology_version === METHODOLOGY_VERSION, "methodology parsed");

// ─── Test 2: Vault Append-Only ───────────────────────────────────────────────

console.log("\n[TEST 2] Vault append-only + duplicate rejection");

cleanup();

const event1 = makeEvent("SE3", "2025-02-13");
const record1 = publishToVault(event1, TEST_VAULT);

assert(record1.event_index === 1, "first record index = 1");
assert(record1.prev_hash === null, "first record prev_hash = null");
assert(record1.event_hash.length === 64, "event_hash is SHA-256");
assert(record1.chain_hash.length === 64, "chain_hash is SHA-256");

const event2 = makeEvent("DE_LU", "2025-02-13");
const record2 = publishToVault(event2, TEST_VAULT);

assert(record2.event_index === 2, "second record index = 2");
assert(record2.prev_hash === record1.chain_hash, "second prev_hash = first chain_hash");

// Duplicate rejection
let duplicateRejected = false;
try {
  publishToVault(event1, TEST_VAULT); // Same dataset_eve_id
} catch (err: any) {
  if (err.message.includes("Duplicate")) duplicateRejected = true;
}
assert(duplicateRejected, "duplicate dataset_eve_id rejected");

// Vault still has exactly 2 records
const vault = readVault(TEST_VAULT);
assert(vault.length === 2, "vault has 2 records after duplicate rejection");

// ─── Test 3: Chain Integrity Verification ────────────────────────────────────

console.log("\n[TEST 3] Chain integrity verification");

const verifyResult = verifyVault(TEST_VAULT);
assert(verifyResult.valid === true, "clean vault is valid");
assert(verifyResult.total_records === 2, "correct record count");
assert(verifyResult.last_chain_hash === record2.chain_hash, "last chain_hash matches");

// Empty vault
const emptyResult = verifyVault(resolve(__dirname, "nonexistent.jsonl"));
assert(emptyResult.valid === true, "empty vault is valid");
assert(emptyResult.total_records === 0, "empty vault has 0 records");

// ─── Test 4: Tamper Detection ────────────────────────────────────────────────

console.log("\n[TEST 4] Tamper detection");

// Read vault, tamper with a record, write back
const tamperPath = resolve(__dirname, "tampered_vault.jsonl");
const original = readFileSync(TEST_VAULT, "utf8");
const lines = original.trim().split("\n");
const tamperedRecord = JSON.parse(lines[0]);
tamperedRecord.event.root_hash = "0000000000000000000000000000000000000000000000000000000000000000";
lines[0] = JSON.stringify(tamperedRecord);
writeFileSync(tamperPath, lines.join("\n") + "\n");

const tamperResult = verifyVault(tamperPath);
assert(tamperResult.valid === false, "tampered vault detected");
assert(tamperResult.error_at_index === 1, "tamper detected at correct index");

// Cleanup tamper file
if (existsSync(tamperPath)) unlinkSync(tamperPath);

// ─── Test 5: Methodology Version Lock ────────────────────────────────────────

console.log("\n[TEST 5] Methodology version constants");

assert(METHODOLOGY_VERSION === "TS_V2_EEA_2023_DIRECT", "methodology version locked");
assert(EMISSION_SCOPE === "direct_combustion_only", "emission scope locked");

// ─── Test 6: stableStringify determinism ──────────────────────────────────────

console.log("\n[TEST 6] stableStringify determinism");

// Key order must not matter
const objA = { zone: "SE3", root_hash: "abc", dataset_eve_id: "x" };
const objB = { dataset_eve_id: "x", root_hash: "abc", zone: "SE3" };
assert(stableStringify(objA) === stableStringify(objB), "different key insertion order → same output");

// Nested objects sorted recursively
const nested1 = { b: { z: 1, a: 2 }, a: "hello" };
const nested2 = { a: "hello", b: { a: 2, z: 1 } };
assert(stableStringify(nested1) === stableStringify(nested2), "nested objects sorted recursively");

// Array order preserved (correct — arrays are ordered)
const arr1 = { refs: ["a", "b", "c"] };
const arr2 = { refs: ["a", "b", "c"] };
const arr3 = { refs: ["c", "b", "a"] };
assert(stableStringify(arr1) === stableStringify(arr2), "same array order → same output");
assert(stableStringify(arr1) !== stableStringify(arr3), "different array order → different output");

// SHA-256 stable across key-order variants
const hash1 = createHash("sha256").update(stableStringify(objA)).digest("hex");
const hash2 = createHash("sha256").update(stableStringify(objB)).digest("hex");
assert(hash1 === hash2, "SHA-256 stable across key-order variants");

// ─── Test 7: Rebuild idempotency ─────────────────────────────────────────────

console.log("\n[TEST 7] Rebuild idempotency");

const idempotencyVault = resolve(__dirname, "idempotency_vault.jsonl");
if (existsSync(idempotencyVault)) unlinkSync(idempotencyVault);

const buildEvent = makeEvent("SE3", "2025-02-15");
const firstBuild = publishToVault(buildEvent, idempotencyVault);

// "Rebuild" — identical input produces identical IDs
const rebuildEvent = makeEvent("SE3", "2025-02-15");
assert(rebuildEvent.dataset_eve_id === buildEvent.dataset_eve_id, "rebuild produces same dataset_eve_id");
assert(rebuildEvent.root_hash === buildEvent.root_hash, "rebuild produces same root_hash");

let rebuildRejected = false;
try {
  publishToVault(rebuildEvent, idempotencyVault);
} catch (err: any) {
  if (err.message.includes("Duplicate")) rebuildRejected = true;
}
assert(rebuildRejected, "vault rejects identical rebuild (append-only)");

const idempotencyRecords = readVault(idempotencyVault);
assert(idempotencyRecords.length === 1, "vault still has exactly 1 record after rejected rebuild");

if (existsSync(idempotencyVault)) unlinkSync(idempotencyVault);

// ─── Cleanup & Summary ───────────────────────────────────────────────────────

cleanup();

console.log("\n════════════════════════════════════════════════════════════════");
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log("════════════════════════════════════════════════════════════════");

if (failed > 0) process.exit(1);
