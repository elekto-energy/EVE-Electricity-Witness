/**
 * ELMONITOR SPIKE A v2 - pure functions (no I/O, no network).
 * v2 = v1 generalised to any ENTSO-E point value: A44 <price.amount> (EUR/MWh) and
 * A11 <quantity> (MW). v1 (lib.ts) is kept unchanged as the instrument of stage 1/2.
 *
 * Parses ENTSO-E XML at TimeSeries level and computes coverage per series
 * (bidding zone, or directed border) x local delivery day (Europe/Stockholm),
 * including PT15M / PT60M resolution, DST days (23 h / 25 h) and the A03
 * curve-type rule (omitted positions repeat the previous point).
 *
 * This module never invents a value: every value is either an explicit
 * <Point> in the response or an A03 repetition of the immediately preceding
 * explicit point inside the same Period, and is labelled as such.
 */

export const MARKET_TZ = "Europe/Stockholm";

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/** Offset (minutes) of MARKET_TZ relative to UTC at a given instant. */
export function tzOffsetMinutes(utcMs: number, tz: string = MARKET_TZ): number {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - utcMs) / 60000);
}

/** UTC instant (ms) of local midnight starting the given local date (YYYY-MM-DD). */
export function localDayStartUtc(day: string, tz: string = MARKET_TZ): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new Error(`Invalid day: ${day}`);
  const naive = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0);
  let guess = naive - tzOffsetMinutes(naive, tz) * 60000;
  // Second pass settles transitions (local midnight is never inside a DST gap in Europe).
  guess = naive - tzOffsetMinutes(guess, tz) * 60000;
  return guess;
}

export function addDays(day: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new Error(`Invalid day: ${day}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  return d.toISOString().slice(0, 10);
}

/** Local delivery day (YYYY-MM-DD) containing the UTC instant. */
export function localDayOf(utcMs: number, tz: string = MARKET_TZ): string {
  const local = utcMs + tzOffsetMinutes(utcMs, tz) * 60000;
  return new Date(local).toISOString().slice(0, 10);
}

/** Length of a local day in hours (23, 24 or 25). */
export function localDayHours(day: string, tz: string = MARKET_TZ): number {
  return (localDayStartUtc(addDays(day, 1), tz) - localDayStartUtc(day, tz)) / 3600000;
}

/** Expand "a..b" ranges and single days into a sorted unique day list. */
export function expandDays(spec: string): string[] {
  const out = new Set<string>();
  for (const part of spec.split(",").map(s => s.trim()).filter(Boolean)) {
    const r = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(part);
    if (r) {
      if (r[1] > r[2]) throw new Error(`Range reversed: ${part}`);
      for (let d = r[1]; d <= r[2]; d = addDays(d, 1)) out.add(d);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(part)) {
      out.add(part);
    } else {
      throw new Error(`Invalid day spec: ${part}`);
    }
  }
  return [...out].sort();
}

/** Group sorted days into contiguous ranges, each at most maxDays long. */
export function groupContiguous(days: string[], maxDays: number): { first: string; last: string }[] {
  const groups: { first: string; last: string }[] = [];
  for (const d of days) {
    const g = groups[groups.length - 1];
    if (g && addDays(g.last, 1) === d && dayDiff(g.first, d) < maxDays) g.last = d;
    else groups.push({ first: d, last: d });
  }
  return groups;
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

export function resolutionMinutes(res: string): number {
  const m = /^PT(\d+)M$/.exec(res);
  if (m) return Number(m[1]);
  const h = /^PT(\d+)H$/.exec(res);
  if (h) return Number(h[1]) * 60;
  throw new Error(`Unsupported resolution: ${res}`);
}

// ---------------------------------------------------------------------------
// XML parsing at TimeSeries level
// ---------------------------------------------------------------------------

function text(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag.replace(/\./g, "\\.")}>([^<]*)</${tag.replace(/\./g, "\\.")}>`).exec(xml);
  return m ? m[1] : null;
}

function blocks(xml: string, tag: string): string[] {
  return xml.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "g")) ?? [];
}

export interface ParsedPeriod {
  start: string;
  end: string;
  resolution: string;
  points: { position: number; value: number }[];
}

export interface ParsedSeries {
  mrid: string | null;
  curve_type: string | null;
  classification_sequence: string | null;
  currency: string | null;
  unit: string | null;
  periods: ParsedPeriod[];
}

export interface ParsedDoc {
  kind: "PUBLICATION" | "ACKNOWLEDGEMENT" | "UNKNOWN";
  ack_code: string | null;
  ack_text: string | null;
  series: ParsedSeries[];
}

/** A44 day-ahead prices: point value tag <price.amount>. */
export function parseA44(xml: string): ParsedDoc {
  return parseDoc(xml, "price.amount");
}

/** A11 physical flows: point value tag <quantity>. */
export function parseA11(xml: string): ParsedDoc {
  return parseDoc(xml, "quantity");
}

/** True when an acknowledgement says the request had no data (not an access or request error). */
export function isNoDataAck(text: string | null): boolean {
  return !!text && /no matching data found/i.test(text);
}

export function parseDoc(xml: string, valueTag: string): ParsedDoc {
  if (xml.includes("Acknowledgement_MarketDocument")) {
    return { kind: "ACKNOWLEDGEMENT", ack_code: text(xml, "code"), ack_text: text(xml, "text"), series: [] };
  }
  if (!xml.includes("Publication_MarketDocument")) {
    return { kind: "UNKNOWN", ack_code: null, ack_text: null, series: [] };
  }
  const series: ParsedSeries[] = [];
  for (const ts of blocks(xml, "TimeSeries")) {
    const periods: ParsedPeriod[] = [];
    for (const p of blocks(ts, "Period")) {
      const start = text(p, "start");
      const end = text(p, "end");
      const resolution = text(p, "resolution");
      if (!start || !end || !resolution) continue;
      const points: { position: number; value: number }[] = [];
      for (const pt of blocks(p, "Point")) {
        const pos = text(pt, "position");
        const val = text(pt, valueTag);
        if (pos !== null && val !== null) points.push({ position: Number(pos), value: Number(val) });
      }
      points.sort((a, b) => a.position - b.position);
      periods.push({ start, end, resolution, points });
    }
    series.push({
      mrid: text(ts, "mRID"),
      curve_type: text(ts, "curveType"),
      classification_sequence: text(ts, "classificationSequence_AttributeInstanceComponent.position"),
      currency: text(ts, "currency_Unit.name"),
      unit: text(ts, "price_Measure_Unit.name") ?? text(ts, "quantity_Measure_Unit.name"),
      periods,
    });
  }
  return { kind: "PUBLICATION", ack_code: null, ack_text: null, series };
}

// ---------------------------------------------------------------------------
// Interval expansion
// ---------------------------------------------------------------------------

export type ValueOrigin = "EXPLICIT" | "A03_REPEAT";

export interface IntervalValue {
  start_utc: string;
  resolution: string;
  value: number;          // EUR/MWh for A44, MW for A11
  origin: ValueOrigin;
  series_mrid: string | null;
  source_file: string;
}

export interface ExpansionIssue {
  kind: "UNKNOWN_CURVE_TYPE" | "LEADING_GAP" | "POSITION_OUT_OF_RANGE" | "NON_INTEGER_PERIOD";
  detail: string;
  source_file: string;
}

/**
 * Expand one parsed document into per-interval values.
 * A03: an omitted position repeats the previous explicit point of the same Period.
 * A01 (or missing / unknown curve type): omitted positions stay missing.
 */
export function expandIntervals(doc: ParsedDoc, sourceFile: string): { values: IntervalValue[]; issues: ExpansionIssue[] } {
  const values: IntervalValue[] = [];
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
        if (byPos.has(pos)) {
          last = byPos.get(pos)!;
          values.push({ start_utc: t, resolution: p.resolution, value: last, origin: "EXPLICIT", series_mrid: s.mrid, source_file: sourceFile });
        } else if (repeat && last !== null) {
          values.push({ start_utc: t, resolution: p.resolution, value: last, origin: "A03_REPEAT", series_mrid: s.mrid, source_file: sourceFile });
        } else if (repeat && last === null) {
          issues.push({ kind: "LEADING_GAP", detail: `A03 period ${p.start} has no point at position 1..${pos}`, source_file: sourceFile });
        }
      }
    }
  }
  return { values, issues };
}

// ---------------------------------------------------------------------------
// Coverage per local day
// ---------------------------------------------------------------------------

export type DayStatus = "COMPLETE" | "PARTIAL" | "MISSING" | "NOT_PUBLISHED_YET" | "CONFLICT";

export interface ResolutionCoverage {
  resolution: string;
  expected: number;
  present: number;
  explicit: number;
  a03_repeat: number;
  missing_starts_utc: string[];
}

export interface DayCoverage {
  zone: string;
  day: string;
  day_hours: number;
  status: DayStatus;
  complete_resolution: string | null;
  by_resolution: ResolutionCoverage[];
  duplicates_equal: number;
  conflicts: { start_utc: string; resolution: string; values: number[] }[];
}

/**
 * Compute coverage for one zone and the requested days.
 * `publishedThrough` = latest local day whose values must exist at run time (today);
 * a later day without data is NOT_PUBLISHED_YET, an earlier or equal one is MISSING.
 */
export function computeCoverage(zone: string, days: string[], values: IntervalValue[], publishedThrough: string): DayCoverage[] {
  // Group values by resolution + start, detect duplicates/conflicts.
  const byKey = new Map<string, IntervalValue[]>();
  for (const v of values) {
    const k = `${v.resolution}|${v.start_utc}`;
    const arr = byKey.get(k);
    if (arr) arr.push(v);
    else byKey.set(k, [v]);
  }
  const resolutions = [...new Set(values.map(v => v.resolution))].sort(
    (a, b) => resolutionMinutes(a) - resolutionMinutes(b),
  );

  const out: DayCoverage[] = [];
  for (const day of days) {
    const startMs = localDayStartUtc(day);
    const endMs = localDayStartUtc(addDays(day, 1));
    const hours = (endMs - startMs) / 3600000;
    const byRes: ResolutionCoverage[] = [];
    let dupEqual = 0;
    const conflicts: DayCoverage["conflicts"] = [];

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
        if (arr.length > 1) {
          const distinct = [...new Set(arr.map(a => a.value))];
          if (distinct.length > 1) conflicts.push({ start_utc: iso, resolution: res, values: distinct });
          else dupEqual += arr.length - 1;
        }
      }
      if (present > 0) byRes.push({ resolution: res, expected, present, explicit, a03_repeat: rep, missing_starts_utc: missing });
    }

    let status: DayStatus;
    let completeRes: string | null = null;
    const full = byRes.find(r => r.present === r.expected);
    if (conflicts.length > 0) status = "CONFLICT";
    else if (full) { status = "COMPLETE"; completeRes = full.resolution; }
    else if (byRes.length > 0) status = "PARTIAL";
    else status = day > publishedThrough ? "NOT_PUBLISHED_YET" : "MISSING";

    out.push({ zone, day, day_hours: hours, status, complete_resolution: completeRes, by_resolution: byRes, duplicates_equal: dupEqual, conflicts });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Derived hourly (candidate rule, owner decision A5 pending)
// ---------------------------------------------------------------------------

export const DERIVED_HOURLY_METHOD = "PT60M_FROM_PT15M_ARITHMETIC_MEAN_OF_4_V0_CANDIDATE";

export interface HourlyValue {
  start_utc: string;
  value: number;          // same unit as the source intervals
  method: "NATIVE_PT60M" | typeof DERIVED_HOURLY_METHOD;
}

/**
 * Hourly series per local day: native PT60M if present, else mean of the four
 * PT15M quarters only when all four exist. Never fills an hour with fewer quarters.
 */
export function hourlySeries(values: IntervalValue[]): HourlyValue[] {
  const native = new Map<string, number>();
  // hour -> (quarter start -> value); keyed by start so equal duplicate series count once.
  const quarters = new Map<string, Map<string, number>>();
  for (const v of values) {
    if (v.resolution === "PT60M") native.set(v.start_utc, v.value);
    if (v.resolution === "PT15M") {
      const ms = Date.parse(v.start_utc);
      const hour = new Date(ms - (ms % 3600000)).toISOString();
      const m = quarters.get(hour) ?? new Map<string, number>();
      m.set(v.start_utc, v.value);
      quarters.set(hour, m);
    }
  }
  const out = new Map<string, HourlyValue>();
  for (const [h, qm] of quarters) {
    if (qm.size === 4) {
      const q = [...qm.values()];
      const mean = Math.round(((q[0] + q[1] + q[2] + q[3]) / 4) * 1e6) / 1e6;
      out.set(h, { start_utc: h, value: mean, method: DERIVED_HOURLY_METHOD });
    }
  }
  for (const [h, p] of native) out.set(h, { start_utc: h, value: p, method: "NATIVE_PT60M" });
  return [...out.values()].sort((a, b) => a.start_utc.localeCompare(b.start_utc));
}

/** Remove every occurrence of a secret from a string (for error texts). */
export function redact(s: string, secret: string): string {
  if (!secret) return s;
  return s.split(secret).join("[REDACTED]");
}
