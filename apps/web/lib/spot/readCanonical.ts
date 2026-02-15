/**
 * Canonical ENTSO-E data reader.
 *
 * Reads from data/canonical/entsoe/<run_id>/day_ahead_prices.json
 * and manifests/entsoe/<run_id>_canonical.{root_hash.txt,manifest.json,files.sha256}
 *
 * Deterministic: same canonical files → same output. No network calls.
 * CODEFACTORY scope — no UI, no opinions.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import type { EvidenceMetadata, SpotPricePoint, SpotStats } from "@/lib/types/spot";

/**
 * Project root resolution.
 * process.cwd() in Next.js dev = apps/web/.
 * We need the monorepo root = 2 levels up.
 */
function getProjectRoot(): string {
  // If running from apps/web (Next.js), go up 2 levels
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\web") || cwd.endsWith("apps/web")) {
    return resolve(cwd, "../..");
  }
  // If running from project root directly
  return cwd;
}

const PROJECT_ROOT = getProjectRoot();

/** Raw canonical record as written by ingest_entsoe_dayahead.ts */
interface CanonicalPriceRecord {
  zone_code: string;
  zone_eic: string;
  zone_name: string;
  country: string;
  period_start: string;
  period_end: string;
  resolution: string;
  currency: string;
  unit: string;
  prices: Array<{ position: number; price_eur_mwh: number }>;
  evidence_id: string;
  source: { name: string; publisher: string; dataset_id: string; uri: string };
  fetched_at_utc: string;
}

/** Find the latest run_id directory under data/canonical/entsoe/ */
export function findLatestRun(): string | null {
  const base = resolve(PROJECT_ROOT, "data", "canonical", "entsoe");
  if (!existsSync(base)) return null;

  const runs = readdirSync(base, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()
    .reverse();

  return runs[0] ?? null;
}

/** Find a run that matches a specific date (YYYY-MM-DD in run_id) */
export function findRunByDate(date: string): string | null {
  const base = resolve(PROJECT_ROOT, "data", "canonical", "entsoe");
  if (!existsSync(base)) return null;

  const dateCompact = date.replace(/-/g, "");
  const runs = readdirSync(base, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.includes(dateCompact))
    .map(d => d.name)
    .sort()
    .reverse();

  return runs[0] ?? null;
}

/** Load all canonical records for a run */
export function loadCanonicalRecords(runId: string): CanonicalPriceRecord[] {
  const filePath = resolve(PROJECT_ROOT, "data", "canonical", "entsoe", runId, "day_ahead_prices.json");
  if (!existsSync(filePath)) return [];

  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as CanonicalPriceRecord[];
}

/** Load evidence metadata for a run */
export function loadEvidenceMetadata(runId: string): EvidenceMetadata {
  const manifestDir = resolve(PROJECT_ROOT, "manifests", "entsoe");
  const canonicalRunId = `${runId}_canonical`;

  const rootHashPath = join(manifestDir, `${canonicalRunId}.root_hash.txt`);
  const manifestPath = join(manifestDir, `${canonicalRunId}.manifest.json`);
  const filesSha256Path = join(manifestDir, `${canonicalRunId}.files.sha256`);

  const rootHash = existsSync(rootHashPath)
    ? readFileSync(rootHashPath, "utf-8").trim()
    : "unknown";

  return {
    manifest_id: canonicalRunId,
    root_hash: rootHash,
    files_sha256_path: existsSync(filesSha256Path) ? filesSha256Path : "not_found",
  };
}

/** Compute stats for a price series */
export function computeStats(prices: number[]): SpotStats {
  if (prices.length === 0) return { avg: 0, min: 0, max: 0 };
  const sum = prices.reduce((s, v) => s + v, 0);
  return {
    avg: Math.round((sum / prices.length) * 100) / 100,
    min: Math.round(Math.min(...prices) * 100) / 100,
    max: Math.round(Math.max(...prices) * 100) / 100,
  };
}

/**
 * Convert position-based prices to ISO-timestamped series.
 * Merges multiple periods for the same zone into a single 24h series.
 *
 * ENTSO-E returns UTC times. Position 1 = first hour of period.
 * Resolution PT60M: position N → periodStart + (N-1) hours.
 */
function periodToSeries(record: CanonicalPriceRecord): SpotPricePoint[] {
  const start = new Date(record.period_start);
  const isQuarterly = record.resolution === "PT15M";
  const stepMs = isQuarterly ? 15 * 60 * 1000 : 60 * 60 * 1000;

  return record.prices.map(p => ({
    hourISO: new Date(start.getTime() + (p.position - 1) * stepMs).toISOString(),
    price: p.price_eur_mwh,
  }));
}

/**
 * Get merged 24h series for a single zone on a given date.
 * Handles ENTSO-E returning 2 periods spanning the query date.
 * Filters to only include hours within the requested date (UTC).
 */
export function getZoneDaySeries(
  records: CanonicalPriceRecord[],
  zoneCode: string,
  date: string, // YYYY-MM-DD
): { series: SpotPricePoint[]; resolution: "PT60M" | "PT15M" } {
  const zoneRecords = records.filter(r => r.zone_code === zoneCode);
  if (zoneRecords.length === 0) return { series: [], resolution: "PT60M" };

  // Merge all periods for this zone into one series
  const allPoints: SpotPricePoint[] = [];
  let resolution: "PT60M" | "PT15M" = "PT60M";

  for (const rec of zoneRecords) {
    if (rec.resolution === "PT15M") resolution = "PT15M";
    allPoints.push(...periodToSeries(rec));
  }

  // Filter to requested date (UTC day boundaries)
  const dayStart = new Date(date + "T00:00:00Z").getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  const filtered = allPoints
    .filter(p => {
      const t = new Date(p.hourISO).getTime();
      return t >= dayStart && t < dayEnd;
    })
    .sort((a, b) => new Date(a.hourISO).getTime() - new Date(b.hourISO).getTime());

  // Deduplicate by hourISO (in case periods overlap)
  const seen = new Set<string>();
  const deduped: SpotPricePoint[] = [];
  for (const p of filtered) {
    if (!seen.has(p.hourISO)) {
      seen.add(p.hourISO);
      deduped.push(p);
    }
  }

  return { series: deduped, resolution };
}
