"use client";

/**
 * Spot Page V3.1 — Unified Energy Dashboard
 *
 * Controls: Mode (Live/Day/Month) + ONE date picker + Zone multi-select
 * Default: SEK kr/kWh. Toggle to EUR €/MWh.
 * Shift+click zones to compare.
 *
 * TR1: No source, no number.
 * TR6: Code renders — never invents.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { EvidenceBadge } from "@/components/EvidenceBadge";

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface V2Row {
  ts: string; zone: string; spot: number | null; temp: number | null;
  wind_speed: number | null; solar_rad: number | null; hdd: number | null;
  nuclear_mw: number | null; hydro_mw: number | null;
  wind_onshore_mw: number | null; wind_offshore_mw: number | null;
  solar_mw: number | null; gas_mw: number | null; coal_mw: number | null;
  lignite_mw: number | null; oil_mw: number | null; other_mw: number | null;
  total_gen_mw: number | null; net_import_mw: number | null;
  production_co2_g_kwh: number | null; consumption_co2_g_kwh: number | null;
  is_forecast?: boolean;
}

interface V2Response {
  zone: string; period: string; count: number; rows: V2Row[];
  stats: any; generation_mix: Record<string, number | null>;
  evidence: { dataset_eve_id: string; root_hash: string; methodology_version: string } | null;
}

interface LiveResponse {
  zone: string; rows: V2Row[]; has_tomorrow: boolean;
  stats: { today_spot: { avg: number | null; min: number | null; max: number | null };
           tomorrow_spot: { avg: number | null; min: number | null; max: number | null };
           temp: { avg: number | null } };
}

interface Dataset {
  id: string; zone: string; period: string; label: string; color: string;
  rows: V2Row[]; genMix: Record<string, number | null>; stats: any; evidence: any;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

import { ZONE_COLORS, ZONE_NAMES, getZoneColor } from "@/lib/zone-colors";

const ALL_ZONES = ["SE1", "SE2", "SE3", "SE4", "FI", "DE_LU"] as const;
const ZC = ZONE_COLORS;
const ZN = ZONE_NAMES;
const PALETTE = ["#f59e0b", "#22d3ee", "#ef4444", "#10b981", "#a78bfa", "#38bdf8", "#f97316", "#ec4899"];

const GC: Record<string, string> = {
  nuclear_mw: "#a78bfa", hydro_mw: "#3b82f6", wind_onshore_mw: "#22d3ee", wind_offshore_mw: "#06b6d4",
  solar_mw: "#facc15", gas_mw: "#f97316", coal_mw: "#78716c", lignite_mw: "#57534e", oil_mw: "#44403c", other_mw: "#a8a29e",
};
const GL: Record<string, string> = {
  nuclear_mw: "Kärnkraft", hydro_mw: "Vatten", wind_onshore_mw: "Vind land", wind_offshore_mw: "Vind hav",
  solar_mw: "Sol", gas_mw: "Gas", coal_mw: "Kol", lignite_mw: "Brunkol", oil_mw: "Olja", other_mw: "Övrigt",
};
const GF = Object.keys(GC);

type TimeMode = "live" | "day" | "month";
type PriceUnit = "sek" | "eur";

// EUR→SEK approximate. TODO: live FX from Riksbanken API
const EUR_SEK = 11.20;

interface SeriesConfig {
  key: string; label: string; color: string; dash?: string;
  extract: (r: V2Row) => number | null; unit: string; perDataset?: boolean;
}

const SERIES_DEFS: SeriesConfig[] = [
  { key: "spot", label: "Spotpris", color: "#f59e0b", extract: r => r.spot, unit: "€/MWh", perDataset: true },
  { key: "co2p", label: "CO₂ prod", color: "#22c55e", dash: "4 2", extract: r => r.production_co2_g_kwh, unit: "g/kWh" },
  { key: "co2c", label: "CO₂ kons", color: "#ef4444", dash: "6 3", extract: r => r.consumption_co2_g_kwh, unit: "g/kWh" },
  { key: "temp", label: "Temp", color: "#22d3ee", dash: "3 2", extract: r => r.temp, unit: "°C" },
  { key: "wind", label: "Vind", color: "#94a3b8", dash: "5 2", extract: r => r.wind_onshore_mw != null ? (r.wind_onshore_mw + (r.wind_offshore_mw ?? 0)) : r.wind_speed, unit: "MW" },
  { key: "solar", label: "Sol", color: "#facc15", dash: "2 2", extract: r => r.solar_mw ?? r.solar_rad, unit: "MW" },
  { key: "gen", label: "Total gen", color: "#3b82f6", dash: "8 3", extract: r => r.total_gen_mw, unit: "MW" },
  { key: "import", label: "Import", color: "#ec4899", dash: "4 4", extract: r => r.net_import_mw, unit: "MW" },
];

const PANEL_OPTIONS = [
  { key: "genmix", label: "Produktionsmix" },
  { key: "co2import", label: "CO₂-avtryck" },
  { key: "heatmap", label: "Intensitetskarta" },
  { key: "table", label: "Timdata" },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function yesterday(): string { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }
function todayStr(): string { return new Date().toISOString().slice(0, 10); }
const r1 = (n: number | null | undefined) => n != null && !isNaN(n) ? n.toFixed(1) : "–";
const r0 = (n: number | null | undefined) => n != null && !isNaN(n) ? Math.round(n).toString() : "–";
function norm(v: number, mn: number, mx: number) { return mx === mn ? 0.5 : Math.max(0, Math.min(1, (v - mn) / (mx - mn))); }

/** Convert EUR/MWh → öre/kWh (multiply by EUR_SEK / 10) */
function spotDisplay(eurMwh: number | null | undefined, unit: PriceUnit): string {
  if (eurMwh == null || isNaN(eurMwh)) return "–";
  if (unit === "eur") return eurMwh.toFixed(1);
  return (eurMwh * EUR_SEK / 10).toFixed(1);
}
function spotUnit(unit: PriceUnit): string { return unit === "eur" ? "€/MWh" : "öre/kWh"; }

// ═══════════════════════════════════════════════════════════════════════════════
// Small UI
// ═══════════════════════════════════════════════════════════════════════════════

function Stat({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: 6, padding: "5px 8px", minWidth: 70, flex: "1 1 70px" }}>
      <div style={{ fontSize: 8, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color, fontFamily: "var(--font-mono)" }}>
        {value}{unit && <span style={{ fontSize: 8, fontWeight: 400, marginLeft: 2, color: "var(--text-muted)" }}>{unit}</span>}
      </div>
    </div>
  );
}

function Toggle({ on, label, color, onClick }: { on: boolean; label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: "2px 7px", fontSize: 10, borderRadius: 4, cursor: "pointer",
      background: on ? color + "22" : "transparent",
      border: `1px solid ${on ? color : "var(--border-color)"}`,
      color: on ? color : "var(--text-muted)", fontWeight: on ? 600 : 400,
    }}>{label}</button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Chart
// ═══════════════════════════════════════════════════════════════════════════════

function UnifiedChart({ datasets, activeSeries, mode, priceUnit }: {
  datasets: Dataset[]; activeSeries: Set<string>; mode: TimeMode; priceUnit: PriceUnit;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (datasets.flatMap(d => d.rows).length < 2) return <div style={{ color: "var(--text-muted)", fontSize: 12, padding: 16 }}>Ingen data att visa</div>;

  const W = 1000, H = 300;
  const PAD = { top: 20, right: 12, bottom: 32, left: 40 };
  const pW = W - PAD.left - PAD.right, pH = H - PAD.top - PAD.bottom;
  const primary = datasets[0];
  // Use the longest series that has actual spot data to determine chart length
  const maxDataLen = Math.max(...datasets.map(ds => {
    let last = ds.rows.length - 1;
    while (last >= 0 && ds.rows[last].spot === null) last--;
    return last + 1;
  }));
  const len = maxDataLen > 0 ? maxDataLen : primary.rows.length;
  const x = (i: number) => PAD.left + (i / Math.max(len - 1, 1)) * pW;

  const active = SERIES_DEFS.filter(s => activeSeries.has(s.key));
  type DrawLine = { path: string; color: string; width: number; dash?: string; label: string };
  const lines: DrawLine[] = [];

  for (const series of active) {
    if (series.perDataset) {
      for (const ds of datasets) {
        const vals = ds.rows.map(series.extract);
        const valid = vals.filter((v): v is number => v !== null);
        if (valid.length < 2) continue;
        const mn = Math.min(...valid), mx = Math.max(...valid), rng = mx - mn || 1;
        const yFn = (v: number) => PAD.top + pH - ((v - mn) / rng) * pH;
        const path = vals.map((v, i) => { if (v === null) return ""; return `${i === 0 || vals[i - 1] === null ? "M" : "L"} ${x(i)} ${yFn(v)}`; }).filter(Boolean).join(" ");
        lines.push({ path, color: ds.color, width: 2.5, label: ds.label });
      }
    } else {
      const vals = primary.rows.map(series.extract);
      const valid = vals.filter((v): v is number => v !== null);
      if (valid.length < 2) continue;
      const mn = Math.min(...valid), mx = Math.max(...valid), rng = mx - mn || 1;
      const yFn = (v: number) => PAD.top + pH - ((v - mn) / rng) * pH;
      const path = vals.map((v, i) => { if (v === null) return ""; return `${i === 0 || vals[i - 1] === null ? "M" : "L"} ${x(i)} ${yFn(v)}`; }).filter(Boolean).join(" ");
      lines.push({ path, color: series.color, width: 1.5, dash: series.dash, label: series.label });
    }
  }

  const step = len <= 25 ? 3 : len <= 48 ? 6 : len <= 168 ? 24 : Math.floor(len / 8);
  const xTicks: number[] = []; for (let i = 0; i < len; i += step) xTicks.push(i);

  let nowIdx: number | null = null;
  if (mode === "live" && len > 0) {
    const h = new Date().getHours();
    if (h < len) nowIdx = h;
  }

  let tmrIdx: number | null = null;
  if (mode === "live") { const idx = primary.rows.findIndex(r => r.is_forecast); if (idx > 0) tmrIdx = idx; }

  // Mouse/touch → index
  const getIdxFromEvent = (e: React.MouseEvent | React.TouchEvent) => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const pxRatio = W / rect.width;
    const svgX = (clientX - rect.left) * pxRatio;
    const frac = (svgX - PAD.left) / pW;
    const idx = Math.round(frac * (len - 1));
    return idx >= 0 && idx < len ? idx : null;
  };

  // Tooltip data for hovered index
  const hRow = hoverIdx != null ? primary.rows[hoverIdx] : null;
  const hTime = hRow ? (() => {
    const d = new Date(hRow.ts);
    return (mode === "live" || mode === "day")
      ? d.getUTCHours().toString().padStart(2, "0") + ":00"
      : `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${d.getUTCHours().toString().padStart(2, "0")}:00`;
  })() : null;

  return (
    <div ref={containerRef} style={{ position: "relative", cursor: "crosshair" }}
      onMouseMove={e => setHoverIdx(getIdxFromEvent(e))}
      onTouchMove={e => setHoverIdx(getIdxFromEvent(e))}
      onMouseLeave={() => setHoverIdx(null)}
      onTouchEnd={() => setHoverIdx(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => <line key={f} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + pH * (1 - f)} y2={PAD.top + pH * (1 - f)} stroke="var(--border-color)" strokeWidth={0.5} />)}
        {/* X labels */}
        {xTicks.map(i => {
          const row = primary.rows[i]; if (!row) return null;
          const d = new Date(row.ts);
          const label = (mode === "live" || mode === "day") ? d.getUTCHours().toString().padStart(2, "0") + ":00" : `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
          return <text key={i} x={x(i)} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--text-muted)" fontFamily="var(--font-mono)">{label}</text>;
        })}
        {/* Tomorrow divider */}
        {tmrIdx !== null && <>
          <line x1={x(tmrIdx)} x2={x(tmrIdx)} y1={PAD.top} y2={PAD.top + pH} stroke="var(--border-color)" strokeWidth={1} strokeDasharray="4 3" />
          <text x={x(tmrIdx) + 4} y={PAD.top + 10} fontSize={7} fill="var(--text-muted)">imorgon</text>
        </>}
        {/* Lines */}
        {lines.map((l, i) => <path key={i} d={l.path} fill="none" stroke={l.color} strokeWidth={l.width} strokeDasharray={l.dash ?? "none"} opacity={0.9} />)}
        {/* Now marker */}
        {nowIdx !== null && <>
          <line x1={x(nowIdx)} x2={x(nowIdx)} y1={PAD.top} y2={PAD.top + pH} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.6} />
          <text x={x(nowIdx)} y={PAD.top - 4} textAnchor="middle" fontSize={8} fill="#f59e0b" fontFamily="var(--font-mono)" fontWeight={700}>NU</text>
        </>}
        {/* Hover crosshair */}
        {hoverIdx !== null && <>
          <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={PAD.top} y2={PAD.top + pH} stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
          {/* Dots on each line at hover index */}
          {datasets.map((ds, di) => {
            const row = ds.rows[hoverIdx];
            if (!row) return null;
            return active.filter(s => s.perDataset).map(s => {
              const v = s.extract(row);
              if (v == null) return null;
              const vals = ds.rows.map(s.extract).filter((v): v is number => v !== null);
              const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
              const cy = PAD.top + pH - ((v - mn) / rng) * pH;
              return <circle key={`${di}-${s.key}`} cx={x(hoverIdx)} cy={cy} r={4} fill={ds.color} stroke="var(--bg-primary)" strokeWidth={1.5} />;
            });
          })}
        </>}
      </svg>

      {/* Tooltip overlay */}
      {hoverIdx !== null && hRow && (
        <div style={{
          position: "absolute",
          left: `${((x(hoverIdx) / W) * 100)}%`,
          top: 8,
          transform: hoverIdx > len * 0.65 ? "translateX(-105%)" : "translateX(5%)",
          background: "rgba(15, 23, 42, 0.95)",
          border: "1px solid var(--border-color)",
          borderRadius: 8,
          padding: "8px 10px",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          pointerEvents: "none",
          zIndex: 10,
          minWidth: 160,
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}>
          <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 4, borderBottom: "1px solid var(--border-color)", paddingBottom: 3 }}>
            {hTime} {hRow.is_forecast ? <span style={{ color: "#3b82f6", fontSize: 9 }}>prognos</span> : ""}
          </div>
          {/* Spot per dataset */}
          {datasets.map(ds => {
            const r = ds.rows[hoverIdx];
            if (!r?.spot) return null;
            return <div key={ds.id} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ color: ds.color }}>{ds.label} spot</span>
              <span style={{ color: "#f59e0b", fontWeight: 600 }}>{spotDisplay(r.spot, priceUnit)} <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{spotUnit(priceUnit)}</span></span>
            </div>;
          })}
          {/* Other series from primary */}
          {hRow.production_co2_g_kwh != null && activeSeries.has("co2p") && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#22c55e" }}>CO₂ prod</span><span>{r0(hRow.production_co2_g_kwh)} g</span></div>}
          {hRow.consumption_co2_g_kwh != null && activeSeries.has("co2c") && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#ef4444" }}>CO₂ kons</span><span>{r0(hRow.consumption_co2_g_kwh)} g</span></div>}
          {hRow.temp != null && activeSeries.has("temp") && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#22d3ee" }}>Temp</span><span>{r1(hRow.temp)}°C</span></div>}
          {activeSeries.has("wind") && (hRow.wind_onshore_mw != null || hRow.wind_speed != null) && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#94a3b8" }}>Vind</span><span>{r0((hRow.wind_onshore_mw ?? 0) + (hRow.wind_offshore_mw ?? 0))} MW</span></div>}
          {hRow.solar_mw != null && activeSeries.has("solar") && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#facc15" }}>Sol</span><span>{r0(hRow.solar_mw)} MW</span></div>}
          {hRow.total_gen_mw != null && activeSeries.has("gen") && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#3b82f6" }}>Gen</span><span>{r0(hRow.total_gen_mw)} MW</span></div>}
          {hRow.net_import_mw != null && activeSeries.has("import") && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#ec4899" }}>Import</span><span>{r0(hRow.net_import_mw)} MW</span></div>}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-panels
// ═══════════════════════════════════════════════════════════════════════════════

function GenMixPanel({ datasets }: { datasets: Dataset[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: datasets.length > 1 ? `repeat(${Math.min(datasets.length, 3)}, 1fr)` : "1fr", gap: 12 }}>
      {datasets.map(ds => {
        const active = GF.map(f => ({ f, v: ds.genMix[f] ?? 0 })).filter(e => e.v > 0);
        const total = active.reduce((s, e) => s + e.v, 0);
        if (total <= 0) return <div key={ds.id} style={{ color: "var(--text-muted)", fontSize: 11 }}>{ds.label}: ingen data</div>;
        return (
          <div key={ds.id}>
            <div style={{ fontSize: 10, color: ds.color, fontWeight: 600, marginBottom: 3 }}>{ds.label}</div>
            <div style={{ display: "flex", height: 20, borderRadius: 4, overflow: "hidden", marginBottom: 3 }}>
              {active.map(e => { const p = (e.v / total) * 100; if (p < 0.5) return null; return <div key={e.f} style={{ width: `${p}%`, background: GC[e.f], display: "flex", alignItems: "center", justifyContent: "center", fontSize: p > 8 ? 7 : 0, color: "#fff", fontWeight: 600 }} title={`${GL[e.f]}: ${Math.round(e.v)} MW`}>{p > 12 ? `${GL[e.f]} ${p.toFixed(0)}%` : p > 5 ? `${p.toFixed(0)}%` : ""}</div>; })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 8px" }}>
              {active.filter(e => (e.v / total) * 100 >= 1).map(e => (
                <span key={e.f} style={{ fontSize: 8, color: "var(--text-muted)" }}><span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 2, background: GC[e.f], marginRight: 2, verticalAlign: "middle" }} />{GL[e.f]} {r0(e.v)}</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CO2ImportPanel({ datasets }: { datasets: Dataset[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: datasets.length > 1 ? `repeat(${Math.min(datasets.length, 3)}, 1fr)` : "1fr", gap: 12 }}>
      {datasets.map(ds => {
        const rows = ds.rows.filter(r => r.production_co2_g_kwh != null && r.consumption_co2_g_kwh != null);
        if (rows.length === 0) return <div key={ds.id} style={{ fontSize: 10, color: "var(--text-muted)" }}>{ds.label}: ingen CO₂-data</div>;
        const avgP = rows.reduce((s, r) => s + r.production_co2_g_kwh!, 0) / rows.length;
        const avgC = rows.reduce((s, r) => s + r.consumption_co2_g_kwh!, 0) / rows.length;
        const impShare = avgC > 0 ? ((avgC - avgP) / avgC) * 100 : 0;
        return (
          <div key={ds.id}>
            <div style={{ fontSize: 10, color: ds.color, fontWeight: 600, marginBottom: 4 }}>{ds.label}</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <Stat label="Prod CO₂" value={r0(avgP)} unit="g/kWh" color="#22c55e" />
              <Stat label="Kons CO₂" value={r0(avgC)} unit="g/kWh" color="#ef4444" />
              <Stat label="Import-andel" value={impShare.toFixed(0)} unit="%" color="#f59e0b" />
            </div>
            <div style={{ fontSize: 8, color: "var(--text-muted)", marginTop: 4 }}>EU-medel 242 g/kWh (EEA 2023) för importerad el.</div>
          </div>
        );
      })}
    </div>
  );
}

function HeatmapPanel({ datasets }: { datasets: Dataset[] }) {
  const fields: { key: keyof V2Row; label: string; color: string; inv?: boolean }[] = [
    { key: "spot", label: "Spot", color: "#f59e0b" },
    { key: "temp", label: "Temp", color: "#22d3ee", inv: true },
    { key: "wind_onshore_mw", label: "Vind", color: "#94a3b8", inv: true },
    { key: "solar_mw", label: "Sol", color: "#facc15", inv: true },
    { key: "production_co2_g_kwh", label: "CO₂", color: "#22c55e" },
    { key: "net_import_mw", label: "Import", color: "#3b82f6" },
  ];
  return (
    <div>
      {datasets.map(ds => (
        <div key={ds.id} style={{ marginBottom: datasets.length > 1 ? 12 : 0 }}>
          {datasets.length > 1 && <div style={{ fontSize: 10, color: ds.color, fontWeight: 600, marginBottom: 2 }}>{ds.label}</div>}
          {fields.map(f => {
            const vals = ds.rows.map(r => r[f.key] as number | null);
            const valid = vals.filter((v): v is number => v !== null);
            if (valid.length === 0) return null;
            const mn = Math.min(...valid), mx = Math.max(...valid);
            return (
              <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 1 }}>
                <span style={{ fontSize: 8, color: "var(--text-muted)", width: 40, textAlign: "right", flexShrink: 0 }}>{f.label}</span>
                <div style={{ display: "flex", flex: 1, height: 12, borderRadius: 2, overflow: "hidden" }}>
                  {vals.map((v, i) => {
                    if (v === null) return <div key={i} style={{ flex: 1, background: "var(--bg-primary)" }} />;
                    let intensity = norm(v, mn, mx); if (f.inv) intensity = 1 - intensity;
                    return <div key={i} style={{ flex: 1, background: f.color, opacity: 0.1 + intensity * 0.9 }} title={`${ds.rows[i].ts.slice(11, 16)} ${r1(v)}`} />;
                  })}
                </div>
                <span style={{ fontSize: 7, color: "var(--text-muted)", width: 32, fontFamily: "var(--font-mono)", flexShrink: 0 }}>ø{r1(valid.reduce((s, v) => s + v, 0) / valid.length)}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function TablePanel({ datasets, mode, priceUnit }: { datasets: Dataset[]; mode: TimeMode; priceUnit: PriceUnit }) {
  const [exp, setExp] = useState(false);
  return (
    <div>
      {datasets.map(ds => {
        const display = !exp && ds.rows.length > 48 ? ds.rows.slice(0, 48) : ds.rows;
        return (
          <div key={ds.id} style={{ marginBottom: datasets.length > 1 ? 16 : 0 }}>
            {datasets.length > 1 && <div style={{ fontSize: 10, color: ds.color, fontWeight: 600, marginBottom: 2 }}>{ds.label}</div>}
            <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto" }}>
              <table className="data-table" style={{ fontSize: "0.7rem", whiteSpace: "nowrap" }}>
                <thead><tr>
                  <th>Tid</th><th style={{ color: "#f59e0b" }}>{spotUnit(priceUnit)}</th><th style={{ color: "#22d3ee" }}>°C</th>
                  <th style={{ color: "#22c55e" }}>CO₂p</th><th style={{ color: "#ef4444" }}>CO₂c</th>
                  <th>Gen</th><th>Import</th><th>Vind</th><th>Sol</th>
                </tr></thead>
                <tbody>{display.map(row => (
                  <tr key={row.ts} style={row.is_forecast ? { opacity: 0.5 } : undefined}>
                    <td style={{ fontFamily: "var(--font-mono)" }}>
                      {(mode === "live" || mode === "day") ? new Date(row.ts).getUTCHours().toString().padStart(2, "0") + ":00" : row.ts.slice(5, 13).replace("T", " ")}
                      {row.is_forecast && <span style={{ color: "#3b82f6", fontSize: 7, marginLeft: 2 }}>prog</span>}
                    </td>
                    <td style={{ color: "#f59e0b", fontWeight: 600 }}>{spotDisplay(row.spot, priceUnit)}</td>
                    <td style={{ color: "#22d3ee" }}>{r1(row.temp)}</td>
                    <td style={{ color: "#22c55e" }}>{r0(row.production_co2_g_kwh)}</td>
                    <td style={{ color: "#ef4444" }}>{r0(row.consumption_co2_g_kwh)}</td>
                    <td>{r0(row.total_gen_mw)}</td>
                    <td style={{ color: (row.net_import_mw ?? 0) > 0 ? "#3b82f6" : "#ef4444" }}>{r0(row.net_import_mw)}</td>
                    <td>{r0((row.wind_onshore_mw ?? 0) + (row.wind_offshore_mw ?? 0))}</td>
                    <td>{r0(row.solar_mw)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {ds.rows.length > 48 && <button onClick={() => setExp(!exp)} style={{ background: "none", border: "1px solid var(--border-color)", borderRadius: 4, padding: "2px 6px", color: "var(--text-muted)", fontSize: 9, cursor: "pointer", marginTop: 3 }}>{exp ? "Visa färre" : `Alla ${ds.rows.length}`}</button>}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function SpotDashboard() {
  const [selectedZones, setSelectedZones] = useState<string[]>(["SE3"]);
  const [mode, setMode] = useState<TimeMode>("live");
  const [date, setDate] = useState(yesterday());
  const [priceUnit, setPriceUnit] = useState<PriceUnit>("sek");
  const [activeSeries, setActiveSeries] = useState<Set<string>>(new Set(["spot"]));
  const [activePanels, setActivePanels] = useState<Set<string>>(new Set());
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Zone: click = toggle on/off (multi-select). Always keep at least one.
  const handleZoneClick = (zone: string) => {
    setSelectedZones(prev => {
      if (prev.includes(zone)) {
        return prev.length > 1 ? prev.filter(z => z !== zone) : prev;
      }
      return [...prev, zone];
    });
  };

  // Fetch
  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const results: Dataset[] = [];
      for (let i = 0; i < selectedZones.length; i++) {
        const zone = selectedZones[i];
        const color = ZC[zone] ?? PALETTE[i % PALETTE.length];
        const label = selectedZones.length === 1 ? `${zone} ${ZN[zone] ?? ""}` : zone;

        if (mode === "live") {
          const res = await fetch(`/api/spot/live?zone=${zone}`);
          if (res.ok) {
            const d: LiveResponse = await res.json();
            results.push({ id: `${zone}_live`, zone, period: "live", label, color, rows: d.rows, genMix: {}, stats: d.stats, evidence: null });
          }
        } else {
          const periodStr = mode === "month" ? date.slice(0, 7) : date;
          const param = mode === "month" ? `month=${periodStr}` : `date=${periodStr}`;
          const res = await fetch(`/api/spot/v2?zone=${zone}&${param}`);
          if (res.ok) {
            const d: V2Response = await res.json();
            results.push({ id: `${zone}_${periodStr}`, zone, period: periodStr, label, color, rows: d.rows, genMix: d.generation_mix, stats: d.stats, evidence: d.evidence });
          }
        }
      }
      if (results.length === 0) setError("Ingen data hittades");
      setDatasets(results);
      setLastRefresh(new Date());
    } catch { setError("Nätverksfel"); }
    finally { setLoading(false); }
  }, [selectedZones, mode, date]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { if (mode !== "live") return; const iv = setInterval(fetchAll, 5 * 60_000); return () => clearInterval(iv); }, [mode, fetchAll]);

  const toggleSeries = (key: string) => setActiveSeries(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const togglePanel = (key: string) => setActivePanels(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const primaryDs = datasets[0];

  // Current hour price for hero
  const nowRow = (() => {
    if (!primaryDs) return null;
    const now = new Date();
    const h = now.getUTCHours();
    const today = now.toISOString().slice(0, 10);
    return primaryDs.rows.find(r => r.ts.startsWith(today) && new Date(r.ts).getUTCHours() === h)
      ?? primaryDs.rows.find(r => new Date(r.ts).getUTCHours() === h);
  })();

  return (
    <div>
      {/* ═══ CONTROLS ═══ */}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>

        {/* Row 1: Mode + Date picker + Price unit */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {(["live", "day", "month"] as TimeMode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: "4px 12px", fontSize: 11, borderRadius: 6, cursor: "pointer", fontWeight: mode === m ? 700 : 400,
              background: mode === m ? "#f59e0b22" : "transparent",
              border: `1px solid ${mode === m ? "#f59e0b" : "var(--border-color)"}`,
              color: mode === m ? "#f59e0b" : "var(--text-muted)",
            }}>{m === "live" ? "🔴 Live" : m === "day" ? "📅 Dag" : "📊 Månad"}</button>
          ))}

          {mode !== "live" && (
            <>
              <div style={{ width: 1, height: 24, background: "var(--border-color)" }} />
              <button onClick={() => {
                const d = new Date(date); d.setDate(d.getDate() - (mode === "month" ? 30 : 1));
                setDate(d.toISOString().slice(0, 10));
              }} style={{ padding: "4px 8px", fontSize: 12, borderRadius: 6, cursor: "pointer", background: "transparent", border: "1px solid var(--border-color)", color: "var(--text-muted)" }}>◀</button>
              <input
                type={mode === "month" ? "month" : "date"}
                value={mode === "month" ? date.slice(0, 7) : date}
                max={todayStr()}
                onChange={e => setDate(mode === "month" ? e.target.value + "-01" : e.target.value)}
                style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: 6, color: "var(--text-primary)", fontSize: 12, padding: "4px 8px", fontFamily: "var(--font-mono)", cursor: "pointer" }}
              />
              <button onClick={() => {
                const d = new Date(date); d.setDate(d.getDate() + (mode === "month" ? 30 : 1));
                if (d <= new Date()) setDate(d.toISOString().slice(0, 10));
              }} style={{ padding: "4px 8px", fontSize: 12, borderRadius: 6, cursor: "pointer", background: "transparent", border: "1px solid var(--border-color)", color: "var(--text-muted)" }}>▶</button>
            </>
          )}

          {mode === "live" && (
            <span style={{ fontSize: 10, color: "#22c55e", display: "flex", alignItems: "center", gap: 3, marginLeft: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
              LIVE
            </span>
          )}

          <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
            <button onClick={() => setPriceUnit("sek")} style={{
              padding: "3px 8px", fontSize: 10, borderRadius: "4px 0 0 4px", cursor: "pointer",
              background: priceUnit === "sek" ? "#f59e0b22" : "transparent",
              border: `1px solid ${priceUnit === "sek" ? "#f59e0b" : "var(--border-color)"}`,
              color: priceUnit === "sek" ? "#f59e0b" : "var(--text-muted)", fontWeight: priceUnit === "sek" ? 700 : 400,
            }}>öre/kWh</button>
            <button onClick={() => setPriceUnit("eur")} style={{
              padding: "3px 8px", fontSize: 10, borderRadius: "0 4px 4px 0", cursor: "pointer",
              background: priceUnit === "eur" ? "#f59e0b22" : "transparent",
              border: `1px solid ${priceUnit === "eur" ? "#f59e0b" : "var(--border-color)"}`,
              color: priceUnit === "eur" ? "#f59e0b" : "var(--text-muted)", fontWeight: priceUnit === "eur" ? 700 : 400,
            }}>€/MWh</button>
          </div>
        </div>

        {/* Row 2: Zone buttons */}
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          {ALL_ZONES.map(z => {
            const sel = selectedZones.includes(z);
            return (
              <button key={z} onClick={() => handleZoneClick(z)} title="Klicka för att lägga till/ta bort" style={{
                padding: "4px 10px", fontSize: 11, borderRadius: 6, cursor: "pointer",
                background: sel ? ZC[z] + "22" : "transparent",
                border: `2px solid ${sel ? ZC[z] : "var(--border-color)"}`,
                color: sel ? ZC[z] : "var(--text-muted)", fontWeight: sel ? 700 : 400,
              }}>{z} <span style={{ fontSize: 8, opacity: 0.7 }}>{ZN[z]}</span></button>
            );
          })}
          {selectedZones.length > 1 && (
            <button onClick={() => setSelectedZones([selectedZones[0]])} style={{
              padding: "3px 8px", fontSize: 9, borderRadius: 4, cursor: "pointer",
              background: "transparent", border: "1px solid var(--border-color)", color: "var(--text-muted)",
            }}>Rensa jämförelse</button>
          )}
        </div>

        {/* Row 3: Series toggles */}
        <div style={{ display: "flex", gap: 3, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>Serier:</span>
          {SERIES_DEFS.map(s => <Toggle key={s.key} on={activeSeries.has(s.key)} label={s.label} color={s.color} onClick={() => toggleSeries(s.key)} />)}
        </div>

        {/* Row 4: Panel toggles */}
        <div style={{ display: "flex", gap: 3, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>Paneler:</span>
          {PANEL_OPTIONS.map(p => (
            <button key={p.key} onClick={() => togglePanel(p.key)} style={{
              padding: "3px 10px", fontSize: 10, borderRadius: 4, cursor: "pointer",
              background: activePanels.has(p.key) ? "var(--bg-card)" : "transparent",
              border: `1px solid ${activePanels.has(p.key) ? "#f59e0b" : "var(--border-color)"}`,
              color: activePanels.has(p.key) ? "var(--text-primary)" : "var(--text-muted)",
            }}>{activePanels.has(p.key) ? "▾" : "▸"} {p.label}</button>
          ))}
        </div>

        {/* Info */}
        <div style={{ display: "flex", gap: 10, fontSize: 9, color: "var(--text-muted)", alignItems: "center" }}>
          {datasets.map(ds => <span key={ds.id} style={{ color: ds.color }}>{ds.label} ({ds.rows.length} pt)</span>)}
          <span>Senast {lastRefresh.toLocaleTimeString("sv-SE")}</span>
          {priceUnit === "sek" && <span style={{ color: "var(--text-muted)" }}>Kurs: {EUR_SEK} SEK/EUR (fast)</span>}
          {datasets[0]?.evidence && <EvidenceBadge manifestId={datasets[0].evidence.dataset_eve_id} rootHash={datasets[0].evidence.root_hash} />}
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}

      {error && <div className="card" style={{ borderColor: "#ef4444" }}><p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p></div>}
      {loading && <div className="card"><p style={{ color: "var(--text-muted)" }}>Laddar…</p></div>}

      {!loading && !error && datasets.length > 0 && (
        <>
          {/* HERO — current price */}
          {primaryDs && (() => {
            const nowSpot = nowRow?.spot;
            const nowCo2 = nowRow?.production_co2_g_kwh;
            const avgSpot = primaryDs.stats?.spot?.avg ?? primaryDs.stats?.today_spot?.avg;
            const diff = nowSpot != null && avgSpot != null ? nowSpot - avgSpot : null;
            const nextH = nowRow ? primaryDs.rows.find(r => new Date(r.ts).getUTCHours() === (new Date(nowRow.ts).getUTCHours() + 1) % 24) : null;
            const tomorrowAvg = primaryDs.stats?.tomorrow_spot?.avg;

            const heroPrice = spotDisplay(nowSpot, priceUnit);
            const heroUnit = spotUnit(priceUnit);
            const heroSecondary = priceUnit === "sek"
              ? (nowSpot != null ? nowSpot.toFixed(1) + " €/MWh" : "")
              : (nowSpot != null ? (nowSpot * EUR_SEK / 10).toFixed(1) + " öre/kWh" : "");

            return (
              <div className="card" style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                {/* Big price */}
                <div style={{ textAlign: "center", minWidth: 140 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{primaryDs.zone} {ZN[primaryDs.zone]} — just nu</div>
                  <div style={{ fontSize: 48, fontWeight: 800, color: "#f59e0b", fontFamily: "var(--font-mono)", lineHeight: 1 }}>
                    {heroPrice}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{heroUnit}</div>
                  {heroSecondary && <div style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{heroSecondary}</div>}
                </div>

                {/* Context stats */}
                <div style={{ flex: 1, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Stat label="Dagmedel" value={spotDisplay(avgSpot, priceUnit)} unit={spotUnit(priceUnit)} color="var(--text-muted)" />
                  {diff != null && <Stat label="vs medel" value={(diff >= 0 ? "+" : "") + spotDisplay(Math.abs(diff) * (diff >= 0 ? 1 : -1), priceUnit)} color={diff > 0 ? "#ef4444" : "#22c55e"} />}
                  <Stat label="Min" value={spotDisplay(primaryDs.stats?.spot?.min ?? primaryDs.stats?.today_spot?.min, priceUnit)} color="#22c55e" />
                  <Stat label="Max" value={spotDisplay(primaryDs.stats?.spot?.max ?? primaryDs.stats?.today_spot?.max, priceUnit)} color="#ef4444" />
                  {nextH?.spot != null && <Stat label="Nästa tim" value={spotDisplay(nextH.spot, priceUnit)} color="#3b82f6" />}
                  {tomorrowAvg != null && <Stat label="Imorgon ø" value={spotDisplay(tomorrowAvg, priceUnit)} color="#3b82f6" />}
                  {nowCo2 != null && <Stat label="CO₂ nu" value={r0(nowCo2)} unit="g/kWh" color="#22c55e" />}
                  <Stat label="Temp" value={r1(primaryDs.stats?.temp?.avg)} unit="°C" color="#22d3ee" />
                </div>
              </div>
            );
          })()}

          {/* Chart */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">{datasets.map(d => d.label).join(" vs ")}</span>
            </div>
            <UnifiedChart datasets={datasets} activeSeries={activeSeries} mode={mode} priceUnit={priceUnit} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4, fontSize: 9 }}>
              {datasets.length > 1 && datasets.map(ds => <span key={ds.id} style={{ color: ds.color, fontWeight: 600 }}>● {ds.label}</span>)}
              {SERIES_DEFS.filter(s => activeSeries.has(s.key) && !s.perDataset).map(s => (
                <span key={s.key} style={{ color: s.color }}>
                  <svg width={12} height={3} style={{ verticalAlign: "middle", marginRight: 2 }}><line x1={0} y1={1.5} x2={12} y2={1.5} stroke={s.color} strokeWidth={1.5} strokeDasharray={s.dash ?? "none"} /></svg>
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          {/* Sub-panels */}
          {activePanels.has("genmix") && <div className="card"><div className="card-header"><span className="card-title">Produktionsmix</span><span style={{ fontSize: 10, color: "var(--text-muted)" }}>ENTSO-E A75</span></div><GenMixPanel datasets={datasets} /></div>}
          {activePanels.has("co2import") && <div className="card"><div className="card-header"><span className="card-title">CO₂-avtryck</span></div><CO2ImportPanel datasets={datasets} /></div>}
          {activePanels.has("heatmap") && <div className="card"><div className="card-header"><span className="card-title">Intensitetskarta</span></div><HeatmapPanel datasets={datasets} /></div>}
          {activePanels.has("table") && <div className="card"><div className="card-header"><span className="card-title">Timdata</span></div><TablePanel datasets={datasets} mode={mode} priceUnit={priceUnit} /></div>}
        </>
      )}

      <div style={{ fontSize: 8, color: "var(--text-muted)", padding: "8px 0", borderTop: "1px solid var(--border-color)", marginTop: 12 }}>
        Källa: ENTSO-E (A44/A75/A11), Open-Meteo/ERA5, EEA 2023. {priceUnit === "sek" && `Kurs ${EUR_SEK} SEK/EUR (fast, ej realtid).`} Korrelation ≠ kausalitet.
      </div>
    </div>
  );
}
