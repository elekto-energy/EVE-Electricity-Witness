#!/usr/bin/env npx tsx
/**
 * ELMONITOR A2 - one run of the automated data chain.
 *
 *   plan     : every non-COMPLETE day from HISTORY_START, plus COMPLETE days inside the 14-day revision window
 *   acquire  : fetch per request group with retries; each group checkpointed (resumable with --resume)
 *   merge    : spike v3 rules; never degrade a COMPLETE day; revisions recorded; errors kept visible
 *   build    : deterministic files (data per series x month, coverage register, summary, meta)
 *   publish  : immutable objects + manifest, verified read-back, pointer switched last (see version.ts)
 *
 * Usage (from the repo root):
 *   npx tsx pipeline/a2/run_a2.ts --store local:<dir> [--work <dir>] [--today YYYY-MM-DD] [--resume <run_id>] [--dry-run]
 * Only local:<dir> stores exist in this phase (no cloud resource without OWNER-GO).
 * Token: ENTSOE_TOKEN from the environment, else apps/web/.env.local; never printed.
 *
 * Exit codes: 0 PUBLISHED / NO_CHANGE / DRY_RUN_OK, 3 PUBLISHED_WITH_SOURCE_ERRORS (errors visible in register and run report),
 *             1 PUBLISH_FAILED (previous version still live), 4 INTERRUPTED (resume with --resume), 2 setup error.
 */

import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { localDayOf, redact } from "../../spike/a_local_ingest/lib_v3";
import { acquire, AcquireOptions, GroupResult, interpret, loadRaw } from "./acquire";
import { A2_ID, A2_VERSION, allSeries, HISTORY_START, REVISION_WINDOW_DAYS, SeriesSpec, VALUES_HASH_METHOD } from "./config";
import { EMPTY_DAY_DATA, markFetchError, mergeDay, MergeOutcome, plan, regKey } from "./model";
import { openStore, stableJson, StorageAdapter } from "./store";
import { buildFiles, loadState, MigrationReport, publish, PublishError, PublishHooks, putDay } from "./version";
import INSTRUMENT_FILE_LIST from "./instrument_files.json";

const REPO_ROOT = resolve(__dirname, "..", "..");
/** Source files whose sha256 is recorded in every run report and manifest (list shared with the site build). */
export const INSTRUMENT_FILES: string[] = INSTRUMENT_FILE_LIST;

export function instrumentHashes(): Record<string, string> {
  return Object.fromEntries(INSTRUMENT_FILES.map(rel => {
    const p = join(REPO_ROOT, ...rel.split("/"));
    return [rel, existsSync(p) ? createHash("sha256").update(readFileSync(p)).digest("hex") : "MISSING"];
  }));
}

export interface RunOptions {
  store: StorageAdapter;
  workDir: string;
  token: string;
  today?: string;
  resumeRunId?: string;
  dryRun?: boolean;
  acquire?: Partial<AcquireOptions>;
  publishHooks?: PublishHooks;
  now?: () => Date;
  /** Time budget (epoch ms): groups not started by then are deferred to the next run (see acquire.ts). */
  deadlineMs?: number;
  /** Fetch the newest days first (plan sorted by last day, descending), so a time-limited run serves today first. */
  recentFirst?: boolean;
  /** Instrument hashes measured elsewhere (e.g. at site build time, where the sources are on disk). */
  instrument?: Record<string, string>;
  /** Test hook: plan only these series (default allSeries()). */
  series?: SeriesSpec[];
}

export interface RunReport {
  a2_id: string; a2_version: string; run_id: string; today: string; started_at_utc: string; finished_at_utc: string;
  status: "PUBLISHED" | "NO_CHANGE" | "DRY_RUN_OK" | "PUBLISHED_WITH_SOURCE_ERRORS" | "NO_CHANGE_WITH_SOURCE_ERRORS" | "PUBLISH_FAILED" | "INTERRUPTED";
  plan: { groups: number; days: number; by_reason: Record<string, number>; deferred_groups?: number; deferred_days?: number };
  groups: GroupResult[];
  source_errors: { series: string; first: string; last: string; code: string; text: string }[];
  merge: Record<string, number>;
  revisions: { series: string; day: string }[];
  regressions_refused: { series: string; day: string; text: string }[];
  publish: { status: string; stage?: string; error?: string; version_id?: string; previous_version_id: string | null };
  instrument: Record<string, string>;
  values_hash_method: string;
  migration: MigrationReport | null;
}

export async function runA2(o: RunOptions): Promise<{ report: RunReport; exitCode: number }> {
  const now = o.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const today = o.today ?? localDayOf(now().getTime());
  const runId = o.resumeRunId ?? `A2_${startedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`;
  const workRunDir = join(o.workDir, runId);
  if (o.resumeRunId && !existsSync(workRunDir)) throw new Error(`resume: no work dir ${workRunDir}`);
  mkdirSync(workRunDir, { recursive: true });

  // The plan is frozen in the work dir on the first attempt so a resumed run fetches exactly the same groups.
  const { state, pointer: previous, migration } = await loadState(o.store);
  const planPath = join(workRunDir, "plan.json");
  let planned;
  if (existsSync(planPath)) {
    const saved = JSON.parse(readFileSync(planPath, "utf-8"));
    if (saved.previous_version_id !== (previous?.version_id ?? null)) throw new Error("resume: published version changed since the interrupted run; start a new run");
    planned = saved.groups;
  } else {
    planned = plan(o.series ?? allSeries(), state.register, today, HISTORY_START, REVISION_WINDOW_DAYS);
    if (o.recentFirst) {
      planned = [...planned].sort((a: any, b: any) =>
        a.last !== b.last ? (a.last < b.last ? 1 : -1) : a.first !== b.first ? (a.first < b.first ? 1 : -1)
          : `${a.series.dataset}|${a.series.label}` < `${b.series.dataset}|${b.series.label}` ? -1 : 1);
    }
    writeFileSync(planPath, JSON.stringify({ today, previous_version_id: previous?.version_id ?? null, groups: planned }, null, 2) + "\n", { flag: "wx" });
  }
  const byReason: Record<string, number> = {};
  for (const g of planned) for (const r of Object.values(g.reason) as string[]) byReason[r] = (byReason[r] ?? 0) + 1;

  const report: RunReport = {
    a2_id: A2_ID, a2_version: A2_VERSION, run_id: runId, today, started_at_utc: startedAt, finished_at_utc: "",
    status: "INTERRUPTED", plan: { groups: planned.length, days: planned.reduce((s: number, g: any) => s + g.days.length, 0), by_reason: byReason },
    groups: [], source_errors: [], merge: {}, revisions: [], regressions_refused: [],
    publish: { status: "NOT_STARTED", previous_version_id: previous?.version_id ?? null }, instrument: o.instrument ?? instrumentHashes(),
    values_hash_method: VALUES_HASH_METHOD, migration,
  };

  const acq = await acquire(planned, { token: o.token, workRunDir, deadlineMs: o.deadlineMs, ...o.acquire });
  report.groups = acq.results;
  if (acq.deferred > 0) {
    report.plan.deferred_groups = acq.deferred;
    report.plan.deferred_days = planned.slice(acq.results.length).reduce((s: number, g: any) => s + g.days.length, 0);
  }
  if (acq.interrupted) {
    report.finished_at_utc = now().toISOString();
    writeFileSync(join(workRunDir, "RUN_REPORT.json"), stableJson(report));
    return { report, exitCode: 4 };
  }

  // Merge.
  const nowIso = now().toISOString();
  const rawUsed = new Map<string, Buffer>();
  const count = (k: MergeOutcome | "FETCH_ERROR") => { report.merge[k] = (report.merge[k] ?? 0) + 1; };
  for (let i = 0; i < acq.results.length; i++) {  // deferred groups (time budget) are left untouched
    const g = planned[i], r = acq.results[i];
    const raw = r.outcome === "PUBLICATION" ? loadRaw(workRunDir, r.raw_sha256!) : null;
    const err = r.outcome === "ERROR" ? r.error : null;
    const interp = err ? { days: [], error: err } : interpret(g, r, raw, today, runId);
    if (interp.error) {
      report.source_errors.push({ series: g.series.label, first: g.first, last: g.last, code: interp.error.code, text: redact(interp.error.text, o.token) });
      for (const d of g.days) {
        const k = regKey(g.series.dataset, g.series.label, d);
        state.register.set(k, markFetchError(state.register.get(k) ?? null, g.series.dataset, g.series.label, d,
          { run_id: runId, at_utc: nowIso, code: interp.error.code, text: redact(interp.error.text, o.token) }, nowIso, today));
        count("FETCH_ERROR");
      }
      continue;
    }
    for (const fd of interp.days) {
      const k = regKey(g.series.dataset, g.series.label, fd.day);
      const prevEntry = state.register.get(k) ?? null;
      const prevData = state.months.get(`${g.series.dataset}|${g.series.label}|${fd.day.slice(0, 7)}`)?.days[fd.day] ?? null;
      // A register entry without data (MISSING after a fetch error) is a previous state, not "nothing": merge -> IMPROVED, not NEW.
      const m = mergeDay(prevEntry ? { entry: prevEntry, data: prevData ?? EMPTY_DAY_DATA(prevEntry.status) } : null, fd, runId, nowIso);
      count(m.outcome);
      state.register.set(k, m.entry);
      putDay(state, g.series.dataset, g.series.label, fd.day, m.data);
      if (m.outcome === "REVISED") report.revisions.push({ series: g.series.label, day: fd.day });
      if (m.outcome === "REGRESSION_REFUSED") report.regressions_refused.push({ series: g.series.label, day: fd.day, text: m.entry.last_error!.text });
      if (["NEW", "IMPROVED", "REVISED", "UPDATED"].includes(m.outcome) && raw) rawUsed.set(r.raw_sha256!, raw);
    }
  }

  // Build + publish.
  const files = buildFiles(state);
  const hasSourceErrors = report.source_errors.length > 0;
  if (o.dryRun) {
    report.status = "DRY_RUN_OK";
    report.publish = { status: "SKIPPED_DRY_RUN", previous_version_id: previous?.version_id ?? null };
    writeFileSync(join(workRunDir, "RUN_REPORT.json"), stableJson(report));
    return { report, exitCode: 0 };
  }
  let exitCode = 0;
  try {
    const p = await publish(o.store, files, rawUsed, previous, { run_id: runId, built_at_utc: nowIso, instrument: report.instrument, migration }, o.publishHooks);
    report.publish = { status: p.status, version_id: p.pointer.version_id, previous_version_id: previous?.version_id ?? null };
    report.status = p.status === "PUBLISHED" ? (hasSourceErrors ? "PUBLISHED_WITH_SOURCE_ERRORS" : "PUBLISHED") : (hasSourceErrors ? "NO_CHANGE_WITH_SOURCE_ERRORS" : "NO_CHANGE");
    exitCode = hasSourceErrors ? 3 : 0;
  } catch (e: any) {
    report.status = "PUBLISH_FAILED";
    report.publish = { status: "FAILED", stage: e instanceof PublishError ? e.stage : "UNKNOWN", error: String(e?.message ?? e), previous_version_id: previous?.version_id ?? null };
    exitCode = 1;
  }
  report.finished_at_utc = now().toISOString();
  const rb = Buffer.from(stableJson(report), "utf-8");
  writeFileSync(join(workRunDir, "RUN_REPORT.json"), rb);
  try { await o.store.put(`runs/${runId}.json`, rb, { immutable: true }); }
  catch (e: any) { report.publish.error = `${report.publish.error ?? ""} [run report not stored: ${e?.message ?? e}]`.trim(); if (exitCode === 0) exitCode = 1; }
  return { report, exitCode };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function arg(name: string): string | null { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null; }
function getToken(): string {
  if (process.env.ENTSOE_TOKEN) return process.env.ENTSOE_TOKEN.trim();
  const envPath = join(REPO_ROOT, "apps", "web", ".env.local");
  if (existsSync(envPath)) for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) { const m = line.match(/^ENTSOE_TOKEN=(.+)$/); if (m) return m[1].trim(); }
  throw new Error("ENTSOE_TOKEN not found in environment or apps/web/.env.local");
}

if (require.main === module) {
  (async () => {
    const storeSpec = arg("--store");
    if (!storeSpec) { console.error("[a2] SETUP ERROR: --store local:<dir> required"); process.exit(2); }
    let token = "";
    try {
      token = getToken();
      const today = arg("--today") ?? undefined;
      if (today && !/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("--today must be YYYY-MM-DD");
      const { report, exitCode } = await runA2({
        store: openStore(storeSpec), workDir: resolve(arg("--work") ?? join(REPO_ROOT, "pipeline", "a2", "work")), token,
        today, resumeRunId: arg("--resume") ?? undefined, dryRun: process.argv.includes("--dry-run"),
      });
      console.log(`[a2] run=${report.run_id} status=${report.status} plan_groups=${report.plan.groups} plan_days=${report.plan.days} merge=${JSON.stringify(report.merge)}`);
      console.log(`[a2] source_errors=${report.source_errors.length} revisions=${report.revisions.length} regressions_refused=${report.regressions_refused.length} values_hash_method=${report.values_hash_method}`);
      if (report.migration) console.log(`[a2] migration=${JSON.stringify(report.migration)}`);
      console.log(`[a2] publish=${JSON.stringify(report.publish)}`);
      process.exit(exitCode);
    } catch (e: any) {
      console.error(`[a2] SETUP ERROR: ${redact(String(e?.message ?? e), token)}`);
      process.exit(2);
    }
  })();
}
