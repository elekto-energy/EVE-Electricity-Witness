/**
 * ELMONITOR A2 - offline tests for the generation dataset (A75). No network, no token.
 */

import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { isPublicationBody, interpret } from "../acquire";
import { allSeries, GENERATION_HISTORY_START, SeriesSpec } from "../config";
import { exportSnapshot } from "../export_preview";
import { parseA75 } from "../generation";
import { RegisterEntry, seriesSlug } from "../model";
import { runA2 } from "../run_a2";
import { LocalDirAdapter, sha256 } from "../store";
import { resolveVerified } from "../version";
import { MockEntsoe } from "./mock_entsoe";

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); }
}
const tmp = (p: string) => mkdtempSync(join(tmpdir(), `a2g-${p}-`));
const noSleep = async () => {};

const TODAY = "2026-10-20";
const NOW = new Date("2026-10-20T10:00:00.000Z");
const GEN = (zones: string[]): SeriesSpec[] => zones.map(z => ({ dataset: "generation" as const, label: z, zone: z }));
const ZONES = ["SE1", "SE3", "NO4", "DE_LU", "LT"];

function freshMock(): MockEntsoe {
  const m = new MockEntsoe();
  m.genTypes = { SE1: ["B12", "B19"], SE3: ["B04", "B12", "B14", "B19"], NO4: ["B12", "B19"], DE_LU: ["B10", "B16", "B19"], LT: [] };
  m.genPt60 = new Set(["NO4"]);
  m.genConsumption = new Set(["DE_LU"]);
  m.genUntilMs = NOW.getTime() - 2 * 3600000;           // A75 published with delay
  // one missing quarter: SE1 B19 2026-10-10 06:15Z -> hour 06:00Z cannot be produced (never from fewer than four)
  m.genGaps.add("SE1|B19|2026-10-10T06:15:00.000Z");
  m.install();
  return m;
}
const run = (store: LocalDirAdapter, work: string, today = TODAY, now = NOW) =>
  runA2({ store, workDir: work, token: "TEST-TOKEN-NOT-A-SECRET", today, now: () => now, acquire: { sleep: noSleep, now: () => now }, series: GEN(ZONES) });

function json(files: Map<string, Buffer>, path: string): any { return JSON.parse(files.get(path)!.toString("utf-8")); }
function entry(files: Map<string, Buffer>, zone: string, day: string): RegisterEntry | undefined {
  const p = `coverage/generation/${seriesSlug(zone)}/${day.slice(0, 7)}.json`;
  return files.has(p) ? (json(files, p).entries as RegisterEntry[]).find(e => e.day === day) : undefined;
}
function dayData(files: Map<string, Buffer>, zone: string, day: string): any {
  const p = `data/generation/${seriesSlug(zone)}/${day.slice(0, 7)}.json`;
  return files.has(p) ? json(files, p).days[day] : undefined;
}

(async () => {
  check("G0 allSeries has one generation series per price zone, history start 2026-10-01",
    allSeries().filter(s => s.dataset === "generation").length === 13 && GENERATION_HISTORY_START === "2026-10-01");

  const mock = freshMock();
  const store = new LocalDirAdapter(tmp("store"));
  const r = await run(store, tmp("work"));
  const v = (await resolveVerified(store))!;
  const f = v.files;
  check("G1 run PUBLISHED, exit 0; generation planned from 2026-10-01 only", r.report.status === "PUBLISHED" && r.exitCode === 0
    && r.report.groups.every(g => g.first >= "2026-10-01"), `${r.report.status} ${JSON.stringify(r.report.publish)}`);

  const se3 = entry(f, "SE3", "2026-10-15"), se3t = entry(f, "SE3", TODAY);
  check("G2 SE3 past day COMPLETE with 4 types x 24 hours", se3?.status === "COMPLETE" && se3.present_intervals === 96 && se3.expected_intervals === 96
    && Object.keys(dayData(f, "SE3", "2026-10-15").by_type).join() === "B04,B12,B14,B19", JSON.stringify(se3));
  check("G3 running day IN_PROGRESS with its missing hours listed", se3t?.status === "IN_PROGRESS" && dayData(f, "SE3", TODAY).missing_starts_utc.length > 0
    && dayData(f, "SE3", TODAY).missing_starts_utc.every((h: string) => h >= "2026-10-20T08:00:00.000Z"), JSON.stringify(se3t));

  // hourly = mean of the four quarters (A5)
  const h = "2026-10-15T12:00:00.000Z", t0 = Date.parse(h);
  const q = [0, 1, 2, 3].map(i => mock.genValue("SE3", "B14", t0 + i * 900000));
  const want = Math.round(((q[0] + q[1] + q[2] + q[3]) / 4) * 1e6) / 1e6;
  const got = (dayData(f, "SE3", "2026-10-15").by_type.B14 as [string, number][]).find(x => x[0] === h)?.[1];
  check("G4 PT15M hour = mean of its four quarters", got === want, `${got} vs ${want}`);

  const g1 = entry(f, "SE1", "2026-10-10"), d1 = dayData(f, "SE1", "2026-10-10");
  check("G5 one missing quarter -> that hour missing for that type only, day PARTIAL", g1?.status === "PARTIAL"
    && d1.missing_starts_utc.join() === "2026-10-10T06:00:00.000Z"
    && !d1.by_type.B19.some((x: [string, number]) => x[0] === "2026-10-10T06:00:00.000Z")
    && d1.by_type.B12.some((x: [string, number]) => x[0] === "2026-10-10T06:00:00.000Z") && g1.present_intervals === 47, JSON.stringify(g1));

  const n4 = dayData(f, "NO4", "2026-10-15"), n4e = entry(f, "NO4", "2026-10-15");
  const hn = "2026-10-15T05:00:00.000Z";
  check("G6 PT60M zone: native hourly values, resolution PT60M", n4e?.status === "COMPLETE" && n4.resolution === "PT60M"
    && (n4.by_type.B12 as [string, number][]).find(x => x[0] === hn)?.[1] === mock.genValue("NO4", "B12", Date.parse(hn)), JSON.stringify(n4e));

  const de = dayData(f, "DE_LU", "2026-10-15"), dee = entry(f, "DE_LU", "2026-10-15");
  const hd = "2026-10-15T09:00:00.000Z", td = Date.parse(hd);
  const prodMean = Math.round((([0, 1, 2, 3].map(i => mock.genValue("DE_LU", "B10", td + i * 900000)).reduce((a, b) => a + b, 0)) / 4) * 1e6) / 1e6;
  check("G7 pumped-storage consumption series (outBiddingZone) excluded; B10 = production series", dee?.status === "COMPLETE"
    && (de.by_type.B10 as [string, number][]).find(x => x[0] === hd)?.[1] === prodMean && /consumption series excluded: 1/.test(dee.selection.decision_ref), JSON.stringify(dee?.selection));

  const lt = entry(f, "LT", "2026-10-15");
  const ltd = dayData(f, "LT", "2026-10-15");
  check("G8 no-data acknowledgement -> MISSING, no values invented", lt?.status === "MISSING" && lt.present_intervals === 0
    && Object.keys(ltd?.by_type ?? {}).length === 0 && lt.source?.raw_sha256 === "NO_DATA_ACKNOWLEDGEMENT", JSON.stringify(lt));

  const genRaw = r.report.groups.find(g => g.dataset === "generation" && g.series === "SE3" && g.outcome === "PUBLICATION")!;
  const rawBody = await store.get(`raw/${genRaw.raw_sha256}.xml`);
  check("G9 raw A75 document kept as evidence (content-addressed, in the manifest)", !!rawBody && sha256(rawBody) === genRaw.raw_sha256
    && v.manifest.raw_evidence.includes(genRaw.raw_sha256!) && rawBody.toString("utf-8").includes("<GL_MarketDocument") && se3?.source?.document_type === "A75");

  check("G10 GL_MarketDocument accepted only for generation, Publication_MarketDocument only for prices/flows",
    isPublicationBody("<GL_MarketDocument>", "generation") && !isPublicationBody("<GL_MarketDocument>", "prices")
    && !isPublicationBody("<Publication_MarketDocument>", "generation") && isPublicationBody("<Publication_MarketDocument>")
    && !isPublicationBody(`{"uuAppErrorMap":{}}`, "generation"));

  const p = parseA75(`<GL_MarketDocument><TimeSeries><inBiddingZone_Domain.mRID codingScheme="A01">X</inBiddingZone_Domain.mRID><curveType>A03</curveType><MktPSRType><psrType>B10</psrType></MktPSRType><Period><timeInterval><start>2026-10-15T00:00Z</start><end>2026-10-15T01:00Z</end></timeInterval><resolution>PT15M</resolution><Point><position>1</position><quantity>5</quantity></Point></Period></TimeSeries><TimeSeries><outBiddingZone_Domain.mRID codingScheme="A01">X</outBiddingZone_Domain.mRID><curveType>A03</curveType><MktPSRType><psrType>B10</psrType></MktPSRType><Period><timeInterval><start>2026-10-15T00:00Z</start><end>2026-10-15T01:00Z</end></timeInterval><resolution>PT15M</resolution><Point><position>1</position><quantity>9</quantity></Point></Period></TimeSeries></GL_MarketDocument>`);
  check("G11 parser: production kept, consumption counted and excluded, A03 curve kept", p.kind === "PUBLICATION" && p.byType.get("B10")!.series.length === 1
    && p.consumption_series_excluded === 1 && p.byType.get("B10")!.series[0].curve_type === "A03" && p.byType.get("B10")!.series[0].periods[0].points[0].value === 5);

  // second run, same source -> NO_CHANGE for COMPLETE days; then a source revision on a COMPLETE day in the window
  freshMock();
  const r2 = await run(store, tmp("work2"), TODAY, new Date(NOW.getTime() + 60000));
  check("G12 unchanged source: no revision, no regression", r2.report.revisions.length === 0 && r2.report.regressions_refused.length === 0, JSON.stringify(r2.report.merge));
  const m3 = freshMock();
  m3.overrides.set("SE3|B14|2026-10-15T12:00:00.000Z", 9999);
  const r3 = await run(store, tmp("work3"), TODAY, new Date(NOW.getTime() + 120000));
  const se3r = entry((await resolveVerified(store))!.files, "SE3", "2026-10-15");
  check("G13 changed value on a COMPLETE day -> REVISED with old/new hashes", r3.report.revisions.some(x => x.series === "SE3" && x.day === "2026-10-15")
    && se3r!.revisions.length === 1 && se3r!.revisions[0].old_values_sha256 !== se3r!.revisions[0].new_values_sha256, JSON.stringify(r3.report.revisions));

  // DST: 2026-10-25 has 25 local hours
  const s2 = new LocalDirAdapter(tmp("dst"));
  const md = freshMock();
  md.genUntilMs = Date.parse("2026-10-27T08:00:00.000Z");
  await run(s2, tmp("wdst"), "2026-10-27", new Date("2026-10-27T10:00:00.000Z"));
  const fd = (await resolveVerified(s2))!.files;
  const dst = entry(fd, "SE3", "2026-10-25");
  check("G14 DST day 2026-10-25: 25 hours per type, COMPLETE", dst?.status === "COMPLETE" && (dayData(fd, "SE3", "2026-10-25").by_type.B12 as unknown[]).length === 25
    && dst.expected_intervals === 100, JSON.stringify(dst));

  // export: generation for today and yesterday, names from the client's PSR_TYPES
  const ex = await exportSnapshot(store, { asOf: TODAY });
  const snap = JSON.parse(ex.body.toString("utf-8"));
  const g = snap.generation?.SE3;
  check("G15 export: generation today + yesterday, statuses, hourly by type, totals, psr names", !!g && g.days.length === 2
    && g.days[0].day === "2026-10-19" && g.days[0].status === "COMPLETE" && g.days[1].status === "IN_PROGRESS"
    && g.days[0].hourly_by_type.B14.length === 24 && typeof g.days[0].totals_mwh_by_type.B14 === "number"
    && snap.psr_names.B14 === "Nuclear" && snap.units.generation === "MW" && /A75/.test(snap.provider), JSON.stringify(g?.days?.map((d: any) => d.status)));
  check("G16 export: zone without data -> MISSING (not filled)", snap.generation.LT.days.every((d: any) => d.status === "MISSING" && !d.hourly_by_type?.B12));

  // interpret contract: non-contiguous plan group is refused for generation too
  let threw = false;
  try { interpret({ series: GEN(["SE3"])[0], first: "2026-10-01", last: "2026-10-03", days: ["2026-10-01", "2026-10-03"], reason: {} } as any, { outcome: "NO_DATA" } as any, null, TODAY, "R"); } catch { threw = true; }
  check("G17 non-contiguous generation group refused", threw);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
