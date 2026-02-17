/**
 * ENTSO-E A11 Bulk Ingest — Cross-Border Physical Flows
 *
 * Fetches month-by-month for all V2 zone interconnections.
 * Each interconnection requires TWO calls (one per direction).
 *
 * Output: data/canonical/entsoe_flows/{run_id}/flows.json
 *         data/raw/entsoe_flows/{run_id}/{out}_{in}.xml
 *
 * Usage:
 *   npx tsx packages/evidence/src/ingest_entsoe_flows.ts \
 *     --token YOUR_TOKEN \
 *     --from 2022-01 \
 *     --to 2026-02
 *
 * TR1: No source, no number.
 * TR6: Code fetches — never invents.
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";
import {
  fetchCrossBorderFlows,
  isFlowResponse,
  isFlowError,
  V2_ZONE_INTERCONNECTIONS,
  type FlowResponse,
  type FlowError,
  type EntsoeClientConfig,
} from "./entsoe_generation_client";

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let token = "";
  let fromArg = "";
  let toArg = "";
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--token" && args[i + 1]) token = args[++i];
    if (args[i] === "--from" && args[i + 1]) fromArg = args[++i];
    if (args[i] === "--to" && args[i + 1]) toArg = args[++i];
    if (args[i] === "--force") force = true;
  }

  if (!token) throw new Error("--token required");
  if (!fromArg) throw new Error("--from required (YYYY-MM)");
  if (!toArg) throw new Error("--to required (YYYY-MM)");

  return { token, fromArg, toArg, force };
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

/**
 * Build all directed pairs from undirected interconnections.
 * Each [A, B] becomes [A→B, B→A] (two API calls).
 */
function buildDirectedPairs(): [string, string][] {
  const pairs: [string, string][] = [];
  for (const [a, b] of V2_ZONE_INTERCONNECTIONS) {
    pairs.push([a, b]); // flow FROM b TO a → call with in_Domain=a, out_Domain=b
    pairs.push([b, a]); // flow FROM a TO b → call with in_Domain=b, out_Domain=a
  }
  return pairs;
}

// ─── Canonical Format ────────────────────────────────────────────────────────

interface CanonicalFlowRecord {
  in_zone: string;
  out_zone: string;
  direction: string;         // "FR→DE_LU"
  period_start: string;
  period_end: string;
  resolution: string;
  unit: string;
  points: Array<{ position: number; quantity_mw: number }>;
  evidence_id: string;
  source: { name: string; publisher: string; dataset_id: string };
  fetched_at_utc: string;
}

function toCanonical(resp: FlowResponse, runId: string): CanonicalFlowRecord[] {
  const records: CanonicalFlowRecord[] = [];

  for (const ts of resp.time_series) {
    const contentHash = createHash("sha256")
      .update(`${resp.out_zone.code}:${resp.in_zone.code}:${ts.period_start}:${ts.period_end}:${JSON.stringify(ts.points)}`)
      .digest("hex").slice(0, 12);

    records.push({
      in_zone: resp.in_zone.code,
      out_zone: resp.out_zone.code,
      direction: resp.direction,
      period_start: ts.period_start,
      period_end: ts.period_end,
      resolution: ts.resolution,
      unit: "MW",
      points: ts.points,
      evidence_id: `evr:entsoe:flow_a11:${runId}:${resp.out_zone.code}_${resp.in_zone.code}:${contentHash}`,
      source: {
        name: "ENTSO-E Transparency Platform",
        publisher: "ENTSO-E",
        dataset_id: "cross_border_physical_flows_A11",
      },
      fetched_at_utc: resp.fetched_at_utc,
    });
  }

  return records;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { token, fromArg, toArg, force } = parseArgs();
  const config: EntsoeClientConfig = { securityToken: token, timeoutMs: 30000 };
  const projectRoot = resolve(__dirname, "../../..");
  const months = generateMonths(fromArg, toArg);
  const directedPairs = buildDirectedPairs();

  console.log(`[flow-ingest] ${months.length} months × ${directedPairs.length} directed pairs = ${months.length * directedPairs.length} requests`);
  console.log(`[flow-ingest] Interconnections: ${V2_ZONE_INTERCONNECTIONS.length} undirected → ${directedPairs.length} directed`);
  console.log(`[flow-ingest] Period: ${fromArg} → ${toArg}`);
  console.log();

  let totalRecords = 0;
  let totalErrors = 0;

  for (let mi = 0; mi < months.length; mi++) {
    const { year, month } = months[mi];
    const mm = month.toString().padStart(2, "0");
    const runId = `entsoe_flows_${year}${mm}`;

    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 1));

    const canonicalDir = join(projectRoot, "data", "canonical", "entsoe_flows", runId);
    const rawDir = join(projectRoot, "data", "raw", "entsoe_flows", runId);

    // Skip if already ingested (unless --force)
    const canonicalPath = join(canonicalDir, "flows.json");
    if (existsSync(canonicalPath) && !force) {
      console.log(`[flow-ingest] (${mi + 1}/${months.length}) ${year}-${mm} SKIP (exists, use --force to re-fetch)`);
      continue;
    }

    mkdirSync(canonicalDir, { recursive: true });
    mkdirSync(rawDir, { recursive: true });

    console.log(`[flow-ingest] (${mi + 1}/${months.length}) ${year}-${mm} fetching ${directedPairs.length} pairs...`);

    const allCanonical: CanonicalFlowRecord[] = [];
    const errors: FlowError[] = [];

    for (let pi = 0; pi < directedPairs.length; pi++) {
      const [inZone, outZone] = directedPairs[pi];
      const result = await fetchCrossBorderFlows(config, inZone, outZone, periodStart, periodEnd);

      if (isFlowResponse(result)) {
        writeFileSync(join(rawDir, `${outZone}_${inZone}.xml`), result.raw_xml, "utf-8");
        const canonical = toCanonical(result, runId);
        allCanonical.push(...canonical);

        const pts = result.time_series.reduce((s, ts) => s + ts.points.length, 0);
        console.log(`  ✅ ${outZone}→${inZone}: ${pts} points`);
      } else if (isFlowError(result)) {
        errors.push(result);
        // No data is common for some pairs (e.g., no direct connection)
        if (result.error_code !== "999") {
          console.log(`  ❌ ${outZone}→${inZone}: ${result.error_code} — ${result.error_text}`);
        } else {
          console.log(`  ⚪ ${outZone}→${inZone}: no data`);
        }
      }

      // Rate limit (300ms between calls)
      if (pi < directedPairs.length - 1) {
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
      pairs_success: allCanonical.map(r => r.direction).filter((v, i, a) => a.indexOf(v) === i),
      pairs_failed: errors.map(e => `${e.out_zone.code}→${e.in_zone.code}`),
      total_records: allCanonical.length,
      completed_at_utc: new Date().toISOString(),
    };
    writeFileSync(join(canonicalDir, "summary.json"), JSON.stringify(summary, null, 2), "utf-8");

    // Rate limit between months (1.5s)
    if (mi < months.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  console.log(`\n[flow-ingest] === DONE ===`);
  console.log(`[flow-ingest] Total records: ${totalRecords}`);
  console.log(`[flow-ingest] Total errors: ${totalErrors}`);
  console.log(`[flow-ingest] Output: data/canonical/entsoe_flows/`);
}

main().catch((err) => {
  console.error("[flow-ingest] FATAL:", err);
  process.exit(1);
});
