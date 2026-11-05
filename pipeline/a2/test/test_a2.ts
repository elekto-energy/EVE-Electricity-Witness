/**
 * Offline tests for the ELMONITOR A2 data chain (no network, no token, no cloud).
 * Run from the repo root: npx tsx pipeline/a2/test/test_a2.ts
 * Scenarios required by OWNER-GO A2: normal run, restart, bad source data, missing periods, DST, duplicates,
 * rerun, interrupted publication; plus revision, regression refusal, concurrent pointer change, workflow guards.
 */

import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { addDays } from "../../../spike/a_local_ingest/lib_v3";
import { acquire, interpret, isPublicationBody } from "../acquire";
import { allSeries, HISTORY_START, VALUES_HASH_METHOD, VALUES_HASH_METHOD_V1_LEGACY } from "../config";
import { DayData, FreshDay, mergeDay, plan, regKey, RegisterEntry, seriesSlug, valuesSha } from "../model";
import { runA2 } from "../run_a2";
import { LocalDirAdapter, sha256, StorageAdapter } from "../store";
import { buildFiles, CURRENT_KEY, loadState, publish, putDay, resolveVerified, State } from "../version";
import { MockEntsoe } from "./mock_entsoe";

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); }
}
const tmp = (p: string) => mkdtempSync(join(tmpdir(), `a2-${p}-`));
const TODAY = "2026-03-31";
const NOW = new Date("2026-03-31T10:00:00.000Z");      // before the day-ahead result for 2026-04-01
const noSleep = async () => {};

function freshMock(): MockEntsoe {
  const m = new MockEntsoe();
  m.priceCutoffDay = TODAY;
  m.flowsUntilMs = NOW.getTime() - 3600000;
  // Real-world-like gap: SE4>SE3 2026-03-28 stops at 04:00Z (76 of 96 quarters missing).
  for (let t = Date.parse("2026-03-28T04:00:00Z"); t < Date.parse("2026-03-28T23:00:00Z"); t += 900000) m.gaps.add(`SE4>SE3|${new Date(t).toISOString()}`);
  // Two scattered quarters missing on SE2>SE1 2026-03-10.
  m.gaps.add("SE2>SE1|2026-03-10T05:15:00.000Z"); m.gaps.add("SE2>SE1|2026-03-10T05:30:00.000Z");
  m.install();
  return m;
}

async function run(store: StorageAdapter, work: string, extra: Partial<Parameters<typeof runA2>[0]> = {}, now = NOW, today = TODAY) {
  return runA2({ store, workDir: work, token: "TEST-TOKEN-NOT-A-SECRET", today, now: () => now, acquire: { sleep: noSleep, now: () => now }, ...extra });
}

class FaultyAdapter implements StorageAdapter {
  readonly kind = "faulty";
  puts = 0;
  constructor(readonly inner: StorageAdapter, readonly failPutAt: number | null = null, readonly corruptGetPrefix: string | null = null) {}
  // Read-back corruption only after this run started writing (the published state loads cleanly).
  get(k: string) { return this.inner.get(k).then(b => (b && this.puts > 0 && this.corruptGetPrefix && k.startsWith(this.corruptGetPrefix)) ? Buffer.concat([b, Buffer.from(" ")]) : b); }
  exists(k: string) { return this.inner.exists(k); }
  list(p: string) { return this.inner.list(p); }
  async put(k: string, b: Buffer, o: { immutable: boolean }) {
    this.puts++;
    if (this.failPutAt !== null && this.puts === this.failPutAt) throw new Error("simulated network failure during upload");
    return this.inner.put(k, b, o);
  }
}

function fileJson(files: Map<string, Buffer>, path: string): any { return JSON.parse(files.get(path)!.toString("utf-8")); }
function entries(files: Map<string, Buffer>, dataset: string, series: string): RegisterEntry[] {
  const pre = `coverage/${dataset}/${seriesSlug(series)}/`;
  return [...files.keys()].filter(k => k.startsWith(pre)).sort().flatMap(k => fileJson(files, k).entries);
}

(async () => {
  // ---------------- 1. Normal first run ----------------
  let mock = freshMock();
  const storeDir = tmp("store"), work = tmp("work");
  const store = new LocalDirAdapter(storeDir);
  let r = await run(store, work);
  check("N1 first run PUBLISHED, exit 0", r.report.status === "PUBLISHED" && r.exitCode === 0, `${r.report.status} ${JSON.stringify(r.report.publish)}`);
  let cur = await resolveVerified(store);
  check("N2 published version verifies (pointer -> manifest -> objects)", !!cur && cur.pointer.version_id === r.report.publish.version_id);
  const files1 = cur!.files;
  const se3 = entries(files1, "prices", "SE3");
  check("N3 SE3 prices: every day from HISTORY_START to today COMPLETE", se3.filter(e => e.day <= TODAY).every(e => e.status === "COMPLETE") && se3[0].day === HISTORY_START, JSON.stringify(se3.find(e => e.status !== "COMPLETE")));
  check("N4 tomorrow's prices NOT_PUBLISHED_YET before the auction result", se3.find(e => e.day === addDays(TODAY, 1))?.status === "NOT_PUBLISHED_YET");
  const flowToday = entries(files1, "flows", "SE3>SE4").find(e => e.day === TODAY)!;
  check("N5 flows running day IN_PROGRESS", flowToday.status === "IN_PROGRESS");
  check("N6 register carries source, timestamp and checksum", !!se3[10].source && /^[0-9a-f]{64}$/.test(se3[10].source!.raw_sha256) && !!se3[10].source!.fetched_at_utc && /^[0-9a-f]{64}$/.test(se3[10].values_sha256!));
  check("N7 raw evidence stored and hash-verified", !!(await store.get(`raw/${se3[10].source!.raw_sha256}.xml`)) && sha256((await store.get(`raw/${se3[10].source!.raw_sha256}.xml`))!) === se3[10].source!.raw_sha256);
  check("N8 run report stored", !!(await store.get(`runs/${r.report.run_id}.json`)));

  // ---------------- 2. DST ----------------
  const dst = se3.find(e => e.day === "2026-03-29")!;
  const dstData = fileJson(files1, "data/prices/SE3/2026-03.json").days["2026-03-29"];
  check("D1 2026-03-29 COMPLETE with 92 quarters", dst.status === "COMPLETE" && dst.expected_intervals === 92 && dst.present_intervals === 92);
  check("D2 2026-03-29 hourly has 23 hours", dstData.hourly.length === 23);

  // ---------------- 3. Missing periods (never filled) ----------------
  const gapE = entries(files1, "flows", "SE4>SE3").find(e => e.day === "2026-03-28")!;
  const gapD = fileJson(files1, "data/flows/SE4_to_SE3/2026-03.json").days["2026-03-28"];
  check("M1 gap day PARTIAL with 76 missing of 96", gapE.status === "PARTIAL" && gapE.missing_intervals === 76 && gapE.expected_intervals === 96, JSON.stringify({ s: gapE.status, m: gapE.missing_intervals }));
  check("M2 no value published for any missing quarter", gapD.values.every((v: any) => !gapD.missing_starts_utc.includes(v[0])) && gapD.values.length === 20 && gapD.missing_starts_utc.length === 76);
  check("M3 no hourly value for an hour with a missing quarter", gapD.hourly.length === 5, String(gapD.hourly.length));
  const sc = entries(files1, "flows", "SE2>SE1").find(e => e.day === "2026-03-10")!;
  check("M4 scattered gap: 2 missing quarters, hour 05Z dropped only", sc.status === "PARTIAL" && sc.missing_intervals === 2 && fileJson(files1, "data/flows/SE2_to_SE1/2026-03.json").days["2026-03-10"].hourly.length === 23);
  const summary = fileJson(files1, "coverage/summary.json").series;
  check("M5 summary lists the gaps with their missing counts", summary["flows|SE4>SE3"].not_complete.some((x: any) => x.day === "2026-03-28" && x.missing_intervals === 76) && summary["flows|SE4>SE3"].missing_intervals_total >= 76);

  // ---------------- 4. Duplicates and sequence selection ----------------
  const de = entries(files1, "prices", "DE_LU").find(e => e.day === "2026-03-15")!;
  const deD = fileJson(files1, "data/prices/DE_LU/2026-03.json").days["2026-03-15"];
  check("S1 DE_LU COMPLETE from sequence 1, no conflict", de.status === "COMPLETE" && de.conflicts === 0 && de.selection.rule_mode === "SEQUENCE" && de.selection.verified === true);
  check("S2 DE_LU values are sequence 1 (not +40)", deD.values[0][1] === mock.value("DE_LU", Date.parse(deD.values[0][0])));
  const dk = entries(files1, "prices", "DK1").find(e => e.day === "2026-03-15")!;
  const dkD = fileJson(files1, "data/prices/DK1/2026-03.json").days["2026-03-15"];
  check("S3 DK1 duplicates within 1e-4 merged, unlabeled value kept", dk.status === "COMPLETE" && dk.duplicates_within_tolerance > 0 && dkD.values[0][1] === mock.value("DK1", Date.parse(dkD.values[0][0])));
  // Selection outside the verified period: interpret a DE_LU group for 2026-11-04 directly.
  {
    const g = plan([{ dataset: "prices", label: "DE_LU", zone: "DE_LU" }], new Map(), "2026-11-04", "2026-11-04", 0)[0];
    const m2 = new MockEntsoe(); m2.install();
    const resp: any = await (globalThis as any).fetch(`https://x/api?documentType=A44&in_Domain=10Y1001A1001A82H&out_Domain=10Y1001A1001A82H&periodStart=202611032300&periodEnd=202611042300`);
    const raw = Buffer.from(await resp.text());
    const out = interpret(g, { key: "k", dataset: "prices", series: "DE_LU", first: "2026-11-04", last: "2026-11-04", outcome: "PUBLICATION", attempts: [], raw_sha256: sha256(raw), raw_bytes: raw.length, fetched_at_utc: NOW.toISOString(), error: null }, raw, "2026-11-04", "T");
    const d4 = out.days.find(x => x.day === "2026-11-04")!;
    check("S4 DE_LU 2026-11-04: COMPLETE but selection.verified=false (coverage and verification kept apart)", d4.entry.status === "COMPLETE" && d4.entry.selection.verified === false);
    mock.install();
  }

  // ---------------- 5. Rerun (idempotent) ----------------
  const v1 = cur!.pointer.version_id;
  const callsBefore = mock.calls;
  r = await run(store, work, {}, new Date(NOW.getTime() + 60000));
  cur = await resolveVerified(store);
  check("R1 rerun with unchanged source = NO_CHANGE, pointer unchanged", r.report.status === "NO_CHANGE" && cur!.pointer.version_id === v1, r.report.status);
  const reasons = r.report.plan.by_reason;
  check("R2 rerun fetches only incomplete days + 14-day revision window (no NEW)", !reasons.NEW && (reasons.REVISION_CHECK ?? 0) > 0 && mock.calls - callsBefore === r.report.plan.groups, JSON.stringify(reasons));

  // ---------------- 6. Revision and regression ----------------
  const revDay = "2026-03-25", revT = Date.parse("2026-03-25T10:00:00Z");
  mock.overrides.set(`SE3|${new Date(revT).toISOString()}`, 999.99);
  for (let t = Date.parse("2026-03-26T12:00:00Z"); t < Date.parse("2026-03-26T13:00:00Z"); t += 900000) mock.gaps.add(`SE1>SE2|${new Date(t).toISOString()}`);
  r = await run(store, work, {}, new Date(NOW.getTime() + 120000));
  cur = await resolveVerified(store);
  const rev = entries(cur!.files, "prices", "SE3").find(e => e.day === revDay)!;
  check("V1 source revision inside window detected and published as REVISED with old/new hashes", r.report.status === "PUBLISHED" && r.report.revisions.some(x => x.series === "SE3" && x.day === revDay) && rev.revisions.length === 1 && rev.revisions[0].old_values_sha256 !== rev.revisions[0].new_values_sha256);
  const reg = entries(cur!.files, "flows", "SE1>SE2").find(e => e.day === "2026-03-26")!;
  check("V2 a COMPLETE day that now comes back incomplete is not degraded; error visible", reg.status === "COMPLETE" && reg.last_error?.code === "REGRESSION_REFUSED");
  mock.gaps.clear(); freshMock().gaps.forEach(g => mock.gaps.add(g)); mock.install();

  // ---------------- 7. Bad source data ----------------
  const before = (await resolveVerified(store))!;
  mock.failures.push({ series: "FI", mode: "unauthorized", times: 50 }, { series: "SE3>FI", mode: "malformed", times: 50 }, { series: "SE1>FI", mode: "abort", times: 1 });
  r = await run(store, work, {}, new Date(NOW.getTime() + 180000));
  cur = await resolveVerified(store);
  const fi = entries(cur!.files, "prices", "FI").find(e => e.day === "2026-03-25")!;
  check("B1 unauthorized + malformed responses recorded as source errors, exit 3", r.exitCode === 3 && r.report.source_errors.some(e => e.series === "FI") && r.report.source_errors.some(e => e.series === "SE3>FI"), JSON.stringify(r.report.source_errors.map(e => e.series + ":" + e.code)));
  check("B2 previous FI values kept and error visible on the day", fi.status === "COMPLETE" && !!fi.last_error && fi.values_sha256 === entries(before.files, "prices", "FI").find(e => e.day === "2026-03-25")!.values_sha256);
  check("B3 an aborted attempt that recovers is not an error (retried, final publication)", !r.report.source_errors.some(e => e.series === "SE1>FI") && r.report.groups.some(g => g.series === "SE1>FI" && g.attempts.length === 2 && g.outcome === "PUBLICATION"));
  check("B4 token never appears in the run report", !JSON.stringify(r.report).includes("TEST-TOKEN-NOT-A-SECRET"));
  mock.failures = [];
  r = await run(store, work, {}, new Date(NOW.getTime() + 240000));
  cur = await resolveVerified(store);
  check("B5 next clean run clears the visible error", !entries(cur!.files, "prices", "FI").find(e => e.day === "2026-03-25")!.last_error);

  // ---------------- 8. Restart (interrupted acquisition) ----------------
  {
    const m = freshMock();
    const sA = new LocalDirAdapter(tmp("storeA")), wA = tmp("workA");
    const first = await run(sA, wA, { acquire: { sleep: noSleep, now: () => NOW, maxGroups: 10 } });
    check("A1 interrupted run exits 4 and publishes nothing", first.exitCode === 4 && first.report.status === "INTERRUPTED" && !(await sA.get(CURRENT_KEY)));
    const callsAfterFirst = m.calls;
    const second = await run(sA, wA, { resumeRunId: first.report.run_id });
    check("A2 resumed run publishes and does not refetch checkpointed groups", second.report.status === "PUBLISHED" && m.calls - callsAfterFirst === second.report.plan.groups - 10, `${m.calls - callsAfterFirst} vs ${second.report.plan.groups - 10}`);
    const m2 = freshMock();
    const sB = new LocalDirAdapter(tmp("storeB"));
    const straight = await run(sB, tmp("workB"));
    const a = await resolveVerified(sA), b = await resolveVerified(sB);
    check("A3 resumed result has the same content hash as an uninterrupted run", a!.pointer.content_sha256 === b!.pointer.content_sha256);
    void m2; void straight;
  }

  // ---------------- 9. Interrupted / failed publication ----------------
  {
    freshMock();
    const base = new LocalDirAdapter(tmp("storeP"));
    const ok = await run(base, tmp("workP0"));
    const good = (await resolveVerified(base))!;
    check("P0 baseline published", ok.report.status === "PUBLISHED");
    mock = freshMock();
    mock.overrides.set(`SE4|${new Date(Date.parse("2026-03-30T08:00:00Z")).toISOString()}`, 123.45); // forces a new version
    const cases: [string, StorageAdapter][] = [
      ["upload fails mid-way", new FaultyAdapter(base, 3)],
      ["object read-back corrupt", new FaultyAdapter(base, null, "objects/")],
      ["manifest read-back corrupt", new FaultyAdapter(base, null, "versions/")],
    ];
    for (const [name, adapter] of cases) {
      const fr = await run(adapter, tmp("workPf"), {}, new Date(NOW.getTime() + 300000));
      const still = (await resolveVerified(base))!;
      check(`P1 ${name}: PUBLISH_FAILED exit 1, previous version still live and verifiable`, fr.exitCode === 1 && fr.report.status === "PUBLISH_FAILED" && still.pointer.version_id === good.pointer.version_id, `${fr.report.status} ${JSON.stringify(fr.report.publish)}`);
      check(`P2 ${name}: failure stage recorded`, !!fr.report.publish.stage);
    }
    const sw = await run(base, tmp("workPs"), { publishHooks: { beforeStage: (s) => { if (s === "SWITCH_POINTER") throw new Error("killed before pointer switch"); } } }, new Date(NOW.getTime() + 360000));
    const after = (await resolveVerified(base))!;
    check("P3 crash before pointer switch: previous version live, orphan manifest harmless", sw.exitCode === 1 && after.pointer.version_id === good.pointer.version_id);
    const cc = await run(base, tmp("workPc"), { publishHooks: { beforeStage: async (s) => {
      if (s === "CHECK_POINTER") await base.put(CURRENT_KEY, Buffer.from(JSON.stringify({ ...good.pointer, version_id: "vOTHER" })), { immutable: false });
    } } }, new Date(NOW.getTime() + 420000));
    check("P4 concurrent pointer change detected, pointer not overwritten", cc.report.publish.stage === "CHECK_POINTER" && JSON.parse((await base.get(CURRENT_KEY))!.toString()).version_id === "vOTHER");
    await base.put(CURRENT_KEY, Buffer.from(JSON.stringify(good.pointer)), { immutable: false });
    const rec = await run(base, tmp("workPr"), {}, new Date(NOW.getTime() + 480000));
    let refused = false;
    {
      const corrupt: StorageAdapter = { kind: "corrupt", exists: k => base.exists(k), list: p => base.list(p), put: (k, b, o) => base.put(k, b, o),
        get: k => base.get(k).then(b => (b && k.startsWith("objects/")) ? Buffer.concat([b, Buffer.from(" ")]) : b) };
      try { await run(corrupt, tmp("workPv2"), {}, new Date(NOW.getTime() + 460000)); } catch (e: any) { refused = /hash mismatch/.test(String(e?.message)); }
    }
    check("P6 a published version that fails verification on load stops the run (no build on unverified state)", refused);
    check("P5 next run after failures publishes normally", rec.report.status === "PUBLISHED" && (await resolveVerified(base))!.pointer.version_id === rec.report.publish.version_id);
  }

  // ---------------- 10. Store guards ----------------
  {
    const s = new LocalDirAdapter(tmp("guard"));
    await s.put("objects/x.json", Buffer.from("a"), { immutable: true });
    let threw = false; try { await s.put("objects/x.json", Buffer.from("b"), { immutable: true }); } catch { threw = true; }
    check("G1 immutable key cannot be overwritten with different bytes", threw);
    threw = false; try { await s.put("../escape.json", Buffer.from("a"), { immutable: true }); } catch { threw = true; }
    check("G2 key cannot escape the store", threw);
  }

  // ---------------- 11. Workflow guards (static) ----------------
  {
    const wf = readFileSync(resolve(__dirname, "..", "..", "..", ".github", "workflows", "elmonitor_a2_data.yml"), "utf-8");
    // Contract after the owner's choice 2026-11-05 (data update on Vercel, no keys on GitHub): manual offline tests only.
    const code = wf.replace(/#.*$/gm, "");
    check("W1 workflow trigger: workflow_dispatch only (no schedule, push, pull_request, workflow_run)", /workflow_dispatch:/.test(code) && !/\n\s+(schedule|push|pull_request|pull_request_target|workflow_run|repository_dispatch):/.test(code));
    check("W2 permissions read-only, concurrency group set", /permissions:\s*\n\s+contents:\s*read/.test(code) && /concurrency:/.test(code));
    check("W3 no secrets at all, no deploy, no ssh, no git push", !/secrets\./.test(code) && !/ssh|deploy|VPS_SSH_KEY|docker|git push|contents:\s*write/i.test(code));
    check("W4 no store and no data run (tests only)", !/--store|run_a2\.ts|export_preview\.ts|publish_site\.ts|BLOB_|ENTSOE_TOKEN/.test(code) && /test_a2\.ts/.test(code) && /test_blob_store\.ts/.test(code));
    const vj = JSON.parse(readFileSync(resolve(__dirname, "..", "..", "..", "apps", "web", "vercel.json"), "utf-8"));
    const route = readFileSync(resolve(__dirname, "..", "..", "..", "apps", "web", "app", "api", "cron", "a2", "route.ts"), "utf-8");
    const CRONS = ["17 6 * * *", "17 9 * * *", "17 12 * * *", "17 13 * * *", "17 16 * * *", "17 19 * * *", "7 22 * * *", "7 23 * * *"];
    check("W5 Vercel cron: the 8 UTC times of the schedule on /api/cron/a2", JSON.stringify(vj.crons) === JSON.stringify(CRONS.map(c => ({ path: "/api/cron/a2", schedule: c }))));
    check("W6 cron route fails closed without CRON_SECRET and uses only the elmonitor/a2 and elmonitor/site prefixes", /if \(!secret\) return false;/.test(route) && /timingSafeEqual/.test(route) && [...route.matchAll(/new BlobAdapter\("([^"]+)"/g)].map(m => m[1]).join() === "elmonitor/a2,elmonitor/site");
  }

  // ---------------- 12. Hash method V2: origin marker excluded (A2 fix after local run 2, OWNER-DECISION option 1) ----------------
  {
    const mkData = (origin0: "E" | "R", v0 = 10): DayData => ({ status: "COMPLETE", resolution: "PT15M",
      values: [["2026-02-01T23:00:00.000Z", v0, origin0], ["2026-02-01T23:15:00.000Z", 11, "E"]], hourly: [["2026-02-01T23:00:00.000Z", 10.5]], missing_starts_utc: [] });
    const src = (raw: string) => ({ provider: "ENTSO-E Transparency Platform" as const, document_type: "A11" as const, request_first_day: "2026-02-02", request_last_day: "2026-02-02", raw_sha256: raw, raw_bytes: 1, fetched_at_utc: "2026-11-03T00:00:00.000Z", run_id: "R" });
    const baseEntry = (data: DayData, method: string, raw: string): RegisterEntry => ({
      dataset: "flows", series: "SE2>SE1", day: "2026-02-02", status: "COMPLETE", resolution: "PT15M", expected_intervals: 2, present_intervals: 2, missing_intervals: 0,
      duplicates_within_tolerance: 0, conflicts: 0, selection: { rule_mode: "ALL_EQUAL", decision_ref: "x", verified: null }, source: src(raw),
      values_sha256: valuesSha(data, method), values_hash_method: method, last_changed_utc: "2026-11-03T00:00:00.000Z", last_checked_utc: "2026-11-03T00:00:00.000Z", revisions: [], last_error: null });
    const fresh = (data: DayData, raw: string): FreshDay => { const { values_sha256: _a, values_hash_method: _b, last_changed_utc: _c, last_checked_utc: _d, revisions: _e, last_error: _f, ...rest } = baseEntry(data, VALUES_HASH_METHOD, raw); return { day: "2026-02-02", data, entry: { ...rest, source: src(raw) } }; };
    check("H1 V2 hash ignores the R/E origin marker; V1 does not", valuesSha(mkData("R")) === valuesSha(mkData("E")) && valuesSha(mkData("R"), VALUES_HASH_METHOD_V1_LEGACY) !== valuesSha(mkData("E"), VALUES_HASH_METHOD_V1_LEGACY));
    const prev = { entry: baseEntry(mkData("R"), VALUES_HASH_METHOD, "rawA"), data: mkData("R") };
    const m1 = mergeDay(prev, fresh(mkData("E"), "rawB"), "RUN_X", "2026-11-04T00:00:00.000Z");
    check("H2 origin-only change -> UNCHANGED (not REVISED), previous data and source kept", m1.outcome === "UNCHANGED" && m1.entry.revisions.length === 0 && m1.data.values[0][2] === "R" && m1.entry.source!.raw_sha256 === "rawA", m1.outcome);
    const m2 = mergeDay(prev, fresh(mkData("E", 99), "rawC"), "RUN_X", "2026-11-04T00:00:00.000Z");
    check("H3 real value change -> REVISED with the hash method recorded", m2.outcome === "REVISED" && m2.entry.revisions[0].values_hash_method === VALUES_HASH_METHOD && m2.entry.values_hash_method === VALUES_HASH_METHOD, m2.outcome);
    const legacyPrev = { entry: baseEntry(mkData("R"), VALUES_HASH_METHOD_V1_LEGACY, "rawA"), data: mkData("R") };
    legacyPrev.entry.values_hash_method = undefined as any;
    const m3 = mergeDay(legacyPrev, fresh(mkData("E"), "rawB"), "RUN_X", "2026-11-04T00:00:00.000Z");
    check("H4 a legacy (V1) previous hash is never compared: recomputed from data -> UNCHANGED", m3.outcome === "UNCHANGED" && m3.entry.values_hash_method === VALUES_HASH_METHOD && m3.entry.values_sha256 === valuesSha(mkData("R")), m3.outcome);
  }

  // ---------------- 13. Legacy store migration (a2.0 -> a2.1) ----------------
  {
    const s = new LocalDirAdapter(tmp("legacy"));
    const day = (d: string, o: "E" | "R", v: number): DayData => ({ status: "COMPLETE", resolution: "PT15M",
      values: [[`${d}T00:00:00.000Z`, v, o]], hourly: [], missing_starts_utc: [] });
    const legacyEntry = (series: string, d: string, data: DayData, revisions: any[]): RegisterEntry => {
      const e: any = { dataset: "prices", series, day: d, status: "COMPLETE", resolution: "PT15M", expected_intervals: 1, present_intervals: 1, missing_intervals: 0,
        duplicates_within_tolerance: 0, conflicts: 0, selection: { rule_mode: "ALL_EQUAL", decision_ref: "x", verified: null },
        source: { provider: "ENTSO-E Transparency Platform", document_type: "A44", request_first_day: d, request_last_day: d, raw_sha256: "r", raw_bytes: 1, fetched_at_utc: "2026-11-03T00:00:00.000Z", run_id: "LEGACY_RUN_1" },
        values_sha256: valuesSha(data, VALUES_HASH_METHOD_V1_LEGACY), last_changed_utc: "2026-11-03T00:00:00.000Z", last_checked_utc: "2026-11-03T00:00:00.000Z", revisions, last_error: null };
      return e;
    };
    // a2.0 builds: strip the fields a2.0 did not write.
    const legacyFiles = (st: State) => { const f = buildFiles(st); for (const [k, b] of f) { if (!k.startsWith("coverage/") || k === "coverage/summary.json") continue;
      const o = JSON.parse(b.toString()); for (const e of o.entries) delete e.values_hash_method; f.set(k, Buffer.from(JSON.stringify(o))); } return f; };
    const s1: State = { register: new Map(), months: new Map() };
    const A = day("2026-02-02", "R", 50), B = day("2026-02-03", "E", 60);
    s1.register.set(regKey("prices", "SE3", A.values[0][0].slice(0, 10)), legacyEntry("SE3", "2026-02-02", A, []));
    s1.register.set(regKey("prices", "SE3", "2026-02-03"), legacyEntry("SE3", "2026-02-03", B, []));
    putDay(s1, "prices", "SE3", "2026-02-02", A); putDay(s1, "prices", "SE3", "2026-02-03", B);
    const p1 = await publish(s, legacyFiles(s1), new Map(), null, { run_id: "LEGACY_RUN_1", built_at_utc: "2026-11-03T01:00:00.000Z", instrument: {} });
    const A2 = day("2026-02-02", "E", 50), B2 = day("2026-02-03", "E", 61);       // A: origin only; B: real value change
    const rev = (old: DayData, nu: DayData) => [{ detected_utc: "2026-11-03T02:00:00.000Z", run_id: "LEGACY_RUN_2", old_values_sha256: valuesSha(old, VALUES_HASH_METHOD_V1_LEGACY), new_values_sha256: valuesSha(nu, VALUES_HASH_METHOD_V1_LEGACY), old_raw_sha256: "r", new_raw_sha256: "r2" }];
    const s2: State = { register: new Map(), months: new Map() };
    s2.register.set(regKey("prices", "SE3", "2026-02-02"), legacyEntry("SE3", "2026-02-02", A2, rev(A, A2)));
    s2.register.set(regKey("prices", "SE3", "2026-02-03"), legacyEntry("SE3", "2026-02-03", B2, rev(B, B2)));
    putDay(s2, "prices", "SE3", "2026-02-02", A2); putDay(s2, "prices", "SE3", "2026-02-03", B2);
    const p2 = await publish(s, legacyFiles(s2), new Map(), p1.pointer, { run_id: "LEGACY_RUN_2", built_at_utc: "2026-11-03T02:00:00.000Z", instrument: {} });
    const m1Bytes = await s.get(p1.pointer.manifest_key), m2Bytes = await s.get(p2.pointer.manifest_key);
    const { state, migration } = await loadState(s);
    const eA = state.register.get(regKey("prices", "SE3", "2026-02-02"))!, eB = state.register.get(regKey("prices", "SE3", "2026-02-03"))!;
    check("M1 legacy state migrated: every entry carries the V2 method and a recomputed hash", !!migration && migration.entries_migrated === 2 && migration.hashes_recomputed === 2
      && eA.values_hash_method === VALUES_HASH_METHOD && eA.values_sha256 === valuesSha(A2) && eA.last_changed_utc === "2026-11-03T00:00:00.000Z", JSON.stringify(migration));
    check("M2 origin-only revision reclassified (kept, not deleted); real revision kept", eA.revisions.length === 1 && eA.revisions[0].classification === "ORIGIN_ONLY_NOT_A_SOURCE_REVISION"
      && eB.revisions.length === 1 && !eB.revisions[0].classification && migration!.revisions_reclassified_origin_only === 1 && migration!.revisions_kept === 1);
    check("M3 legacy revision records marked with the V1 method (old hashes not compared with V2)", eA.revisions[0].values_hash_method === VALUES_HASH_METHOD_V1_LEGACY && eB.revisions[0].values_hash_method === VALUES_HASH_METHOD_V1_LEGACY);
    // Full run on the legacy store: new version with method + migration; old versions byte-identical.
    mock = freshMock();
    const lr = await run(s, tmp("workLegacy"));
    const v3 = await resolveVerified(s);
    const sum = fileJson(v3!.files, "coverage/summary.json").series["prices|SE3"];
    check("M4 run on a legacy store publishes a new version labelled with the V2 method and the migration report", lr.report.status === "PUBLISHED" && v3!.manifest.values_hash_method === VALUES_HASH_METHOD
      && v3!.manifest.migration?.revisions_reclassified_origin_only === 1 && lr.report.migration?.revisions_reclassified_origin_only === 1 && fileJson(v3!.files, "meta.json").values_hash_method === VALUES_HASH_METHOD, JSON.stringify(lr.report.publish));
    check("M5 summary counts only real revisions; reclassified ones listed separately", sum.revisions === 1 && sum.revisions_reclassified === 1, JSON.stringify({ r: sum.revisions, c: sum.revisions_reclassified }));
    check("M6 earlier version manifests unchanged (immutable history)", sha256((await s.get(p1.pointer.manifest_key))!) === sha256(m1Bytes!) && sha256((await s.get(p2.pointer.manifest_key))!) === sha256(m2Bytes!));
    const again = await loadState(s);
    check("M7 a migrated (V2) state is not migrated again", again.migration === null);
  }

  // ---------------- 14. Non-XML source body (gateway timeout JSON) ----------------
  {
    check("X1 publication body check: XML publication yes; gateway JSON, HTML, acknowledgement no",
      isPublicationBody(`<?xml version="1.0"?><Publication_MarketDocument xmlns="x">`) && !isPublicationBody(`{"uuAppErrorMap":{}}`) && !isPublicationBody(`<html><body>Bad gateway</body></html>`) && !isPublicationBody(`<Acknowledgement_MarketDocument/>`));
    const series = allSeries().find(x => x.label === "SE2>SE1")!;
    const g = { series, first: "2026-03-02", last: "2026-03-03", days: ["2026-03-02", "2026-03-03"], reason: { "2026-03-02": "NEW" as const, "2026-03-03": "NEW" as const } };
    mock = freshMock();
    mock.failures.push({ series: "SE2>SE1", mode: "gatewayjson", times: 99 });
    const sleeps: number[] = [];
    const wd1 = tmp("workX1");
    const a1 = await acquire([g], { token: "TEST-TOKEN-NOT-A-SECRET", workRunDir: wd1, sleep: async ms => { sleeps.push(ms); }, now: () => NOW });
    const r1 = a1.results[0];
    check("X2 gateway JSON body retried (bounded) then ERROR SOURCE_INVALID_BODY, never PUBLICATION", r1.outcome === "ERROR" && r1.error?.code === "SOURCE_INVALID_BODY" && r1.attempts.length === 3 && r1.attempts.every(a => a.outcome === "ERROR") && r1.raw_sha256 === null && sleeps.slice(0, 2).join(",") === "2000,5000", JSON.stringify(r1.attempts));
    check("X3 error text bounded and without token", (r1.error?.text.length ?? 999) < 300 && !JSON.stringify(r1).includes("TEST-TOKEN-NOT-A-SECRET") && /uu-gateway-router\/connectTimeout/.test(r1.error!.text));
    mock = freshMock();
    mock.failures.push({ series: "SE2>SE1", mode: "gatewayjson", times: 1 });
    const a2 = await acquire([g], { token: "TEST-TOKEN-NOT-A-SECRET", workRunDir: tmp("workX2"), sleep: noSleep, now: () => NOW });
    check("X4 gateway JSON once, then a real publication -> PUBLICATION after 2 attempts", a2.results[0].outcome === "PUBLICATION" && a2.results[0].attempts.length === 2 && a2.results[0].attempts[0].error_code === "SOURCE_INVALID_BODY");
  }

  // ---------------- 15. MISSING after a fetch error, then data -> IMPROVED (not NEW) ----------------
  {
    const s = new LocalDirAdapter(tmp("missing"));
    mock = freshMock();
    mock.failures.push({ series: "SE2>SE1", mode: "gatewayjson", times: 99 });
    const f1 = await run(s, tmp("workM1"));
    const missing = entries((await resolveVerified(s))!.files, "flows", "SE2>SE1").filter(e => e.status === "MISSING").length;
    mock = freshMock();
    const f2 = await run(s, tmp("workM2"), {}, new Date(NOW.getTime() + 60000));
    check("I1 fetch-error run leaves MISSING days with the error visible", f1.exitCode === 3 && missing > 0 && f1.report.source_errors.every(e => e.code === "SOURCE_INVALID_BODY"), JSON.stringify(f1.report.source_errors.slice(0, 2)));
    check("I2 next clean run: those days IMPROVED, none NEW", (f2.report.merge.IMPROVED ?? 0) >= missing && !f2.report.merge.NEW, JSON.stringify(f2.report.merge));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
