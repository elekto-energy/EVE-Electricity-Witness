"use client";

/**
 * Spot V2 Page — Unified Energy Dashboard
 *
 * Single panel: spot price, weather, generation mix, CO₂ intensity.
 * Data from V2 canonical NDJSON via /api/spot/v2.
 *
 * TR3: Every value links to evidence.
 * TR6: Code renders — never invents.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import PriceDriverPanel from "@/components/price/PriceDriverPanel";
import CongestionPanel from "@/components/price/CongestionPanel";

// ─── Types ───────────────────────────────────────────────────────────────────

interface V2Row {
  ts: string;
  zone: string;
  spot: number | null;
  temp: number | null;
  wind_speed: number | null;
  solar_rad: number | null;
  hdd: number | null;
  nuclear_mw: number | null;
  hydro_mw: number | null;
  wind_onshore_mw: number | null;
  wind_offshore_mw: number | null;
  solar_mw: number | null;
  gas_mw: number | null;
  coal_mw: number | null;
  lignite_mw: number | null;
  oil_mw: number | null;
  other_mw: number | null;
  total_gen_mw: number | null;
  net_import_mw: number | null;
  production_co2_g_kwh: number | null;
  consumption_co2_g_kwh: number | null;
}

interface V2Stats {
  spot: { avg: number | null; min: number | null; max: number | null };
  temp: { avg: number | null; min: number | null; max: number | null };
  co2_production: { avg: number | null; min: number | null; max: number | null };
  total_gen: { avg: number | null };
}

interface V2Evidence {
  dataset_eve_id: string;
  root_hash: string;
  methodology_version: string;
  emission_scope: string;
}

interface V2Response {
  zone: string;
  period: string;
  count: number;
  rows: V2Row[];
  stats: V2Stats;
  generation_mix: Record<string, number | null>;
  evidence: V2Evidence | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const V2_ZONES = ["SE1", "SE2", "SE3", "SE4", "FI", "DE_LU", "FR", "NL", "PL", "ES"];

const GEN_COLORS: Record<string, string> = {
  nuclear_mw: "#a78bfa",
  hydro_mw: "#3b82f6",
  wind_onshore_mw: "#22d3ee",
  wind_offshore_mw: "#06b6d4",
  solar_mw: "#facc15",
  gas_mw: "#f97316",
  coal_mw: "#78716c",
  lignite_mw: "#57534e",
  oil_mw: "#44403c",
  other_mw: "#a8a29e",
};

const GEN_LABELS: Record<string, string> = {
  nuclear_mw: "Nuclear",
  hydro_mw: "Hydro",
  wind_onshore_mw: "Wind (on)",
  wind_offshore_mw: "Wind (off)",
  solar_mw: "Solar",
  gas_mw: "Gas",
  coal_mw: "Coal",
  lignite_mw: "Lignite",
  oil_mw: "Oil",
  other_mw: "Other",
};

const GEN_FIELDS = Object.keys(GEN_COLORS);

type ViewMode = "day" | "month";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DATE_MIN = "2020-01-01";

function defaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setDate(d.getDate() + n);
  const s = d.toISOString().slice(0, 10);
  if (s < DATE_MIN) return DATE_MIN;
  const today = todayStr();
  if (s > today) return today;
  return s;
}

/** Is this date "today"? If so, auto-refresh is relevant. */
function isToday(dateStr: string): boolean {
  return dateStr === todayStr();
}

/** Is this date "yesterday"? Day-ahead data is final. */
function isComplete(dateStr: string): boolean {
  return dateStr < todayStr();
}

function defaultMonth(): string {
  return defaultDate().slice(0, 7);
}

const r1 = (n: number | null) => n !== null ? n.toFixed(1) : "–";
const r0 = (n: number | null) => n !== null ? Math.round(n).toString() : "–";

// ─── Stat Card ───────────────────────────────────────────────────────────────

function Stat({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: 8,
      padding: "8px 12px", minWidth: 90, flex: "1 1 90px",
    }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "var(--font-mono)" }}>
        {value}
        {unit && <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 3, color: "var(--text-muted)" }}>{unit}</span>}
      </div>
    </div>
  );
}

// ─── Spot + CO₂ Chart (dual axis SVG) ────────────────────────────────────────

function DualAxisChart({ rows }: { rows: V2Row[] }) {
  if (rows.length < 2) return null;

  const W = 760, H = 220;
  const PAD = { top: 16, right: 56, bottom: 32, left: 56 };
  const pW = W - PAD.left - PAD.right;
  const pH = H - PAD.top - PAD.bottom;

  const spots = rows.map(r => r.spot);
  const co2s = rows.map(r => r.production_co2_g_kwh);
  const temps = rows.map(r => r.temp);

  const validSpots = spots.filter((v): v is number => v !== null);
  const validCo2 = co2s.filter((v): v is number => v !== null);

  const sMin = validSpots.length ? Math.floor(Math.min(...validSpots) / 10) * 10 : 0;
  const sMax = validSpots.length ? Math.ceil(Math.max(...validSpots) / 10) * 10 : 100;
  const cMin = validCo2.length ? Math.floor(Math.min(...validCo2) / 50) * 50 : 0;
  const cMax = validCo2.length ? Math.ceil(Math.max(...validCo2) / 50) * 50 : 500;

  const sRange = sMax - sMin || 1;
  const cRange = cMax - cMin || 1;

  const x = (i: number) => PAD.left + (i / (rows.length - 1)) * pW;
  const yS = (v: number) => PAD.top + pH - ((v - sMin) / sRange) * pH;
  const yC = (v: number) => PAD.top + pH - ((v - cMin) / cRange) * pH;

  const spotPath = spots.map((v, i) => v !== null ? `${i === 0 || spots[i - 1] === null ? "M" : "L"} ${x(i)} ${yS(v)}` : "").filter(Boolean).join(" ");
  const co2Path = co2s.map((v, i) => v !== null ? `${i === 0 || co2s[i - 1] === null ? "M" : "L"} ${x(i)} ${yC(v)}` : "").filter(Boolean).join(" ");
  const tempPath = temps.map((v, i) => v !== null ? `${i === 0 || temps[i - 1] === null ? "M" : "L"} ${x(i)} ${yS(v)}` : "").filter(Boolean).join(" ");

  // X ticks
  const xStep = rows.length <= 25 ? 4 : rows.length <= 168 ? 24 : Math.floor(rows.length / 8);
  const xTicks: number[] = [];
  for (let i = 0; i < rows.length; i += xStep) xTicks.push(i);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map(f => (
        <line key={f} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + pH * (1 - f)} y2={PAD.top + pH * (1 - f)} stroke="var(--border-color)" strokeWidth={0.5} />
      ))}
      {/* Y labels left — spot */}
      {[0, 0.5, 1].map(f => (
        <text key={`yl${f}`} x={PAD.left - 4} y={PAD.top + pH * (1 - f) + 3} textAnchor="end" fontSize={9} fill="var(--accent-amber)" fontFamily="var(--font-mono)">
          {Math.round(sMin + sRange * f)}
        </text>
      ))}
      {/* Y labels right — CO₂ */}
      {[0, 0.5, 1].map(f => (
        <text key={`yr${f}`} x={W - PAD.right + 4} y={PAD.top + pH * (1 - f) + 3} fontSize={9} fill="var(--accent-green)" fontFamily="var(--font-mono)">
          {Math.round(cMin + cRange * f)}
        </text>
      ))}
      {/* X labels */}
      {xTicks.map(i => {
        const row = rows[i];
        if (!row) return null;
        const d = new Date(row.ts);
        const label = rows.length <= 25
          ? d.getUTCHours().toString().padStart(2, "0") + ":00"
          : `${(d.getUTCMonth() + 1).toString().padStart(2, "0")}/${d.getUTCDate().toString().padStart(2, "0")}`;
        return <text key={i} x={x(i)} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--text-muted)" fontFamily="var(--font-mono)">{label}</text>;
      })}
      {/* Lines */}
      <path d={spotPath} fill="none" stroke="var(--accent-amber)" strokeWidth={2} />
      <path d={co2Path} fill="none" stroke="var(--accent-green)" strokeWidth={1.5} opacity={0.8} />
      {/* Axis titles */}
      <text x={10} y={PAD.top + pH / 2} textAnchor="middle" fontSize={9} fill="var(--accent-amber)" transform={`rotate(-90, 10, ${PAD.top + pH / 2})`}>EUR/MWh</text>
      <text x={W - 6} y={PAD.top + pH / 2} textAnchor="middle" fontSize={9} fill="var(--accent-green)" transform={`rotate(90, ${W - 6}, ${PAD.top + pH / 2})`}>gCO₂/kWh</text>
      {/* Legend */}
      <line x1={PAD.left} x2={PAD.left + 16} y1={H - 16} y2={H - 16} stroke="var(--accent-amber)" strokeWidth={2} />
      <text x={PAD.left + 20} y={H - 12} fontSize={9} fill="var(--text-muted)">Spot</text>
      <line x1={PAD.left + 60} x2={PAD.left + 76} y1={H - 16} y2={H - 16} stroke="var(--accent-green)" strokeWidth={1.5} />
      <text x={PAD.left + 80} y={H - 12} fontSize={9} fill="var(--text-muted)">CO₂ prod</text>
    </svg>
  );
}

// ─── Generation Mix Stacked Bar ──────────────────────────────────────────────

function GenMixBar({ mix }: { mix: Record<string, number | null> }) {
  const active = GEN_FIELDS
    .map(f => ({ field: f, value: mix[f] ?? 0 }))
    .filter(e => e.value > 0);

  const total = active.reduce((s, e) => s + e.value, 0);
  if (total <= 0) return <div style={{ color: "var(--text-muted)", fontSize: 12 }}>No generation data</div>;

  return (
    <div>
      {/* Stacked bar */}
      <div style={{ display: "flex", height: 28, borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
        {active.map(e => {
          const pct = (e.value / total) * 100;
          if (pct < 0.5) return null;
          return (
            <div
              key={e.field}
              style={{
                width: `${pct}%`,
                background: GEN_COLORS[e.field],
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: pct > 6 ? 9 : 0, color: "#fff", fontWeight: 600,
              }}
              title={`${GEN_LABELS[e.field]}: ${Math.round(e.value)} MW (${pct.toFixed(1)}%)`}
            >
              {pct > 8 ? `${GEN_LABELS[e.field]} ${pct.toFixed(0)}%` : pct > 5 ? `${pct.toFixed(0)}%` : ""}
            </div>
          );
        })}
      </div>
      {/* Legend row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
        {active.filter(e => (e.value / total) * 100 >= 1).map(e => (
          <div key={e.field} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: GEN_COLORS[e.field] }} />
            <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
              {GEN_LABELS[e.field]} <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{r0(e.value)} MW</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Weather Row ─────────────────────────────────────────────────────────────

function WeatherRow({ stats }: { stats: V2Stats }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Stat label="Temp avg" value={r1(stats.temp.avg)} unit="°C" color="#22d3ee" />
      <Stat label="Temp min" value={r1(stats.temp.min)} unit="°C" color="#3b82f6" />
      <Stat label="Temp max" value={r1(stats.temp.max)} unit="°C" color="#ef4444" />
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SpotV2Page() {
  const [zone, setZone] = useState("SE3");
  const [mode, setMode] = useState<ViewMode>("day");
  const [date, setDate] = useState(defaultDate);
  const [month, setMonth] = useState(defaultMonth);

  const [data, setData] = useState<V2Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const param = mode === "day" ? `date=${date}` : `month=${month}`;
      const res = await fetch(`/api/spot/v2?zone=${zone}&${param}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? "Failed to fetch");
        setData(null);
        return;
      }
      setData(await res.json());
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [zone, mode, date, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh for today: spot data published ~13:00 CET for next day,
  // intraday updates every ~15 min for live generation/flows.
  // Historical dates: no auto-refresh needed.
  useEffect(() => {
    if (mode !== "day" || !isToday(date)) return;
    // For today: refresh every 60s (generation/flows update frequently)
    const iv = setInterval(fetchData, 60_000);
    return () => clearInterval(iv);
  }, [date, mode, fetchData]);

  // For yesterday (day-ahead final): refresh once after 5 min in case data was just ingested
  useEffect(() => {
    if (mode !== "day" || isToday(date)) return;
    const yesterday = addDays(todayStr(), -1);
    if (date !== yesterday) return; // only for yesterday
    const t = setTimeout(fetchData, 300_000);
    return () => clearTimeout(t);
  }, [date, mode, fetchData]);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">⚡ Energy Dashboard</h1>
        <p className="page-subtitle">
          Spot price, weather, generation mix, CO₂ intensity — unified V2 canonical data.
        </p>
      </div>

      {/* Controls */}
      <div className="card">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {/* Zone */}
          <select
            value={zone} onChange={e => setZone(e.target.value)}
            style={{
              padding: "6px 10px", fontSize: "0.85rem", fontFamily: "var(--font-mono)",
              background: "var(--bg-card)", color: "var(--text-primary)",
              border: "1px solid var(--border-color)", borderRadius: 4,
            }}
          >
            {V2_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
          </select>

          <div style={{ width: 1, height: 24, background: "var(--border-color)" }} />

          {/* Mode toggle */}
          <div className="tab-row" style={{ marginBottom: 0, borderBottom: "none" }}>
            <button className={`tab ${mode === "day" ? "active" : ""}`} onClick={() => setMode("day")}>Day</button>
            <button className={`tab ${mode === "month" ? "active" : ""}`} onClick={() => setMode("month")}>Month</button>
          </div>

          <div style={{ width: 1, height: 24, background: "var(--border-color)" }} />

          {/* Date / Month picker with ◄ ► nav */}
          {mode === "day" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={() => setDate(addDays(date, -1))}
                disabled={date <= DATE_MIN}
                style={{
                  background: "none", border: "1px solid var(--border-color)", borderRadius: 4,
                  padding: "4px 8px", fontSize: 14, cursor: "pointer", color: "var(--text-muted)",
                  opacity: date <= DATE_MIN ? 0.3 : 1,
                }}
                title="Föregående dag"
              >◄</button>
              <input type="date" value={date} min={DATE_MIN} max={todayStr()}
                onChange={e => setDate(e.target.value)}
                style={{
                  padding: "5px 8px", fontSize: "0.82rem", fontFamily: "var(--font-mono)",
                  background: "var(--bg-card)", color: "var(--text-primary)",
                  border: "1px solid var(--border-color)", borderRadius: 4,
                }}
              />
              <button
                onClick={() => setDate(addDays(date, 1))}
                disabled={date >= todayStr()}
                style={{
                  background: "none", border: "1px solid var(--border-color)", borderRadius: 4,
                  padding: "4px 8px", fontSize: 14, cursor: "pointer", color: "var(--text-muted)",
                  opacity: date >= todayStr() ? 0.3 : 1,
                }}
                title="Nästa dag"
              >►</button>
              {isToday(date) && (
                <span style={{
                  fontSize: 9, padding: "2px 6px", borderRadius: 3,
                  background: "rgba(34,197,94,0.15)", color: "var(--accent-green)",
                  border: "1px solid rgba(34,197,94,0.3)",
                  animation: "pulse 2s ease-in-out infinite",
                }}>LIVE</span>
              )}
              {isComplete(date) && (
                <span style={{
                  fontSize: 9, padding: "2px 6px", borderRadius: 3,
                  background: "rgba(96,165,250,0.15)", color: "var(--accent-blue)",
                  border: "1px solid rgba(96,165,250,0.3)",
                }}>Komplett</span>
              )}
            </div>
          ) : (
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              style={{
                padding: "5px 8px", fontSize: "0.82rem", fontFamily: "var(--font-mono)",
                background: "var(--bg-card)", color: "var(--text-primary)",
                border: "1px solid var(--border-color)", borderRadius: 4,
              }}
            />
          )}

          {/* Evidence */}
          {data?.evidence && (
            <EvidenceBadge
              manifestId={data.evidence.dataset_eve_id}
              rootHash={data.evidence.root_hash}
            />
          )}
        </div>

        {/* Methodology line */}
        {data?.evidence && (
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
            {data.evidence.methodology_version} · {data.evidence.emission_scope} · {data.count} points
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="card" style={{ borderColor: "var(--accent-red)" }}>
          <p style={{ color: "var(--accent-red)", fontSize: "0.85rem" }}>{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="card"><p style={{ color: "var(--text-muted)" }}>Loading…</p></div>
      )}

      {/* ═══ Content Grid ═══ */}
      {!loading && !error && data && (
        <>
          {/* Stats row */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">{zone} — {data.period}</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Stat label="Spot avg" value={r1(data.stats.spot.avg)} unit="EUR/MWh" color="var(--accent-amber)" />
              <Stat label="Spot min" value={r1(data.stats.spot.min)} unit="" color="var(--accent-green)" />
              <Stat label="Spot max" value={r1(data.stats.spot.max)} unit="" color="var(--accent-red)" />
              <Stat label="CO₂ avg" value={r0(data.stats.co2_production.avg)} unit="g/kWh" color="var(--accent-green)" />
              <Stat label="Gen avg" value={r0(data.stats.total_gen.avg)} unit="MW" color="var(--accent-blue)" />
            </div>
          </div>

          {/* Spot + CO₂ Chart */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Spot Price & CO₂ Intensity</span>
              <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                Dual axis: price (left) · carbon intensity (right)
              </span>
            </div>
            <DualAxisChart rows={data.rows} />
          </div>

          {/* Generation Mix */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Generation Mix</span>
              <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                Average MW over period · ENTSO-E A75
              </span>
            </div>
            <GenMixBar mix={data.generation_mix} />
          </div>

          {/* ═══ Congestion / DDM Panel ═══ */}
          {mode === "day" && (
            <CongestionPanel zone={zone} date={date} />
          )}

          {/* Price Drivers — correlation panel */}
          <PriceDriverPanel rows={data.rows} zone={zone} mode={mode} />

          {/* Weather */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Weather</span>
              <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>ERA5 reanalysis</span>
            </div>
            <WeatherRow stats={data.stats} />
          </div>

          {/* Hourly Table */}
          <HourlyTable rows={data.rows} mode={mode} />
        </>
      )}
    </div>
  );
}

// ─── Hourly Data Table ───────────────────────────────────────────────────────

function HourlyTable({ rows, mode }: { rows: V2Row[]; mode: ViewMode }) {
  const [show, setShow] = useState(false);

  // For month mode, limit initial display
  const displayRows = mode === "month" && !show ? rows.slice(0, 48) : rows;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Hourly Data</span>
        <button
          onClick={() => setShow(!show)}
          style={{
            background: "none", border: "1px solid var(--border-color)", borderRadius: 4,
            padding: "2px 8px", color: "var(--text-muted)", fontSize: 10, cursor: "pointer",
          }}
        >
          {show ? "Collapse" : `Show all ${rows.length} rows`}
        </button>
      </div>
      <div style={{ overflowX: "auto", maxHeight: 500, overflowY: "auto" }}>
        <table className="data-table" style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
          <thead>
            <tr>
              <th>Time (UTC)</th>
              <th style={{ color: "var(--accent-amber)" }}>Spot</th>
              <th style={{ color: "#22d3ee" }}>Temp</th>
              <th style={{ color: "var(--accent-green)" }}>CO₂ prod</th>
              <th style={{ color: "#94a3b8" }}>CO₂ cons</th>
              <th>Gen MW</th>
              <th>Net import</th>
              <th>HDD</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map(row => (
              <tr key={row.ts}>
                <td style={{ fontFamily: "var(--font-mono)" }}>
                  {mode === "day"
                    ? new Date(row.ts).getUTCHours().toString().padStart(2, "0") + ":00"
                    : row.ts.slice(5, 13).replace("T", " ")}
                </td>
                <td style={{ color: "var(--accent-amber)", fontWeight: 600 }}>{r1(row.spot)}</td>
                <td style={{ color: "#22d3ee" }}>{r1(row.temp)}</td>
                <td style={{ color: "var(--accent-green)" }}>{r0(row.production_co2_g_kwh)}</td>
                <td style={{ color: "#94a3b8" }}>{r0(row.consumption_co2_g_kwh)}</td>
                <td>{r0(row.total_gen_mw)}</td>
                <td style={{ color: (row.net_import_mw ?? 0) > 0 ? "var(--accent-blue)" : "var(--accent-red)" }}>
                  {r0(row.net_import_mw)}
                </td>
                <td>{r1(row.hdd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mode === "month" && !show && rows.length > 48 && (
        <div style={{ textAlign: "center", padding: "8px", fontSize: 11, color: "var(--text-muted)" }}>
          Showing 48 of {rows.length} rows. Click "Show all" above.
        </div>
      )}
    </div>
  );
}
