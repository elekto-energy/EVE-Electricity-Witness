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
}

interface RentEntry { border: string; total_eur: number; avg_delta: number; }

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

const EUR_SEK = 11.2;
const toKr = (eur: number) => +((eur * EUR_SEK) / 1000).toFixed(3);
const NET = 0.32;
const TAX = 0.36;

const C = {
  bg: "var(--bg-primary, #0a0a0f)",
  card: "var(--bg-card, #111118)",
  card2: "var(--bg-elevated, #0e0e15)",
  border: "var(--border-color, #1c1c2a)",
  text: "var(--text-primary, #e8e8f0)",
  muted: "var(--text-muted, #6e6e88)",
  dim: "#3a3a52",
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
  moms: "#eab308",
  spot: "#f59e0b",
  green: "#22c55e",
  imp: "#60a5fa",
  exp: "#f87171",
};

const FONT = "var(--font-mono, 'JetBrains Mono', monospace)";

const ZONE_NAMES: Record<string, string> = {
  SE1: "Luleå", SE2: "Sundsvall", SE3: "Stockholm", SE4: "Malmö",
};

// ─── Helpers ─────────────────────────────────────────────────────────────

function twoDaysAgo(): string {
  const d = new Date(); d.setDate(d.getDate() - 2);
  return d.toISOString().slice(0, 10);
}
function todayStr(): string { return new Date().toISOString().slice(0, 10); }

// ─── Donut sub-component ─────────────────────────────────────────────────

interface Seg { id: string; pct: number; color: string; label: string; }

function Donut({ segments, size = 156, thickness = 26, centerTop, centerBot, pulseId }: {
  segments: Seg[]; size?: number; thickness?: number;
  centerTop: string; centerBot: string; pulseId?: string | null;
}) {
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
            style={s.id === pulseId ? {
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hovIdx, setHovIdx] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [showAdv, setShowAdv] = useState(false);

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
      // Fetch months sequentially in batches of 4 to avoid overwhelming the server
      for (let i = 0; i < monthArr.length; i += 4) {
        const batch = monthArr.slice(i, i + 4);
        const results = await Promise.all(
          batch.map(m =>
            fetch(`/api/energy/ddm?zone=${zone}&month=${m}`)
              .then(r => r.ok ? r.json() : null)
              .catch(() => null)
          )
        );
        for (const ddmRes of results) {
          if (ddmRes && ddmRes.count > 0) {
            // Filter rows to date range
            const filtered = ddmRes.rows.filter((r: DDMRow) => {
              const rd = r.ts.slice(0, 10);
              return rd >= start && rd <= end;
            });
            allRows.push(...filtered);
            ddmRes.sources?.forEach((s: string) => allSources.add(s));
            if (ddmRes.warnings) allWarnings.push(...ddmRes.warnings);
            anyOk = true;
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRange(period.start, period.end);
      setDdm(result.ddm);
      setGen(result.gen);
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
  }, [period, compare, compPeriod, fetchRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh for today (day mode only)
  useEffect(() => {
    if (mode !== "day" || period.start !== todayStr()) return;
    const iv = setInterval(fetchData, 300_000);
    return () => clearInterval(iv);
  }, [mode, period.start, fetchData]);

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

  const genByTs = useMemo(() => {
    const m = new Map<string, V2Row>();
    for (const r of gen) m.set(r.ts, r);
    return m;
  }, [gen]);

  // Active computed values
  const a = useMemo(() => {
    const calc = (z: number, s: number, g: V2Row | undefined, imp: number, exp: number,
      fIn: Record<string, number>, fOut: Record<string, number>) => {
      const flask = z - s;
      const spKr = toKr(z);
      const syKr = toKr(s);
      const fkKr = Math.max(0, +(spKr - syKr).toFixed(3));
      const sub = spKr + NET + TAX;
      const mo = +(sub * 0.25).toFixed(3);
      const tot = +(sub + mo).toFixed(3);
      const nuc = g?.nuclear_mw ?? 0;
      const hyd = g?.hydro_mw ?? 0;
      const win = (g?.wind_onshore_mw ?? 0) + (g?.wind_offshore_mw ?? 0);
      const sol = g?.solar_mw ?? 0;
      const oth = g?.other_mw ?? 0;
      const genTot = g?.total_gen_mw ?? (nuc + hyd + win + sol + oth);
      const flPct = z > 0 ? +((Math.max(0, flask) / z) * 100).toFixed(1) : 0;
      return { z, s, flask, spKr, syKr, fkKr, mo, tot, nuc, hyd, win, sol, oth, gen: genTot, flPct, imp, exp, net: imp - exp, fIn, fOut };
    };

    if (hovIdx !== null && rows[hovIdx]) {
      const r = rows[hovIdx];
      const g = genByTs.get(r.ts);
      const imp = Object.values(r.flows_in).reduce((s, v) => s + v, 0);
      const exp2 = Object.values(r.flows_out).reduce((s, v) => s + v, 0);
      return { ...calc(r.zonpris_eur_mwh, r.systempris_eur_mwh ?? 0, g, imp, exp2, r.flows_in, r.flows_out), h: new Date(r.ts).getUTCHours(), isHour: true };
    }

    // Daily average
    const n = rows.length || 1;
    const avgZ = rows.reduce((s, r) => s + r.zonpris_eur_mwh, 0) / n;
    const avgS = rows.reduce((s, r) => s + (r.systempris_eur_mwh ?? 0), 0) / n;
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
    return { ...calc(avgZ, avgS, genAvg, avgImp, avgExp, {}, {}), h: -1, isHour: false };
  }, [hovIdx, rows, genByTs]);

  const pulse = a.flPct > 10;
  const tl = a.isHour ? `${String(a.h).padStart(2, "0")}:00` : "Dagsmedel";

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

  const pSeg: Seg[] = useMemo(() => {
    const t = a.tot || 1;
    return [
      { id: "sys", pct: (a.syKr / t) * 100, color: C.sys, label: "Systempris" },
      { id: "flask", pct: (a.fkKr / t) * 100, color: C.flask, label: "Flaskhals" },
      { id: "net", pct: (NET / t) * 100, color: C.net, label: "Nätavgift" },
      { id: "tax", pct: (TAX / t) * 100, color: C.tax, label: "Energiskatt" },
      { id: "moms", pct: (a.mo / t) * 100, color: C.moms, label: "Moms 25%" },
    ].filter(s => s.pct > 0.3);
  }, [a]);

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

  // Bar segments
  const bar = useMemo(() => [
    { id: "sys", w: (a.syKr / a.tot) * 100, color: C.sys, label: `Sys ${a.syKr.toFixed(2)}`, min: 8 },
    { id: "flask", w: (a.fkKr / a.tot) * 100, color: C.flask, label: `Flaskhals ${a.fkKr.toFixed(2)}`, min: 3, pulse: true },
    { id: "net", w: (NET / a.tot) * 100, color: C.net, label: `Nät ${NET.toFixed(2)}`, min: 5 },
    { id: "tax", w: (TAX / a.tot) * 100, color: C.tax, label: `Skatt ${TAX.toFixed(2)}`, min: 5 },
    { id: "moms", w: (a.mo / a.tot) * 100, color: C.moms, label: `Moms ${a.mo.toFixed(2)}`, min: 5 },
  ].filter(s => s.w > 0.3), [a]);

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
                    const cSpKr = toKr(cavgZ);
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

        {/* Warnings */}
        {ddm.warnings.length > 0 && (
          <div style={{ padding: "4px 20px", fontSize: 9, color: "#f59e0b" }}>
            ⚠ {ddm.warnings[0]}
          </div>
        )}

        {/* ─── PRICE BAR ─── */}
        <div style={{ padding: "6px 20px 10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: C.muted }}>{tl} — Vad du betalar per kWh</span>
            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: FONT }}>{a.tot.toFixed(2)} kr/kWh</span>
          </div>
          <div style={{ display: "flex", height: 36, borderRadius: 8, overflow: "hidden", gap: 1 }}>
            {bar.map(s => (
              <div key={s.id} style={{
                width: `${s.w}%`, background: s.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: s.w > s.min ? 9 : 0, color: "#fff", fontWeight: 600,
                animation: s.id === "flask" && pulse ? "eip-bp 2s ease-in-out infinite" : "none",
                position: "relative",
              }}>
                {s.w > s.min && s.label}
                {s.id === "flask" && pulse && (
                  <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 12px ${C.flaskHi}66, 0 0 8px ${C.flask}44`, animation: "eip-bp 2s ease-in-out infinite", pointerEvents: "none" }} />
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 5, fontSize: 9, color: C.muted, flexWrap: "wrap" }}>
            {[
              { color: C.sys, label: "Systempris" },
              { color: C.flask, label: "Flaskhals", bold: true },
              { color: C.net, label: "Nätavgift" },
              { color: C.tax, label: "Energiskatt" },
              { color: C.moms, label: "Moms 25%" },
            ].map(l => (
              <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color, display: "inline-block" }} />
                <span style={{ fontWeight: l.bold ? 600 : 400, color: l.bold ? C.flask : C.muted }}>{l.label}</span>
              </span>
            ))}
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
            <Donut segments={eSeg} centerTop={`${(a.gen / 1000).toFixed(1)}k`} centerBot="MW" />
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
                  <text x={P.l - 4} y={yPos(v) + 3} textAnchor="end" fill={C.muted} fontSize={8} fontFamily={FONT}>{toKr(v).toFixed(1)}</text>
                </g>
              ))}
              {sysArea && <path d={sysArea} fill="url(#eip-sg)" />}
              {flaskArea && <path d={flaskArea} fill="url(#eip-fg)" style={{ animation: pulse ? "eip-bp 2s ease-in-out infinite" : "none" }} />}
              {sysLine && <path d={sysLine} fill="none" stroke={C.green} strokeWidth={1.5} opacity={0.45} />}
              {zonLine && <path d={zonLine} fill="none" stroke={C.spot} strokeWidth={2.5} style={{ animation: pulse ? "eip-fg 2s ease-in-out infinite" : "none" }} />}
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
                        +{toKr(rows[hovIdx].zonpris_eur_mwh - (rows[hovIdx].systempris_eur_mwh ?? 0)).toFixed(2)} kr
                      </text>
                    </>
                  )}
                  <rect x={xPos(hovIdx) - 34} y={yPos(rows[hovIdx].zonpris_eur_mwh) - 22} width={68} height={16} rx={3} fill={C.bg} opacity={0.92} />
                  <text x={xPos(hovIdx)} y={yPos(rows[hovIdx].zonpris_eur_mwh) - 10}
                    textAnchor="middle" fill={C.spot} fontSize={9} fontWeight={600} fontFamily={FONT}>
                    {toKr(rows[hovIdx].zonpris_eur_mwh).toFixed(2)} kr/kWh
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
              <text x={P.l + 110} y={P.t + 8} fill={C.flask} fontSize={8} fontWeight={600} fontFamily={FONT}>Flaskhals</text>
            </svg>
          </div>

          {/* Right: Prisuppdelning (desktop only) */}
          <div className="eip-donut-right" style={{ padding: "8px 14px 14px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 9, color: C.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>Prisuppdelning</div>
            <Donut segments={pSeg} centerTop={a.tot.toFixed(2)} centerBot="kr/kWh" pulseId={pulse ? "flask" : null} />
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6, width: "100%" }}>
              {pSeg.map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0,
                    boxShadow: s.id === "flask" && pulse ? `0 0 6px ${C.flask}88` : "none" }} />
                  <span style={{ color: s.id === "flask" ? C.flask : C.muted, flex: 1, fontWeight: s.id === "flask" ? 600 : 400 }}>{s.label}</span>
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
            <Donut segments={eSeg} size={130} thickness={22} centerTop={`${(a.gen / 1000).toFixed(1)}k`} centerBot="MW" />
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
          {/* Prisuppdelning */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 9, color: C.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>Prisuppdelning</div>
            <Donut segments={pSeg} size={130} thickness={22} centerTop={a.tot.toFixed(2)} centerBot="kr/kWh" pulseId={pulse ? "flask" : null} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4, width: "100%" }}>
              {pSeg.map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: s.color, flexShrink: 0,
                    boxShadow: s.id === "flask" && pulse ? `0 0 4px ${C.flask}88` : "none" }} />
                  <span style={{ color: s.id === "flask" ? C.flask : C.muted, flex: 1, fontWeight: s.id === "flask" ? 600 : 400 }}>{s.label}</span>
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
            <div style={{ fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>Flaskhals</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: a.fkKr > 0.005 ? C.flask : C.green, fontFamily: FONT }}>
              {a.fkKr > 0 ? "+" : ""}{a.fkKr.toFixed(2)}
              <span style={{ fontSize: 8, color: C.muted, marginLeft: 2 }}>kr</span>
            </div>
            <div style={{ fontSize: 8, color: C.muted }}>{a.flPct}% av zon</div>
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
                    {[
                      { l: "⚡ Spotpris (zonpris)", v: a.spKr.toFixed(2), c: C.spot, pct: ((a.spKr / a.tot) * 100).toFixed(0) },
                      { l: "  ├ Systempris", v: a.syKr.toFixed(2), c: C.sys, sub: true },
                      { l: "  └ Flaskhals", v: `+${a.fkKr.toFixed(2)}`, c: C.flask, sub: true, note: `${a.flPct}%` },
                      { l: "🔌 Nätavgift", v: NET.toFixed(2), c: C.net, pct: ((NET / a.tot) * 100).toFixed(0) },
                      { l: "🏛 Energiskatt", v: TAX.toFixed(2), c: C.tax, pct: ((TAX / a.tot) * 100).toFixed(0) },
                      { l: "📄 Moms 25%", v: a.mo.toFixed(2), c: C.moms, pct: ((a.mo / a.tot) * 100).toFixed(0) },
                    ].map((r, i) => (
                      <tr key={i} style={{ borderBottom: i === 2 ? `1px solid ${C.border}` : "none" }}>
                        <td style={{ padding: "3px 0", color: r.sub ? C.dim : C.muted, fontSize: r.sub ? 9 : 10 }}>{r.l}</td>
                        <td style={{ textAlign: "right", color: r.c, fontWeight: r.sub ? 400 : 600, fontFamily: FONT }}>{r.v}</td>
                        <td style={{ textAlign: "right", width: 40, color: C.dim, fontSize: 9 }}>{r.pct ? `${r.pct}%` : r.note ?? ""}</td>
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
                          {(r.total_eur * EUR_SEK / 1000).toFixed(0)}k <span style={{ fontSize: 8, color: C.muted }}>SEK</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 8, color: C.muted, marginTop: 6 }}>
                    Totalt: <span style={{ color: C.flask, fontWeight: 600 }}>{(summary.total_rent_eur * EUR_SEK / 1000).toFixed(0)}k SEK</span> per dygn
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        </>)}

        {/* Footer */}
        <div style={{ padding: "6px 20px", fontSize: 8, color: C.dim, lineHeight: 1.5, borderTop: `1px solid ${C.border}` }}>
          EVE-DDM v1.0 — Ren algebra: Flaskhals = Zon − Sys. Inga parametrar.
          EUR/SEK {EUR_SEK}. Nät 32 öre. Skatt 36 öre (2026).
          {ddm?.sources && ddm.sources.length > 0 && ` | ${ddm.sources.join(" · ")}`}
        </div>
      </div>
    </>
  );
}
