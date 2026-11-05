/**
 * ELMONITOR A2 - acquisition with checkpoints (resumable).
 *
 * Reuses the unchanged ENTSO-E clients and the verified spike v3 rules:
 *   parse -> A03 expansion -> selection rule -> coverage per local day -> selected values -> A5 hourly.
 * Each request group is checkpointed under <work>/<run_id>/acquired/ before the next one starts,
 * so an interrupted run resumes without refetching completed groups.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { fetchDayAheadPrices, isSpotPriceError } from "../../packages/evidence/src/entsoe_client";
import { fetchCrossBorderFlows, fetchGenerationPerType, isFlowError, isGenerationError } from "../../packages/evidence/src/entsoe_generation_client";
import {
  addDays, applySelection, computeCoverageV3, expandIntervalsV3, hourlySeriesV3, isNoDataAck, localDayStartUtc,
  parseA11, parseA44, redact, ruleFor,
} from "../../spike/a_local_ingest/lib_v3";
import { interpretGeneration } from "./generation";
import { DayData, FreshDay, PlanGroup, seriesSlug } from "./model";
import { sha256 } from "./store";

export const RETRY_DELAYS_MS = [2000, 5000];
export const REQUEST_GAP_MS = 300;

export interface GroupResult {
  key: string;
  dataset: string; series: string; first: string; last: string;
  outcome: "PUBLICATION" | "NO_DATA" | "ERROR";
  attempts: { attempt: number; outcome: string; error_code?: string; error_text?: string; duration_ms: number }[];
  raw_sha256: string | null; raw_bytes: number | null; fetched_at_utc: string | null;
  error: { code: string; text: string } | null;
}

/**
 * A successful client response must be an ENTSO-E publication document. Anything else (e.g. the gateway's JSON
 * "uu-gateway-router/connectTimeout" body, an HTML error page) is a source fetch error: retried with the same
 * bounded delays, never checkpointed as PUBLICATION. (Fix after A2 local run 1, 2026-11-03.)
 */
export function isPublicationBody(body: string, dataset: string = "prices"): boolean {
  const t = body.replace(/^\uFEFF/, "").trimStart();
  // A75 (generation) answers with GL_MarketDocument; A44/A11 with Publication_MarketDocument. Each only for its dataset.
  const root = dataset === "generation" ? "GL_MarketDocument" : "Publication_MarketDocument";
  return t.startsWith("<") && new RegExp(`<([A-Za-z0-9_]+:)?${root}[\\s>]`).test(t);
}
export const INVALID_BODY_CODE = "SOURCE_INVALID_BODY";
const bodyExcerpt = (body: string) => body.replace(/\s+/g, " ").trim().slice(0, 200);

export const groupKey = (g: PlanGroup) => `${g.series.dataset}__${seriesSlug(g.series.label)}__${g.first}_${g.last}`;

export interface AcquireOptions {
  token: string;
  workRunDir: string;
  maxGroups?: number;          // test hook: stop after N newly fetched groups (simulated interruption)
  /** Time budget: no new group is started at or after this epoch ms (measured with now()). The groups not started
   *  are returned as deferred; they are not fetched, not merged and not marked as errors. */
  deadlineMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

/** Fetch (or load from checkpoint) every planned group. Returns results in plan order and whether the run was cut short. */
export async function acquire(groups: PlanGroup[], o: AcquireOptions): Promise<{ results: GroupResult[]; interrupted: boolean; deferred: number }> {
  const dir = join(o.workRunDir, "acquired");
  mkdirSync(dir, { recursive: true });
  const sleep = o.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)));
  const now = o.now ?? (() => new Date());
  const results: GroupResult[] = [];
  let fetched = 0;
  for (const g of groups) {
    const key = groupKey(g);
    const metaPath = join(dir, `${key}.json`);
    if (existsSync(metaPath)) { results.push(JSON.parse(readFileSync(metaPath, "utf-8"))); continue; }
    if (o.maxGroups !== undefined && fetched >= o.maxGroups) return { results, interrupted: true, deferred: 0 };
    if (o.deadlineMs !== undefined && now().getTime() >= o.deadlineMs) return { results, interrupted: false, deferred: groups.length - results.length };
    const periodStart = new Date(localDayStartUtc(g.first));
    const periodEnd = new Date(localDayStartUtc(addDays(g.last, 1)));
    const attempts: GroupResult["attempts"] = [];
    let res: GroupResult | null = null;
    for (let attempt = 1; ; attempt++) {
      const t0 = Date.now();
      const cfg = { securityToken: o.token, timeoutMs: 30000 };
      const r: any = g.series.dataset === "prices" ? await fetchDayAheadPrices(cfg, g.series.zone!, periodStart, periodEnd)
        : g.series.dataset === "generation" ? await fetchGenerationPerType(cfg, g.series.zone!, periodStart, periodEnd)
        : await fetchCrossBorderFlows(cfg, g.series.in_zone!, g.series.out_zone!, periodStart, periodEnd);
      const ms = Date.now() - t0;
      const isErr = g.series.dataset === "prices" ? isSpotPriceError(r) : g.series.dataset === "generation" ? isGenerationError(r) : isFlowError(r);
      const base = { key, dataset: g.series.dataset, series: g.series.label, first: g.first, last: g.last, attempts };
      if (isErr) {
        const text = redact(String(r.error_text ?? ""), o.token);
        if (isNoDataAck(r.error_text)) {
          attempts.push({ attempt, outcome: "NO_DATA", error_code: r.error_code, error_text: text, duration_ms: ms });
          res = { ...base, outcome: "NO_DATA", raw_sha256: null, raw_bytes: null, fetched_at_utc: now().toISOString(), error: null };
          break;
        }
        attempts.push({ attempt, outcome: "ERROR", error_code: r.error_code, error_text: text, duration_ms: ms });
        if (r.error_code === "FETCH_ERROR" && attempt <= RETRY_DELAYS_MS.length) { await sleep(RETRY_DELAYS_MS[attempt - 1]); continue; }
        res = { ...base, outcome: "ERROR", raw_sha256: null, raw_bytes: null, fetched_at_utc: null, error: { code: String(r.error_code), text } };
        break;
      }
      const body = String(r.raw_xml ?? "");
      if (!isPublicationBody(body, g.series.dataset)) {
        const text = redact(`not an ENTSO-E publication document (${Buffer.byteLength(body, "utf-8")} bytes): ${bodyExcerpt(body)}`, o.token);
        attempts.push({ attempt, outcome: "ERROR", error_code: INVALID_BODY_CODE, error_text: text, duration_ms: ms });
        if (attempt <= RETRY_DELAYS_MS.length) { await sleep(RETRY_DELAYS_MS[attempt - 1]); continue; }
        res = { ...base, outcome: "ERROR", raw_sha256: null, raw_bytes: null, fetched_at_utc: null, error: { code: INVALID_BODY_CODE, text } };
        break;
      }
      const raw = Buffer.from(body, "utf-8");
      const rawSha = sha256(raw);
      writeFileSync(join(dir, `${rawSha}.xml`), raw);
      attempts.push({ attempt, outcome: "PUBLICATION", duration_ms: ms });
      res = { ...base, outcome: "PUBLICATION", raw_sha256: rawSha, raw_bytes: raw.length, fetched_at_utc: now().toISOString(), error: null };
      break;
    }
    writeFileSync(metaPath, JSON.stringify(res, null, 2) + "\n", { flag: "wx" }); // checkpoint written once
    results.push(res!);
    fetched++;
    await sleep(REQUEST_GAP_MS);
  }
  return { results, interrupted: false, deferred: 0 };
}

export function loadRaw(workRunDir: string, rawSha: string): Buffer {
  const p = join(workRunDir, "acquired", `${rawSha}.xml`);
  const b = readFileSync(p);
  if (sha256(b) !== rawSha) throw new Error(`checkpoint raw ${rawSha} does not match its hash`);
  return b;
}

/**
 * Turn one PUBLICATION into per-day fresh results for the planned days, using the spike v3 rules.
 * A document that cannot be parsed into a publication yields an error instead of guessed days.
 */
export function interpret(g: PlanGroup, r: GroupResult, raw: Buffer | null, today: string, runId: string): { days: FreshDay[]; error: { code: string; text: string } | null } {
  const dataset = g.series.dataset;
  const days = g.days;
  for (let i = 0, d = g.first; i < days.length; i++, d = addDays(d, 1)) if (days[i] !== d) throw new Error(`plan group ${g.first}..${g.last} is not contiguous`);
  if (days[days.length - 1] !== g.last) throw new Error(`plan group ${g.first}..${g.last} does not end at its last day`);
  if (dataset === "generation") return interpretGeneration(g, r, raw, today, runId);
  let values: ReturnType<typeof expandIntervalsV3>["values"] = [];
  let issues: string[] = [];
  if (r.outcome === "PUBLICATION") {
    const xml = raw!.toString("utf-8");
    const doc = dataset === "prices" ? parseA44(xml) : parseA11(xml); // generation handled above
    if (doc.kind !== "PUBLICATION") return { days: [], error: { code: `SOURCE_${doc.kind}`, text: `${doc.ack_code ?? ""} ${doc.ack_text ?? ""}`.trim() || "not a publication document" } };
    const ex = expandIntervalsV3(doc, `raw/${r.raw_sha256}.xml`);
    values = ex.values;
    issues = ex.issues.map(i => `${i.kind}: ${i.detail}`);
    if (doc.series.length > 0 && values.length === 0) return { days: [], error: { code: "SOURCE_NO_VALUES", text: `publication without usable values${issues.length ? "; " + issues.slice(0, 3).join("; ") : ""}` } };
  }
  // Planned days are contiguous: keep values inside [start of first day, start of the day after the last).
  // (Numeric bounds instead of localDayOf per value: same result, without one Intl formatter per interval.)
  const lo = localDayStartUtc(g.first), hi = localDayStartUtc(addDays(g.last, 1));
  for (let i = 0, d = g.first; i < days.length; i++, d = addDays(d, 1)) if (days[i] !== d) throw new Error(`plan group ${g.first}..${g.last} is not contiguous`);
  if (days[days.length - 1] !== g.last) throw new Error(`plan group ${g.first}..${g.last} does not end at its last day`);
  const inScope = values.filter(v => { const t = Date.parse(v.start_utc); return t >= lo && t < hi; });
  const rule = ruleFor(dataset as "prices" | "flows", g.series.label);
  const sel = applySelection(inScope, rule);
  const { coverage, selected } = computeCoverageV3(g.series.label, days, sel.selected, {
    publishedThrough: today, inProgressFrom: dataset === "flows" ? today : null, rule,
  });
  const out: FreshDay[] = [];
  for (const c of coverage) {
    const res = c.complete_resolution ?? c.by_resolution[0]?.resolution ?? null;
    const dayStart = localDayStartUtc(c.day), dayEnd = localDayStartUtc(addDays(c.day, 1));
    const sel = selected.filter(s => s.resolution === res && Date.parse(s.start_utc) >= dayStart && Date.parse(s.start_utc) < dayEnd)
      .sort((a, b) => a.start_utc.localeCompare(b.start_utc));
    const rc = c.by_resolution.find(b => b.resolution === res) ?? null;
    const conflictStarts = new Set(c.conflicts.map(x => x.start_utc));
    const missing = rc ? [...rc.missing_starts_utc, ...[...conflictStarts]].sort() : [];
    const data: DayData = {
      status: c.status, resolution: res,
      values: sel.map(s => [s.start_utc, s.value, s.origin === "EXPLICIT" ? "E" : "R"]),
      hourly: hourlySeriesV3(sel).map(h => [h.start_utc, h.value]),
      missing_starts_utc: missing,
    };
    out.push({
      day: c.day, data,
      entry: {
        dataset, series: g.series.label, day: c.day, status: c.status, resolution: res,
        expected_intervals: rc?.expected ?? null, present_intervals: sel.length, missing_intervals: rc ? missing.length : null,
        duplicates_within_tolerance: c.duplicates_within_tolerance, conflicts: c.conflicts.length,
        selection: { rule_mode: rule.mode, decision_ref: rule.decision_ref, verified: c.selection_verified },
        source: {
          provider: "ENTSO-E Transparency Platform", document_type: dataset === "prices" ? "A44" : "A11",
          request_first_day: g.first, request_last_day: g.last,
          raw_sha256: r.raw_sha256 ?? "NO_DATA_ACKNOWLEDGEMENT", raw_bytes: r.raw_bytes ?? 0,
          fetched_at_utc: r.fetched_at_utc!, run_id: runId,
        },
      },
    });
  }
  return { days: out, error: null };
}
