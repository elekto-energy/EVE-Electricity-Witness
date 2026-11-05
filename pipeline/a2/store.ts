/**
 * ELMONITOR A2 - storage adapter.
 *
 * Layout in any store (keys are POSIX paths):
 *   objects/<sha256>.json      immutable, content-addressed data files (cache forever)
 *   raw/<sha256>.xml           immutable raw ENTSO-E response bodies (evidence)
 *   versions/<id>/MANIFEST.json immutable version manifest: logical path -> object sha256/bytes
 *   runs/<run_id>.json          run report (success or failure), written once per run
 *   current.json                the ONLY mutable key: pointer to the last verified version
 *
 * Adapters: LocalDirAdapter (local:<dir>) and BlobAdapter (blob:<prefix>, Vercel Blob; OWNER-GO 2026-11-05).
 */

import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, readdirSync, statSync } from "fs";
import { dirname, join, relative, resolve, sep } from "path";

export interface StorageAdapter {
  readonly kind: string;
  get(key: string): Promise<Buffer | null>;
  exists(key: string): Promise<boolean>;
  /** Immutable keys must never be overwritten with different bytes; the adapter refuses. */
  put(key: string, body: Buffer, opts: { immutable: boolean }): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

/** Deterministic JSON: object keys sorted recursively, 2-space indent, trailing newline. */
export function stableJson(v: unknown): string {
  const norm = (x: any): any => {
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === "object") {
      const o: Record<string, unknown> = {};
      for (const k of Object.keys(x).sort()) if (x[k] !== undefined) o[k] = norm(x[k]);
      return o;
    }
    return x;
  };
  return JSON.stringify(norm(v), null, 2) + "\n";
}

function checkKey(key: string): void {
  if (!/^[A-Za-z0-9_.\-/]+$/.test(key) || key.includes("..") || key.startsWith("/")) throw new Error(`invalid store key: ${key}`);
}

export class LocalDirAdapter implements StorageAdapter {
  readonly kind = "local";
  constructor(readonly root: string) { mkdirSync(root, { recursive: true }); }
  private path(key: string): string {
    checkKey(key);
    const p = resolve(this.root, ...key.split("/"));
    if (relative(resolve(this.root), p).startsWith("..")) throw new Error(`key escapes store: ${key}`);
    return p;
  }
  async get(key: string) { const p = this.path(key); return existsSync(p) ? readFileSync(p) : null; }
  async exists(key: string) { return existsSync(this.path(key)); }
  async put(key: string, body: Buffer, opts: { immutable: boolean }) {
    const p = this.path(key);
    if (opts.immutable && existsSync(p)) {
      if (sha256(readFileSync(p)) === sha256(body)) return; // idempotent re-put of identical bytes
      throw new Error(`immutable key exists with different content: ${key}`);
    }
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tmp, body, { flag: "wx" });
    renameSync(tmp, p); // atomic replace on the same volume
  }
  async list(prefix: string) {
    const base = this.path(prefix.replace(/\/$/, "") || ".");
    if (!existsSync(base)) return [];
    const out: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const q = join(d, f);
        if (statSync(q).isDirectory()) walk(q);
        else if (!f.includes(".tmp-")) out.push(relative(resolve(this.root), q).split(sep).join("/"));
      }
    };
    walk(base);
    return out.sort();
  }
}

// ---------------------------------------------------------------------------
// Vercel Blob
// ---------------------------------------------------------------------------

/** The subset of @vercel/blob (pinned 2.8.2) the adapter uses; injectable so tests run offline. */
export interface BlobSdk {
  put(pathname: string, body: Buffer, opts: {
    access: BlobAccess; addRandomSuffix: false; allowOverwrite: false; contentType: string; cacheControlMaxAge: number;
  }): Promise<{ pathname: string; url: string }>;
  get(pathname: string, opts: { access: BlobAccess }): Promise<{ statusCode: number; stream: ReadableStream<Uint8Array> | null } | null>;
  list(opts: { prefix: string; cursor?: string; limit?: number }): Promise<{ blobs: { pathname: string; url: string }[]; cursor?: string; hasMore: boolean }>;
}
export type BlobAccess = "public" | "private";

/** Folder that holds the append-only history of a mutable key (only current.json today). */
export const POINTER_LOG = "_log";

/**
 * Vercel Blob store under a fixed prefix.
 *
 * Nothing is ever overwritten. Every blob is written once with allowOverwrite=false. A mutable key K (put with
 * immutable=false) is stored as a new immutable entry  _log/K/<UTC timestamp>.json  and get(K) returns the newest
 * entry found through the list API. Reasons: a public store serves get() through the CDN (useCache=false only
 * applies to private stores in @vercel/blob 2.8.2), so an overwritten pointer could be read back stale; the log
 * also keeps every pointer state as evidence. Restoring a previous pointer appends it again as the newest entry.
 *
 * Every written blob is checked: returned pathname must equal the requested one (no random suffix) and the URL
 * host must carry the configured access type, so a public/private mismatch fails hard.
 */
export class BlobAdapter implements StorageAdapter {
  readonly kind = "blob";
  private lastStamp = "";
  constructor(readonly prefix: string, readonly access: BlobAccess, private readonly sdk: () => Promise<BlobSdk>, private readonly clock: () => Date = () => new Date()) {
    if (!/^[A-Za-z0-9_\-]+(\/[A-Za-z0-9_\-]+)*$/.test(prefix)) throw new Error(`invalid blob prefix: ${prefix}`);
    if (access !== "public" && access !== "private") throw new Error(`blob access must be "public" or "private", got "${access}"`);
  }
  private path(key: string): string { checkKey(key); return `${this.prefix}/${key}`; }
  private static contentType(key: string): string {
    if (key.endsWith(".json")) return "application/json";
    if (key.endsWith(".xml")) return "application/xml";
    throw new Error(`no content type for key ${key}`);
  }
  private async read(pathname: string): Promise<Buffer | null> {
    const sdk = await this.sdk();
    let r;
    try { r = await sdk.get(pathname, { access: this.access }); }
    catch (e: any) { if (e?.name === "BlobNotFoundError") return null; throw e; }
    if (!r) return null;
    if (r.statusCode !== 200 || !r.stream) throw new Error(`blob get ${pathname}: unexpected status ${r.statusCode}`);
    const chunks: Buffer[] = [];
    const reader = r.stream.getReader();
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(Buffer.from(value)); }
    return Buffer.concat(chunks);
  }
  private async listPaths(prefix: string): Promise<{ pathname: string; url: string }[]> {
    const sdk = await this.sdk();
    const out: { pathname: string; url: string }[] = [];
    let cursor: string | undefined;
    do {
      const page = await sdk.list({ prefix, cursor, limit: 1000 });
      out.push(...page.blobs.map(b => ({ pathname: b.pathname, url: b.url })));
      cursor = page.hasMore ? page.cursor : undefined;
      if (page.hasMore && !cursor) throw new Error("blob list: hasMore without cursor");
    } while (cursor);
    return out;
  }
  /** Newest log entry of a mutable key; entries sort by their fixed-width UTC timestamp. */
  private async newestLogEntry(key: string): Promise<string | null> {
    const base = `${this.prefix}/${POINTER_LOG}/${key}/`;
    const names = (await this.listPaths(base)).map(b => b.pathname).filter(p => /^\d{8}T\d{9}Z\.json$/.test(p.slice(base.length))).sort();
    return names.length ? names[names.length - 1] : null;
  }
  private async write(pathname: string, body: Buffer, key: string): Promise<void> {
    const sdk = await this.sdk();
    const res = await sdk.put(pathname, body, {
      access: this.access, addRandomSuffix: false, allowOverwrite: false,
      contentType: BlobAdapter.contentType(key), cacheControlMaxAge: 31536000,
    });
    if (res.pathname !== pathname) throw new Error(`blob put ${pathname}: store returned pathname ${res.pathname}`);
    const host = (() => { try { return new URL(res.url).host; } catch { return ""; } })();
    if (!host.endsWith(`.${this.access}.blob.vercel-storage.com`)) throw new Error(`blob put ${pathname}: url host "${host}" does not match access "${this.access}"`);
  }
  private stamp(): string {
    let s = this.clock().toISOString().replace(/[-:.]/g, ""); // 20261105T131700123Z
    if (s <= this.lastStamp) { // strictly increasing within this process
      const t = new Date(Date.parse(this.lastStamp.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z$/, "$1-$2-$3T$4:$5:$6.$7Z")) + 1);
      s = t.toISOString().replace(/[-:.]/g, "");
    }
    this.lastStamp = s;
    return s;
  }
  async get(key: string) {
    checkKey(key);
    if (key === CURRENT_POINTER_KEY) { const p = await this.newestLogEntry(key); return p ? this.read(p) : null; }
    return this.read(this.path(key));
  }
  async exists(key: string) { return (await this.get(key)) !== null; }
  async put(key: string, body: Buffer, opts: { immutable: boolean }) {
    checkKey(key);
    if (!opts.immutable) {
      if (key !== CURRENT_POINTER_KEY) throw new Error(`blob store: only ${CURRENT_POINTER_KEY} may be mutable, got ${key}`);
      const newest = await this.newestLogEntry(key);
      const stamp = this.stamp();
      if (newest && newest.slice(newest.lastIndexOf("/") + 1) >= `${stamp}.json`) throw new Error(`blob store: clock behind newest pointer entry ${newest}`);
      await this.write(`${this.prefix}/${POINTER_LOG}/${key}/${stamp}.json`, body, key);
      return;
    }
    if (key.startsWith(`${POINTER_LOG}/`)) throw new Error(`blob store: ${POINTER_LOG}/ is reserved`);
    const existing = await this.read(this.path(key));
    if (existing) {
      if (sha256(existing) === sha256(body)) return; // idempotent re-put of identical bytes
      throw new Error(`immutable key exists with different content: ${key}`);
    }
    await this.write(this.path(key), body, key);
  }
  async list(prefix: string) {
    const base = `${this.prefix}/`;
    const p = prefix.replace(/\/$/, "");
    if (p) checkKey(p);
    return (await this.listPaths(base + (p ? p + "/" : "")))
      .map(b => b.pathname.slice(base.length))
      .filter(k => !k.startsWith(`${POINTER_LOG}/`))
      .sort();
  }
}

/** The single mutable key of the A2 layout (see version.ts CURRENT_KEY). */
export const CURRENT_POINTER_KEY = "current.json";

/** Loads @vercel/blob lazily; the token comes from BLOB_READ_WRITE_TOKEN (read by the SDK, never logged here). */
export const loadVercelBlobSdk = async (): Promise<BlobSdk> => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is not set");
  return (await import("@vercel/blob")) as unknown as BlobSdk;
};

/**
 * Parse --store spec.
 *   local:<dir>     LocalDirAdapter
 *   blob:<prefix>   BlobAdapter; access from ELMONITOR_BLOB_ACCESS ("public" | "private"), required, no default.
 */
export function openStore(spec: string): StorageAdapter {
  const m = /^local:(.+)$/.exec(spec);
  if (m) return new LocalDirAdapter(resolve(m[1]));
  const b = /^blob:(.+)$/.exec(spec);
  if (b) {
    const access = process.env.ELMONITOR_BLOB_ACCESS ?? "";
    if (access !== "public" && access !== "private") throw new Error(`ELMONITOR_BLOB_ACCESS must be "public" or "private" (store setting), got "${access}"`);
    return new BlobAdapter(b[1], access, loadVercelBlobSdk);
  }
  throw new Error(`store "${spec}" not supported: use local:<dir> or blob:<prefix>`);
}
