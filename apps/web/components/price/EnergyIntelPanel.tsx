"use client";

/**
 * EnergyIntelPanel — EVE Energipanel
 *
 * Allt i ett fönster. Hover i diagrammet styr hela vyn.
 * Två donuts: produktion + prisuppdelning.
 * Flaskhals = egen tydlig orange sektion.
 * Avancerat gömt bakom toggle.
 *
 * Data: /api/energy/ddm + /api/spot/v2 (generation mix)
 *
 * Layer: CMD + DDM
 * TR1: No source, no number.
 * TR6: Code renders — never invents.
 */

import { useState, useEffect, useMemo, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────

interface SeSpreads {
  "SE1-SE2": number | null;
  "SE2-SE3": number | null;
  "SE3-SE4": number | null;
}

interface DDMRow {
  ts: string;
  zone: string;
  zonpris_eur_mwh: number;
  systempris_eur_mwh: number | null;
  flaskhals_eur_mwh: number | null;
  flaskhals_pct: number | null;
  net_import_mw: number | null;
  flows_in: Record<string, number>;
  flows_out: Record<string, number>;
  se_spreads?: SeSpreads; // present from DDM v2
}

interface RentEntry { border: string; total_eur: number; avg_delta: number; }

// ─── Spreads types ──────────────────────────────────────────────────────

interface SpreadRow { ts: string; delta_eur_mwh: number; }
interface ZoneRow { ts: string; spot_eur_mwh: number; }
interface LinkSummary {
  link: string; from: string; to: string;
  rows: SpreadRow[];
  avg_delta_eur_mwh: number | null;
  avg_delta_kr_kwh: number | null;
  max_delta_eur_mwh: number | null;
  congested_hours: number;
}
interface SpreadsData {
  period: string;
  zones: Record<string, ZoneRow[]>;
  links: LinkSummary[];
  sources: string[];
  warnings: string[];
}

interface DDMData {
  zone: string;
  period: string;
  count: number;
  rows: DDMRow[];
  daily_summary: {
    avg_zonpris: number | null;
    avg_systempris: number | null;
    avg_flaskhals: number | null;
    max_flaskhals: number | null;
    max_flaskhals_pct: number | null;
    avg_net_import_mw: number | null;
    total_import_mw: number | null;
    total_export_mw: number | null;
    constraint_rent: RentEntry[];
    total_rent_eur: number;
    avg_se_spreads?: SeSpreads;
  };
  sources: string[];
  warnings: string[];
}

interface V2Row {
  ts: string;
  nuclear_mw: number | null;
  hydro_mw: number | null;
  wind_onshore_mw: number | null;
  wind_offshore_mw: number | null;
  solar_mw: number | null;
  other_mw: number | null;
  total_gen_mw: number | null;
}

interface V2Resp { rows: V2Row[]; }

// ─── Constants ───────────────────────────────────────────────────────────

const toKr = (eur: number, eurSek: number) => +((eur * eurSek) / 1000).toFixed(3);
const NET = 0.32;
const TAX = 0.36;

const C = {
  bg: "var(--bg-primary)",
  card: "var(--bg-card)",
  card2: "var(--bg-primary)",
  border: "var(--border-color)",
  text: "var(--text-primary)",
  muted: "var(--text-muted)",
  dim: "var(--text-ghost)",
  nuclear: "#a78bfa",
  hydro: "#3b82f6",
  wind: "#34d399",
  solar: "#fbbf24",
  other: "#6b7280",
  sys: "#3b82f6",
  flask: "#f97316",
  flaskHi: "#fb923c",
  net: "#a78bfa",
  tax: "#ef4444",
  moms: "#facc15",
  spot: "#f59e0b",
  amber: "#f59e0b",
  green: "#22c55e",
  imp: "#60a5fa",
  exp: "#f87171",
};

const FONT = "var(--font-mono, 'JetBrains Mono', monospace)";

const ZONE_NAMES: Record<string, string> = {
  SE1: "Luleå", SE2: "Sundsvall", SE3: "Stockholm", SE4: "Malmö",
};

// ─── SE chain constants ──────────────────────────────────────────────────
// Single source of truth. API link.link field MUST match these strings.
// Format: "SEA→SEB" (unicode →, U+2192). Never use dash or underscore variants.
const SWEDEN_LINKS = ["SE1→SE2", "SE2→SE3", "SE3→SE4"] as const;
type SwedenLink = typeof SWEDEN_LINKS[number];

// Which upstream links affect a given zone (ordered SE1→SE4)
const UPSTREAM_LINKS_FOR: Record<string, SwedenLink[]> = {
  SE1: [],
  SE2: ["SE1→SE2"],
  SE3: ["SE1→SE2", "SE2→SE3"],
  SE4: ["SE1→SE2", "SE2→SE3", "SE3→SE4"],
};

// Visual encoding — fixed shades, ordered darkest (farthest upstream) to lightest
const LINK_COLOR: Record<SwedenLink, string> = {
  "SE1→SE2": "#ea580c",  // orange-600 — strongest/farthest upstream
  "SE2→SE3": "#f97316",  // orange-500
  "SE3→SE4": "#fb923c",  // orange-400 — lightest/nearest downstream
};

// ─── Helpers ─────────────────────────────────────────────────────────────

function twoDaysAgo(): string {
  const d = new Date(); d.setDate(d.getDate() - 3);
  return d.toISOString().slice(0, 10);
}
function todayStr(): string { return new Date().toISOString().slice(0, 10); }

// ─── Donut sub-component ─────────────────────────────────────────────────

interface Seg { id: string; pct: number; color: string; label: string; }

function Donut({ segments, size = 156, thickness = 26, centerTop, centerBot, pulseId, pulseIds }: {
  segments: Seg[]; size?: number; thickness?: number;
  centerTop: string; centerBot: string; pulseId?: string | null; pulseIds?: string[];
}) {
  const pulsing = new Set(pulseIds ?? (pulseId ? [pulseId] : []));
  const r = (size - thickness) / 2;
  const circ = Math.PI * 2 * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.border} strokeWidth={thickness} opacity={0.4} />
      {segments.map((s, i) => {
        const dash = (s.pct / 100) * circ;
        const gap = circ - dash;
        const rot = (offset / 100) * 360 - 90;
        offset += s.pct;
        return (
          <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={s.color} strokeWidth={thickness}
            strokeDasharray={`${dash} ${gap}`} strokeLinecap="butt"
            transform={`rotate(${rot} ${size / 2} ${size / 2})`}
            opacity={0.9}
            style={pulsing.has(s.id) ? {
              filter: `drop-shadow(0 0 8px ${s.color}88)`,
              animation: "eip-dp 2s ease-in-out infinite",
            } : {}}
          />
        );
      })}
      <text x={size / 2} y={size / 2 - 6} textAnchor="middle" fill={C.text}
        fontSize={18} fontWeight={700} fontFamily={FONT}>{centerTop}</text>
      <text x={size / 2} y={size / 2 + 12} textAnchor="middle" fill={C.muted}
        fontSize={9} fontFamily={FONT}>{centerBot}</text>
    </svg>
  );
}

// ─── Main component ──────────────────────────────────────────────────────

interface Props {
  initialZone?: string;
  initialDate?: string;
}

// ─── Period helpers ──────────────────────────────────────────────────────

type PeriodMode = "day" | "week" | "month" | "year" | "custom";

interface PeriodRange { start: string; end: string; label: string; }

function getWeekStart(d: Date): Date {
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday start
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
}

function computePeriod(mode: PeriodMode, anchor: string): PeriodRange {
  const d = new Date(anchor + "T00:00:00Z");
  switch (mode) {
    case "day":
      return { start: anchor, end: anchor, label: anchor };
    case "week": {
      const ws = getWeekStart(d);
      const we = new Date(ws.getTime() + 6 * 86400_000);
      const s = ws.toISOString().slice(0, 10);
      const e = we.toISOString().slice(0, 10);
      const wn = Math.ceil(((ws.getTime() - new Date(Date.UTC(ws.getUTCFullYear(), 0, 1)).getTime()) / 86400_000 + 1) / 7);
      return { start: s, end: e, label: `v${wn} ${ws.getUTCFullYear()}` };
    }
    case "month": {
      const s = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
      const e = last.toISOString().slice(0, 10);
      const months = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
      return { start: s, end: e, label: `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
    }
    case "year": {
      const y = d.getUTCFullYear();
      return { start: `${y}-01-01`, end: `${y}-12-31`, label: `${y}` };
    }
    case "custom":
      return { start: anchor, end: anchor, label: anchor };
  }
}

function navigatePeriod(mode: PeriodMode, anchor: string, dir: -1 | 1): string {
  const d = new Date(anchor + "T00:00:00Z");
  switch (mode) {
    case "day":
      d.setUTCDate(d.getUTCDate() + dir);
      break;
    case "week":
      d.setUTCDate(d.getUTCDate() + dir * 7);
      break;
    case "month":
      d.setUTCMonth(d.getUTCMonth() + dir);
      break;
    case "year":
      d.setUTCFullYear(d.getUTCFullYear() + dir);
      break;
    case "custom":
      d.setUTCDate(d.getUTCDate() + dir);
      break;
  }
  return d.toISOString().slice(0, 10);
}

function prevPeriod(mode: PeriodMode, anchor: string): PeriodRange {
  const prev = navigatePeriod(mode, anchor, -1);
  return computePeriod(mode, prev);
}

function dateDiffDays(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400_000) + 1;
}

// ─── Main component ──────────────────────────────────────────────────────

export default function EnergyIntelPanel({ initialZone = "SE3", initialDate }: Props) {
  const [zone, setZone] = useState(initialZone);
  const [anchor, setAnchor] = useState(initialDate ?? twoDaysAgo());
  const [mode, setMode] = useState<PeriodMode>("day");
  const [compare, setCompare] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const [ddm, setDdm] = useState<DDMData | null>(null);
  const [compDdm, setCompDdm] = useState<DDMData | null>(null);
  const [gen, setGen] = useState<V2Row[]>([]);
  const [spreads, setSpreads] = useState<SpreadsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hovIdx, setHovIdx] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [showAdv, setShowAdv] = useState(false);
  // PMM: auto-active when systempris unavailable.
  // Indicated by striped bar + PMM badge + info text. No toggle needed.
  const [showPmm, setShowPmm] = useState(true);
  const [pmmData, setPmmData] = useState<{
    summary: { avg_system_proxy_eur_mwh: number; avg_intern_diff_proxy_eur_mwh: number; avg_share_proxy_pct: number };
    rows: Array<{ ts: string; system_proxy_eur_mwh: number; intern_diff_proxy_eur_mwh: number; share_proxy_pct: number }>;
    methodology_version: string;
    param_version: string;
    param_hash: string;
    weights: Record<string, number>;
    legal_notice: string;
  } | null>(null);
  const [pmmLoading, setPmmLoading] = useState(false);

  // ─── EUR/SEK from ECB canonical data (TR1) ──────────────────────────────
  const [eurSek, setEurSek] = useState(11.2); // fallback until API responds
  useEffect(() => {
    fetch("/api/energy/forex")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.rate) setEurSek(d.rate); })
      .catch(() => {});
  }, []);

  // Series visibility — toggled by legend clicks
  // Dynamically seeded from zone: only upstream links for selected zone are included.
  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(() =>
    new Set(["zon", "sys", ...UPSTREAM_LINKS_FOR[initialZone] ?? [], "net", "tax", "moms"])
  );

  // Re-seed visible link series when zone changes (preserve non-link toggles)
  useEffect(() => {
    setVisibleSeries(prev => {
      const next = new Set(prev);
      // Remove all link series
      for (const l of SWEDEN_LINKS) next.delete(l);
      // Add upstream links for new zone
      for (const l of UPSTREAM_LINKS_FOR[zone] ?? []) next.add(l);
      return next;
    });
  }, [zone]);
  const toggleSeries = (id: string) => {
    setVisibleSeries(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  // Derived period
  const period = useMemo(() => {
    if (mode === "custom" && customStart && customEnd) {
      return { start: customStart, end: customEnd, label: `${customStart} – ${customEnd}` };
    }
    return computePeriod(mode, anchor);
  }, [mode, anchor, customStart, customEnd]);

  const compPeriod = useMemo(() => {
    if (!compare) return null;
    return prevPeriod(mode, anchor);
  }, [compare, mode, anchor]);

  // For API: single day = 1 call, multi-day = N calls
  const date = period.start; // primary fetch date (for single-day mode)

  // Fetch DDM + V2 data for a date range
  // Strategy: use ?month= for multi-day ranges (much fewer HTTP requests)
  const fetchRange = useCallback(async (start: string, end: string): Promise<{ ddm: DDMData | null; gen: V2Row[]; error: string | null }> => {
    const days = dateDiffDays(start, end);
    const allRows: DDMRow[] = [];
    const allGen: V2Row[] = [];
    const allSources = new Set<string>();
    const allWarnings: string[] = [];
    let anyOk = false;

    if (days === 1) {
      // Single day: use ?date= (original)
      const [ddmRes, v2Res] = await Promise.all([
        fetch(`/api/energy/ddm?zone=${zone}&date=${start}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/spot/v2?zone=${zone}&date=${start}`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (ddmRes && ddmRes.count > 0) {
        allRows.push(...ddmRes.rows);
        ddmRes.sources?.forEach((s: string) => allSources.add(s));
        if (ddmRes.warnings) allWarnings.push(...ddmRes.warnings);
        anyOk = true;
      }
      if (v2Res?.rows) allGen.push(...v2Res.rows);
    } else {
      // Multi-day: collect unique months in range, use ?month= per month
      const months = new Set<string>();
      const d = new Date(start + "T00:00:00Z");
      const endD = new Date(end + "T00:00:00Z");
      while (d <= endD) {
        const m = d.toISOString().slice(0, 7);
        months.add(m);
        d.setUTCMonth(d.getUTCMonth() + 1);
        d.setUTCDate(1);
      }

      const monthArr = [...months];
      // Fetch months in batches of 4: DDM + V2 in parallel per month
      for (let i = 0; i < monthArr.length; i += 4) {
        const batch = monthArr.slice(i, i + 4);
        const results = await Promise.all(
          batch.flatMap(m => [
            fetch(`/api/energy/ddm?zone=${zone}&month=${m}`)
              .then(r => r.ok ? r.json() : null)
              .catch(() => null),
            fetch(`/api/spot/v2?zone=${zone}&month=${m}`)
              .then(r => r.ok ? r.json() : null)
              .catch(() => null),
          ])
        );
        // Results alternate: ddm0, v20, ddm1, v21, ...
        for (let j = 0; j < batch.length; j++) {
          const ddmRes = results[j * 2];
          const v2Res = results[j * 2 + 1];
          if (ddmRes && ddmRes.count > 0) {
            const filtered = ddmRes.rows.filter((r: DDMRow) => {
              const rd = r.ts.slice(0, 10);
              return rd >= start && rd <= end;
            });
            allRows.push(...filtered);
            ddmRes.sources?.forEach((s: string) => allSources.add(s));
            if (ddmRes.warnings) allWarnings.push(...ddmRes.warnings);
            anyOk = true;
          }
          if (v2Res?.rows) {
            const filtered = v2Res.rows.filter((r: V2Row) => {
              const rd = r.ts.slice(0, 10);
              return rd >= start && rd <= end;
            });
            allGen.push(...filtered);
          }
        }
      }
    }

    if (!anyOk) {
      return { ddm: null, gen: allGen, error: `Ingen data för ${zone} ${start}–${end}` };
    }

    // Sort by timestamp
    allRows.sort((a, b) => a.ts.localeCompare(b.ts));
    allGen.sort((a, b) => a.ts.localeCompare(b.ts));

    // Build aggregate summary
    const n = allRows.length || 1;
    const avgZ = allRows.reduce((s, r) => s + r.zonpris_eur_mwh, 0) / n;
    const avgS = allRows.reduce((s, r) => s + (r.systempris_eur_mwh ?? 0), 0) / n;
    const avgF = allRows.reduce((s, r) => s + (r.flaskhals_eur_mwh ?? 0), 0) / n;
    const maxF = Math.max(...allRows.map(r => r.flaskhals_eur_mwh ?? 0));
    const maxFP = Math.max(...allRows.map(r => r.flaskhals_pct ?? 0));

    const merged: DDMData = {
      zone,
      period: `${start}/${end}`,
      count: allRows.length,
      rows: allRows,
      daily_summary: {
        avg_zonpris: avgZ,
        avg_systempris: avgS,
        avg_flaskhals: avgF,
        max_flaskhals: maxF,
        max_flaskhals_pct: maxFP,
        avg_net_import_mw: null,
        total_import_mw: null,
        total_export_mw: null,
        constraint_rent: [],
        total_rent_eur: 0,
      },
      sources: [...allSources],
      warnings: [...new Set(allWarnings)].slice(0, 3),
    };

    return { ddm: merged, gen: allGen, error: null };
  }, [zone]);

  // Fetch spreads for a period (single date or month)
  const fetchSpreads = useCallback(async (start: string, end: string): Promise<SpreadsData | null> => {
    const days = dateDiffDays(start, end);
    if (days === 1) {
      const res = await fetch(`/api/energy/spreads?date=${start}`).then(r => r.ok ? r.json() : null).catch(() => null);
      return res ?? null;
    }
    // Multi-day: fetch per month, merge links
    const months = new Set<string>();
    const d = new Date(start + "T00:00:00Z");
    const endD = new Date(end + "T00:00:00Z");
    while (d <= endD) { months.add(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(1); }
    const results = await Promise.all([...months].map(m =>
      fetch(`/api/energy/spreads?month=${m}`).then(r => r.ok ? r.json() : null).catch(() => null)
    ));
    const valid = results.filter(Boolean) as SpreadsData[];
    if (!valid.length) return null;
    // Merge: concatenate link rows, recalculate summaries
    const merged: SpreadsData = { period: `${start}/${end}`, zones: {}, links: [], sources: [], warnings: [] };
    const linkMap = new Map<string, LinkSummary>();
    for (const v of valid) {
      v.sources.forEach(s => { if (!merged.sources.includes(s)) merged.sources.push(s); });
      v.warnings.forEach(w => { if (!merged.warnings.includes(w)) merged.warnings.push(w); });
      for (const [z, rows] of Object.entries(v.zones)) {
        if (!merged.zones[z]) merged.zones[z] = [];
        const filtered = rows.filter(r => r.ts.slice(0, 10) >= start && r.ts.slice(0, 10) <= end);
        merged.zones[z].push(...filtered);
      }
      for (const link of v.links) {
        const existing = linkMap.get(link.link);
        const filtered = link.rows.filter(r => r.ts.slice(0, 10) >= start && r.ts.slice(0, 10) <= end);
        if (!existing) { linkMap.set(link.link, { ...link, rows: filtered }); }
        else { existing.rows.push(...filtered); }
      }
    }
    // Recalculate summaries
    for (const [, link] of linkMap) {
      const deltas = link.rows.map(r => r.delta_eur_mwh);
      const nonZero = deltas.filter(d => d > 0);
      link.avg_delta_eur_mwh = deltas.length ? +(deltas.reduce((s, v) => s + v, 0) / deltas.length).toFixed(4) : null;
      link.avg_delta_kr_kwh = deltas.length ? +((deltas.reduce((s, v) => s + v, 0) / deltas.length * eurSek / 1000)).toFixed(4) : null;
      link.max_delta_eur_mwh = nonZero.length ? +Math.max(...nonZero).toFixed(4) : null;
      link.congested_hours = nonZero.length;
      merged.links.push(link);
    }
    return merged;
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, spreadsResult] = await Promise.all([
        fetchRange(period.start, period.end),
        fetchSpreads(period.start, period.end),
      ]);
      setDdm(result.ddm);
      setGen(result.gen);
      setSpreads(spreadsResult);
      if (result.error) setError(result.error);

      // Comparison period
      if (compare && compPeriod) {
        const compResult = await fetchRange(compPeriod.start, compPeriod.end);
        setCompDdm(compResult.ddm);
      } else {
        setCompDdm(null);
      }
    } catch {
      setError("Nätverksfel");
    } finally {
      setLoading(false);
    }
  }, [period, compare, compPeriod, fetchRange, fetchSpreads]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh for today (day mode only)
  useEffect(() => {
    if (mode !== "day" || period.start !== todayStr()) return;
    const iv = setInterval(fetchData, 300_000);
    return () => clearInterval(iv);
  }, [mode, period.start, fetchData]);

  // PMM fetch — only when opt-in active AND systempris unavailable
  useEffect(() => {
    if (!showPmm) { setPmmData(null); return; }
    let cancelled = false;
    const fetchPmm = async () => {
      setPmmLoading(true);
      try {
        const days = dateDiffDays(period.start, period.end);
        let allRows: Array<{ ts: string; system_proxy_eur_mwh: number; intern_diff_proxy_eur_mwh: number; share_proxy_pct: number }> = [];
        let meta: any = null;
        if (days === 1) {
          const res = await fetch(`/api/energy/pmm?zone=${zone}&date=${period.start}`);
          if (res.ok) {
            const data = await res.json();
            allRows = data.rows ?? [];
            meta = data;
          }
        } else {
          // Multi-day: fetch per month
          const months = new Set<string>();
          const d = new Date(period.start + "T00:00:00Z");
          const endD = new Date(period.end + "T00:00:00Z");
          while (d <= endD) { months.add(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(1); }
          for (const m of months) {
            const res = await fetch(`/api/energy/pmm?zone=${zone}&month=${m}`);
            if (res.ok) {
              const data = await res.json();
              if (!meta) meta = data;
              const filtered = (data.rows ?? []).filter((r: any) => {
                const rd = r.ts.slice(0, 10);
                return rd >= period.start && rd <= period.end;
              });
              allRows.push(...filtered);
            }
          }
        }
        if (!cancelled && meta && allRows.length > 0) {
          const n = allRows.length;
          setPmmData({
            summary: {
              avg_system_proxy_eur_mwh: +(allRows.reduce((s, r) => s + r.system_proxy_eur_mwh, 0) / n).toFixed(4),
              avg_intern_diff_proxy_eur_mwh: +(allRows.reduce((s, r) => s + r.intern_diff_proxy_eur_mwh, 0) / n).toFixed(4),
              avg_share_proxy_pct: +(allRows.reduce((s, r) => s + r.share_proxy_pct, 0) / n).toFixed(2),
            },
            rows: allRows,
            methodology_version: meta.methodology_version,
            param_version: meta.param_version,
            param_hash: meta.param_hash,
            weights: meta.weights,
            legal_notice: meta.legal_notice,
          });
        } else if (!cancelled) {
          setPmmData(null);
        }
      } catch {
        if (!cancelled) setPmmData(null);
      } finally {
        if (!cancelled) setPmmLoading(false);
      }
    };
    fetchPmm();
    return () => { cancelled = true; };
  }, [showPmm, zone, period.start, period.end]);

  // Navigate
  const nav = (dir: -1 | 1) => {
    const next = navigatePeriod(mode, anchor, dir);
    if (next >= "2020-01-01" && next <= todayStr()) {
      setAnchor(next);
      setHovIdx(null);
      setLocked(false);
    }
  };

  const switchMode = (m: PeriodMode) => {
    setMode(m);
    setHovIdx(null);
    setLocked(false);
  };

  // Merge DDM + V2 for generation data per hour
  const rows = ddm?.rows ?? [];

  // Active links for selected zone (from spreads API data)
  const activeLinks = useMemo(() => {
    if (!spreads) return [];
    const upstreamNames = UPSTREAM_LINKS_FOR[zone] ?? [];
    // Filter and sort by canonical SWEDEN_LINKS order
    return upstreamNames
      .map(name => spreads.links.find(l => l.link === name))
      .filter((l): l is LinkSummary => l !== undefined);
  }, [spreads, zone]);

  // Per-ts lookup: link name → delta_kr_kwh
  const spreadsByTs = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const link of (spreads?.links ?? [])) {
      for (const row of link.rows) {
        if (!map.has(row.ts)) map.set(row.ts, {});
        map.get(row.ts)![link.link] = toKr(row.delta_eur_mwh, eurSek);
      }
    }
    return map;
  }, [spreads]);

  const genByTs = useMemo(() => {
    const m = new Map<string, V2Row>();
    for (const r of gen) m.set(r.ts, r);
    return m;
  }, [gen]);

  // PMM per-ts lookup
  const pmmByTs = useMemo(() => {
    if (!pmmData) return new Map<string, { system_proxy_eur_mwh: number; intern_diff_proxy_eur_mwh: number; share_proxy_pct: number }>();
    const m = new Map<string, { system_proxy_eur_mwh: number; intern_diff_proxy_eur_mwh: number; share_proxy_pct: number }>();
    for (const r of pmmData.rows) m.set(r.ts, r);
    return m;
  }, [pmmData]);

  // Active computed values
  const a = useMemo(() => {
    // sysAvailable: true only if at least one row has a non-null systempris
    const sysAvailableInRows = rows.some(r => r.systempris_eur_mwh !== null && r.systempris_eur_mwh > 0);

    const calc = (z: number, sRaw: number | null, g: V2Row | undefined, imp: number, exp: number,
      fIn: Record<string, number>, fOut: Record<string, number>, sysAvail: boolean) => {
      const spKr = toKr(z, eurSek);
      // If systempris is unavailable, treat syKr and fkKr as null (unknown)
      const syKr = sysAvail && sRaw !== null ? toKr(sRaw, eurSek) : null;
      const fkKr = syKr !== null ? Math.max(0, +(spKr - syKr).toFixed(3)) : null;
      const sub = spKr + NET + TAX;
      const mo = +(sub * 0.25).toFixed(3);
      const tot = +(sub + mo).toFixed(3);
      const nuc = g?.nuclear_mw ?? 0;
      const hyd = g?.hydro_mw ?? 0;
      const win = (g?.wind_onshore_mw ?? 0) + (g?.wind_offshore_mw ?? 0);
      const sol = g?.solar_mw ?? 0;
      const oth = g?.other_mw ?? 0;
      const genTot = g?.total_gen_mw ?? (nuc + hyd + win + sol + oth);
      const flPct = syKr !== null && z > 0 ? +((Math.max(0, z - (sRaw ?? 0)) / z) * 100).toFixed(1) : 0;
      return { z, sRaw, spKr, syKr, fkKr, mo, tot, nuc, hyd, win, sol, oth, gen: genTot, flPct, imp, exp, net: imp - exp, fIn, fOut, sysAvail };
    };

    if (hovIdx !== null && rows[hovIdx]) {
      const r = rows[hovIdx];
      const g = genByTs.get(r.ts);
      const imp = Object.values(r.flows_in).reduce((s, v) => s + v, 0);
      const exp2 = Object.values(r.flows_out).reduce((s, v) => s + v, 0);
      const rowSysAvail = r.systempris_eur_mwh !== null && r.systempris_eur_mwh > 0;
      return { ...calc(r.zonpris_eur_mwh, r.systempris_eur_mwh, g, imp, exp2, r.flows_in, r.flows_out, rowSysAvail), h: new Date(r.ts).getUTCHours(), isHour: true };
    }

    // Daily average — DDM spec §5: if systempris missing for an hour,
    // exclude that hour CONSISTENTLY from all three series (zon, sys, diff).
    const sysRows = rows.filter(r => r.systempris_eur_mwh !== null && r.systempris_eur_mwh > 0);
    const hasSys = sysRows.length > 0;
    // When sys available: average only over hours that have sys (consistent exclusion)
    // When sys unavailable: average over all hours
    const avgPool = hasSys ? sysRows : rows;
    const n = avgPool.length || 1;
    const avgZ = avgPool.reduce((s, r) => s + r.zonpris_eur_mwh, 0) / n;
    const avgS = hasSys ? sysRows.reduce((s, r) => s + r.systempris_eur_mwh!, 0) / sysRows.length : null;
    const avgImp = rows.reduce((s, r) => s + Object.values(r.flows_in).reduce((a, b) => a + b, 0), 0) / n;
    const avgExp = rows.reduce((s, r) => s + Object.values(r.flows_out).reduce((a, b) => a + b, 0), 0) / n;
    // Average gen
    const genAvg: V2Row = {
      ts: "", nuclear_mw: 0, hydro_mw: 0, wind_onshore_mw: 0, wind_offshore_mw: 0, solar_mw: 0, other_mw: 0, total_gen_mw: 0,
    };
    for (const r of rows) {
      const g = genByTs.get(r.ts);
      if (g) {
        genAvg.nuclear_mw! += (g.nuclear_mw ?? 0) / n;
        genAvg.hydro_mw! += (g.hydro_mw ?? 0) / n;
        genAvg.wind_onshore_mw! += (g.wind_onshore_mw ?? 0) / n;
        genAvg.wind_offshore_mw! += (g.wind_offshore_mw ?? 0) / n;
        genAvg.solar_mw! += (g.solar_mw ?? 0) / n;
        genAvg.other_mw! += (g.other_mw ?? 0) / n;
        genAvg.total_gen_mw! += (g.total_gen_mw ?? 0) / n;
      }
    }
    return { ...calc(avgZ, avgS, genAvg, avgImp, avgExp, {}, {}, sysAvailableInRows), h: -1, isHour: false };
  }, [hovIdx, rows, genByTs]);

  const tl = a.isHour ? `${String(a.h).padStart(2, "0")}:00`
    : mode === "day" ? "Dagsmedel"
    : mode === "week" ? "Veckmedel"
    : mode === "month" ? "M\u00e5nadsmedel"
    : mode === "year" ? "\u00c5rsmedel"
    : "Medel";

  // Generation: hours with V2 data (for energy totals)
  const genHours = useMemo(() => {
    let count = 0;
    for (const r of rows) { if (genByTs.has(r.ts)) count++; }
    return count;
  }, [rows, genByTs]);

  // Production display: always avg MW in donut, total energy as secondary KPI
  const genDisplay = useMemo(() => {
    const mw = a.gen;
    const centerValue = mw >= 1000 ? `${(mw / 1000).toFixed(1)}k` : `${Math.round(mw)}`;
    const centerUnit = "MW";

    // Period label for context
    let periodLabel = "";
    if (a.isHour) {
      periodLabel = `kl ${String(a.h).padStart(2, "0")}:00`;
    } else {
      const labels: Record<PeriodMode, string> = { day: "dagsmedel", week: "veckomedel", month: "m\u00e5nadsmedel", year: "\u00e5rsmedel", custom: "medel" };
      periodLabel = labels[mode] ?? "medel";
    }

    // Total energy as secondary display
    const mwh = mw * genHours;
    const gwh = mwh / 1000;
    const twh = gwh / 1000;
    let totalLabel = "";
    if (genHours > 0 && mode !== "day" && !a.isHour) {
      if (twh >= 1) totalLabel = `${twh.toFixed(1)} TWh totalt`;
      else if (gwh >= 1) totalLabel = `${gwh.toFixed(0)} GWh totalt`;
      else if (mwh > 0) totalLabel = `${Math.round(mwh)} MWh totalt`;
    }

    return { value: centerValue, unit: centerUnit, periodLabel, totalLabel };
  }, [a.gen, a.h, a.isHour, mode, genHours]);

  // Donut segments
  const eSeg: Seg[] = useMemo(() => {
    const g = a.gen || 1;
    return [
      { id: "nuc", pct: (a.nuc / g) * 100, color: C.nuclear, label: "Kärnkraft" },
      { id: "hyd", pct: (a.hyd / g) * 100, color: C.hydro, label: "Vattenkraft" },
      { id: "win", pct: (a.win / g) * 100, color: C.wind, label: "Vindkraft" },
      { id: "sol", pct: Math.max(0.3, (a.sol / g) * 100), color: C.solar, label: "Sol" },
      { id: "oth", pct: (a.oth / g) * 100, color: C.other, label: "Övrigt" },
    ].filter(s => s.pct > 0.2);
  }, [a]);

  // Per-link kr values for current view (hover or period aggregate)
  // DDM spec §6: link delta = pure subtraction, NO max(0) in price display.
  // max(0) is only used in constraint rent (§7).
  const activeLinkKrs = useMemo(() => {
    const upstreamNames = UPSTREAM_LINKS_FOR[zone] ?? [];
    return upstreamNames.map(linkName => {
      let kr = 0;
      if (hovIdx !== null && rows[hovIdx]) {
        kr = spreadsByTs.get(rows[hovIdx].ts)?.[linkName] ?? 0;
      } else {
        const link = activeLinks.find(l => l.link === linkName);
        kr = link?.avg_delta_kr_kwh ?? 0;
      }
      return { linkName, kr };
    });
  }, [zone, hovIdx, rows, spreadsByTs, activeLinks]);

  // Total SE-link flaskhals kr (sum of active upstream links)
  const totalLinkKr = useMemo(() =>
    activeLinkKrs.reduce((s, x) => s + x.kr, 0)
  , [activeLinkKrs]);

  // pulse: pure link-model signal. Trigger when internal bottleneck > 10% of spot.
  // spKr is in kr/kWh; totalLinkKr is in kr/kWh — ratio is dimensionless.
  const pulse = a.spKr > 0 && (totalLinkKr / a.spKr) > 0.10;

  // pSeg: ALL segments always present (stable legend), pct may be 0.
  // pSegDonut: only segments with pct > 0.3 (for donut rendering).
  const pSeg: Seg[] = useMemo(() => {
    const t = a.tot || 1;
    const segs: Seg[] = [];
    const upstreamNames = UPSTREAM_LINKS_FOR[zone] ?? [];
    if (a.sysAvail && a.syKr !== null) {
      segs.push({ id: "sys", pct: (a.syKr / t) * 100, color: C.sys, label: "Systempris" });
      // DDM spec §3: intern_diff = zon - system. If SE-links don't account for all of it,
      // show the residual as "Prisdiff" so the donut sums to 100%.
      const allocatedLinkKr = upstreamNames.reduce((s, ln) => {
        const entry = activeLinkKrs.find(x => x.linkName === ln);
        return s + Math.max(0, entry?.kr ?? 0);
      }, 0);
      const internDiffKr = Math.max(0, a.spKr - a.syKr);
      const residualKr = Math.max(0, internDiffKr - allocatedLinkKr);
      if (residualKr > 0.001) {
        segs.push({ id: "diff", pct: (residualKr / t) * 100, color: C.flask, label: "Prisdiff" });
      }
    } else if (showPmm && pmmData && !a.sysAvail) {
      // PMM mode: proxy decomposition (model, not observation)
      // F1*: Zon = S* + (Zon - S*). This IS an identity by construction.
      // F4 SE-links are NOT additive with PMM-diff, so they are excluded from donut.
      const pmmHour = hovIdx !== null && rows[hovIdx] ? pmmByTs.get(rows[hovIdx].ts) : null;
      const proxyEur = pmmHour ? pmmHour.system_proxy_eur_mwh : pmmData.summary.avg_system_proxy_eur_mwh;
      const diffEur = pmmHour ? pmmHour.intern_diff_proxy_eur_mwh : pmmData.summary.avg_intern_diff_proxy_eur_mwh;
      const proxyKr = toKr(proxyEur, eurSek);
      const diffKr = toKr(diffEur, eurSek);
      segs.push({ id: "sys_proxy", pct: Math.max(0, (proxyKr / t) * 100), color: "#60a5fa", label: "Systempris (proxy)" });
      segs.push({ id: "diff_proxy", pct: Math.max(0, (diffKr / t) * 100), color: "#fb923c", label: "Prisdiff (proxy)" });
      // SE-links dimmed (0%) in PMM mode — not additive with proxy diff
      for (const linkName of upstreamNames) {
        segs.push({ id: linkName, pct: 0, color: LINK_COLOR[linkName as SwedenLink] ?? C.flask, label: linkName });
      }
    } else {
      // No systempris, no PMM: show spot minus link spreads as base
      const linkTotal = upstreamNames.reduce((s, ln) => {
        const entry = activeLinkKrs.find(x => x.linkName === ln);
        return s + Math.max(0, entry?.kr ?? 0);
      }, 0);
      const baseSpot = Math.max(0, a.spKr - linkTotal);
      segs.push({ id: "zon", pct: (baseSpot / t) * 100, color: C.spot, label: "Zonpris" });
      // DDM F4: SE-link spreads are pure A44 zone-to-zone.
      for (const linkName of upstreamNames) {
        const entry = activeLinkKrs.find(x => x.linkName === linkName);
        const kr = entry?.kr ?? 0;
        const clampedKr = Math.max(0, kr);
        segs.push({ id: linkName, pct: clampedKr > 0.0001 ? (clampedKr / t) * 100 : 0, color: LINK_COLOR[linkName as SwedenLink] ?? C.flask, label: linkName });
      }
    }
    segs.push(
      { id: "net", pct: (NET / t) * 100, color: C.net, label: "Nätavgift" },
      { id: "tax", pct: (TAX / t) * 100, color: C.tax, label: "Energiskatt" },
      { id: "moms", pct: (a.mo / t) * 100, color: C.moms, label: "Moms 25%" },
    );
    return segs;
  }, [a, activeLinkKrs, zone, showPmm, pmmData, pmmByTs, hovIdx, rows]);

  // Donut rendering: only non-zero segments
  const pSegDonut = useMemo(() => pSeg.filter(s => s.pct > 0.3), [pSeg]);

  // ─── Shared flask decomposition (used by both donut and bar) ────────
  // DDM v1.1 §5: sys saknas → InternPrisDiff = null. Proxy = PMM overlay.
  // PMM overlay: visually distinct (stripes, gul kant, asterisk, badge).
  // DDM: solid orange #f97316. PMM: diagonal stripes #eab308 (gul).
  const decomp = useMemo(() => {
    const usePmm = showPmm && pmmData && !a.sysAvail;
    let sysKr: number;
    let flaskKr: number;
    let sysLabel: string;
    let sysColor: string;
    let flaskColor: string;
    let isProxy = false;
    if (a.sysAvail && a.syKr !== null) {
      // DDM: observation + algebra
      sysKr = a.syKr;
      flaskKr = Math.max(0, a.spKr - a.syKr);
      sysLabel = `Sys ${sysKr.toFixed(2)}`;
      sysColor = C.sys;
      flaskColor = "#f97316"; // DDM solid orange
    } else if (usePmm) {
      // PMM overlay: modellberäknad proxy — ALDRIG DDM-färg
      const pmmHour = hovIdx !== null && rows[hovIdx] ? pmmByTs.get(rows[hovIdx].ts) : null;
      const proxyEur = pmmHour ? pmmHour.system_proxy_eur_mwh : pmmData!.summary.avg_system_proxy_eur_mwh;
      const diffEur = pmmHour ? pmmHour.intern_diff_proxy_eur_mwh : pmmData!.summary.avg_intern_diff_proxy_eur_mwh;
      sysKr = toKr(proxyEur, eurSek);
      flaskKr = Math.max(0, toKr(diffEur, eurSek));
      sysLabel = `S* ${sysKr.toFixed(2)}`;
      sysColor = "#60a5fa"; // PMM blue
      flaskColor = "#eab308"; // PMM gul — aldrig DDM-orange
      isProxy = true;
    } else {
      // Ingen sys, ingen PMM: bara zonpris, ingen decomposition
      sysKr = a.spKr;
      flaskKr = 0;
      sysLabel = `Zon ${sysKr.toFixed(2)}`;
      sysColor = C.spot;
      flaskColor = "#f97316";
    }
    return { sysKr, flaskKr, sysLabel, sysColor, flaskColor, isProxy };
  }, [a.sysAvail, a.syKr, a.spKr, showPmm, pmmData, hovIdx, rows, pmmByTs, eurSek]);

  // ─── El vs Avgifter donut (3 segments) ─────────────────────────────────
  const elVsAvg: Seg[] = useMemo(() => {
    const t = a.tot || 1;
    const avgKr = NET + TAX + a.mo;
    const segs: Seg[] = [
      { id: "el", pct: (decomp.sysKr / t) * 100, color: decomp.isProxy ? "#60a5fa" : "#22c55e", label: decomp.isProxy ? "El (proxy*)" : "El (systempris)" },
    ];
    if (decomp.flaskKr > 0.001) {
      segs.push({ id: "flask", pct: (decomp.flaskKr / t) * 100, color: decomp.flaskColor, label: decomp.isProxy ? "Prisdiff* (modell)" : "Överföring (flaskhals)" });
    }
    segs.push({ id: "avg", pct: (avgKr / t) * 100, color: "#ef4444", label: "Avgifter (nät/skatt/moms)" });
    return segs;
  }, [a.tot, a.mo, decomp]);

  // Fixed legend: ALL possible rows always present (stable layout, no jumping).
  // Donut uses pSegDonut (dynamic), legend uses this (fixed).
  const pSegLegend: Seg[] = useMemo(() => {
    const upstreamNames = UPSTREAM_LINKS_FOR[zone] ?? [];
    // Determine which base segment to show
    const hasSys = a.sysAvail && a.syKr !== null;
    const hasPmm = showPmm && pmmData && !a.sysAvail;
    // Build all possible rows in fixed order
    const allSlots: { id: string; color: string; label: string }[] = [];
    if (hasSys) {
      allSlots.push({ id: "sys", color: C.sys, label: "Systempris" });
    } else if (hasPmm) {
      allSlots.push({ id: "sys_proxy", color: "#60a5fa", label: "Systempris (proxy)" });
    } else {
      allSlots.push({ id: "zon", color: C.spot, label: "Zonpris" });
    }
    for (const ln of upstreamNames) {
      allSlots.push({ id: ln, color: LINK_COLOR[ln as SwedenLink] ?? C.flask, label: ln });
    }
    if (hasPmm) {
      allSlots.push({ id: "diff_proxy", color: "#fb923c", label: "Prisdiff (proxy)" });
    }
    allSlots.push(
      { id: "net", color: C.net, label: "Nätavgift" },
      { id: "tax", color: C.tax, label: "Energiskatt" },
      { id: "moms", color: C.moms, label: "Moms 25%" },
    );
    // Map to pSeg values (or 0 if not present)
    return allSlots.map(slot => {
      const found = pSeg.find(s => s.id === slot.id);
      return found ?? { ...slot, pct: 0 };
    });
  }, [pSeg, zone, a.sysAvail, a.syKr, showPmm, pmmData]);

  // Chart
  const W = 820, H = 200;
  const P = { l: 44, r: 12, t: 16, b: 28 };
  const cw = W - P.l - P.r, ch = H - P.t - P.b;
  const maxZ = rows.length > 0 ? Math.max(...rows.map(r => r.zonpris_eur_mwh)) * 1.08 : 120;
  const xPos = (i: number) => P.l + (i / Math.max(rows.length - 1, 1)) * cw;
  const yPos = (v: number) => P.t + (1 - v / maxZ) * ch;

  const zonLine = rows.map((d, i) => `${i === 0 ? "M" : "L"}${xPos(i).toFixed(1)},${yPos(d.zonpris_eur_mwh).toFixed(1)}`).join(" ");
  const sysLine = rows.map((d, i) => `${i === 0 ? "M" : "L"}${xPos(i).toFixed(1)},${yPos(d.systempris_eur_mwh ?? 0).toFixed(1)}`).join(" ");
  const flaskArea = rows.length > 1 ? (
    rows.map((d, i) => `${i === 0 ? "M" : "L"}${xPos(i).toFixed(1)},${yPos(d.zonpris_eur_mwh).toFixed(1)}`).join(" ")
    + " " + [...rows].reverse().map((d, i) => `L${xPos(rows.length - 1 - i).toFixed(1)},${yPos(d.systempris_eur_mwh ?? 0).toFixed(1)}`).join(" ") + " Z"
  ) : "";
  const sysArea = rows.length > 1 ? (
    rows.map((d, i) => `${i === 0 ? "M" : "L"}${xPos(i).toFixed(1)},${yPos(d.systempris_eur_mwh ?? 0).toFixed(1)}`).join(" ")
    + ` L${xPos(rows.length - 1).toFixed(1)},${yPos(0).toFixed(1)} L${xPos(0).toFixed(1)},${yPos(0).toFixed(1)} Z`
  ) : "";

  const onChartMove = useCallback((e: React.MouseEvent) => {
    if (locked || rows.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round(((mx - P.l) / cw) * (rows.length - 1));
    if (idx >= 0 && idx < rows.length) setHovIdx(idx);
  }, [locked, rows.length]);

  // Bar segments — two modes:
  //   Default (hovIdx=null): period aggregate — stable reference
  //   Hover active (hovIdx≠null): hour values — follows crosshair
  // MODE FLAG is isHoverBar — used to show "Timvärde" label in UI.
  const isHoverBar = hovIdx !== null;

  // Bar uses `decomp` (shared with donut) — single source of truth.
  // Segments: Sys + Flaskhals(zon−sys or PMM proxy) + Nät + Skatt + Moms = a.tot
  const bar = useMemo(() => {
    const showSpot = visibleSeries.has("zon") || visibleSeries.has("sys");
    const t = a.tot || 1;

    const all: { id: string; w: number; color: string; label: string; min: number; pulse: boolean }[] = [];

    if (showSpot) {
      all.push({ id: "sys", w: (decomp.sysKr / t) * 100, color: decomp.sysColor, label: decomp.sysLabel, min: 8, pulse: false });
    }

    // Flask always present (stable layout). Width 0 when no bottleneck.
    const flaskLabel = decomp.flaskKr > 0.001 ? (decomp.isProxy ? `Diff* ${decomp.flaskKr.toFixed(2)}` : `Flask ${decomp.flaskKr.toFixed(2)}`) : "";
    all.push({ id: "flask", w: showSpot && decomp.flaskKr > 0.001 ? (decomp.flaskKr / t) * 100 : 0, color: decomp.flaskColor, label: flaskLabel, min: 3, pulse: true });

    all.push({ id: "net",  w: visibleSeries.has("net")  ? (NET / t) * 100  : 0, color: C.net,  label: `N\u00e4t ${NET.toFixed(2)}`,   min: 5, pulse: false });
    all.push({ id: "tax",  w: visibleSeries.has("tax")  ? (TAX / t) * 100  : 0, color: C.tax,  label: `Skatt ${TAX.toFixed(2)}`, min: 5, pulse: false });
    all.push({ id: "moms", w: visibleSeries.has("moms") ? (a.mo / t) * 100 : 0, color: C.moms, label: `Moms ${a.mo.toFixed(2)}`, min: 5, pulse: false });

    // All 5 segments always present. Widths transition smoothly via CSS.
    return all;
  }, [a, visibleSeries, decomp]);

  const summary = ddm?.daily_summary;

  // ─── Render ────────────────────────────────────────────────────────────

  if (loading && !ddm) {
    return <div className="card"><p style={{ color: C.muted, fontSize: 12 }}>Laddar energipanel…</p></div>;
  }

  return (
    <>
      <style>{`
        @keyframes eip-dp { 0%,100%{opacity:.65} 50%{opacity:1} }
        @keyframes eip-bp { 0%,100%{opacity:.7} 50%{opacity:1} }
        @keyframes eip-fg { 0%,100%{filter:drop-shadow(0 0 3px rgba(249,115,22,0))} 50%{filter:drop-shadow(0 0 10px rgba(249,115,22,.5))} }
        @keyframes eip-fi { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      <div className="card" style={{ overflow: "hidden", padding: 0 }}>

        {/* ─── HEADER ─── */}
        <div style={{ padding: "12px 20px 0" }}>
          {/* Row 1: Title + Zone + Big price */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>EVE Energipanel</span>
              <span style={{ padding: "1px 5px", borderRadius: 3, fontSize: 8, fontWeight: 600, background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}>CMD</span>
              <span style={{ padding: "1px 5px", borderRadius: 3, fontSize: 8, fontWeight: 600, background: "rgba(96,165,250,0.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.25)" }}>DDM</span>
              {showPmm && (
                <span title={pmmData?.legal_notice ?? "Modellbaserad proxy"} style={{ padding: "1px 5px", borderRadius: 3, fontSize: 8, fontWeight: 600, background: "rgba(234,179,8,0.12)", color: "#eab308", border: "1px solid rgba(234,179,8,0.25)", cursor: "help" }}>PMM</span>
              )}
              {/* Zone */}
              <div style={{ display: "flex", gap: 2 }}>
                {["SE1", "SE2", "SE3", "SE4"].map(z => (
                  <button key={z} onClick={() => { setZone(z); setHovIdx(null); setLocked(false); }}
                    style={{
                      padding: "3px 10px", fontSize: 11, fontWeight: zone === z ? 700 : 400,
                      background: zone === z ? "rgba(245,158,11,0.15)" : "transparent",
                      border: `1px solid ${zone === z ? C.spot + "66" : C.border}`,
                      borderRadius: 4, color: zone === z ? C.spot : C.muted, cursor: "pointer",
                      fontFamily: FONT,
                    }}>
                    {z}
                  </button>
                ))}
              </div>
            </div>
            {/* Big price */}
            {ddm && rows.length > 0 && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: C.muted }}>{a.isHour ? `Timme ${tl}` : mode === "day" ? "Dagsmedel" : `Medel ${period.label}`}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.spot, fontFamily: FONT }}>
                  {a.tot.toFixed(2)}
                  <span style={{ fontSize: 10, fontWeight: 400, color: C.muted, marginLeft: 3 }}>kr/kWh</span>
                  {compare && compDdm && (() => {
                    const cn = compDdm.rows.length || 1;
                    const cavgZ = compDdm.rows.reduce((s, r) => s + r.zonpris_eur_mwh, 0) / cn;
                    const cSpKr = toKr(cavgZ, eurSek);
                    const cTot = +((cSpKr + NET + TAX) * 1.25).toFixed(3);
                    const diff = a.tot - cTot;
                    return (
                      <span style={{ fontSize: 10, marginLeft: 8, color: diff > 0 ? C.tax : C.green, fontWeight: 600 }}>
                        {diff > 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(2)}
                      </span>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Row 2: Period mode tabs + nav + compare toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 10, borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
            {/* Period tabs */}
            <div style={{ display: "flex", gap: 1, background: C.border, borderRadius: 6, padding: 1 }}>
              {(["day", "week", "month", "year", "custom"] as PeriodMode[]).map(m => {
                const labels: Record<PeriodMode, string> = { day: "Dag", week: "Vecka", month: "Månad", year: "År", custom: "Custom" };
                return (
                  <button key={m} onClick={() => switchMode(m)}
                    style={{
                      padding: "4px 12px", fontSize: 10, fontWeight: mode === m ? 700 : 400,
                      background: mode === m ? C.card2 : "transparent",
                      border: "none", borderRadius: 5, color: mode === m ? C.text : C.muted,
                      cursor: "pointer", fontFamily: FONT,
                    }}>
                    {labels[m]}
                  </button>
                );
              })}
            </div>

            {/* Nav arrows + period label */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button onClick={() => nav(-1)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontSize: 12, padding: "3px 8px", cursor: "pointer", lineHeight: 1 }}>◀</button>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: FONT, minWidth: 120, textAlign: "center" }}>
                {period.label}
              </span>
              <button onClick={() => nav(1)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontSize: 12, padding: "3px 8px", cursor: "pointer", lineHeight: 1 }}>▶</button>
              {mode === "day" && period.start === todayStr() && (
                <span style={{ fontSize: 9, color: "#22c55e", display: "flex", alignItems: "center", gap: 3, marginLeft: 4 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />LIVE
                </span>
              )}
            </div>

            {/* Custom date inputs */}
            {mode === "custom" && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="date" value={customStart} max={todayStr()}
                  onChange={(e) => { setCustomStart(e.target.value); setHovIdx(null); }}
                  style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontSize: 10, fontFamily: FONT, padding: "3px 6px" }} />
                <span style={{ color: C.dim, fontSize: 10 }}>–</span>
                <input type="date" value={customEnd} max={todayStr()}
                  onChange={(e) => { setCustomEnd(e.target.value); setHovIdx(null); }}
                  style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontSize: 10, fontFamily: FONT, padding: "3px 6px" }} />
              </div>
            )}

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Compare toggle */}
            <button onClick={() => setCompare(!compare)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px", fontSize: 9, fontFamily: FONT,
                background: compare ? "rgba(96,165,250,0.12)" : "transparent",
                border: `1px solid ${compare ? "#60a5fa66" : C.border}`,
                borderRadius: 5, color: compare ? "#60a5fa" : C.muted,
                cursor: "pointer",
              }}>
              <span style={{
                width: 28, height: 14, borderRadius: 7, position: "relative",
                background: compare ? "#60a5fa" : C.dim,
                transition: "background .2s",
              }}>
                <span style={{
                  width: 10, height: 10, borderRadius: "50%", background: "#fff",
                  position: "absolute", top: 2,
                  left: compare ? 16 : 2,
                  transition: "left .2s",
                }} />
              </span>
              Jämför föregående
              {compare && compPeriod && (
                <span style={{ fontSize: 8, color: C.dim }}>({compPeriod.label})</span>
              )}
            </button>
          </div>
        </div>

        {/* Error / loading state */}
        {loading && !ddm && (
          <div style={{ padding: "16px 20px", color: C.muted, fontSize: 12 }}>Laddar energipanel…</div>
        )}
        {error && !ddm && (
          <div style={{ padding: "16px 20px" }}>
            <p style={{ color: C.flask, fontSize: 12, margin: 0 }}>{error}</p>
            <p style={{ color: C.muted, fontSize: 10, marginTop: 4 }}>Använd ◀ för att navigera till ett datum med data.</p>
          </div>
        )}

        {/* ─── DATA CONTENT (only when DDM data available) ─── */}
        {ddm && rows.length > 0 && (<>

        {/* Warnings — only show if NOT about missing systempris (that's handled by PMM offer row) */}
        {ddm.warnings.length > 0 && a.sysAvail && (
          <div style={{ padding: "4px 20px", fontSize: 9, color: "#f59e0b" }}>
            ⚠ {ddm.warnings[0]}
          </div>
        )}

        {/* ─── PMM info (always visible when sys unavailable) ─── */}
        {!a.sysAvail && (
          <div style={{ padding: "6px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            background: "rgba(234,179,8,0.04)",
            borderBottom: "1px solid rgba(234,179,8,0.1)" }}>
            <span style={{ fontSize: 9, color: "#f59e0b" }}>
              ⚠ Systempris ej tillgängligt för denna period. Dekomposition baseras på modellberäknat systempris (viktat medel SE1–SE4).
              Nord Pool låser historisk SYS-data bakom betalvägg (pre-2026). ENTSO-E, EEA, ECB och Riksdagen är öppna — Nord Pool är undantaget.
            </span>
            <a href="/methodology" target="_blank" rel="noopener" style={{
              fontSize: 9, color: "#f59e0b88", textDecoration: "underline", textUnderlineOffset: 2, whiteSpace: "nowrap",
            }}>Beräkningsmetodik</a>
          </div>
        )}

        {/* ─── PRICE BAR ─── */}
        <div style={{ padding: "6px 20px 10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: C.muted }}>
              {tl} — Vad du betalar per kWh
              {isHoverBar && (
                <span style={{ marginLeft: 8, fontSize: 8, fontFamily: FONT, color: C.amber,
                  border: `1px solid ${C.amber}44`, borderRadius: 3, padding: "1px 5px" }}>
                  Timvärde
                </span>
              )}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: FONT }}>{a.tot.toFixed(2)} kr/kWh</span>
          </div>
          <div style={{ display: "flex", height: 36, borderRadius: 8, overflow: "hidden", gap: 1 }}>
            {bar.map(s => {
              const stripes = decomp.isProxy && (s.id === "sys" || s.id === "flask");
              const bg = stripes
                ? `repeating-linear-gradient(135deg, ${s.color}, ${s.color} 4px, ${s.color}88 4px, ${s.color}88 8px)`
                : s.color;
              return (
              <div key={s.id} style={{
                width: `${s.w}%`, background: bg,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: s.w > s.min ? 9 : 0, color: "#fff", fontWeight: 600,
                transition: "width 0.15s ease-out, font-size 0.1s",
                overflow: "hidden",
                animation: s.id === "flask" && pulse ? "eip-bp 2s ease-in-out infinite" : "none",
                position: "relative",
                border: stripes ? "1.5px solid #eab308" : "none",
                boxSizing: "border-box",
              }}>
                {s.w > s.min && s.label}
                {s.id === "flask" && pulse && !decomp.isProxy && (
                  <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 12px ${C.flaskHi}66, 0 0 8px ${C.flask}44`, animation: "eip-bp 2s ease-in-out infinite", pointerEvents: "none" }} />
                )}
              </div>
            ); })}
          </div>
          {/* Flaskhals summary row — always rendered with fixed height to prevent layout shift */}
          {/* DDM spec §3: only show when systempris available (intern_diff = null without it) */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            marginTop: 4, padding: "2px 0", fontSize: 8, color: !a.sysAvail ? C.dim : totalLinkKr > 0.0001 ? C.flask : C.dim, fontFamily: FONT,
            minHeight: 16 }}>
            {!a.sysAvail ? (
              <span style={{ color: C.dim }}>
                Intern prisdifferens: modellberäknad (PMM)
              </span>
            ) : totalLinkKr > 0.0001 ? (
              <>
                <span>
                  Intern prisdifferens (zon − system): <strong>+{totalLinkKr.toFixed(3)} kr/kWh</strong>
                  {activeLinkKrs.filter(x => Math.abs(x.kr) > 0.0001).length > 1 && (
                    <span style={{ color: C.muted, marginLeft: 6 }}>
                      ({activeLinkKrs.filter(x => Math.abs(x.kr) > 0.0001).map(x => `${x.linkName.replace("\u2192", "\u00bb")} ${x.kr.toFixed(3)}`).join(" + ")})
                    </span>
                  )}
                </span>
                <span style={{ color: C.muted }}>
                  {a.spKr > 0 ? `${((totalLinkKr / a.spKr) * 100).toFixed(0)}\u00a0% av spotpris` : ""}
                </span>
              </>
            ) : (
              <span style={{ color: C.dim }}>Intern prisdifferens (zon − system): 0.000 kr/kWh</span>
            )}
          </div>
          {/* Clickable legend — toggles chart series and bar segments */}
          {/* Values update on hover but widths are fixed to prevent layout shift */}
          <div style={{ display: "flex", gap: 6, marginTop: 6, fontSize: 9, flexWrap: "wrap" }}>
            {/* Base price buttons */}
            {[
              { id: "zon", color: C.spot, label: "Zonpris", val: a.spKr.toFixed(3) },
              { id: "sys", color: a.sysAvail ? C.sys : C.dim, label: "Systempris",
                val: a.sysAvail && a.syKr !== null ? a.syKr.toFixed(3) : "n/a",
                disabled: !a.sysAvail },
            ].map(l => {
              const on = visibleSeries.has(l.id) && !l.disabled;
              return (
                <button key={l.id} onClick={() => { if (!l.disabled) toggleSeries(l.id); }}
                  title={l.disabled ? `${l.label}: ej tillgängligt` : on ? `Dölj ${l.label}` : `Visa ${l.label}`}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 7px", borderRadius: 5, cursor: "pointer",
                    background: on ? `${l.color}14` : "transparent",
                    border: `1px solid ${on ? l.color + "55" : C.border}`,
                    opacity: on ? 1 : 0.4, transition: "all .15s", fontFamily: FONT }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: on ? l.color : C.dim,
                    display: "inline-block", flexShrink: 0 }} />
                  <span style={{ color: on ? l.color : C.dim }}>{l.label}</span>
                  <span style={{ color: C.dim, fontSize: 8, fontFamily: FONT, minWidth: 36, textAlign: "right", display: "inline-block" }}>{l.val}</span>
                </button>
              );
            })}
            {/* SE link spread buttons — only upstream links for selected zone */}
            {(UPSTREAM_LINKS_FOR[zone] ?? []).map(linkName => {
              const lkr = activeLinkKrs.find(x => x.linkName === linkName)?.kr ?? 0;
              const color = LINK_COLOR[linkName as SwedenLink] ?? C.flask;
              const on = visibleSeries.has(linkName);
              const hasData = lkr > 0.0001;
              return (
                <button key={linkName} onClick={() => toggleSeries(linkName)}
                  title={on ? `Dölj ${linkName}` : `Visa ${linkName}`}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 7px", borderRadius: 5, cursor: "pointer",
                    background: on && hasData ? `${color}14` : "transparent",
                    border: `1px solid ${on && hasData ? color + "55" : C.border}`,
                    opacity: on ? 1 : 0.4, transition: "all .15s", fontFamily: FONT }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2,
                    background: on && hasData ? color : C.dim, display: "inline-block", flexShrink: 0,
                    boxShadow: on && hasData && pulse ? `0 0 5px ${color}88` : "none" }} />
                  <span style={{ color: on && hasData ? color : C.dim, fontWeight: hasData ? 600 : 400 }}>{linkName}</span>
                  <span style={{ color: C.dim, fontSize: 8, fontFamily: FONT, minWidth: 36, textAlign: "right", display: "inline-block" }}>
                    {hasData ? `+${lkr.toFixed(3)}` : "0"}
                  </span>
                </button>
              );
            })}
            {/* Fixed cost buttons */}
            {[
              { id: "net",  color: C.net,  label: "Nätavgift",   val: NET.toFixed(2) },
              { id: "tax",  color: C.tax,  label: "Energiskatt", val: TAX.toFixed(2) },
              { id: "moms", color: C.moms, label: "Moms 25%",    val: a.mo.toFixed(3) },
            ].map(l => {
              const on = visibleSeries.has(l.id);
              return (
                <button key={l.id} onClick={() => toggleSeries(l.id)}
                  title={on ? `Dölj ${l.label}` : `Visa ${l.label}`}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 7px", borderRadius: 5, cursor: "pointer",
                    background: on ? `${l.color}14` : "transparent",
                    border: `1px solid ${on ? l.color + "55" : C.border}`,
                    opacity: on ? 1 : 0.4, transition: "all .15s", fontFamily: FONT }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: on ? l.color : C.dim,
                    display: "inline-block", flexShrink: 0 }} />
                  <span style={{ color: on ? l.color : C.dim }}>{l.label}</span>
                  <span style={{ color: C.dim, fontSize: 8, fontFamily: FONT, minWidth: 36, textAlign: "right", display: "inline-block" }}>{l.val}</span>
                </button>
              );
            })}
            <button
              onClick={() => setVisibleSeries(new Set(["zon", "sys", ...UPSTREAM_LINKS_FOR[zone] ?? [], "net", "tax", "moms"]))}
              style={{ marginLeft: "auto", fontSize: 8, padding: "3px 7px", borderRadius: 5, background: "none",
                border: `1px solid ${C.border}`, color: C.dim, cursor: "pointer" }}
            >Visa alla</button>
          </div>
        </div>

        {/* ─── CHART + DONUTS ─── */}
        {/* Mobile: chart first (full width), donuts below side-by-side */}
        {/* Desktop: donut | chart | donut in a row */}
        <style>{`
          .eip-viz-row { display: flex; }
          .eip-donut-left, .eip-donut-right { width: 200px; flex-shrink: 0; }
          .eip-donut-left { border-right: 1px solid ${C.border}; }
          .eip-donut-right { border-left: 1px solid ${C.border}; }
          .eip-chart-col { flex: 1; min-width: 0; }
          .eip-donuts-mobile { display: none; }
          @media (max-width: 767px) {
            .eip-viz-row { flex-direction: column; }
            .eip-donut-left, .eip-donut-right { display: none !important; }
            .eip-chart-col { width: 100%; order: 0; }
            .eip-donuts-mobile {
              display: flex;
              gap: 8px;
              padding: 12px 16px;
              border-top: 1px solid ${C.border};
            }
            .eip-donuts-mobile > div { flex: 1; min-width: 0; }
          }
        `}</style>

        <div className="eip-viz-row">
          {/* Left: Produktion (desktop only) */}
          <div className="eip-donut-left" style={{ padding: "8px 14px 14px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 9, color: C.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>Produktion</div>
            <Donut segments={eSeg} centerTop={genDisplay.value} centerBot={genDisplay.unit} />
            {genDisplay.periodLabel && (
              <div style={{ fontSize: 8, color: C.muted, marginTop: 2, fontFamily: FONT }}>{genDisplay.periodLabel}</div>
            )}
            {genDisplay.totalLabel && (
              <div style={{ fontSize: 8, color: C.dim, marginTop: 1, fontFamily: FONT }}>{genDisplay.totalLabel}</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6, width: "100%" }}>
              {eSeg.filter(s => s.pct > 1).map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                  <span style={{ color: C.muted, flex: 1 }}>{s.label}</span>
                  <span style={{ color: C.text, fontWeight: 500 }}>{s.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Center: Chart (always visible, full width on mobile) */}
          <div className="eip-chart-col" style={{ padding: "8px 0 0" }}>
            <svg viewBox={`0 0 ${W} ${H}`}
              style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }}
              onMouseMove={onChartMove}
              onMouseLeave={() => { if (!locked) setHovIdx(null); }}
              onClick={() => { if (locked) { setLocked(false); setHovIdx(null); } else if (hovIdx !== null) setLocked(true); }}
            >
              <defs>
                <linearGradient id="eip-sg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.sys} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={C.sys} stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id="eip-fg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.flask} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={C.flask} stopOpacity={0.08} />
                </linearGradient>
              </defs>
              {[25, 50, 75, 100].filter(v => v <= maxZ).map(v => (
                <g key={v}>
                  <line x1={P.l} x2={W - P.r} y1={yPos(v)} y2={yPos(v)} stroke={C.border} strokeWidth={0.5} />
                  <text x={P.l - 4} y={yPos(v) + 3} textAnchor="end" fill={C.muted} fontSize={8} fontFamily={FONT}>{toKr(v, eurSek).toFixed(1)}</text>
                </g>
              ))}
              {visibleSeries.has("sys") && a.sysAvail && sysArea && <path d={sysArea} fill="url(#eip-sg)" />}
              {visibleSeries.has("flask") && a.sysAvail && flaskArea && <path d={flaskArea} fill="url(#eip-fg)" style={{ animation: pulse ? "eip-bp 2s ease-in-out infinite" : "none" }} />}
              {visibleSeries.has("sys") && a.sysAvail && sysLine && <path d={sysLine} fill="none" stroke={C.green} strokeWidth={1.5} opacity={0.45} />}
              {visibleSeries.has("zon") && zonLine && <path d={zonLine} fill="none" stroke={C.spot} strokeWidth={2.5} style={{ animation: pulse ? "eip-fg 2s ease-in-out infinite" : "none" }} />}
              {hovIdx !== null && hovIdx < rows.length && (
                <g>
                  <line x1={xPos(hovIdx)} x2={xPos(hovIdx)} y1={P.t} y2={H - P.b}
                    stroke={locked ? C.spot : C.muted} strokeWidth={1} strokeDasharray={locked ? "none" : "3,2"} opacity={0.6} />
                  <circle cx={xPos(hovIdx)} cy={yPos(rows[hovIdx].zonpris_eur_mwh)} r={5} fill={C.spot} stroke={C.bg} strokeWidth={2} />
                  <circle cx={xPos(hovIdx)} cy={yPos(rows[hovIdx].systempris_eur_mwh ?? 0)} r={3.5} fill={C.green} stroke={C.bg} strokeWidth={1.5} />
                  {rows[hovIdx].zonpris_eur_mwh - (rows[hovIdx].systempris_eur_mwh ?? 0) > 3 && (
                    <>
                      <rect x={xPos(hovIdx) + 6} y={(yPos(rows[hovIdx].zonpris_eur_mwh) + yPos(rows[hovIdx].systempris_eur_mwh ?? 0)) / 2 - 8} width={52} height={16} rx={3} fill={C.flask} opacity={0.9} />
                      <text x={xPos(hovIdx) + 32} y={(yPos(rows[hovIdx].zonpris_eur_mwh) + yPos(rows[hovIdx].systempris_eur_mwh ?? 0)) / 2 + 4}
                        textAnchor="middle" fill="#fff" fontSize={9} fontWeight={600} fontFamily={FONT}>
                        +{toKr(rows[hovIdx].zonpris_eur_mwh - (rows[hovIdx].systempris_eur_mwh ?? 0), eurSek).toFixed(2)} kr
                      </text>
                    </>
                  )}
                  <rect x={xPos(hovIdx) - 50} y={yPos(rows[hovIdx].zonpris_eur_mwh) - 34} width={100} height={28} rx={4} fill={C.bg} stroke={C.border} strokeWidth={0.5} opacity={0.95} />
                  <text x={xPos(hovIdx)} y={yPos(rows[hovIdx].zonpris_eur_mwh) - 20}
                    textAnchor="middle" fill={C.muted} fontSize={7} fontFamily={FONT}>
                    {(() => {
                      const d = new Date(rows[hovIdx].ts);
                      return `${d.toISOString().slice(0,10)} kl ${String(d.getUTCHours()).padStart(2,"0")}:00`;
                    })()}
                  </text>
                  <text x={xPos(hovIdx)} y={yPos(rows[hovIdx].zonpris_eur_mwh) - 9}
                    textAnchor="middle" fill={C.spot} fontSize={10} fontWeight={700} fontFamily={FONT}>
                    {toKr(rows[hovIdx].zonpris_eur_mwh, eurSek).toFixed(2)} kr/kWh
                  </text>
                </g>
              )}
              {[0, 3, 6, 9, 12, 15, 18, 21].map(h => {
                const idx = rows.findIndex(r => new Date(r.ts).getUTCHours() === h);
                if (idx < 0) return null;
                return <text key={h} x={xPos(idx)} y={H - 6} textAnchor="middle" fill={C.muted} fontSize={9} fontFamily={FONT}>{String(h).padStart(2, "0")}</text>;
              })}
              <text x={P.l - 4} y={P.t - 4} textAnchor="end" fill={C.dim} fontSize={7} fontFamily={FONT}>kr/kWh</text>
              <line x1={P.l + 4} x2={P.l + 18} y1={P.t + 5} y2={P.t + 5} stroke={C.spot} strokeWidth={2.5} />
              <text x={P.l + 22} y={P.t + 8} fill={C.muted} fontSize={8} fontFamily={FONT}>Zon</text>
              <line x1={P.l + 48} x2={P.l + 62} y1={P.t + 5} y2={P.t + 5} stroke={C.green} strokeWidth={1.5} opacity={0.5} />
              <text x={P.l + 66} y={P.t + 8} fill={C.muted} fontSize={8} fontFamily={FONT}>Sys</text>
              <rect x={P.l + 92} y={P.t + 1} width={14} height={8} rx={1} fill={C.flask} opacity={0.5} />
              <text x={P.l + 110} y={P.t + 8} fill={C.flask} fontSize={8} fontWeight={600} fontFamily={FONT}>Prisdiff</text>
            </svg>
          </div>

          {/* Right: El vs Avgifter (desktop only) */}
          <div className="eip-donut-right" style={{ padding: "8px 14px 14px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 9, color: C.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>El vs Avgifter</div>
            <Donut segments={elVsAvg} centerTop={a.tot.toFixed(2)} centerBot="kr/kWh" pulseId={pulse ? "flask" : null} />
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6, width: "100%" }}>
              {elVsAvg.map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                  <span style={{ color: C.muted, flex: 1 }}>{s.label}</span>
                  <span style={{ color: C.text, fontWeight: 500 }}>{s.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── DONUTS (mobile only — shown below chart) ─── */}
        <div className="eip-donuts-mobile">
          {/* Produktion */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 9, color: C.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>Produktion</div>
            <Donut segments={eSeg} size={130} thickness={22} centerTop={genDisplay.value} centerBot={genDisplay.unit} />
            {genDisplay.periodLabel && (
              <div style={{ fontSize: 7, color: C.muted, marginTop: 2, fontFamily: FONT }}>{genDisplay.periodLabel}</div>
            )}
            {genDisplay.totalLabel && (
              <div style={{ fontSize: 7, color: C.dim, marginTop: 1, fontFamily: FONT }}>{genDisplay.totalLabel}</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4, width: "100%" }}>
              {eSeg.filter(s => s.pct > 1).map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                  <span style={{ color: C.muted, flex: 1 }}>{s.label}</span>
                  <span style={{ color: C.text, fontWeight: 500 }}>{s.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
          {/* El vs Avgifter */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 9, color: C.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>El vs Avgifter</div>
            <Donut segments={elVsAvg} size={130} thickness={22} centerTop={a.tot.toFixed(2)} centerBot="kr/kWh" pulseId={pulse ? "flask" : null} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4, width: "100%" }}>
              {elVsAvg.map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                  <span style={{ color: C.muted, flex: 1 }}>{s.label}</span>
                  <span style={{ color: C.text, fontWeight: 500 }}>{s.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── BOTTOM: Flow + Flaskhals KPI ─── */}
        <div style={{ display: "flex", borderTop: `1px solid ${C.border}`, padding: "12px 20px", gap: 16, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.muted, marginBottom: 4 }}>
              <span>↓ Import {(a.imp / 1000).toFixed(1)}k MW</span>
              <span style={{ color: a.net > 0 ? C.green : C.exp, fontWeight: 600 }}>
                Netto: {a.net > 0 ? "+" : ""}{(a.net / 1000).toFixed(1)}k MW
              </span>
              <span>↑ Export {(a.exp / 1000).toFixed(1)}k MW</span>
            </div>
            <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: C.border }}>
              <div style={{ width: `${(a.imp / Math.max(a.imp + a.exp, 1)) * 100}%`, background: `linear-gradient(90deg,${C.imp}44,${C.imp})`, borderRadius: "5px 0 0 5px" }} />
              <div style={{ width: `${(a.exp / Math.max(a.imp + a.exp, 1)) * 100}%`, background: `linear-gradient(90deg,${C.exp},${C.exp}44)`, borderRadius: "0 5px 5px 0" }} />
            </div>
          </div>
          <div style={{
            textAlign: "center", padding: "6px 20px", borderRadius: 8,
            border: `1px solid ${pulse ? C.flask + "66" : C.border}`,
            background: pulse ? C.flask + "0a" : "transparent",
            animation: pulse ? "eip-bp 2s ease-in-out infinite" : "none",
          }}>
            <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>Intern prisdifferens</div>
            {a.sysAvail ? (
              <>
                <div style={{ fontSize: 18, fontWeight: 700, color: totalLinkKr > 0.005 ? C.flask : C.green, fontFamily: FONT }}>
                  {totalLinkKr > 0 ? "+" : ""}{totalLinkKr.toFixed(3)}
                  <span style={{ fontSize: 8, color: C.muted, marginLeft: 2 }}>kr</span>
                </div>
                {activeLinkKrs.filter(x => Math.abs(x.kr) > 0.0001).length > 0 ? (
                  <div style={{ fontSize: 7, color: C.muted, marginTop: 2 }}>
                    {activeLinkKrs.filter(x => Math.abs(x.kr) > 0.0001).map(x => `${x.linkName.replace("→", "»")} ${x.kr.toFixed(3)}`).join(" + ")}
                  </div>
                ) : (
                  <div style={{ fontSize: 8, color: C.muted }}>{a.flPct > 0 ? `${a.flPct}% av zon` : "ingen"}</div>
                )}
              </>
            ) : showPmm && pmmData ? (
              <>
                {(() => {
                  const pmmHour = hovIdx !== null && rows[hovIdx] ? pmmByTs.get(rows[hovIdx].ts) : null;
                  const diffEur = pmmHour ? pmmHour.intern_diff_proxy_eur_mwh : pmmData.summary.avg_intern_diff_proxy_eur_mwh;
                  const diffKr = toKr(diffEur, eurSek);
                  const isNeg = diffKr < 0;
                  return (
                    <>
                      <div style={{ fontSize: 18, fontWeight: 700, color: isNeg ? C.green : "#eab308", fontFamily: FONT }}>
                        {diffKr > 0 ? "+" : ""}{diffKr.toFixed(3)}
                        <span style={{ fontSize: 8, color: C.muted, marginLeft: 2 }}>kr</span>
                      </div>
                      <div style={{ fontSize: 7, color: "#eab308", marginTop: 2 }}>
                        proxy (modell){isNeg ? " — zon billigare" : ""}
                      </div>
                    </>
                  );
                })()}
              </>
            ) : (
              <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>—</div>
            )}
          </div>
        </div>

        {/* ─── ADVANCED TOGGLE ─── */}
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          <button onClick={() => setShowAdv(!showAdv)}
            style={{ width: "100%", padding: 8, background: "none", border: "none", color: C.muted, fontSize: 9, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span style={{ transform: showAdv ? "rotate(180deg)" : "none", transition: "transform .2s", display: "inline-block" }}>▾</span>
            {showAdv ? "Dölj detaljer" : "Visa detaljer"}
          </button>

          {showAdv && (
            <div style={{ padding: "0 20px 16px", animation: "eip-fi .3s ease-out" }}>
              {/* Flows */}
              {a.isHour && Object.keys(a.fIn).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, marginBottom: 6 }}>Flöden kl {tl}</div>
                  <div style={{ display: "flex", gap: 28 }}>
                    <div>
                      <div style={{ fontSize: 8, color: C.imp, marginBottom: 3 }}>↓ IMPORT</div>
                      {Object.entries(a.fIn).map(([k, v]) => (
                        <div key={k} style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>{k}: <span style={{ color: C.text }}>{v.toLocaleString()} MW</span></div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontSize: 8, color: C.exp, marginBottom: 3 }}>↑ EXPORT</div>
                      {Object.entries(a.fOut).map(([k, v]) => (
                        <div key={k} style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>{k}: <span style={{ color: C.text }}>{v.toLocaleString()} MW</span></div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Price table */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, marginBottom: 6 }}>Prisuppdelning kr/kWh</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                  <tbody>
                    {/* Spot row */}
                    <tr>
                      <td style={{ padding: "3px 0", color: C.muted }}>⚡ Spotpris (zonpris)</td>
                      <td style={{ textAlign: "right", color: C.spot, fontWeight: 600, fontFamily: FONT }}>{a.spKr.toFixed(3)}</td>
                      <td style={{ textAlign: "right", width: 40, color: C.dim, fontSize: 9 }}>{((a.spKr / a.tot) * 100).toFixed(0)}%</td>
                    </tr>
                    {/* Systempris sub-row — conditional on availability */}
                    {a.sysAvail && a.syKr !== null ? (
                      <tr>
                        <td style={{ padding: "2px 0 2px 12px", color: C.dim, fontSize: 9 }}>├ Systempris</td>
                        <td style={{ textAlign: "right", color: C.sys, fontFamily: FONT, fontSize: 9 }}>{a.syKr.toFixed(3)}</td>
                        <td />
                      </tr>
                    ) : (
                      <tr>
                        <td style={{ padding: "2px 0 2px 12px", color: C.dim, fontSize: 9 }}>├ Systempris</td>
                        <td style={{ textAlign: "right", color: C.dim, fontFamily: FONT, fontSize: 9 }}>—</td>
                        <td style={{ textAlign: "right", fontSize: 8, color: "#f59e0b" }}>ej tillg.</td>
                      </tr>
                    )}
                    {/* Per-link spread rows */}
                    {activeLinkKrs.map(({ linkName, kr }, i) => {
                      const isLast = i === activeLinkKrs.length - 1;
                      return (
                        <tr key={linkName} style={{ borderBottom: isLast ? `1px solid ${C.border}` : "none" }}>
                          <td style={{ padding: "2px 0 2px 12px", color: C.dim, fontSize: 9 }}>
                            {isLast ? "└" : "├"} {linkName}
                          </td>
                          <td style={{ textAlign: "right", color: LINK_COLOR[linkName as SwedenLink] ?? C.flask, fontFamily: FONT, fontSize: 9 }}>+{kr.toFixed(3)}</td>
                          <td style={{ textAlign: "right", color: C.dim, fontSize: 8 }}>
                            {((kr / a.tot) * 100).toFixed(0)}%
                          </td>
                        </tr>
                      );
                    })}
                    {/* No-spread fallback: spreads data loaded but all links = 0 */}
                    {activeLinkKrs.length === 0 && (
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: "2px 0 2px 12px", color: C.dim, fontSize: 9 }}>└ Intern prisdifferens</td>
                        <td style={{ textAlign: "right", color: C.dim, fontFamily: FONT, fontSize: 9 }}>—</td>
                        <td style={{ textAlign: "right", fontSize: 8, color: C.dim }}>
                          {spreads ? "0" : "ej tillg."}
                        </td>
                      </tr>
                    )}
                    {/* Fixed costs */}
                    {[
                      { l: "🔌 Nätavgift",   v: NET.toFixed(2),     c: C.net,  pct: ((NET / a.tot) * 100).toFixed(0) },
                      { l: "🏛 Energiskatt", v: TAX.toFixed(2),     c: C.tax,  pct: ((TAX / a.tot) * 100).toFixed(0) },
                      { l: "📄 Moms 25%",    v: a.mo.toFixed(2),   c: C.moms, pct: ((a.mo / a.tot) * 100).toFixed(0) },
                    ].map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: "3px 0", color: C.muted }}>{r.l}</td>
                        <td style={{ textAlign: "right", color: r.c, fontWeight: 600, fontFamily: FONT }}>{r.v}</td>
                        <td style={{ textAlign: "right", width: 40, color: C.dim, fontSize: 9 }}>{r.pct}%</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: `2px solid ${C.border}` }}>
                      <td style={{ padding: "4px 0", fontWeight: 700 }}>Totalt</td>
                      <td style={{ textAlign: "right", fontWeight: 700, fontFamily: FONT }}>{a.tot.toFixed(2)}</td>
                      <td style={{ textAlign: "right", color: C.dim, fontSize: 9 }}>100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Constraint rent */}
              {summary && summary.constraint_rent.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, marginBottom: 6 }}>Flaskhalsintäkt per gräns</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {summary.constraint_rent.slice(0, 5).map(r => (
                      <div key={r.border} style={{ flex: "1 1 100px", padding: "6px 8px", background: C.card2, borderRadius: 6, border: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 8, color: C.muted }}>{r.border}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.flask, fontFamily: FONT }}>
                          {(r.total_eur * eurSek / 1000).toFixed(0)}k <span style={{ fontSize: 8, color: C.muted }}>SEK</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 8, color: C.muted, marginTop: 6 }}>
                    Totalt: <span style={{ color: C.flask, fontWeight: 600 }}>{(summary.total_rent_eur * eurSek / 1000).toFixed(0)}k SEK</span> per dygn
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        </>)}

        {/* Footer */}
        <div style={{ padding: "6px 20px", fontSize: 8, color: C.dim, lineHeight: 1.5, borderTop: `1px solid ${C.border}` }}>
          EVE-DDM v1.0 — Ren algebra: Prisdiff = Zon − Sys. Inga parametrar.
          EUR/SEK {eurSek.toFixed(4)} (ECB). Nät 32 öre. Skatt 36 öre (2026).
          {ddm?.sources && ddm.sources.length > 0 && ` | ${ddm.sources.join(" · ")}`}
        </div>
      </div>
    </>
  );
}
