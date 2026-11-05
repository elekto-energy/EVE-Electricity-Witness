/**
 * ELMONITOR A2 - publish one exported site snapshot to the site store (OWNER-GO 2026-11-05).
 *
 * Site store layout (own prefix, separate from the A2 store):
 *   snapshots/<sha256>.json   immutable snapshot, exactly the bytes export_preview.ts wrote
 *   evidence/ecb/<sha256>.json immutable raw ECB response the snapshot's fx block was read from (fx.raw_sha256)
 *   current.json              pointer (ELMONITOR_SITE_POINTER_v1); in a blob store an append-only log, see store.ts
 *
 * Steps: refuse a body that is not ELMONITOR_PREVIEW_SNAPSHOT_v1; upload the snapshot; read it back and verify
 * sha256 and size; if the current pointer already names the same sha256 -> NO_CHANGE; else write the pointer and
 * read it back. Any mismatch throws; the site keeps reading the previous pointer.
 *
 * Usage: npx tsx pipeline/a2/publish_site.ts --store blob:<prefix> --snapshot <file> [--fx-raw <ECB jsondata file>]
 */

import { readFileSync } from "fs";
import { openStore, sha256, StorageAdapter } from "./store";

export const SITE_POINTER_KEY = "current.json";
export const SITE_POINTER_SCHEMA = "ELMONITOR_SITE_POINTER_v1";
const SNAPSHOT_SCHEMA = "ELMONITOR_PREVIEW_SNAPSHOT_v1";

export interface SitePointer {
  schema: typeof SITE_POINTER_SCHEMA;
  snapshot_key: string;
  sha256: string;
  bytes: number;
  today: string;
  a2_version_id: string;
  a2_manifest_sha256: string;
  published_at_utc: string;
}

export async function readSitePointer(store: StorageAdapter): Promise<SitePointer | null> {
  const b = await store.get(SITE_POINTER_KEY);
  if (!b) return null;
  const p = JSON.parse(b.toString("utf-8"));
  if (p.schema !== SITE_POINTER_SCHEMA) throw new Error(`site pointer schema ${String(p.schema)}`);
  return p as SitePointer;
}

export async function publishSite(store: StorageAdapter, body: Buffer, now: () => Date = () => new Date(), fxRaw: Buffer | null = null):
  Promise<{ status: "PUBLISHED" | "NO_CHANGE"; pointer: SitePointer }> {
  const snap = JSON.parse(body.toString("utf-8"));
  if (snap?.schema !== SNAPSHOT_SCHEMA) throw new Error(`refusing body with schema ${String(snap?.schema)}, expected ${SNAPSHOT_SCHEMA}`);
  if (snap.fx) {
    if (!fxRaw) throw new Error("snapshot has an fx block: --fx-raw with the ECB response it was read from is required");
    if (sha256(fxRaw) !== snap.fx.raw_sha256) throw new Error(`--fx-raw sha256 ${sha256(fxRaw)} != snapshot fx.raw_sha256 ${snap.fx.raw_sha256}`);
    const ek = `evidence/ecb/${snap.fx.raw_sha256}.json`;
    await store.put(ek, fxRaw, { immutable: true });
    const eb = await store.get(ek);
    if (!eb || sha256(eb) !== snap.fx.raw_sha256) throw new Error(`read-back mismatch for ${ek}`);
  }
  if (typeof snap.today !== "string" || typeof snap.source?.version_id !== "string" || typeof snap.source?.manifest_sha256 !== "string") {
    throw new Error("snapshot lacks today / source.version_id / source.manifest_sha256");
  }
  const sha = sha256(body);
  const key = `snapshots/${sha}.json`;
  await store.put(key, body, { immutable: true });
  const back = await store.get(key);
  if (!back || sha256(back) !== sha || back.length !== body.length) throw new Error(`read-back mismatch for ${key}`);

  const previous = await readSitePointer(store);
  if (previous && previous.sha256 === sha) return { status: "NO_CHANGE", pointer: previous };

  const pointer: SitePointer = {
    schema: SITE_POINTER_SCHEMA, snapshot_key: key, sha256: sha, bytes: body.length, today: snap.today,
    a2_version_id: snap.source.version_id, a2_manifest_sha256: snap.source.manifest_sha256,
    published_at_utc: now().toISOString(),
  };
  const pbuf = Buffer.from(JSON.stringify(pointer, null, 2) + "\n", "utf-8");
  await store.put(SITE_POINTER_KEY, pbuf, { immutable: false });
  const pback = await store.get(SITE_POINTER_KEY);
  if (!pback || sha256(pback) !== sha256(pbuf)) throw new Error("site pointer read-back mismatch");
  return { status: "PUBLISHED", pointer };
}

function arg(name: string): string {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  throw new Error(`missing argument ${name}`);
}

if (require.main === module) {
  (async () => {
    const store = openStore(arg("--store"));
    const body = readFileSync(arg("--snapshot"));
    const i = process.argv.indexOf("--fx-raw");
    const fxRaw = i >= 0 && process.argv[i + 1] ? readFileSync(process.argv[i + 1]) : null;
    const r = await publishSite(store, body, () => new Date(), fxRaw);
    console.log(`[publish_site] status=${r.status} sha256=${r.pointer.sha256} bytes=${r.pointer.bytes} today=${r.pointer.today} a2_version=${r.pointer.a2_version_id}`);
  })().catch(e => { console.error(`[publish_site] ERROR: ${String(e?.message ?? e)}`); process.exit(1); });
}
