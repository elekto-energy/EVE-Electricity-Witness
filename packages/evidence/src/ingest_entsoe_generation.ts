/**
 * ENTSO-E A75 Bulk Ingest — Actual Generation Per Type
 *
 * Fetches month-by-month for specified zones.
 * ENTSO-E API max period = 1 year, we use 1-month chunks.
 *
 * Output: data/canonical/entsoe_generation/{run_id}/generation.json
 *         data/raw/entsoe_generation/{run_id}/{zone}.xml
 *
 * Usage:
 *   npx tsx packages/evidence/src/ingest_entsoe_generation.ts \
 *     --token YOUR_TOKEN \
 *     --from 2022-01 \
 *     --to 2026-02 \
 *     --zones SE3,DE_LU,FI
 *
 * TR1: No source, no number.
 * TR6: Code fetches — never invents.
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";
import {
  fetchGenerationPerType,
  isGenerationResponse,
  isGenerationError,
  PSR_TYPES,
  type GenerationResponse,
  type GenerationError,
  type EntsoeClientConfig,
} from "./entsoe_generation_client";
import { BIDDING_ZONES } from "./entsoe_zones";

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let token = "";
  let fromArg = "";
  let toArg = "";
  let zonesArg = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--token" && args[i + 1]) token = args[++i];
    if (args[i] === "--from" && args[i + 1]) fromArg = args[++i];
    if (args[i] === "--to" && args[i + 1]) toArg = args[++i];
    if (args[i] === "--zones" && args[i + 1]) zonesArg = args[++i];
  }

  if (!token) throw new Error("--token required");
  if (!fromArg) throw new Error("--from required (YYYY-MM)");
  if (!toArg) throw new Error("--to required (YYYY-MM)");
  if (!zonesArg) throw new Error("--zones required (comma-separated zone codes)");

  const zoneCodes = zonesArg.split(",").map(s => s.trim());
  for (const z of zoneCodes) {
    if (!BIDDING_ZONES[z]) throw new Error(`Unknown zone: ${z}`);
  }

  return { token, fromArg, toArg, zoneCodes };
}

function generateMonths(from: string, to: string): { year: number; month: number }[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const months: { year: number; month: number }[] = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    months.push({ year: y, month: m });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

// ─── Canonical Format ────────────────────────────────────────────────────────

interface CanonicalGenerationRecord {
  zone_code: string;
  zone_eic: string;
  psr_type: string;
  psr_name: string;
  period_start: string;
  period_end: string;
  resolution: string;
  unit: string;
  points: Array<{ position: number; quantity_mw: number }>;
  evidence_id: string;
  source: { name: string; publisher: string; dataset_id: string };
  fetched_at_utc: string;
}

function toCanonical(resp: GenerationResponse, runId: string): CanonicalGenerationRecord[] {
  const records: CanonicalGenerationRecord[] = [];

  for (const ts of resp.time_series) {
    const contentHash = createHash("sha256")
      .update(`${resp.zone.code}:${ts.psr_type}:${ts.period_start}:${ts.period_end}:${JSON.stringify(ts.points)}`)
      .digest("hex").slice(0, 12);

    records.push({
      zone_code: resp.zone.code,
      zone_eic: resp.zone.eic,
      psr_type: ts.psr_type,
      psr_name: ts.psr_name,
      period_start: ts.period_start,
      period_end: ts.period_end,
      resolution: ts.resolution,
      unit: "MW",
      points: ts.points,
      evidence_id: `evr:entsoe:generation_a75:${runId}:${ts.psr_type}:${contentHash}`,
      source: {
        name: "ENTSO-E Transparency Platform",
        publisher: "ENTSO-E",
        dataset_id: "actual_generation_per_type_A75",
      },
      fetched_at_utc: resp.fetched_at_utc,
    });
  }

  return records;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { token, fromArg, toArg, zoneCodes } = parseArgs();
  const config: EntsoeClientConfig = { securityToken: token, timeoutMs: 30000 };
  const projectRoot = resolve(__dirname, "../../..");
  const months = generateMonths(fromArg, toArg);

  console.log(`[gen-ingest] ${months.length} months × ${zoneCodes.length} zones = ${months.length * zoneCodes.length} requests`);
  console.log(`[gen-ingest] Zones: ${zoneCodes.join(", ")}`);
  console.log(`[gen-ingest] Period: ${fromArg} → ${toArg}`);
  console.log();

  let totalRecords = 0;
  let totalErrors = 0;

  for (let mi = 0; mi < months.length; mi++) {
    const { year, month } = months[mi];
    const mm = month.toString().padStart(2, "0");
    const runId = `entsoe_generation_${year}${mm}`;

    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 1));

    const canonicalDir = join(projectRoot, "data", "canonical", "entsoe_generation", runId);
    const rawDir = join(projectRoot, "data", "raw", "entsoe_generation", runId);

    // Skip only if file exists AND contains all requested zones
    const canonicalPath = join(canonicalDir, "generation.json");
    if (existsSync(canonicalPath)) {
      try {
        const existing: CanonicalGenerationRecord[] = JSON.parse(
          require("fs").readFileSync(canonicalPath, "utf-8")
        );
        const existingZones = new Set(existing.map(r => r.zone_code));
        const allPresent = zoneCodes.every(z => existingZones.has(z));
        if (allPresent) {
          console.log(`[gen-ingest] (${mi + 1}/${months.length}) ${year}-${mm} SKIP (all zones present: ${[...existingZones].sort().join(",")})`);
          continue;
        }
        // Missing zones — fetch only missing, then merge
        const missing = zoneCodes.filter(z => !existingZones.has(z));
        console.log(`[gen-ingest] (${mi + 1}/${months.length}) ${year}-${mm} PARTIAL — missing: ${missing.join(",")} (have: ${[...existingZones].sort().join(",")})`);
        // Fall through to fetch missing zones, will merge below
        var existingRecords = existing;
        var fetchOnlyZones = missing;
      } catch {
        // Corrupt file — re-fetch all
        var existingRecords: CanonicalGenerationRecord[] = [];
        var fetchOnlyZones = zoneCodes;
      }
    } else {
      var existingRecords: CanonicalGenerationRecord[] = [];
      var fetchOnlyZones = zoneCodes;
    }

    mkdirSync(canonicalDir, { recursive: true });
    mkdirSync(rawDir, { recursive: true });

    console.log(`[gen-ingest] (${mi + 1}/${months.length}) ${year}-${mm} fetching...`);

    const allCanonical: CanonicalGenerationRecord[] = [...existingRecords];
    const errors: GenerationError[] = [];

    for (let zi = 0; zi < fetchOnlyZones.length; zi++) {
      const zoneCode = fetchOnlyZones[zi];
      const result = await fetchGenerationPerType(config, zoneCode, periodStart, periodEnd);

      if (isGenerationResponse(result)) {
        writeFileSync(join(rawDir, `${zoneCode}.xml`), result.raw_xml, "utf-8");
        const canonical = toCanonical(result, runId);
        allCanonical.push(...canonical);

        const psrTypes = [...new Set(result.time_series.map(ts => ts.psr_type))].sort();
        console.log(`  ✅ ${zoneCode}: ${result.time_series.length} series [${psrTypes.join(",")}]`);
      } else if (isGenerationError(result)) {
        errors.push(result);
        console.log(`  ❌ ${zoneCode}: ${result.error_code} — ${result.error_text}`);
      }

      // Rate limit
      if (zi < fetchOnlyZones.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    writeFileSync(canonicalPath, JSON.stringify(allCanonical, null, 2), "utf-8");
    totalRecords += allCanonical.length;
    totalErrors += errors.length;

    if (errors.length > 0) {
      writeFileSync(join(canonicalDir, "errors.json"), JSON.stringify(errors, null, 2), "utf-8");
    }

    const summary = {
      run_id: runId,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      zones_success: [...new Set(allCanonical.map(r => r.zone_code))],
      zones_failed: errors.map(e => e.zone.code),
      total_records: allCanonical.length,
      psr_types_seen: [...new Set(allCanonical.map(r => r.psr_type))].sort(),
      completed_at_utc: new Date().toISOString(),
    };
    writeFileSync(join(canonicalDir, "summary.json"), JSON.stringify(summary, null, 2), "utf-8");

    // Rate limit between months
    if (mi < months.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n[gen-ingest] === DONE ===`);
  console.log(`[gen-ingest] Total records: ${totalRecords}`);
  console.log(`[gen-ingest] Total errors: ${totalErrors}`);
  console.log(`[gen-ingest] Output: data/canonical/entsoe_generation/`);
}

main().catch((err) => {
  console.error("[gen-ingest] FATAL:", err);
  process.exit(1);
});
