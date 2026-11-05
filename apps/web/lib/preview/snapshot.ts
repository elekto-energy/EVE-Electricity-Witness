/**
 * Typed access to the A2 snapshot (ELMONITOR_PREVIEW_SNAPSHOT_v1), produced by pipeline/a2/export_preview.ts from
 * one verified A2 version. Pure helpers only: loading (Blob or bundled fallback) lives in load.ts.
 * Nothing here fetches data or fills gaps: missing days stay missing.
 */

export type DayStatus =
  | "COMPLETE" | "PARTIAL" | "MISSING" | "NOT_PUBLISHED_YET" | "IN_PROGRESS" | "CONFLICT" | "NO_RECORD";

export interface PriceDay {
  day: string;
  status: DayStatus;
  resolution?: string | null;
  selection_verified?: boolean | null;
  missing_intervals?: number;
  hourly?: [string, number][];
  quarters?: [string, number][];
  mean?: number | null;
  min?: number | null;
  max?: number | null;
}

export interface Coverage {
  first_day: string | null;
  last_day: string | null;
  status_counts: Record<string, number>;
  not_complete: { day: string; status: string; missing_intervals: number | null }[];
  missing_intervals_total: number;
  selection_unverified: string[];
  open_errors: { day: string; code: string }[];
  revisions: number;
}

export interface FlowDay {
  day: string;
  status_ab: DayStatus;
  status_ba: DayStatus;
  hours_with_both: number;
  net_mean_mw: number | null;
  hourly_net?: [string, number][];
}

export interface Snapshot {
  schema: "ELMONITOR_PREVIEW_SNAPSHOT_v1";
  source: {
    chain: string; a2_version: string; store: string; version_id: string; run_id: string;
    published_at_utc: string; manifest_sha256: string; content_sha256: string; values_hash_method: string;
  };
  provider: string;
  market_tz: string;
  today: string;
  window: { first: string; last: string };
  units: { price: string; flow: string };
  hourly_method: string;
  history_start: string;
  status_meaning: Record<string, string>;
  selection_note: string;
  prices: Record<string, { coverage: Coverage | null; days: PriceDay[] }>;
  flows: Record<string, { from: string; to: string; coverage: Record<string, Coverage | null>; days: FlowDay[] }>;
  fx: { source: string; unit: string; raw_sha256: string; rule: string; rates: Record<string, number> } | null;
}

/** Structural check of a parsed snapshot; throws on anything that is not ELMONITOR_PREVIEW_SNAPSHOT_v1. */
export function asSnapshot(x: unknown): Snapshot {
  const s = x as Snapshot;
  if (!s || s.schema !== "ELMONITOR_PREVIEW_SNAPSHOT_v1") throw new Error(`unexpected snapshot schema ${String((x as { schema?: unknown })?.schema)}`);
  if (typeof s.today !== "string" || !s.prices || !s.flows || !s.source?.version_id) throw new Error("snapshot lacks today/prices/flows/source");
  return s;
}

export const SE_ZONES = ["SE1", "SE2", "SE3", "SE4"] as const;
export const NEIGHBOUR_ZONES = ["FI", "NO1", "NO3", "NO4", "DK1", "DK2", "DE_LU", "PL", "LT"] as const;

export const ZONE_LABEL: Record<string, string> = {
  SE1: "SE1 Luleå", SE2: "SE2 Sundsvall", SE3: "SE3 Stockholm", SE4: "SE4 Malmö",
  FI: "Finland", NO1: "Norge NO1 (Oslo)", NO3: "Norge NO3 (Trondheim)", NO4: "Norge NO4 (Tromsø)",
  DK1: "Danmark DK1 (Jylland)", DK2: "Danmark DK2 (Själland)", DE_LU: "Tyskland-Luxemburg", PL: "Polen", LT: "Litauen",
};

export function addDays(day: string, n: number): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function priceDay(snapshot: Snapshot, zone: string, day: string): PriceDay | null {
  return snapshot.prices[zone]?.days.find(d => d.day === day) ?? null;
}

export const fmt = (x: number | null | undefined, digits = 1) =>
  x === null || x === undefined ? "–" : x.toLocaleString("sv-SE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Stockholm local hour label for a UTC interval start. */
export function hourLabel(isoUtc: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }).format(new Date(isoUtc));
}

export function weekdayLabel(day: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(day + "T12:00:00Z"));
}

/** ECB EUR/SEK reference rate for a price day: that day's rate, or the latest published before it. */
export function rateFor(snapshot: Snapshot, day: string): { rate: number; date: string } | null {
  const r = snapshot.fx?.rates;
  if (!r) return null;
  const d = Object.keys(r).filter(x => x <= day).sort().pop();
  return d ? { rate: r[d], date: d } : null;
}

/** EUR/MWh -> ore/kWh (1 EUR/MWh = rate/10 ore/kWh). Returns null when no rate is available. */
export function toOre(snapshot: Snapshot, eurMwh: number | null | undefined, day: string): number | null {
  const fx = rateFor(snapshot, day);
  if (eurMwh === null || eurMwh === undefined || !fx) return null;
  return Math.round(((eurMwh * fx.rate) / 10) * 100) / 100;
}

export const PRICE_UNIT = "öre/kWh";
