/**
 * ELMONITOR A2 - state, version build, safe publication and verified read.
 *
 * Publication protocol (previous valid version stays live on any failure before step 5):
 *   1. upload missing immutable objects (data, coverage, raw evidence), content-addressed by sha256
 *   2. read every referenced object back and verify sha256
 *   3. upload the immutable version manifest, read back, verify
 *   4. re-read current.json and require it still points to the version this build started from
 *   5. replace current.json (the only mutable key)
 *   6. read current.json back and verify; on mismatch restore the previous pointer and fail
 * Readers only follow current.json -> manifest -> objects and verify every hash (resolveVerified).
 */

import { PRICE_SELECTION_RULES_V3, DEFAULT_RULE, HOURLY_METHOD_V3 } from "../../spike/a_local_ingest/lib_v3";
import { A2_ID, A2_VERSION, FLOW_BORDERS, HISTORY_START, PRICE_ZONES, REVISION_WINDOW_DAYS, VALUES_HASH_METHOD, VALUES_HASH_METHOD_V1_LEGACY } from "./config";
import { countedRevisions, DayData, RegisterEntry, regKey, REVISION_CLASS_ORIGIN_ONLY, seriesSlug, stableEntry, valuesSha } from "./model";
import { sha256, stableJson, StorageAdapter } from "./store";

export const CURRENT_KEY = "current.json";
export const POINTER_SCHEMA = "ELMONITOR_A2_CURRENT_v1";
export const MANIFEST_SCHEMA = "ELMONITOR_A2_VERSION_MANIFEST_v1";

export interface MonthFile { dataset: string; series: string; month: string; unit: string; days: Record<string, DayData> }
export interface State { register: Map<string, RegisterEntry>; months: Map<string, MonthFile> }
export const monthKey = (dataset: string, series: string, month: string) => `${dataset}|${series}|${month}`;

export interface Pointer { schema: string; version_id: string; manifest_key: string; manifest_sha256: string; content_sha256: string; published_at_utc: string; run_id: string }
export interface Manifest {
  schema: string; a2_id: string; a2_version: string; version_id: string; content_sha256: string;
  built_at_utc: string; run_id: string; previous_version_id: string | null;
  instrument: Record<string, string>;
  files: { path: string; sha256: string; bytes: number }[];
  raw_evidence: string[];
  /** absent in a2.0 manifests (= V1 legacy) */
  values_hash_method?: string;
  migration?: MigrationReport | null;
}

/** Result of migrating a legacy (a2.0, V1 hash) state on load. Old versions are not touched. */
export interface MigrationReport {
  from_values_hash_method: string; to_values_hash_method: string;
  loaded_version_id: string; previous_version_id: string | null;
  entries_migrated: number; hashes_recomputed: number;
  revisions_checked: number; revisions_reclassified_origin_only: number; revisions_kept: number;
  reclassified: { series: string; day: string; run_id: string }[];
}

export class PublishError extends Error {
  constructor(readonly stage: string, msg: string) { super(`${stage}: ${msg}`); }
}

const objectKey = (sha: string) => `objects/${sha}.json`;

/** Store calls run with this many in flight (a remote store answers each call over the network). */
export const IO_CONCURRENCY = 16;

/** Map with at most `limit` calls in flight; results keep input order; the first failure rejects. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0, failed: unknown = null;
  const worker = async () => {
    while (failed === null && next < items.length) {
      const i = next++;
      try { out[i] = await fn(items[i], i); } catch (e) { if (failed === null) failed = e; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failed !== null) throw failed;
  return out;
}

/** Read current.json -> manifest -> every object, verifying every sha256. Returns null when nothing is published yet. */
export async function resolveVerified(store: StorageAdapter): Promise<{ pointer: Pointer; manifest: Manifest; files: Map<string, Buffer> } | null> {
  const pb = await store.get(CURRENT_KEY);
  if (!pb) return null;
  const pointer: Pointer = JSON.parse(pb.toString("utf-8"));
  if (pointer.schema !== POINTER_SCHEMA) throw new Error(`unknown pointer schema ${pointer.schema}`);
  const mb = await store.get(pointer.manifest_key);
  if (!mb || sha256(mb) !== pointer.manifest_sha256) throw new Error(`manifest ${pointer.manifest_key} missing or hash mismatch`);
  const manifest: Manifest = JSON.parse(mb.toString("utf-8"));
  if (manifest.content_sha256 !== pointer.content_sha256 || contentSha(manifest.files) !== manifest.content_sha256) throw new Error("content hash mismatch");
  const files = new Map<string, Buffer>();
  const bodies = await mapLimit(manifest.files, IO_CONCURRENCY, async f => {
    const b = await store.get(objectKey(f.sha256));
    if (!b || sha256(b) !== f.sha256 || b.length !== f.bytes) throw new Error(`object for ${f.path} missing or hash mismatch`);
    return b;
  });
  manifest.files.forEach((f, i) => files.set(f.path, bodies[i]));
  return { pointer, manifest, files };
}

export function contentSha(files: { path: string; sha256: string }[]): string {
  return sha256(stableJson([...files].sort((a, b) => a.path.localeCompare(b.path)).map(f => [f.path, f.sha256])));
}

/** Read and verify a version by id (manifest + objects), without going through current.json. */
export async function resolveVersionVerified(store: StorageAdapter, versionId: string): Promise<{ manifest: Manifest; files: Map<string, Buffer> }> {
  const mb = await store.get(`versions/${versionId}/MANIFEST.json`);
  if (!mb) throw new Error(`manifest of ${versionId} missing`);
  const manifest: Manifest = JSON.parse(mb.toString("utf-8"));
  if (manifest.version_id !== versionId || contentSha(manifest.files) !== manifest.content_sha256) throw new Error(`manifest of ${versionId} inconsistent`);
  const files = new Map<string, Buffer>();
  const data = manifest.files.filter(f => f.path.startsWith("data/")); // only data files are needed for revision checks
  const bodies = await mapLimit(data, IO_CONCURRENCY, async f => {
    const b = await store.get(objectKey(f.sha256));
    if (!b || sha256(b) !== f.sha256 || b.length !== f.bytes) throw new Error(`object for ${f.path} of ${versionId} missing or hash mismatch`);
    return b;
  });
  data.forEach((f, i) => files.set(f.path, bodies[i]));
  return { manifest, files };
}

/** Load the last verified published state (empty when nothing published); migrate a legacy (V1 hash) state. */
export async function loadState(store: StorageAdapter): Promise<{ state: State; pointer: Pointer | null; migration: MigrationReport | null }> {
  const state: State = { register: new Map(), months: new Map() };
  const cur = await resolveVerified(store);
  if (!cur) return { state, pointer: null, migration: null };
  for (const [path, b] of cur.files) {
    const o = JSON.parse(b.toString("utf-8"));
    if (path.startsWith("data/")) state.months.set(monthKey(o.dataset, o.series, o.month), o);
    else if (path.startsWith("coverage/") && Array.isArray(o.entries)) {
      for (const e of o.entries) state.register.set(regKey(e.dataset, e.series, e.day), { ...e, last_checked_utc: e.last_changed_utc });
    }
  }
  const migration = await migrateLegacyState(store, state, cur.manifest);
  return { state, pointer: cur.pointer, migration };
}

/**
 * a2.0 -> a2.1: recompute every legacy values hash with the current method from the stored data (not a data change:
 * last_changed_utc stays), mark legacy revision records with the V1 method, and re-check revisions detected by the
 * run that built the loaded version against the previous version's data with the current method. A revision whose
 * values are equal apart from the R/E origin marker is reclassified (kept, not deleted, not counted).
 */
export async function migrateLegacyState(store: StorageAdapter, state: State, manifest: Manifest): Promise<MigrationReport | null> {
  const legacy = [...state.register.values()].filter(e => !e.values_hash_method);
  if (legacy.length === 0) return null;
  const rep: MigrationReport = {
    from_values_hash_method: VALUES_HASH_METHOD_V1_LEGACY, to_values_hash_method: VALUES_HASH_METHOD,
    loaded_version_id: manifest.version_id, previous_version_id: manifest.previous_version_id,
    entries_migrated: 0, hashes_recomputed: 0, revisions_checked: 0, revisions_reclassified_origin_only: 0, revisions_kept: 0, reclassified: [],
  };
  let prevFiles: Map<string, Buffer> | null = null;
  const prevMonths = new Map<string, any>();
  const prevDay = async (e: RegisterEntry): Promise<DayData | null> => {
    if (!manifest.previous_version_id) return null;
    if (!prevFiles) prevFiles = (await resolveVersionVerified(store, manifest.previous_version_id)).files;
    const path = `data/${e.dataset}/${seriesSlug(e.series)}/${e.day.slice(0, 7)}.json`;
    if (!prevMonths.has(path)) prevMonths.set(path, prevFiles.has(path) ? JSON.parse(prevFiles.get(path)!.toString("utf-8")) : null);
    return prevMonths.get(path)?.days?.[e.day] ?? null;
  };
  for (const e0 of legacy) {
    const data = state.months.get(monthKey(e0.dataset, e0.series, e0.day.slice(0, 7)))?.days[e0.day] ?? null;
    const e: RegisterEntry = { ...e0, values_hash_method: VALUES_HASH_METHOD, revisions: e0.revisions.map(r => ({ ...r, values_hash_method: r.values_hash_method ?? VALUES_HASH_METHOD_V1_LEGACY })) };
    if (e0.values_sha256 !== null && data) { e.values_sha256 = valuesSha(data); rep.hashes_recomputed++; }
    else if (e0.values_sha256 !== null) throw new Error(`migration: entry ${e0.dataset}|${e0.series}|${e0.day} has a hash but no data`);
    const last = e.revisions[e.revisions.length - 1];
    if (last && !last.classification && last.run_id === manifest.run_id) {
      rep.revisions_checked++;
      const before = await prevDay(e);
      if (before && data && valuesSha(before) === valuesSha(data)) {
        last.classification = REVISION_CLASS_ORIGIN_ONLY;
        last.classification_note = `values equal to version ${manifest.previous_version_id} under ${VALUES_HASH_METHOD}; only the R/E origin marker differed`;
        rep.revisions_reclassified_origin_only++;
        rep.reclassified.push({ series: e.series, day: e.day, run_id: last.run_id });
      } else rep.revisions_kept++;
    }
    state.register.set(regKey(e.dataset, e.series, e.day), e);
    rep.entries_migrated++;
  }
  rep.reclassified.sort((a, b) => (a.series + a.day).localeCompare(b.series + b.day));
  return rep;
}

export function putDay(state: State, dataset: string, series: string, day: string, data: DayData): void {
  const month = day.slice(0, 7);
  const k = monthKey(dataset, series, month);
  const m = state.months.get(k) ?? { dataset, series, month, unit: dataset === "prices" ? "EUR/MWh" : "MW", days: {} };
  m.days[day] = data;
  state.months.set(k, m);
}

/** Build all logical files of a version from the state (deterministic: same state -> same bytes). */
export function buildFiles(state: State): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const put = (path: string, v: unknown) => files.set(path, Buffer.from(stableJson(v), "utf-8"));
  for (const m of state.months.values()) put(`data/${m.dataset}/${seriesSlug(m.series)}/${m.month}.json`, m);
  const bySeries = new Map<string, RegisterEntry[]>();
  for (const e of state.register.values()) {
    const k = `${e.dataset}|${e.series}`;
    const a = bySeries.get(k) ?? [];
    a.push(e);
    bySeries.set(k, a);
  }
  const summary: Record<string, unknown> = {};
  for (const [k, entries] of [...bySeries.entries()].sort()) {
    const [dataset, series] = k.split("|");
    entries.sort((a, b) => a.day.localeCompare(b.day));
    // One coverage file per series x month: old months stay byte-identical, so they are not re-uploaded.
    const byMonth = new Map<string, RegisterEntry[]>();
    for (const e of entries) { const mm = e.day.slice(0, 7); byMonth.set(mm, [...(byMonth.get(mm) ?? []), e]); }
    for (const [mm, es] of byMonth) put(`coverage/${dataset}/${seriesSlug(series)}/${mm}.json`, { dataset, series, month: mm, entries: es.map(stableEntry) });
    const counts: Record<string, number> = {};
    for (const e of entries) counts[e.status] = (counts[e.status] ?? 0) + 1;
    summary[k] = {
      dataset, series, first_day: entries[0]?.day ?? null, last_day: entries[entries.length - 1]?.day ?? null, status_counts: counts,
      not_complete: entries.filter(e => e.status !== "COMPLETE").map(e => ({ day: e.day, status: e.status, missing_intervals: e.missing_intervals })),
      missing_intervals_total: entries.reduce((s, e) => s + (e.status === "COMPLETE" ? 0 : (e.missing_intervals ?? 0)), 0),
      selection_unverified: entries.filter(e => e.selection.verified === false).map(e => e.day),
      open_errors: entries.filter(e => e.last_error).map(e => ({ day: e.day, code: e.last_error!.code })),
      revisions: entries.reduce((s, e) => s + countedRevisions(e.revisions), 0),
      revisions_reclassified: entries.reduce((s, e) => s + (e.revisions.length - countedRevisions(e.revisions)), 0),
    };
  }
  put("coverage/summary.json", { history_start: HISTORY_START, series: summary });
  put("meta.json", {
    a2_id: A2_ID, a2_version: A2_VERSION, history_start: HISTORY_START, revision_window_days: REVISION_WINDOW_DAYS,
    price_zones: PRICE_ZONES, flow_borders: FLOW_BORDERS, market_tz: "Europe/Stockholm",
    selection_rules: { default: DEFAULT_RULE, prices: PRICE_SELECTION_RULES_V3 },
    hourly_method: HOURLY_METHOD_V3,
    values_hash_method: VALUES_HASH_METHOD,
    values_hash_note: "values_sha256 = sha256 of resolution, [start_utc, value] pairs, hourly and missing starts; the R/E origin marker (explicit point / A03 repeat) is stored in values as provenance but excluded from the hash because it depends on the request window. Hashes of different methods are never compared.",
    status_meaning: {
      COMPLETE: "every expected interval of the local day has a selected value",
      PARTIAL: "some intervals missing at the source; missing_starts_utc lists them; never filled",
      MISSING: "no value for a day that should be published",
      NOT_PUBLISHED_YET: "future day without data",
      IN_PROGRESS: "flows of the running local day, still being published",
      CONFLICT: "duplicate source values disagree beyond the rule; conflicting intervals have no value",
    },
    selection_note: "coverage status and selection verification are separate: selection.verified=false means complete data from a selected series outside its verified period",
  });
  return files;
}

export interface PublishHooks { beforeStage?: (stage: string) => Promise<void> | void }

export async function publish(
  store: StorageAdapter, files: Map<string, Buffer>, raw: Map<string, Buffer>, previous: Pointer | null,
  meta: { run_id: string; built_at_utc: string; instrument: Record<string, string>; migration?: MigrationReport | null }, hooks: PublishHooks = {},
): Promise<{ status: "PUBLISHED" | "NO_CHANGE"; pointer: Pointer }> {
  const list = [...files.entries()].map(([path, b]) => ({ path, sha256: sha256(b), bytes: b.length })).sort((a, b) => a.path.localeCompare(b.path));
  const content = contentSha(list);
  if (previous && previous.content_sha256 === content) return { status: "NO_CHANGE", pointer: previous };
  const stage = async (s: string) => { if (hooks.beforeStage) await hooks.beforeStage(s); };
  const versionId = `v${meta.built_at_utc.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}_${content.slice(0, 12)}`;
  try {
    await stage("UPLOAD_OBJECTS");
    await mapLimit(list, IO_CONCURRENCY, async f => {
      if (!(await store.exists(objectKey(f.sha256)))) await store.put(objectKey(f.sha256), files.get(f.path)!, { immutable: true });
    });
    await mapLimit([...raw.entries()], IO_CONCURRENCY, async ([sha, b]) => {
      if (!(await store.exists(`raw/${sha}.xml`))) await store.put(`raw/${sha}.xml`, b, { immutable: true });
    });
    await stage("VERIFY_OBJECTS");
    await mapLimit(list, IO_CONCURRENCY, async f => {
      const b = await store.get(objectKey(f.sha256));
      if (!b || sha256(b) !== f.sha256) throw new PublishError("VERIFY_OBJECTS", `object for ${f.path} failed read-back (${b ? `sha256 ${sha256(b)}, ${b.length} bytes` : "missing"})`);
    });
    await mapLimit([...raw.keys()], IO_CONCURRENCY, async sha => {
      const b = await store.get(`raw/${sha}.xml`);
      if (!b || sha256(b) !== sha) throw new PublishError("VERIFY_OBJECTS", `raw ${sha} failed read-back (${b ? `sha256 ${sha256(b)}, ${b.length} bytes` : "missing"})`);
    });
    await stage("UPLOAD_MANIFEST");
    const manifest: Manifest = {
      schema: MANIFEST_SCHEMA, a2_id: A2_ID, a2_version: A2_VERSION, version_id: versionId, content_sha256: content,
      built_at_utc: meta.built_at_utc, run_id: meta.run_id, previous_version_id: previous?.version_id ?? null,
      instrument: meta.instrument, files: list, raw_evidence: [...raw.keys()].sort(),
      values_hash_method: VALUES_HASH_METHOD, migration: meta.migration ?? null,
    };
    const mb = Buffer.from(stableJson(manifest), "utf-8");
    const manifestKey = `versions/${versionId}/MANIFEST.json`;
    await store.put(manifestKey, mb, { immutable: true });
    const mback = await store.get(manifestKey);
    if (!mback || sha256(mback) !== sha256(mb)) throw new PublishError("UPLOAD_MANIFEST", "manifest failed read-back");
    await stage("CHECK_POINTER");
    const curNow = await store.get(CURRENT_KEY);
    const curId = curNow ? (JSON.parse(curNow.toString("utf-8")) as Pointer).version_id : null;
    if (curId !== (previous?.version_id ?? null)) throw new PublishError("CHECK_POINTER", `current.json changed during the run (${curId}); not overwritten`);
    await stage("SWITCH_POINTER");
    const pointer: Pointer = {
      schema: POINTER_SCHEMA, version_id: versionId, manifest_key: manifestKey, manifest_sha256: sha256(mb),
      content_sha256: content, published_at_utc: meta.built_at_utc, run_id: meta.run_id,
    };
    const pbuf = Buffer.from(stableJson(pointer), "utf-8");
    await store.put(CURRENT_KEY, pbuf, { immutable: false });
    await stage("VERIFY_POINTER");
    const pback = await store.get(CURRENT_KEY);
    if (!pback || sha256(pback) !== sha256(pbuf)) {
      if (curNow) await store.put(CURRENT_KEY, curNow, { immutable: false });
      throw new PublishError("VERIFY_POINTER", "pointer failed read-back; previous pointer restored");
    }
    return { status: "PUBLISHED", pointer };
  } catch (e: any) {
    if (e instanceof PublishError) throw e;
    throw new PublishError("STORE_ERROR", String(e?.message ?? e));
  }
}
