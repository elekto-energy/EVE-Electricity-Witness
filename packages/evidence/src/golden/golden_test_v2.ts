/**
 * Golden Test Suite — V2 Timeseries Integrity
 *
 * Deterministic validation suite for EVE Timeseries V2.
 * No test framework dependency. Exit code = pass/fail.
 *
 * Tests:
 *   1. Zone Coverage      — All 14 Golden Zones must have timeseries output
 *   2. CO₂ Bounds         — 0 ≤ production_co2 ≤ 1200, 0 ≤ consumption_co2 ≤ 1500
 *   3. PT15M Leakage      — No sub-hourly timestamps in canonical output
 *   4. Flow Symmetry      — Net imports exist for zones with interconnectors
 *   5. Field Count         — Exactly 24 fields per row (V2 schema lock)
 *   6. Methodology Lock    — methodology_version matches config
 *   7. Config Immutability — V2_GOLDEN_ZONES = 14, V2_PERIOD_START = 2020-01-01
 *
 * Usage:
 *   npx tsx packages/evidence/src/golden/golden_test_v2.ts
 *
 * Exit 0 = all pass. Exit 1 = any failure.
 *
 * This is a CI blocker. Not a unit test.
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { V2_GOLDEN_ZONES, V2_PERIOD_START, TIMESERIES_V2_ZONES } from "../timeseries_v2_config";

const PROJECT_ROOT = resolve(__dirname, "../../../..");
const TS_DIR = join(PROJECT_ROOT, "data", "canonical", "timeseries_v2");
const VAULT_PATH = join(PROJECT_ROOT, "data", "xvault", "elekto_v2_worm.jsonl");
const REGISTRY_LOCK = join(PROJECT_ROOT, "config", "method_registry.lock.json");

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

// ─── Helper: Read first N NDJSON rows from a zone ────────────────────────────

function readNdjsonRows(zone: string, maxFiles = 3): Record<string, unknown>[] {
  const zoneDir = join(TS_DIR, zone);
  if (!existsSync(zoneDir)) return [];
  const files = readdirSync(zoneDir)
    .filter(f => f.endsWith(".ndjson"))
    .sort()
    .slice(0, maxFiles);

  const rows: Record<string, unknown>[] = [];
  for (const f of files) {
    const content = readFileSync(join(zoneDir, f), "utf-8").trim();
    if (!content) continue;
    for (const line of content.split("\n")) {
      if (line.trim()) rows.push(JSON.parse(line));
    }
  }
  return rows;
}

// ─── Test 1: Zone Coverage ───────────────────────────────────────────────────

test("Zone Coverage: 14/14 Golden Zones have timeseries output", () => {
  const missing: string[] = [];
  for (const zone of V2_GOLDEN_ZONES) {
    const zoneDir = join(TS_DIR, zone);
    if (!existsSync(zoneDir)) {
      missing.push(zone);
      continue;
    }
    const files = readdirSync(zoneDir).filter(f => f.endsWith(".ndjson"));
    if (files.length === 0) missing.push(zone);
  }
  if (missing.length > 0) {
    return `Missing zones: ${missing.join(", ")} (${V2_GOLDEN_ZONES.length - missing.length}/${V2_GOLDEN_ZONES.length})`;
  }
  return null;
});

// ─── Test 2: CO₂ Bounds ─────────────────────────────────────────────────────

test("CO₂ Bounds: production_co2 [0, 1200], consumption_co2 [0, 1500]", () => {
  const violations: string[] = [];

  for (const zone of V2_GOLDEN_ZONES) {
    const rows = readNdjsonRows(zone, 2); // Sample first 2 months
    for (const row of rows) {
      const prodCo2 = row.production_co2_g_kwh as number | null;
      const consCo2 = row.consumption_co2_g_kwh as number | null;
      const ts = row.ts as string;

      if (prodCo2 !== null) {
        if (prodCo2 < 0 || prodCo2 > 1200) {
          violations.push(`${zone} ${ts}: production_co2=${prodCo2} (out of [0,1200])`);
        }
      }
      if (consCo2 !== null) {
        if (consCo2 < 0 || consCo2 > 1500) {
          violations.push(`${zone} ${ts}: consumption_co2=${consCo2} (out of [0,1500])`);
        }
      }
    }
  }

  if (violations.length > 0) {
    return `${violations.length} violations (first 5):\n  ${violations.slice(0, 5).join("\n  ")}`;
  }
  return null;
});

// ─── Test 3: PT15M Leakage ──────────────────────────────────────────────────

test("PT15M Leakage: No sub-hourly timestamps in canonical output", () => {
  const leaks: string[] = [];

  for (const zone of V2_GOLDEN_ZONES) {
    const rows = readNdjsonRows(zone, 2);
    for (const row of rows) {
      const ts = row.ts as string;
      // Valid PT60M timestamps end at :00 minutes
      // PT15M would have :15, :30, :45
      const match = ts.match(/:(\d{2}):/);
      if (match) {
        const minutes = parseInt(match[1]);
        if (minutes % 60 !== 0) {
          leaks.push(`${zone} ${ts}: minute=${minutes} (PT15M leak)`);
        }
      }
    }
  }

  if (leaks.length > 0) {
    return `${leaks.length} PT15M leaks found:\n  ${leaks.slice(0, 5).join("\n  ")}`;
  }
  return null;
});

// ─── Test 4: Flow Symmetry Sanity ───────────────────────────────────────────

test("Flow Symmetry: Zones with interconnectors have net_import_mw data", () => {
  // Zones that MUST have non-null net_import (they all have physical interconnectors)
  const zonesWithFlows = ["SE1", "SE2", "SE3", "SE4", "FI", "DE_LU", "PL", "NO1"];
  const missing: string[] = [];

  for (const zone of zonesWithFlows) {
    const rows = readNdjsonRows(zone, 2);
    const hasNetImport = rows.some(r => r.net_import_mw !== null && r.net_import_mw !== undefined);
    if (!hasNetImport && rows.length > 0) {
      missing.push(zone);
    }
  }

  if (missing.length > 0) {
    return `Zones with interconnectors but no net_import data: ${missing.join(", ")}`;
  }
  return null;
});

// ─── Test 5: Field Count (Schema Lock) ──────────────────────────────────────

test("Field Count: Exactly 24 fields per row (V2 schema lock)", () => {
  const EXPECTED_FIELDS = 24;
  const violations: string[] = [];

  for (const zone of V2_GOLDEN_ZONES) {
    const rows = readNdjsonRows(zone, 1); // Just first month
    if (rows.length === 0) continue;

    // Check first and last row
    for (const row of [rows[0], rows[rows.length - 1]]) {
      const fieldCount = Object.keys(row).length;
      if (fieldCount !== EXPECTED_FIELDS) {
        violations.push(`${zone}: ${fieldCount} fields (expected ${EXPECTED_FIELDS})`);
      }
    }
  }

  if (violations.length > 0) {
    return violations.join(", ");
  }
  return null;
});

// ─── Test 6: Methodology Lock ───────────────────────────────────────────────

test("Methodology Lock: All manifests use TS_V2_EEA_2023_DIRECT", () => {
  const violations: string[] = [];

  for (const zone of V2_GOLDEN_ZONES) {
    const zoneDir = join(TS_DIR, zone);
    if (!existsSync(zoneDir)) continue;

    const manifests = readdirSync(zoneDir).filter(f => f.startsWith("manifest_") && f.endsWith(".json"));
    for (const mf of manifests) {
      const manifest = JSON.parse(readFileSync(join(zoneDir, mf), "utf-8"));
      if (manifest.methodology_version !== "TS_V2_EEA_2023_DIRECT") {
        violations.push(`${zone}/${mf}: ${manifest.methodology_version}`);
      }
    }
  }

  if (violations.length > 0) {
    return `Non-standard methodology: ${violations.join(", ")}`;
  }
  return null;
});

// ─── Test 7: Config Immutability ────────────────────────────────────────────

test("Config Immutability: V2_GOLDEN_ZONES=14, V2_PERIOD_START=2020-01-01", () => {
  const errors: string[] = [];

  if (V2_GOLDEN_ZONES.length !== 14) {
    errors.push(`V2_GOLDEN_ZONES.length=${V2_GOLDEN_ZONES.length} (expected 14)`);
  }
  if (V2_PERIOD_START !== "2020-01-01") {
    errors.push(`V2_PERIOD_START="${V2_PERIOD_START}" (expected "2020-01-01")`);
  }

  // Verify all 14 zones exist in TIMESERIES_V2_ZONES
  for (const zone of V2_GOLDEN_ZONES) {
    if (!TIMESERIES_V2_ZONES[zone]) {
      errors.push(`${zone} in GOLDEN_ZONES but not in TIMESERIES_V2_ZONES`);
    }
  }

  return errors.length > 0 ? errors.join("; ") : null;
});

// ─── Test 8: Vault Exists and Has Entries ───────────────────────────────────

test("Vault Integrity: WORM vault exists with sealed entries", () => {
  if (!existsSync(VAULT_PATH)) {
    return "Vault file not found: data/xvault/elekto_v2_worm.jsonl";
  }
  const content = readFileSync(VAULT_PATH, "utf-8").trim();
  const lines = content.split("\n").filter(Boolean);
  if (lines.length === 0) {
    return "Vault is empty";
  }

  // Verify chain integrity (each record's prev_hash matches previous chain_hash)
  let prevChainHash: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const record = JSON.parse(lines[i]);
    if (i === 0) {
      if (record.prev_hash !== null) {
        return `First vault entry has non-null prev_hash: ${record.prev_hash}`;
      }
    } else {
      if (record.prev_hash !== prevChainHash) {
        return `Chain break at index ${record.event_index}: prev_hash=${record.prev_hash} != expected ${prevChainHash}`;
      }
    }
    prevChainHash = record.chain_hash;
  }

  return null;
});

// ─── Test 9: Method Registry Lock File ──────────────────────────────────────

test("Registry Lock: config/method_registry.lock.json exists and is valid", () => {
  if (!existsSync(REGISTRY_LOCK)) {
    return "Missing: config/method_registry.lock.json";
  }
  const lock = JSON.parse(readFileSync(REGISTRY_LOCK, "utf-8"));
  const errors: string[] = [];

  if (lock.methodology_version !== "TS_V2_EEA_2023_DIRECT") {
    errors.push(`methodology_version: ${lock.methodology_version}`);
  }
  if (!lock.registry_hash || lock.registry_hash.length !== 64) {
    errors.push(`Invalid registry_hash: ${lock.registry_hash}`);
  }
  if (!lock.locked_at) {
    errors.push("Missing locked_at");
  }

  return errors.length > 0 ? errors.join("; ") : null;
});

// ─── Runner ──────────────────────────────────────────────────────────────────

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║  GOLDEN TEST SUITE — EVE Timeseries V2                     ║");
console.log("╠══════════════════════════════════════════════════════════════╣");
console.log(`║  Golden Zones: ${V2_GOLDEN_ZONES.length}`.padEnd(63) + "║");
console.log(`║  Period Start: ${V2_PERIOD_START}`.padEnd(63) + "║");
console.log(`║  Timeseries Dir: data/canonical/timeseries_v2/`.padEnd(63) + "║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log();

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
  console.log("\n  🔒 V2 Golden Tests: ALL PASS\n");
  process.exit(0);
}
