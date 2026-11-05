/**
 * ELMONITOR A2 - data model, coverage register (A3) and pure merge / planning rules.
 * No I/O. Statuses and selection rules come from spike lib_v3 (verified in Spike A v3).
 */

import { addDays, groupContiguous, DayStatusV3 } from "../../spike/a_local_ingest/lib_v3";
import { Dataset, GENERATION_HISTORY_START, MAX_DAYS_PER_REQUEST, SeriesSpec, VALUES_HASH_METHOD, VALUES_HASH_METHOD_V1_LEGACY } from "./config";
import { sha256, stableJson } from "./store";

export type ValueTuple = [start_utc: string, value: number, origin: "E" | "R"]; // E = explicit point, R = A03 repeat
export type HourTuple = [start_utc: string, value: number];

/** Published per series x local day inside a monthly data file. Missing intervals are listed, never filled. */
export interface DayData {
  status: DayStatusV3;
  resolution: string | null;
  values: ValueTuple[];
  hourly: HourTuple[];            // A5: native PT60M or mean of four selected PT15M quarters
  missing_starts_utc: string[];   // every expected interval without a selected value (generation: missing hour starts)
  /** generation only: hourly MW per psrType (A5 rule per type); values/hourly stay empty for generation */
  by_type?: Record<string, HourTuple[]>;
}

export interface SourceRef {
  provider: "ENTSO-E Transparency Platform";
  document_type: "A44" | "A11" | "A75";
  request_first_day: string;
  request_last_day: string;
  raw_sha256: string;
  raw_bytes: number;
  fetched_at_utc: string;
  run_id: string;
}

export interface Revision {
  detected_utc: string; run_id: string;
  old_values_sha256: string | null; new_values_sha256: string | null;
  old_raw_sha256: string | null; new_raw_sha256: string | null;
  /** method of old/new_values_sha256; absent in a2.0 records (= V1 legacy, set on migration). */
  values_hash_method?: string;
  /** set when a later check proved the revision was not a source revision; such revisions are not counted. */
  classification?: "ORIGIN_ONLY_NOT_A_SOURCE_REVISION";
  classification_note?: string;
}

export const REVISION_CLASS_ORIGIN_ONLY = "ORIGIN_ONLY_NOT_A_SOURCE_REVISION" as const;
export const countedRevisions = (rs: Revision[]) => rs.filter(r => !r.classification).length;

export interface ErrorRef { run_id: string; at_utc: string; code: string; text: string }

/** A3 coverage register entry: one per dataset x series x local day. */
export interface RegisterEntry {
  dataset: Dataset;
  series: string;
  day: string;
  status: DayStatusV3;
  resolution: string | null;
  expected_intervals: number | null;
  present_intervals: number;
  missing_intervals: number | null;
  duplicates_within_tolerance: number;
  conflicts: number;
  selection: { rule_mode: string; decision_ref: string; verified: boolean | null };
  source: SourceRef | null;
  values_sha256: string | null;
  values_hash_method: string;     // method of values_sha256 (absent in a2.0 = V1 legacy, migrated on load)
  last_changed_utc: string;
  last_checked_utc: string;       // volatile: excluded from the content hash
  revisions: Revision[];
  last_error: ErrorRef | null;    // e.g. fetch error or refused regression; stays visible until a later clean check
}

export const regKey = (dataset: string, series: string, day: string) => `${dataset}|${series}|${day}`;
export const seriesSlug = (s: string) => s.replace(">", "_to_");

/** Semantic values hash. V2 (current) excludes the request-window-dependent R/E origin marker. */
export function valuesSha(d: DayData, method: string = VALUES_HASH_METHOD): string {
  if (method === VALUES_HASH_METHOD) {
    // by_type only for generation, so prices/flows hashes are unchanged from a2.1
    return sha256(stableJson({ method, resolution: d.resolution, values: d.values.map(v => [v[0], v[1]]), hourly: d.hourly, missing: d.missing_starts_utc, ...(d.by_type ? { by_type: d.by_type } : {}) }));
  }
  if (method === VALUES_HASH_METHOD_V1_LEGACY) {
    return sha256(stableJson({ resolution: d.resolution, values: d.values, hourly: d.hourly, missing: d.missing_starts_utc }));
  }
  throw new Error(`unknown values hash method ${method}`);
}

export const EMPTY_DAY_DATA = (status: DayStatusV3): DayData => ({ status, resolution: null, values: [], hourly: [], missing_starts_utc: [] });

/** Register view used for change detection and the content hash (drops the volatile check time). */
export function stableEntry(e: RegisterEntry): Omit<RegisterEntry, "last_checked_utc"> {
  const { last_checked_utc: _ignored, ...rest } = e;
  return rest;
}

export interface FreshDay {
  day: string;
  data: DayData;
  entry: Omit<RegisterEntry, "values_sha256" | "values_hash_method" | "last_changed_utc" | "last_checked_utc" | "revisions" | "last_error" | "source"> & { source: SourceRef };
}

export type MergeOutcome = "NEW" | "UNCHANGED" | "IMPROVED" | "REVISED" | "REGRESSION_REFUSED" | "UPDATED";

/**
 * Merge a freshly fetched day into the previous state.
 * - never degrades: a COMPLETE day is not replaced by an incomplete or conflicting result,
 *   and a day never loses present intervals; the refused result is recorded as last_error;
 * - a COMPLETE day whose values differ is REVISED (source revision), recorded in revisions[];
 * - an unchanged day keeps its original source reference (only last_checked_utc moves);
 * - values are compared with the current hash method only (origin marker excluded); a previous hash of another
 *   method is never compared, the previous hash is recomputed from the previous data instead.
 * prev.data may be an empty placeholder for a register entry without data (e.g. MISSING after a fetch error).
 */
export function mergeDay(
  prev: { entry: RegisterEntry; data: DayData } | null, fresh: FreshDay, runId: string, nowUtc: string,
): { entry: RegisterEntry; data: DayData; outcome: MergeOutcome } {
  const freshSha = valuesSha(fresh.data);
  const take = (outcome: MergeOutcome, revisions: Revision[]) => ({
    entry: { ...fresh.entry, values_sha256: freshSha, values_hash_method: VALUES_HASH_METHOD, last_changed_utc: nowUtc, last_checked_utc: nowUtc, revisions, last_error: null },
    data: fresh.data, outcome,
  });
  if (!prev) return take("NEW", []);
  const p0 = prev.entry;
  const prevSha = p0.values_sha256 === null ? null
    : p0.values_hash_method === VALUES_HASH_METHOD ? p0.values_sha256
    : prev.data.values.length > 0 ? valuesSha(prev.data) : null;
  const p: RegisterEntry = { ...p0, values_sha256: prevSha, values_hash_method: VALUES_HASH_METHOD };
  if (p.values_sha256 !== null && p.values_sha256 === freshSha && p.status === fresh.entry.status) {
    return { entry: { ...p, last_checked_utc: nowUtc, last_error: null }, data: prev.data, outcome: "UNCHANGED" };
  }
  const refuse = (code: string, text: string) => ({
    entry: { ...p, last_checked_utc: nowUtc, last_error: { run_id: runId, at_utc: nowUtc, code, text } },
    data: prev.data, outcome: "REGRESSION_REFUSED" as const,
  });
  if (p.status === "COMPLETE" && fresh.entry.status !== "COMPLETE") {
    return refuse("REGRESSION_REFUSED", `source now ${fresh.entry.status} (${fresh.entry.present_intervals} present) for a day previously COMPLETE; previous values kept`);
  }
  if (fresh.entry.present_intervals < p.present_intervals && fresh.entry.status !== "COMPLETE") {
    return refuse("REGRESSION_REFUSED", `source now has ${fresh.entry.present_intervals} present intervals, previously ${p.present_intervals}; previous values kept`);
  }
  if (p.status === "COMPLETE" && fresh.entry.status === "COMPLETE") {
    return take("REVISED", [...p.revisions, {
      detected_utc: nowUtc, run_id: runId, old_values_sha256: p.values_sha256, new_values_sha256: freshSha,
      old_raw_sha256: p.source?.raw_sha256 ?? null, new_raw_sha256: fresh.entry.source.raw_sha256,
      values_hash_method: VALUES_HASH_METHOD,
    }]);
  }
  const improved = fresh.entry.status === "COMPLETE" || fresh.entry.present_intervals > p.present_intervals;
  return take(improved ? "IMPROVED" : "UPDATED", p.revisions);
}

/** Record a failed fetch on every planned day without touching values. */
export function markFetchError(prev: RegisterEntry | null, dataset: Dataset, series: string, day: string, err: ErrorRef, nowUtc: string, today: string): RegisterEntry {
  if (prev) return { ...prev, last_checked_utc: nowUtc, last_error: err };
  return {
    dataset, series, day, status: day > today ? "NOT_PUBLISHED_YET" : "MISSING", resolution: null, expected_intervals: null, present_intervals: 0, missing_intervals: null,
    duplicates_within_tolerance: 0, conflicts: 0, selection: { rule_mode: "UNKNOWN", decision_ref: "", verified: null },
    source: null, values_sha256: null, values_hash_method: VALUES_HASH_METHOD, last_changed_utc: nowUtc, last_checked_utc: nowUtc, revisions: [], last_error: err,
  };
}

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

export interface PlanGroup { series: SeriesSpec; first: string; last: string; days: string[]; reason: Record<string, "NEW" | "INCOMPLETE" | "REVISION_CHECK"> }

/**
 * Days to fetch per series:
 *   - every day from historyStart to the last relevant day without a COMPLETE register entry (NEW / INCOMPLETE);
 *   - COMPLETE days within the revision window (today - revisionWindowDays .. today) are re-checked (REVISION_CHECK);
 *   - older COMPLETE days are not fetched.
 * Last relevant day: prices = today + 1 (day-ahead), flows and generation = today.
 * First day: historyStart; generation starts at the later of historyStart and generationHistoryStart.
 */
export function plan(series: SeriesSpec[], register: Map<string, RegisterEntry>, today: string, historyStart: string, revisionWindowDays: number,
  generationHistoryStart: string = GENERATION_HISTORY_START): PlanGroup[] {
  const groups: PlanGroup[] = [];
  const revFrom = addDays(today, -revisionWindowDays);
  for (const s of series) {
    const lastDay = s.dataset === "prices" ? addDays(today, 1) : today;
    const start = s.dataset === "generation" && generationHistoryStart > historyStart ? generationHistoryStart : historyStart;
    const reason: PlanGroup["reason"] = {};
    for (let d = start; d <= lastDay; d = addDays(d, 1)) {
      const e = register.get(regKey(s.dataset, s.label, d));
      if (!e) reason[d] = "NEW";
      else if (e.status !== "COMPLETE") reason[d] = "INCOMPLETE";
      else if (d >= revFrom) reason[d] = "REVISION_CHECK";
    }
    for (const g of groupContiguous(Object.keys(reason).sort(), MAX_DAYS_PER_REQUEST)) {
      const days: string[] = [];
      for (let d = g.first; d <= g.last; d = addDays(d, 1)) days.push(d);
      groups.push({ series: s, first: g.first, last: g.last, days, reason: Object.fromEntries(days.map(d => [d, reason[d]])) });
    }
  }
  return groups;
}
