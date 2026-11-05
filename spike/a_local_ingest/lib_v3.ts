/**
 * ELMONITOR SPIKE A v3 - pure functions (no I/O, no network).
 *
 * v3 = v2 plus the owner decisions of 2026-11-03:
 *   - per-series SELECTION RULES for bidding zones that publish more than one A44 series
 *     (DE_LU: classificationSequence 1, verified against Energy-Charts; DK1/DK2: duplicates
 *     equal within 1e-4 EUR/MWh are one value, the unlabeled series is the selected one);
 *   - IN_PROGRESS status for the running local day of physical flows;
 *   - one selected value per interval feeds the hourly series (conflicting intervals never do).
 *
 * Unchanged from v2 and imported from lib_v2 (which stays byte-identical): time helpers,
 * day handling, XML parsing. v1 (lib.ts) and v2 (lib_v2.ts) are not modified.
 *
 * This module never invents a value: every value is either an explicit <Point> in the
 * response or an A03 repetition of the immediately preceding explicit point inside the
 * same Period, and is labelled as such. Selection never switches to another series when
 * the selected one is absent: the interval is then missing.
 */

import {
  MARKET_TZ, tzOffsetMinutes, localDayStartUtc, addDays, localDayOf, localDayHours, expandDays,
  groupContiguous, resolutionMinutes, parseA44, parseA11, parseDoc, isNoDataAck, redact,
  ParsedDoc, ParsedSeries, ParsedPeriod, ValueOrigin, ExpansionIssue,
} from "./lib_v2";

export {
  MARKET_TZ, tzOffsetMinutes, localDayStartUtc, addDays, localDayOf, localDayHours, expandDays,
  groupContiguous, resolutionMinutes, parseA44, parseA11, parseDoc, isNoDataAck, redact,
};
export type { ParsedDoc, ParsedSeries, ParsedPeriod, ValueOrigin, ExpansionIssue };

// ---------------------------------------------------------------------------
// Interval expansion (v2 rule, plus the series' classificationSequence)
// ---------------------------------------------------------------------------

export interface IntervalValueV3 {
  start_utc: string;
  resolution: string;
  value: number;                          // EUR/MWh for A44, MW for A11
  origin: ValueOrigin;
  series_mrid: string | null;
  classification_sequence: string | null; // null = element absent in the TimeSeries
  source_file: string;
}

/**
 * Expand one parsed document into per-interval values.
 * A03: an omitted position repeats the previous explicit point of the same Period.
 * A01 (or missing / unknown curve type): omitted positions stay missing.
 */
export function expandIntervalsV3(doc: ParsedDoc, sourceFile: string): { values: IntervalValueV3[]; issues: ExpansionIssue[] } {
  const values: IntervalValueV3[] = [];
  const issues: ExpansionIssue[] = [];
  for (const s of doc.series) {
    const ct = s.curve_type;
    const repeat = ct === "A03";
    if (ct !== "A01" && ct !== "A03") {
      issues.push({ kind: "UNKNOWN_CURVE_TYPE", detail: `curveType=${ct} mRID=${s.mrid} treated as strict (no repeat)`, source_file: sourceFile });
    }
    for (const p of s.periods) {
      const resMin = resolutionMinutes(p.resolution);
      const startMs = Date.parse(p.start);
      const endMs = Date.parse(p.end);
      const nExact = (endMs - startMs) / (resMin * 60000);
      if (!Number.isInteger(nExact)) {
        issues.push({ kind: "NON_INTEGER_PERIOD", detail: `${p.start}..${p.end} ${p.resolution}`, source_file: sourceFile });
        continue;
      }
      const byPos = new Map<number, number>();
      for (const pt of p.points) {
        if (pt.position < 1 || pt.position > nExact) {
          issues.push({ kind: "POSITION_OUT_OF_RANGE", detail: `pos=${pt.position} n=${nExact} ${p.start}`, source_file: sourceFile });
          continue;
        }
        byPos.set(pt.position, pt.value);
      }
      let last: number | null = null;
      for (let pos = 1; pos <= nExact; pos++) {
        const t = new Date(startMs + (pos - 1) * resMin * 60000).toISOString();
        const base = { start_utc: t, resolution: p.resolution, series_mrid: s.mrid, classification_sequence: s.classification_sequence, source_file: sourceFile };
        if (byPos.has(pos)) {
          last = byPos.get(pos)!;
          values.push({ ...base, value: last, origin: "EXPLICIT" });
        } else if (repeat && last !== null) {
          values.push({ ...base, value: last, origin: "A03_REPEAT" });
        } else if (repeat && last === null) {
          issues.push({ kind: "LEADING_GAP", detail: `A03 period ${p.start} has no point at position 1..${pos}`, source_file: sourceFile });
        }
      }
    }
  }
  return { values, issues };
}

// ---------------------------------------------------------------------------
// Selection rules (owner decisions)
// ---------------------------------------------------------------------------

/**
 * ALL_EQUAL: all series are kept; duplicates must agree within `tolerance` (0 = exact, the v2 rule),
 *            otherwise the interval is a CONFLICT. When `prefer_unlabeled` is true the value of the
 *            series without classificationSequence is the selected one.
 * SEQUENCE:  only the series with classificationSequence === `sequence` is selected; every other
 *            series (including unlabeled ones) is kept in raw but NOT selected. No fallback.
 */
export type SelectionRule =
  | { mode: "ALL_EQUAL"; tolerance: number; prefer_unlabeled: boolean; decision_ref: string }
  | { mode: "SEQUENCE"; sequence: string; verified_from: string | null; verified_through: string | null; decision_ref: string };

export const DEFAULT_RULE: SelectionRule = { mode: "ALL_EQUAL", tolerance: 0, prefer_unlabeled: false, decision_ref: "v2 rule (exact equality)" };

/** Owner decisions 2026-11-03 for A44 prices. Series not listed use DEFAULT_RULE (SE1-SE4 and all flows included). */
export const PRICE_SELECTION_RULES_V3: Record<string, SelectionRule> = {
  DE_LU: {
    mode: "SEQUENCE", sequence: "1", verified_from: "2026-02-01", verified_through: "2026-11-03",
    decision_ref: "OWNER-DECISION 2026-11-03 option 2; verified DELU_EC_CHECK_20261103T142523Z (sequence 1 = Energy-Charts DE-LU, 276/276 days)",
  },
  DK1: { mode: "ALL_EQUAL", tolerance: 1e-4, prefer_unlabeled: true, decision_ref: "OWNER-DECISION 2026-11-03: tolerance 1e-4 EUR/MWh, unlabeled series selected" },
  DK2: { mode: "ALL_EQUAL", tolerance: 1e-4, prefer_unlabeled: true, decision_ref: "OWNER-DECISION 2026-11-03: tolerance 1e-4 EUR/MWh, unlabeled series selected" },
};

export function ruleFor(kind: "prices" | "flows", seriesLabel: string): SelectionRule {
  if (kind === "prices" && PRICE_SELECTION_RULES_V3[seriesLabel]) return PRICE_SELECTION_RULES_V3[seriesLabel];
  return DEFAULT_RULE;
}

export interface SelectionStats {
  rule: SelectionRule;
  values_in: number;
  values_selected: number;
  values_not_selected: number;
  not_selected_by_sequence: Record<string, number>; // "none" = no classificationSequence element
}

function seqKey(s: string | null): string { return s === null ? "none" : s; }

/** Split values into selected / not selected according to the rule. Pure; never alters a value. */
export function applySelection(values: IntervalValueV3[], rule: SelectionRule): { selected: IntervalValueV3[]; stats: SelectionStats } {
  const stats: SelectionStats = { rule, values_in: values.length, values_selected: 0, values_not_selected: 0, not_selected_by_sequence: {} };
  if (rule.mode === "ALL_EQUAL") {
    stats.values_selected = values.length;
    return { selected: values, stats };
  }
  const selected: IntervalValueV3[] = [];
  for (const v of values) {
    if (v.classification_sequence === rule.sequence) selected.push(v);
    else {
      const k = seqKey(v.classification_sequence);
      stats.not_selected_by_sequence[k] = (stats.not_selected_by_sequence[k] ?? 0) + 1;
    }
  }
  stats.values_selected = selected.length;
  stats.values_not_selected = values.length - selected.length;
  return { selected, stats };
}

// ---------------------------------------------------------------------------
// Coverage per local day
// ---------------------------------------------------------------------------

export type DayStatusV3 = "COMPLETE" | "PARTIAL" | "MISSING" | "NOT_PUBLISHED_YET" | "IN_PROGRESS" | "CONFLICT";

export interface ResolutionCoverageV3 {
  resolution: string;
  expected: number;
  present: number;
  explicit: number;
  a03_repeat: number;
  missing_starts_utc: string[];
}

export interface DayCoverageV3 {
  zone: string;
  day: string;
  day_hours: number;
  status: DayStatusV3;
  complete_resolution: string | null;
  by_resolution: ResolutionCoverageV3[];
  duplicates_equal: number;             // exact duplicates (any rule)
  duplicates_within_tolerance: number;  // duplicates differing by > 0 and <= tolerance
  max_duplicate_abs_diff: number;
  conflicts: { start_utc: string; resolution: string; values: number[] }[];
  selection_verified: boolean | null;   // SEQUENCE rule: day inside verified_from..verified_through; null otherwise
}

export interface CoverageOptions {
  /** Latest local day whose values must exist at run time (today). */
  publishedThrough: string;
  /**
   * First local day that may still be in publication (flows: today). A day >= this one that has
   * some but not all values is IN_PROGRESS instead of PARTIAL. null = no such day (prices).
   */
  inProgressFrom: string | null;
  rule: SelectionRule;
}

export interface SelectedInterval { start_utc: string; resolution: string; value: number; origin: ValueOrigin }

/**
 * Compute coverage for one series and the requested days from the SELECTED values
 * (applySelection first). Returns per-day coverage and one selected value per interval;
 * a conflicting interval yields no selected value.
 */
export function computeCoverageV3(zone: string, days: string[], selectedValues: IntervalValueV3[], opt: CoverageOptions): { coverage: DayCoverageV3[]; selected: SelectedInterval[] } {
  const tol = opt.rule.mode === "ALL_EQUAL" ? opt.rule.tolerance : 0;
  const preferUnlabeled = opt.rule.mode === "ALL_EQUAL" && opt.rule.prefer_unlabeled;
  const byKey = new Map<string, IntervalValueV3[]>();
  for (const v of selectedValues) {
    const k = `${v.resolution}|${v.start_utc}`;
    const arr = byKey.get(k);
    if (arr) arr.push(v); else byKey.set(k, [v]);
  }
  const resolutions = [...new Set(selectedValues.map(v => v.resolution))].sort((a, b) => resolutionMinutes(a) - resolutionMinutes(b));

  const coverage: DayCoverageV3[] = [];
  const selected: SelectedInterval[] = [];
  for (const day of days) {
    const startMs = localDayStartUtc(day);
    const endMs = localDayStartUtc(addDays(day, 1));
    const hours = (endMs - startMs) / 3600000;
    const byRes: ResolutionCoverageV3[] = [];
    let dupEqual = 0, dupTol = 0, maxDup = 0;
    const conflicts: DayCoverageV3["conflicts"] = [];

    for (const res of resolutions) {
      const step = resolutionMinutes(res) * 60000;
      const expected = (endMs - startMs) / step;
      let present = 0, explicit = 0, rep = 0;
      const missing: string[] = [];
      for (let t = startMs; t < endMs; t += step) {
        const iso = new Date(t).toISOString();
        const arr = byKey.get(`${res}|${iso}`);
        if (!arr) { missing.push(iso); continue; }
        present++;
        if (arr.some(a => a.origin === "EXPLICIT")) explicit++; else rep++;
        const vals = arr.map(a => a.value);
        const spread = Math.max(...vals) - Math.min(...vals);
        if (arr.length > 1) {
          if (spread > maxDup) maxDup = spread;
          if (spread === 0) dupEqual += arr.length - 1;
          else if (spread <= tol + 1e-12) dupTol += arr.length - 1;
          else { conflicts.push({ start_utc: iso, resolution: res, values: [...new Set(vals)] }); continue; }
        }
        // Selected value: unlabeled series when preferred and present, else the first explicit, else the first.
        const pick = (preferUnlabeled ? arr.find(a => a.classification_sequence === null) : undefined)
          ?? arr.find(a => a.origin === "EXPLICIT") ?? arr[0];
        selected.push({ start_utc: iso, resolution: res, value: pick.value, origin: arr.some(a => a.origin === "EXPLICIT") ? "EXPLICIT" : "A03_REPEAT" });
      }
      if (present > 0) byRes.push({ resolution: res, expected, present, explicit, a03_repeat: rep, missing_starts_utc: missing });
    }

    let status: DayStatusV3;
    let completeRes: string | null = null;
    const full = byRes.find(r => r.present === r.expected);
    const mayBeInProgress = opt.inProgressFrom !== null && day >= opt.inProgressFrom;
    if (conflicts.length > 0) status = "CONFLICT";
    else if (full) { status = "COMPLETE"; completeRes = full.resolution; }
    else if (byRes.length > 0) status = mayBeInProgress ? "IN_PROGRESS" : "PARTIAL";
    else status = day > opt.publishedThrough ? "NOT_PUBLISHED_YET" : "MISSING";

    let selectionVerified: boolean | null = null;
    if (opt.rule.mode === "SEQUENCE") {
      const r = opt.rule;
      selectionVerified = r.verified_from !== null && r.verified_through !== null && day >= r.verified_from && day <= r.verified_through;
    }

    coverage.push({
      zone, day, day_hours: hours, status, complete_resolution: completeRes, by_resolution: byRes,
      duplicates_equal: dupEqual, duplicates_within_tolerance: dupTol, max_duplicate_abs_diff: Math.round(maxDup * 1e9) / 1e9,
      conflicts, selection_verified: selectionVerified,
    });
  }
  return { coverage, selected };
}

// ---------------------------------------------------------------------------
// Hourly series (owner decision A5, adopted 2026-11-03) from SELECTED values only
// ---------------------------------------------------------------------------

export const HOURLY_METHOD_V3 = "PT60M_FROM_PT15M_ARITHMETIC_MEAN_OF_4_A5";

export interface HourlyValueV3 {
  start_utc: string;
  value: number;
  method: "NATIVE_PT60M" | typeof HOURLY_METHOD_V3;
}

/**
 * Native PT60M if present, else mean of the four PT15M quarters only when all four have a
 * selected value. Never fills an hour from fewer quarters; a conflicting quarter has no
 * selected value, so its hour is not produced.
 */
export function hourlySeriesV3(selected: SelectedInterval[]): HourlyValueV3[] {
  const native = new Map<string, number>();
  const quarters = new Map<string, Map<string, number>>();
  for (const v of selected) {
    if (v.resolution === "PT60M") native.set(v.start_utc, v.value);
    if (v.resolution === "PT15M") {
      const ms = Date.parse(v.start_utc);
      const hour = new Date(ms - (ms % 3600000)).toISOString();
      const m = quarters.get(hour) ?? new Map<string, number>();
      m.set(v.start_utc, v.value);
      quarters.set(hour, m);
    }
  }
  const out = new Map<string, HourlyValueV3>();
  for (const [h, qm] of quarters) {
    if (qm.size === 4) {
      const q = [...qm.values()];
      const mean = Math.round(((q[0] + q[1] + q[2] + q[3]) / 4) * 1e6) / 1e6;
      out.set(h, { start_utc: h, value: mean, method: HOURLY_METHOD_V3 });
    }
  }
  for (const [h, p] of native) out.set(h, { start_utc: h, value: p, method: "NATIVE_PT60M" });
  return [...out.values()].sort((a, b) => a.start_utc.localeCompare(b.start_utc));
}

// ---------------------------------------------------------------------------
// Request outcome per group (C4 on the final attempt)
// ---------------------------------------------------------------------------

export interface AttemptRecord { series_label: string; first_day: string; last_day: string; attempt: number; outcome: string }

/** Last attempt per (series_label, first_day, last_day); earlier failed attempts are listed separately. */
export function finalOutcomes<T extends AttemptRecord>(attempts: T[]): { final: T[]; retried_failures: T[] } {
  const last = new Map<string, T>();
  for (const a of attempts) {
    const k = `${a.series_label}|${a.first_day}|${a.last_day}`;
    const prev = last.get(k);
    if (!prev || a.attempt > prev.attempt) last.set(k, a);
  }
  const finalSet = new Set(last.values());
  return {
    final: [...last.values()],
    retried_failures: attempts.filter(a => !finalSet.has(a) && (a.outcome === "ERROR" || a.outcome === "UNKNOWN")),
  };
}
