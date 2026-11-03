/**
 * ELMONITOR A2 - export a small, read-only snapshot of the current A2 version for the Step B preview site.
 *
 * Reads a local A2 store (current.json -> MANIFEST.json -> objects), verifies every object it reads
 * against its content address, and writes one deterministic JSON file. Never writes to the store.
 * No network, no secrets.
 *
 * Usage:
 *   npx tsx pipeline/a2/export_preview.ts --store local:<dir> --out <file> [--days 14] [--only SE3,SE4,SE3-SE4]
 */

import { createHash } from "crypto";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";

const SCHEMA = "ELMONITOR_PREVIEW_SNAPSHOT_v1";
const TZ = "Europe/Stockholm";

type Json = any;

function arg(name: string, def?: string): string {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (def !== undefined) return def;
  throw new Error(`missing argument ${name}`);
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function stableJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableJson).join(",") + "]";
  const o = v as Record<string, unknown>;
  return "{" + Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => JSON.stringify(k) + ":" + stableJson(o[k])).join(",") + "}";
}

function localDate(iso: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const g = (t: string) => p.find(x => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

function addDays(day: string, n: number): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const round = (x: number, n = 2) => Math.round(x * 10 ** n) / 10 ** n;
const slug = (s: string) => s.replace(">", "_to_");

function main() {
  const storeArg = arg("--store");
  if (!storeArg.startsWith("local:")) throw new Error("only --store local:<dir> is supported");
  const dir = storeArg.slice("local:".length);
  const out = arg("--out");
  const nDays = Number(arg("--days", "14"));
  const only = arg("--only", ""); // optional comma list of zones/borders (testing subsets)
  const keep = (x: string) => !only || only.split(",").includes(x);

  const readVerified = (key: string, expected: string): Json => {
    const b = readFileSync(join(dir, key));
    const h = sha256(b);
    if (h !== expected) throw new Error(`hash mismatch for ${key}: expected ${expected}, got ${h}`);
    return JSON.parse(b.toString("utf-8"));
  };

  const current = JSON.parse(readFileSync(join(dir, "current.json"), "utf-8"));
  const manifest = readVerified(current.manifest_key, current.manifest_sha256);
  if (manifest.version_id !== current.version_id) throw new Error("current.json and manifest disagree on version_id");
  const files = new Map<string, { sha256: string; bytes: number }>();
  for (const f of manifest.files) files.set(f.path, f);
  const obj = (path: string): Json | null => {
    const f = files.get(path);
    return f ? readVerified(`objects/${f.sha256}.json`, f.sha256) : null;
  };

  const meta = obj("meta.json");
  const summary = obj("coverage/summary.json");
  if (!meta || !summary) throw new Error("meta.json or coverage/summary.json missing in manifest");

  const today = localDate(current.published_at_utc);
  const first = addDays(today, -(nDays - 1));
  const last = addDays(today, 1);
  const days: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  const months = [...new Set(days.map(d => d.slice(0, 7)))];

  const monthCache = new Map<string, Json | null>();
  const dayData = (dataset: string, series: string, day: string): Json | null => {
    const key = `data/${dataset}/${slug(series)}/${day.slice(0, 7)}.json`;
    if (!monthCache.has(key)) monthCache.set(key, obj(key));
    const m = monthCache.get(key);
    return m?.days?.[day] ?? null;
  };
  const sumOf = (dataset: string, series: string) => summary.series?.[`${dataset}|${series}`] ?? null;

  const cov = (s: Json | null) => s ? {
    first_day: s.first_day, last_day: s.last_day, status_counts: s.status_counts,
    not_complete: s.not_complete, missing_intervals_total: s.missing_intervals_total,
    selection_unverified: s.selection_unverified, open_errors: s.open_errors, revisions: s.revisions,
  } : null;

  // Prices
  const prices: Record<string, Json> = {};
  for (const zone of (meta.price_zones as string[]).filter(keep)) {
    const s = sumOf("prices", zone);
    const unverified = new Set<string>(s?.selection_unverified ?? []);
    prices[zone] = {
      coverage: cov(s),
      days: days.map(day => {
        const d = dayData("prices", zone, day);
        if (!d) return { day, status: "NO_RECORD" };
        const vals = (d.hourly as [string, number][]).map(h => h[1]);
        return {
          day, status: d.status, resolution: d.resolution,
          selection_verified: unverified.has(day) ? false : null,
          missing_intervals: d.missing_starts_utc.length,
          hourly: d.hourly.map((h: [string, number]) => [h[0], round(h[1])]),
          mean: vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
          min: vals.length ? round(Math.min(...vals)) : null,
          max: vals.length ? round(Math.max(...vals)) : null,
        };
      }),
    };
  }

  // Flows: net per border (a -> b positive), only hours where both directions are present.
  const flows: Record<string, Json> = {};
  for (const border of (meta.flow_borders as string[]).filter(keep)) {
    const [a, b] = border.split("-");
    const ab = `${a}>${b}`, ba = `${b}>${a}`;
    flows[border] = {
      from: a, to: b,
      coverage: { [ab]: cov(sumOf("flows", ab)), [ba]: cov(sumOf("flows", ba)) },
      days: days.filter(d => d <= today).map(day => {
        const x = dayData("flows", ab, day), y = dayData("flows", ba, day);
        const status = [x?.status ?? "NO_RECORD", y?.status ?? "NO_RECORD"];
        const hy = new Map<string, number>((y?.hourly ?? []).map((h: [string, number]) => [h[0], h[1]]));
        const net: [string, number][] = [];
        for (const h of (x?.hourly ?? []) as [string, number][]) if (hy.has(h[0])) net.push([h[0], round(h[1] - hy.get(h[0])!, 1)]);
        return {
          day, status_ab: status[0], status_ba: status[1], hours_with_both: net.length,
          net_mean_mw: net.length ? round(net.reduce((s, h) => s + h[1], 0) / net.length, 1) : null,
          hourly_net: day === today || day === addDays(today, -1) ? net : undefined,
        };
      }),
    };
  }

  const snapshot = {
    schema: SCHEMA,
    source: {
      chain: meta.a2_id, a2_version: meta.a2_version, store: "A2 local store (not a production store)",
      version_id: current.version_id, run_id: current.run_id, published_at_utc: current.published_at_utc,
      manifest_sha256: current.manifest_sha256, content_sha256: current.content_sha256,
      values_hash_method: manifest.values_hash_method ?? meta.values_hash_method ?? "A2_VALUES_SHA256_V1_INCL_ORIGIN (legacy, unlabelled)",
    },
    provider: "ENTSO-E Transparency Platform (A44 day-ahead prices, A11 physical flows)",
    market_tz: TZ, today, window: { first, last }, units: { price: "EUR/MWh", flow: "MW" },
    hourly_method: meta.hourly_method, history_start: meta.history_start,
    status_meaning: meta.status_meaning, selection_note: meta.selection_note,
    prices, flows,
  };
  const body = Buffer.from(stableJson(snapshot) + "\n", "utf-8");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, body);
  console.log(`[export_preview] version=${current.version_id} today=${today} window=${first}..${last} bytes=${body.length} sha256=${sha256(body)} out=${out}`);
}

main();
