/**
 * ELMONITOR A2 - A75 "actual generation per production type" (dataset "generation").
 *
 * Measured on real A75 responses (D:\EVE11\Projects\013_elekto_eu\data\raw\entsoe_generation\..._202602, six zones):
 *   - root element GL_MarketDocument (not Publication_MarketDocument, so spike parseDoc does not apply);
 *   - one TimeSeries per psrType and direction; production series carry inBiddingZone_Domain.mRID,
 *     consumption series (pumped storage B10, storage B25) carry outBiddingZone_Domain.mRID;
 *   - curveType A03, resolution PT15M, a series may have several Periods; values in <quantity> (MW).
 *
 * Rules (A2 generation rule, producer choice 2026-11-05, pending owner confirmation):
 *   - only production series (inBiddingZone) are used; consumption series are excluded and counted;
 *   - per psrType: lib_v3 expansion (A03 repeat), exact-equality duplicates, coverage per local day;
 *     hourly MW = native PT60M, or the mean of the four PT15M quarters only when all four exist (A5);
 *   - expected types of a day = every psrType that has at least one value inside the request window;
 *   - a day is COMPLETE when every expected type has every hour of the local day (23/24/25 h);
 *     some hours missing: IN_PROGRESS for the running day (today), PARTIAL before; nothing at all: MISSING;
 *     a duplicate conflict in any type: CONFLICT. Missing hours are listed, never filled.
 */

import {
  addDays, applySelection, computeCoverageV3, DEFAULT_RULE, expandIntervalsV3, hourlySeriesV3, localDayStartUtc,
} from "../../spike/a_local_ingest/lib_v3";
import type { ParsedDoc, ParsedPeriod, ParsedSeries } from "../../spike/a_local_ingest/lib_v3";
import type { GroupResult } from "./acquire";
import { DayData, FreshDay, HourTuple, PlanGroup } from "./model";
import type { DayStatusV3 } from "../../spike/a_local_ingest/lib_v3";

export const GENERATION_RULE_REF = "A2 generation rule 2026-11-05 (production series only, exact equality, every reported type every hour)";

function text(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag.replace(/\./g, "\\.")}(?:\\s[^>]*)?>([^<]*)</${tag.replace(/\./g, "\\.")}>`).exec(xml);
  return m ? m[1] : null;
}
const blocks = (xml: string, tag: string): string[] => xml.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "g")) ?? [];

export interface ParsedA75 {
  kind: "PUBLICATION" | "ACKNOWLEDGEMENT" | "UNKNOWN";
  ack_code: string | null;
  ack_text: string | null;
  /** production series per psrType, as spike ParsedDoc so lib_v3 expansion applies unchanged */
  byType: Map<string, ParsedDoc>;
  consumption_series_excluded: number;
}

export function parseA75(xml: string): ParsedA75 {
  if (xml.includes("Acknowledgement_MarketDocument")) {
    return { kind: "ACKNOWLEDGEMENT", ack_code: text(xml, "code"), ack_text: text(xml, "text"), byType: new Map(), consumption_series_excluded: 0 };
  }
  if (!/<([A-Za-z0-9_]+:)?GL_MarketDocument[\s>]/.test(xml)) {
    return { kind: "UNKNOWN", ack_code: null, ack_text: null, byType: new Map(), consumption_series_excluded: 0 };
  }
  const byType = new Map<string, ParsedDoc>();
  let excluded = 0;
  for (const ts of blocks(xml, "TimeSeries")) {
    const psr = text(ts, "psrType");
    if (!psr) continue;
    const isIn = ts.includes("inBiddingZone_Domain.mRID"), isOut = ts.includes("outBiddingZone_Domain.mRID");
    if (!isIn) { if (isOut) excluded++; continue; }
    const periods: ParsedPeriod[] = [];
    for (const p of blocks(ts, "Period")) {
      const start = text(p, "start"), end = text(p, "end"), resolution = text(p, "resolution");
      if (!start || !end || !resolution) continue;
      const points: { position: number; value: number }[] = [];
      for (const pt of blocks(p, "Point")) {
        const pos = text(pt, "position"), val = text(pt, "quantity");
        if (pos !== null && val !== null) points.push({ position: Number(pos), value: Number(val) });
      }
      points.sort((a, b) => a.position - b.position);
      periods.push({ start, end, resolution, points });
    }
    const s: ParsedSeries = {
      mrid: text(ts, "mRID"), curve_type: text(ts, "curveType"), classification_sequence: null,
      currency: null, unit: text(ts, "quantity_Measure_Unit.name"), periods,
    };
    const d = byType.get(psr) ?? { kind: "PUBLICATION" as const, ack_code: null, ack_text: null, series: [] };
    d.series.push(s);
    byType.set(psr, d);
  }
  return { kind: "PUBLICATION", ack_code: null, ack_text: null, byType, consumption_series_excluded: excluded };
}

/** One PUBLICATION (or NO_DATA) of a generation group -> per-day fresh results. */
export function interpretGeneration(g: PlanGroup, r: GroupResult, raw: Buffer | null, today: string, runId: string):
  { days: FreshDay[]; error: { code: string; text: string } | null } {
  const days = g.days;
  const lo = localDayStartUtc(g.first), hi = localDayStartUtc(addDays(g.last, 1));
  const perType = new Map<string, ReturnType<typeof computeCoverageV3>>();
  let excluded = 0;
  if (r.outcome === "PUBLICATION") {
    const doc = parseA75(raw!.toString("utf-8"));
    if (doc.kind !== "PUBLICATION") return { days: [], error: { code: `SOURCE_${doc.kind}`, text: `${doc.ack_code ?? ""} ${doc.ack_text ?? ""}`.trim() || "not a GL_MarketDocument" } };
    excluded = doc.consumption_series_excluded;
    const issues: string[] = [];
    for (const [psr, d] of doc.byType) {
      const ex = expandIntervalsV3(d, `raw/${r.raw_sha256}.xml`);
      issues.push(...ex.issues.map(i => `${psr} ${i.kind}: ${i.detail}`));
      const inScope = ex.values.filter(v => { const t = Date.parse(v.start_utc); return t >= lo && t < hi; });
      if (inScope.length === 0) continue; // type not reported inside this window
      const sel = applySelection(inScope, DEFAULT_RULE);
      perType.set(psr, computeCoverageV3(`${g.series.label}|${psr}`, days, sel.selected, { publishedThrough: today, inProgressFrom: today, rule: DEFAULT_RULE }));
    }
    if (doc.byType.size > 0 && perType.size === 0 && issues.length > 0) {
      return { days: [], error: { code: "SOURCE_NO_VALUES", text: `publication without usable values; ${issues.slice(0, 3).join("; ")}` } };
    }
  }
  const types = [...perType.keys()].sort();
  const out: FreshDay[] = [];
  for (const day of days) {
    const dayStart = localDayStartUtc(day), dayEnd = localDayStartUtc(addDays(day, 1));
    const hours: string[] = [];
    for (let t = dayStart; t < dayEnd; t += 3600000) hours.push(new Date(t).toISOString());
    const byType: Record<string, HourTuple[]> = {};
    const resolutions = new Set<string>();
    let conflicts = 0, dupTol = 0;
    const missingHours = new Set<string>();
    for (const psr of types) {
      const cov = perType.get(psr)!;
      const c = cov.coverage.find(x => x.day === day)!;
      conflicts += c.conflicts.length;
      dupTol += c.duplicates_within_tolerance;
      for (const b of c.by_resolution) resolutions.add(b.resolution);
      const sel = cov.selected.filter(s => { const t = Date.parse(s.start_utc); return t >= dayStart && t < dayEnd; });
      const hourly = hourlySeriesV3(sel).map(h => [h.start_utc, h.value] as HourTuple);
      const have = new Set(hourly.map(h => h[0]));
      for (const h of hours) if (!have.has(h)) missingHours.add(h);
      if (hourly.length) byType[psr] = hourly;
    }
    const present = Object.values(byType).reduce((s, a) => s + a.length, 0);
    let status: DayStatusV3;
    if (conflicts > 0) status = "CONFLICT";
    else if (types.length > 0 && missingHours.size === 0) status = "COMPLETE";
    else if (present > 0) status = day >= today ? "IN_PROGRESS" : "PARTIAL";
    else status = day > today ? "NOT_PUBLISHED_YET" : "MISSING";
    const res = resolutions.size === 0 ? null : [...resolutions].sort().join("+");
    const missing = [...missingHours].sort();
    const data: DayData = { status, resolution: res, values: [], hourly: [], missing_starts_utc: missing, by_type: byType };
    out.push({
      day, data,
      entry: {
        dataset: "generation", series: g.series.label, day, status, resolution: res,
        expected_intervals: types.length * hours.length, present_intervals: present, missing_intervals: types.length ? types.length * hours.length - present : null,
        duplicates_within_tolerance: dupTol, conflicts,
        selection: { rule_mode: "ALL_EQUAL", decision_ref: `${GENERATION_RULE_REF}; consumption series excluded: ${excluded}`, verified: null },
        source: {
          provider: "ENTSO-E Transparency Platform", document_type: "A75",
          request_first_day: g.first, request_last_day: g.last,
          raw_sha256: r.raw_sha256 ?? "NO_DATA_ACKNOWLEDGEMENT", raw_bytes: r.raw_bytes ?? 0,
          fetched_at_utc: r.fetched_at_utc!, run_id: runId,
        },
      },
    });
  }
  return { days: out, error: null };
}
