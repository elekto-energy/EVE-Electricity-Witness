"use client";

import { useState } from "react";

const ZONES = [
  "SE1", "SE2", "SE3", "SE4",
  "NO1", "NO2",
  "FI", "DE_LU", "PL",
  "EE", "LV", "LT", "FR", "NL",
];

interface QueryPanelProps {
  onSubmit: (params: { zone: string; start: string; end: string; lang: string }) => void;
  loading: boolean;
}

export default function QueryPanel({ onSubmit, loading }: QueryPanelProps) {
  const [zone, setZone] = useState("SE3");
  const [start, setStart] = useState("2024-01-01");
  const [end, setEnd] = useState("2024-01-31");
  const [lang, setLang] = useState("en");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ zone, start, end, lang });
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase",
    letterSpacing: "0.05em", marginBottom: 4, display: "block",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "var(--bg-primary)", border: "1px solid var(--border-color)",
    borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "var(--text-primary)",
    fontFamily: "var(--font-mono)", outline: "none",
  };

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Query</span>
        <span style={{
          fontSize: 9, padding: "2px 6px", borderRadius: 4, fontFamily: "var(--font-mono)",
          background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)",
          color: "#10b981",
        }}>deterministic</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
        {/* Zone */}
        <div>
          <label style={labelStyle}>Bidding Zone</label>
          <select value={zone} onChange={(e) => setZone(e.target.value)} style={inputStyle}>
            {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>

        {/* From */}
        <div>
          <label style={labelStyle}>From</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle} />
        </div>

        {/* To */}
        <div>
          <label style={labelStyle}>To</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle} />
        </div>

        {/* Language */}
        <div>
          <label style={labelStyle}>Report Language</label>
          <div style={{ display: "flex", gap: 4 }}>
            {(["en", "sv"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                style={{
                  flex: 1, padding: "8px 0", fontSize: 13, fontFamily: "var(--font-mono)",
                  borderRadius: 6, cursor: "pointer", fontWeight: lang === l ? 700 : 400,
                  background: lang === l ? "rgba(59, 130, 246, 0.15)" : "var(--bg-primary)",
                  border: `1px solid ${lang === l ? "rgba(59, 130, 246, 0.5)" : "var(--border-color)"}`,
                  color: lang === l ? "#3b82f6" : "var(--text-muted)",
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        style={{
          marginTop: 16, width: "100%", padding: "10px 0",
          background: loading ? "var(--bg-card)" : "#2563eb",
          color: loading ? "var(--text-muted)" : "#fff",
          border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
          transition: "background 0.15s",
        }}
      >
        {loading ? "Computing..." : "Generate Evidence Report"}
      </button>
    </form>
  );
}
