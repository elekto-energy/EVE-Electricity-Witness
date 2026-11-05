/**
 * Server-side snapshot loading (OWNER-GO 2026-11-05).
 *
 * Source order:
 *   1. Vercel Blob, prefix elmonitor/site, written by pipeline/a2/publish_site.ts:
 *      newest pointer in _log/current.json/ (found through the list API) -> snapshots/<sha256>.json,
 *      verified against the pointer's sha256 and size and the snapshot schema.
 *   2. The snapshot bundled at build time (elmonitor_preview_snapshot.json), when the store is not configured or
 *      anything in (1) fails. The page then shows the bundled data with its own date; DataFreshness marks it.
 *
 * The store's access type is read from the URL host the list API returns (measured, not configured).
 * BLOB_READ_WRITE_TOKEN comes from connecting the store to the Vercel project; it is never logged.
 */

import { createHash } from "crypto";
import { get, list } from "@vercel/blob";
import bundledRaw from "./elmonitor_preview_snapshot.json";
import { asSnapshot, type Snapshot } from "./snapshot";

export interface LoadedSnapshot {
  snapshot: Snapshot;
  origin: "blob" | "bundled";
  /** sha256 of the snapshot bytes when read from Blob. */
  sha256: string | null;
  /** Why the bundled snapshot is used (store not configured, read or verification failure). */
  fallbackReason: string | null;
}

const PREFIX = "elmonitor/site/";
const LOG = `${PREFIX}_log/current.json/`;
const ENTRY = /^\d{8}T\d{9}Z\.json$/;
const SNAP_KEY = /^snapshots\/[0-9a-f]{64}\.json$/;

async function readAll(pathname: string, access: "public" | "private"): Promise<Buffer> {
  const r = await get(pathname, { access });
  if (!r || r.statusCode !== 200 || !r.stream) throw new Error(`blob ${pathname}: not found`);
  const chunks: Buffer[] = [];
  const reader = r.stream.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(Buffer.from(value)); }
  return Buffer.concat(chunks);
}

async function fromBlob(): Promise<{ snapshot: Snapshot; sha256: string }> {
  const entries: { pathname: string; url: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: LOG, cursor, limit: 1000 });
    entries.push(...page.blobs.map(b => ({ pathname: b.pathname, url: b.url })));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const valid = entries.filter(e => ENTRY.test(e.pathname.slice(LOG.length))).sort((a, b) => (a.pathname < b.pathname ? -1 : 1));
  const newest = valid[valid.length - 1];
  if (!newest) throw new Error("no site pointer in store");
  const host = new URL(newest.url).host;
  const access = host.endsWith(".public.blob.vercel-storage.com") ? "public" : host.endsWith(".private.blob.vercel-storage.com") ? "private" : null;
  if (!access) throw new Error(`unexpected blob host ${host}`);

  const pointer = JSON.parse((await readAll(newest.pathname, access)).toString("utf-8"));
  if (pointer.schema !== "ELMONITOR_SITE_POINTER_v1") throw new Error(`site pointer schema ${String(pointer.schema)}`);
  if (typeof pointer.snapshot_key !== "string" || !SNAP_KEY.test(pointer.snapshot_key)) throw new Error("site pointer snapshot_key invalid");
  const body = await readAll(PREFIX + pointer.snapshot_key, access);
  const sha = createHash("sha256").update(body).digest("hex");
  if (sha !== pointer.sha256 || body.length !== pointer.bytes || pointer.snapshot_key !== `snapshots/${sha}.json`) {
    throw new Error(`snapshot verification failed: sha256 ${sha} bytes ${body.length}`);
  }
  return { snapshot: asSnapshot(JSON.parse(body.toString("utf-8"))), sha256: sha };
}

export async function loadSnapshot(): Promise<LoadedSnapshot> {
  const bundled = (reason: string): LoadedSnapshot => ({ snapshot: asSnapshot(bundledRaw), origin: "bundled", sha256: null, fallbackReason: reason });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return bundled("store not configured");
  try {
    const r = await fromBlob();
    return { snapshot: r.snapshot, origin: "blob", sha256: r.sha256, fallbackReason: null };
  } catch (e) {
    const reason = String((e as Error)?.message ?? e);
    console.error(`[elmonitor] snapshot from Blob not used: ${reason}`);
    return bundled(reason);
  }
}
