/**
 * ELMONITOR A2 - offline tests for BlobAdapter (Vercel Blob) and the site publisher.
 * The fake SDK follows @vercel/blob 2.8.2 as read from its source: put() with allowOverwrite=false fails on an
 * existing pathname, get() returns null on 404, list() pages with cursor/hasMore. No network, no token.
 */

import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runA2 } from "../run_a2";
import { BlobAccess, BlobAdapter, BlobSdk, LocalDirAdapter, openStore, POINTER_LOG, sha256, StorageAdapter } from "../store";
import { resolveVerified } from "../version";
import { publishSite, readSitePointer, SITE_POINTER_KEY } from "../publish_site";
import { runJob } from "../job";
import { MockEntsoe } from "./mock_entsoe";

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`PASS ${name}`); } else { failed++; console.log(`FAIL ${name} ${detail}`); }
}
const tmp = (p: string) => mkdtempSync(join(tmpdir(), `a2b-${p}-`));

class FakeBlob implements BlobSdk {
  readonly blobs = new Map<string, Buffer>();
  puts: string[] = [];
  constructor(readonly storeAccess: BlobAccess, readonly pageSize = 1000, readonly suffix = false) {}
  private url(p: string) { return `https://fakestore.${this.storeAccess}.blob.vercel-storage.com/${p}`; }
  async put(pathname: string, body: Buffer, opts: Parameters<BlobSdk["put"]>[2]) {
    if (opts.allowOverwrite !== false || opts.addRandomSuffix !== false) throw new Error("fake: adapter must write with allowOverwrite=false, addRandomSuffix=false");
    if (this.blobs.has(pathname)) throw Object.assign(new Error("This blob already exists"), { name: "BlobError" });
    const stored = this.suffix ? `${pathname}-Xy12` : pathname;
    this.blobs.set(stored, Buffer.from(body));
    this.puts.push(stored);
    return { pathname: stored, url: this.url(stored) };
  }
  async get(pathname: string, opts: { access: BlobAccess }) {
    if (opts.access !== this.storeAccess) throw new Error("fake: access mismatch");
    const b = this.blobs.get(pathname);
    if (!b) return null;
    return { statusCode: 200, stream: new Blob([b]).stream() as ReadableStream<Uint8Array> };
  }
  async list(opts: { prefix: string; cursor?: string; limit?: number }) {
    const all = [...this.blobs.keys()].filter(k => k.startsWith(opts.prefix)).sort();
    const start = opts.cursor ? Number(opts.cursor) : 0;
    const size = Math.min(opts.limit ?? 1000, this.pageSize);
    const page = all.slice(start, start + size);
    const more = start + size < all.length;
    return { blobs: page.map(p => ({ pathname: p, url: this.url(p) })), cursor: more ? String(start + size) : undefined, hasMore: more };
  }
}

function clockFrom(startIso: string, stepMs = 1000) { let t = Date.parse(startIso); return () => { const d = new Date(t); t += stepMs; return d; }; }
const adapter = (fake: FakeBlob, access: BlobAccess = fake.storeAccess, prefix = "elmonitor/a2", clock = clockFrom("2026-11-05T13:17:00.000Z")) =>
  new BlobAdapter(prefix, access, async () => fake, clock);

const TODAY = "2026-03-31";
const NOW = new Date("2026-03-31T10:00:00.000Z");
const noSleep = async () => {};
function freshMock(): MockEntsoe {
  const m = new MockEntsoe();
  m.priceCutoffDay = TODAY;
  m.flowsUntilMs = NOW.getTime() - 3600000;
  for (let t = Date.parse("2026-03-28T04:00:00Z"); t < Date.parse("2026-03-28T23:00:00Z"); t += 900000) m.gaps.add(`SE4>SE3|${new Date(t).toISOString()}`);
  m.install();
  return m;
}
const run = (store: StorageAdapter, work: string, now = NOW) =>
  runA2({ store, workDir: work, token: "TEST-TOKEN-NOT-A-SECRET", today: TODAY, now: () => now, acquire: { sleep: noSleep, now: () => now } });

(async () => {
  // ---------------- B1-B6 adapter contract ----------------
  {
    const f = new FakeBlob("private");
    const s = adapter(f);
    await s.put("objects/abc.json", Buffer.from("{\"a\":1}\n"), { immutable: true });
    check("B1 immutable put then get returns identical bytes", (await s.get("objects/abc.json"))?.toString() === "{\"a\":1}\n");
    await s.put("objects/abc.json", Buffer.from("{\"a\":1}\n"), { immutable: true });
    check("B1b identical re-put is idempotent (no second upload)", f.puts.length === 1);
    let refused = false;
    try { await s.put("objects/abc.json", Buffer.from("{\"a\":2}\n"), { immutable: true }); } catch (e: any) { refused = /different content/.test(e.message); }
    check("B1c immutable key with different bytes refused", refused && f.blobs.get("elmonitor/a2/objects/abc.json")!.toString() === "{\"a\":1}\n");
    check("B1d missing key -> null / exists false", (await s.get("objects/none.json")) === null && !(await s.exists("objects/none.json")));

    let mutRefused = false;
    try { await s.put("meta.json", Buffer.from("{}"), { immutable: false }); } catch (e: any) { mutRefused = /only current.json may be mutable/.test(e.message); }
    check("B2 only current.json may be mutable", mutRefused);

    await s.put("current.json", Buffer.from("{\"v\":1}\n"), { immutable: false });
    await s.put("current.json", Buffer.from("{\"v\":2}\n"), { immutable: false });
    await s.put("current.json", Buffer.from("{\"v\":1}\n"), { immutable: false }); // restore = append again
    const log = [...f.blobs.keys()].filter(k => k.startsWith(`elmonitor/a2/${POINTER_LOG}/current.json/`));
    check("B3 pointer updates append immutable log entries, never overwrite", log.length === 3 && f.puts.every((p, i) => f.puts.indexOf(p) === i));
    check("B3b get(current.json) returns the newest entry", (await s.get("current.json"))?.toString() === "{\"v\":1}\n");
    check("B3c list() hides the pointer log", (await s.list("")).join(",") === "objects/abc.json", (await s.list("")).join(","));
    let reserved = false;
    try { await s.put(`${POINTER_LOG}/current.json/x.json`, Buffer.from("{}"), { immutable: true }); } catch (e: any) { reserved = /reserved/.test(e.message); }
    check("B3d _log/ cannot be written as an ordinary key", reserved);

    const same = adapter(new FakeBlob("private"), "private", "elmonitor/a2", () => new Date("2026-11-05T13:17:00.000Z"));
    await same.put("current.json", Buffer.from("{\"v\":3}\n"), { immutable: false });
    await same.put("current.json", Buffer.from("{\"v\":4}\n"), { immutable: false });
    check("B3e two pointer writes in the same millisecond stay ordered", (await same.get("current.json"))?.toString() === "{\"v\":4}\n");
    let behind = false;
    try { await adapter(f, "private", "elmonitor/a2", () => new Date("2026-01-01T00:00:00.000Z")).put("current.json", Buffer.from("{}"), { immutable: false }); }
    catch (e: any) { behind = /clock behind/.test(e.message); }
    check("B3f a clock behind the newest pointer entry fails hard", behind);
  }
  {
    const pub = new FakeBlob("public");
    let mismatch = false;
    // Store is public, adapter configured private: the store answers with a public URL host.
    const s = new BlobAdapter("elmonitor/a2", "private", async () => ({ ...pub, get: async () => null, put: pub.put.bind(pub), list: pub.list.bind(pub) }) as BlobSdk);
    try { await s.put("objects/x.json", Buffer.from("{}"), { immutable: true }); } catch (e: any) { mismatch = /does not match access "private"/.test(e.message); }
    check("B4 public/private mismatch fails hard", mismatch);
    let suffix = false;
    try { await adapter(new FakeBlob("private", 1000, true)).put("objects/y.json", Buffer.from("{}"), { immutable: true }); } catch (e: any) { suffix = /returned pathname/.test(e.message); }
    check("B5 random suffix on a written pathname fails hard", suffix);
    const paged = new FakeBlob("private", 2);
    const sp = adapter(paged);
    for (let i = 0; i < 7; i++) await sp.put(`objects/${i}.json`, Buffer.from(`${i}`), { immutable: true });
    for (let i = 0; i < 5; i++) await sp.put("current.json", Buffer.from(`{"p":${i}}`), { immutable: false });
    check("B6 list pages through cursor (7 keys, page size 2)", (await sp.list("objects")).length === 7);
    check("B6b newest pointer found across pages", (await sp.get("current.json"))?.toString() === "{\"p\":4}");
  }
  {
    const saved = process.env.ELMONITOR_BLOB_ACCESS;
    delete process.env.ELMONITOR_BLOB_ACCESS;
    let noEnv = false;
    try { openStore("blob:elmonitor/a2"); } catch (e: any) { noEnv = /ELMONITOR_BLOB_ACCESS must be/.test(e.message); }
    process.env.ELMONITOR_BLOB_ACCESS = "Public";
    let badEnv = false;
    try { openStore("blob:elmonitor/a2"); } catch (e: any) { badEnv = /ELMONITOR_BLOB_ACCESS must be/.test(e.message); }
    process.env.ELMONITOR_BLOB_ACCESS = "private";
    const ok = openStore("blob:elmonitor/a2").kind === "blob";
    let badPrefix = false;
    try { openStore("blob:../x"); } catch (e: any) { badPrefix = /invalid blob prefix/.test(e.message); }
    if (saved === undefined) delete process.env.ELMONITOR_BLOB_ACCESS; else process.env.ELMONITOR_BLOB_ACCESS = saved;
    check("B7 openStore blob: access required, exact values only, no default", noEnv && badEnv && ok);
    check("B7b invalid blob prefix refused", badPrefix);
  }

  // ---------------- B8 full A2 chain on Blob equals the chain on a local dir ----------------
  {
    freshMock();
    const loc = new LocalDirAdapter(tmp("loc"));
    const rl = await run(loc, tmp("wl"));
    freshMock();
    const f = new FakeBlob("private");
    const bs = adapter(f);
    const rb = await run(bs, tmp("wb"));
    const vl = await resolveVerified(loc), vb = await resolveVerified(bs);
    check("B8 first run on Blob PUBLISHED, exit 0", rb.report.status === "PUBLISHED" && rb.exitCode === 0, `${rb.report.status} ${JSON.stringify(rb.report.publish)}`);
    check("B8b Blob version verifies (pointer -> manifest -> objects)", !!vb && vb.pointer.version_id === rb.report.publish.version_id);
    check("B8c same content hash as the local-dir chain", !!vl && !!vb && vl.pointer.content_sha256 === vb.pointer.content_sha256 && rl.exitCode === 0);
    freshMock();
    const rb2 = await run(bs, tmp("wb2"), new Date(NOW.getTime() + 60000));
    check("B8d second run on unchanged source: NO_CHANGE, pointer log unchanged", rb2.report.status === "NO_CHANGE" && [...f.blobs.keys()].filter(k => k.includes(`/${POINTER_LOG}/`)).length === 1, rb2.report.status);
    check("B8e no blob was ever written twice", new Set(f.puts).size === f.puts.length);
  }

  // ---------------- B10 time budget: newest first, rest deferred, next run completes ----------------
  {
    const f = new FakeBlob("private");
    const bs = adapter(f);
    freshMock();
    let tick = NOW.getTime();
    const clock = () => new Date(tick += 1000);              // one second per clock read
    const budget = await runA2({ store: bs, workDir: tmp("wd1"), token: "TEST-TOKEN-NOT-A-SECRET", today: TODAY, now: () => NOW,
      acquire: { sleep: noSleep, now: clock }, deadlineMs: NOW.getTime() + 40000, recentFirst: true });
    const fetched = budget.report.groups;
    const dg = budget.report.plan.deferred_groups ?? 0;
    check("B10 time-limited run publishes what it fetched and defers the rest", budget.report.status === "PUBLISHED" && fetched.length > 0 && dg > 0 && fetched.length + dg === budget.report.plan.groups && (budget.report.plan.deferred_days ?? 0) > 0,
      `${budget.report.status} fetched=${fetched.length} deferred=${dg} of ${budget.report.plan.groups}`);
    check("B10b fetched in newest-first order and today's groups among them", fetched.every((g, i) => i === 0 || fetched[i - 1].last >= g.last) && fetched.some(g => g.last >= TODAY));
    const v1 = await resolveVerified(bs);
    const deferredSeen = budget.report.groups.length;
    check("B10c deferred groups are not marked as errors", budget.report.source_errors.length === 0 && !budget.report.merge.FETCH_ERROR && deferredSeen === fetched.length && !!v1);
    freshMock();
    const rest = await runA2({ store: bs, workDir: tmp("wd2"), token: "TEST-TOKEN-NOT-A-SECRET", today: TODAY, now: () => NOW,
      acquire: { sleep: noSleep, now: () => NOW }, recentFirst: true });
    freshMock();
    const full = new FakeBlob("private");
    const fs2 = adapter(full);
    await run(fs2, tmp("wfull"));
    const split = (await resolveVerified(bs))!.files, whole = (await resolveVerified(fs2))!.files;
    const dataEq = (a: Map<string, Buffer>, b: Map<string, Buffer>) => {
      const ka = [...a.keys()].filter(k => k.startsWith("data/")).sort(), kb = [...b.keys()].filter(k => k.startsWith("data/")).sort();
      return ka.length > 0 && ka.join() === kb.join() && ka.every(k => sha256(a.get(k)!) === sha256(b.get(k)!));
    };
    check("B10d after the follow-up run, all data files equal a single full run", (rest.report.status === "PUBLISHED") && dataEq(split, whole), rest.report.status);
    check("B10e follow-up run has nothing deferred", !rest.report.plan.deferred_groups);
  }

  // ---------------- B11 exists() via one listing ----------------
  {
    const f = new FakeBlob("private");
    const s = adapter(f);
    await s.put("objects/a.json", Buffer.from("A"), { immutable: true });
    const s2 = adapter(f);                                                    // fresh adapter: lists once
    let lists = 0; const realList = f.list.bind(f); f.list = async (o: any) => { lists++; return realList(o); };
    const e1 = await s2.exists("objects/a.json"), e2 = await s2.exists("objects/b.json"), e3 = await s2.exists("objects/a.json");
    await s2.put("objects/b.json", Buffer.from("B"), { immutable: true });
    const e4 = await s2.exists("objects/b.json");
    check("B11 exists answers from one listing, confirms unlisted keys, sees own writes", e1 && !e2 && e3 && e4 && lists === 1, `${e1} ${e2} ${e3} ${e4} lists=${lists}`);
  }

  // ---------------- B12 the scheduled job end to end (A2 -> ECB -> export -> site) ----------------
  {
    freshMock();
    const fa = new FakeBlob("private"), fsite = new FakeBlob("private");
    const a2 = adapter(fa), site = adapter(fsite, "private", "elmonitor/site");
    // Minimal ECB SDW jsondata shape as read by export_preview (one series, observation index -> date).
    const ecb = Buffer.from(JSON.stringify({ dataSets: [{ series: { "0:0:0:0:0": { observations: { "0": [10.95], "1": [10.97] } } } }],
      structure: { dimensions: { observation: [{ values: [{ id: "2026-03-30" }, { id: "2026-03-31" }] }] } } }));
    const fakeFetch = (async (url: string) => {
      if (!String(url).startsWith("https://data-api.ecb.europa.eu/service/data/EXR/D.SEK.EUR.SP00.A?format=jsondata&startPeriod=")) throw new Error(`unexpected url ${url}`);
      return new Response(new Uint8Array(ecb), { status: 200 });
    }) as unknown as typeof fetch;
    const j = await runJob({ a2, site, token: "TEST-TOKEN-NOT-A-SECRET", workDir: tmp("job"), acquireDeadlineMs: Number.MAX_SAFE_INTEGER,
      now: () => NOW, fetchImpl: fakeFetch, instrument: { "pipeline/a2/run_a2.ts": "x".repeat(64) },
      a2Extra: { today: TODAY, now: () => NOW, acquire: { sleep: noSleep, now: () => NOW } } });
    const ptr = await readSitePointer(site);
    const snap = ptr ? JSON.parse((await site.get(ptr.snapshot_key))!.toString("utf-8")) : null;
    check("B12 job: A2 published, site snapshot published and verifiable", j.ok && j.stage === "DONE" && j.a2?.status === "PUBLISHED" && !!ptr && ptr.sha256 === j.site?.sha256, JSON.stringify(j).slice(0, 300));
    check("B12b snapshot carries the ECB rate and its raw hash; raw kept as evidence", snap?.fx?.rates?.["2026-03-31"] === 10.97 && snap.fx.raw_sha256 === sha256(ecb) && (await site.get(`evidence/ecb/${sha256(ecb)}.json`)) !== null);
    check("B12c run report records the injected instrument hashes", JSON.parse((await a2.get(`runs/${j.a2!.run_id}.json`))!.toString("utf-8")).instrument["pipeline/a2/run_a2.ts"] === "x".repeat(64));
    const failing = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
    freshMock();
    const j2 = await runJob({ a2, site, token: "TEST-TOKEN-NOT-A-SECRET", workDir: tmp("job2"), acquireDeadlineMs: Number.MAX_SAFE_INTEGER,
      now: () => NOW, fetchImpl: failing, a2Extra: { today: TODAY, now: () => new Date(NOW.getTime() + 60000), acquire: { sleep: noSleep, now: () => NOW } } });
    check("B12d ECB down: job fails at ECB, previous site pointer stays", !j2.ok && j2.stage === "ECB" && (await readSitePointer(site))?.sha256 === ptr?.sha256);
  }

  // ---------------- B9 site publisher ----------------
  {
    const f = new FakeBlob("private");
    const site = adapter(f, "private", "elmonitor/site");
    const body = Buffer.from(JSON.stringify({ schema: "ELMONITOR_PREVIEW_SNAPSHOT_v1", today: "2026-11-05", source: { version_id: "v1", manifest_sha256: "m".repeat(64) } }) + "\n");
    const p1 = await publishSite(site, body, () => new Date("2026-11-05T13:20:00.000Z"));
    const ptr = await readSitePointer(site);
    check("B9 site snapshot stored content-addressed and pointer names it", p1.status === "PUBLISHED" && ptr?.snapshot_key === `snapshots/${sha256(body)}.json` && ptr.sha256 === sha256(body) && ptr.bytes === body.length);
    check("B9b snapshot read back equals the exported bytes", sha256((await site.get(ptr!.snapshot_key))!) === sha256(body));
    const p2 = await publishSite(site, body, () => new Date("2026-11-05T21:20:00.000Z"));
    check("B9c identical snapshot -> NO_CHANGE, no new pointer", p2.status === "NO_CHANGE" && [...f.blobs.keys()].filter(k => k.includes(`/${POINTER_LOG}/${SITE_POINTER_KEY}/`)).length === 1);
    const withFx = Buffer.from(JSON.stringify({ schema: "ELMONITOR_PREVIEW_SNAPSHOT_v1", today: "2026-11-06", source: { version_id: "v2", manifest_sha256: "n".repeat(64) }, fx: { raw_sha256: sha256(Buffer.from("ECB")) } }) + "\n");
    let noRaw = false, wrongRaw = false;
    try { await publishSite(site, withFx, () => new Date("2026-11-06T00:20:00.000Z")); } catch (e: any) { noRaw = /--fx-raw/.test(e.message); }
    try { await publishSite(site, withFx, () => new Date("2026-11-06T00:20:00.000Z"), Buffer.from("ECX")); } catch (e: any) { wrongRaw = /!= snapshot fx.raw_sha256/.test(e.message); }
    const p3 = await publishSite(site, withFx, () => new Date("2026-11-06T00:20:00.000Z"), Buffer.from("ECB"));
    check("B9e fx snapshot needs the exact raw ECB file; stored as evidence/ecb/<sha>.json", noRaw && wrongRaw && p3.status === "PUBLISHED" && (await site.get(`evidence/ecb/${sha256(Buffer.from("ECB"))}.json`))?.toString() === "ECB");
    let notSnap = false;
    try { await publishSite(site, Buffer.from("{\"schema\":\"X\"}\n"), () => new Date()); } catch (e: any) { notSnap = /schema/.test(e.message); }
    check("B9d a body that is not a snapshot is refused", notSnap);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
