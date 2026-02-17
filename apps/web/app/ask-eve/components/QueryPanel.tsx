"use client";

import { useState } from "react";

const ZONES = [
  "SE1", "SE2", "SE3", "SE4",
  "NO1", "NO2",
  "FI", "DE_LU", "PL",
  "EE", "LV", "LT", "FR", "NL",
];

const ZONE_NAMES: Record<string, string> = {
  SE1: "Luleå", SE2: "Sundsvall", SE3: "Stockholm", SE4: "Malmö",
  NO1: "Oslo", NO2: "Kristiansand", FI: "Finland", DE_LU: "Tyskland",
  PL: "Polen", EE: "Estland", LV: "Lettland", LT: "Litauen", FR: "Frankrike", NL: "Nederländerna",
};

interface QueryPanelProps {
  onSubmit: (params: { zone: string; start: string; end: string; lang: string }) => void;
  loading: boolean;
  onLangChange?: (lang: string) => void;
}

// ─── Period helpers ──────────────────────────────────────────────────────────

function getMonthRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
  return { start, end };
}

function getQuarterRange(year: number, q: number): { start: string; end: string } {
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = q * 3;
  const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const lastDay = new Date(year, endMonth, 0).getDate();
  const end = `${year}-${String(endMonth).padStart(2, "0")}-${lastDay}`;
  return { start, end };
}

function getYearRange(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

const MONTHS_SV = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
const YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026];

// ─── Component ───────────────────────────────────────────────────────────────

export default function QueryPanel({ onSubmit, loading, onLangChange }: QueryPanelProps) {
  const [zone, setZone] = useState("SE3");
  const [lang, setLang] = useState("en");
  const [periodMode, setPeriodMode] = useState<"month" | "quarter" | "year" | "custom">("month");
  const [selectedYear, setSelectedYear] = useState(2024);
  const [selectedMonth, setSelectedMonth] = useState(1);
  const [selectedQuarter, setSelectedQuarter] = useState(1);
  const [customStart, setCustomStart] = useState("2024-01-01");
  const [customEnd, setCustomEnd] = useState("2024-01-31");

  function getPeriod(): { start: string; end: string } {
    if (periodMode === "month") return getMonthRange(selectedYear, selectedMonth);
    if (periodMode === "quarter") return getQuarterRange(selectedYear, selectedQuarter);
    if (periodMode === "year") return getYearRange(selectedYear);
    return { start: customStart, end: customEnd };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { start, end } = getPeriod();
    onSubmit({ zone, start, end, lang });
  }

  const period = getPeriod();

  const labelStyle: React.CSSProperties = {
    fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase",
    letterSpacing: "0.05em", marginBottom: 4, display: "block",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "var(--bg-primary)", border: "1px solid var(--border-color)",
    borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "var(--text-primary)",
    fontFamily: "var(--font-mono)", outline: "none",
  };

  const pillStyle = (active: boolean, color?: string): React.CSSProperties => ({
    padding: "5px 10px", fontSize: 11, borderRadius: 5, cursor: "pointer",
    fontWeight: active ? 700 : 400, border: "1px solid",
    background: active ? `${color ?? "#3b82f6"}15` : "transparent",
    borderColor: active ? `${color ?? "#3b82f6"}60` : "var(--border-color)",
    color: active ? (color ?? "#3b82f6") : "var(--text-muted)",
    transition: "all 0.1s",
  });

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Query</span>
        <span style={{
          fontSize: 9, padding: "2px 6px", borderRadius: 4, fontFamily: "var(--font-mono)",
          background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)",
          color: "#10b981",
        }}>deterministic</span>
      </div>

      {/* Row 1: Zone + Language */}
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 2 }}>
          <label style={labelStyle}>Bidding Zone</label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {ZONES.map(z => (
              <button key={z} type="button" onClick={() => setZone(z)} style={{
                ...pillStyle(zone === z, "#f59e0b"),
                padding: "4px 8px", fontSize: 10,
              }}>
                {z}
                {zone === z && ZONE_NAMES[z] && (
                  <span style={{ fontSize: 8, opacity: 0.7, marginLeft: 3 }}>{ZONE_NAMES[z]}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 0, minWidth: 100 }}>
          <label style={labelStyle}>Language</label>
          <div style={{ display: "flex", gap: 4 }}>
            {(["en", "sv"] as const).map((l) => (
              <button key={l} type="button" onClick={() => { setLang(l); onLangChange?.(l); }} style={{
                ...pillStyle(lang === l), padding: "6px 14px", fontSize: 12,
              }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Period mode */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Period</label>
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {(["month", "quarter", "year", "custom"] as const).map(m => (
            <button key={m} type="button" onClick={() => setPeriodMode(m)} style={pillStyle(periodMode === m)}>
              {m === "month" ? "Månad" : m === "quarter" ? "Kvartal" : m === "year" ? "År" : "Eget intervall"}
            </button>
          ))}
        </div>

        {/* Year selector (shared) */}
        {periodMode !== "custom" && (
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {YEARS.map(y => (
              <button key={y} type="button" onClick={() => setSelectedYear(y)} style={{
                ...pillStyle(selectedYear === y, "#a855f7"),
                padding: "4px 10px", fontSize: 11,
              }}>
                {y}
              </button>
            ))}
          </div>
        )}

        {/* Month grid */}
        {periodMode === "month" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}>
            {MONTHS_SV.map((m, i) => (
              <button key={i} type="button" onClick={() => setSelectedMonth(i + 1)} style={{
                ...pillStyle(selectedMonth === i + 1, "#22d3ee"),
                padding: "6px 0", fontSize: 11, textAlign: "center",
              }}>
                {m}
              </button>
            ))}
          </div>
        )}

        {/* Quarter selector */}
        {periodMode === "quarter" && (
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3, 4].map(q => (
              <button key={q} type="button" onClick={() => setSelectedQuarter(q)} style={{
                ...pillStyle(selectedQuarter === q, "#22d3ee"),
                padding: "8px 20px", fontSize: 13,
              }}>
                Q{q}
              </button>
            ))}
          </div>
        )}

        {/* Custom date range */}
        {periodMode === "custom" && (
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ ...labelStyle, fontSize: 9 }}>From</label>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ ...labelStyle, fontSize: 9 }}>To</label>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={inputStyle} />
            </div>
          </div>
        )}
      </div>

      {/* Period summary */}
      <div style={{
        fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)",
        padding: "6px 10px", background: "var(--bg-primary)", borderRadius: 4, marginBottom: 14,
        display: "flex", justifyContent: "space-between",
      }}>
        <span>{zone} · {period.start} → {period.end}</span>
        <span style={{ color: "var(--text-muted)" }}>{lang.toUpperCase()}</span>
      </div>

      {/* Submit */}
      <button type="submit" disabled={loading} style={{
        width: "100%", padding: "10px 0", borderRadius: 6, border: "none",
        cursor: loading ? "not-allowed" : "pointer",
        background: loading ? "var(--bg-card)" : "#2563eb",
        color: loading ? "var(--text-muted)" : "#fff",
        fontSize: 13, fontWeight: 700, transition: "background 0.15s",
      }}>
        {loading ? "Computing..." : "Generate Evidence Report"}
      </button>
    </form>
  );
}
