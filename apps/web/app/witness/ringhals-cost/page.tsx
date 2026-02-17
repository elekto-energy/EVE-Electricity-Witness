"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface TimelineEntry {
  date: string;
  type: string;
  actor: string;
  event: string;
  detail: string;
  source?: string;
  source_url?: string;
  fact_check?: string;
}

interface Reactor {
  type: string;
  capacity_mw: number;
  closed: string;
  typical_annual_twh: number;
  lifetime_production_twh: number;
  zone: string;
}

interface AnalysisData {
  _meta: any;
  reactors: {
    ringhals_1: Reactor;
    ringhals_2: Reactor;
    combined_capacity_mw: number;
    combined_typical_annual_twh: number;
  };
  timeline: TimelineEntry[];
  cost_estimate: any;
  sources: { primary: any[]; secondary: any[] };
}

const TYPE_COLORS: Record<string, { bg: string; border: string; label: string; icon: string }> = {
  political_decision: { bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.4)", label: "Politiskt beslut", icon: "🏛" },
  political_statement: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.3)", label: "Politiskt uttalande", icon: "💬" },
  corporate_decision: { bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.4)", label: "Företagsbeslut", icon: "🏢" },
  corporate_statement: { bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.3)", label: "Företagsuttalande", icon: "🏢" },
  corporate_counter: { bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.4)", label: "Motuppgift", icon: "⚠️" },
  authority_warning: { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.5)", label: "Myndighetsvarning", icon: "🚨" },
  closure: { bg: "rgba(107,114,128,0.15)", border: "rgba(107,114,128,0.5)", label: "Stängning", icon: "🔴" },
  system_event: { bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.4)", label: "Systemhändelse", icon: "⚡" },
  outcome: { bg: "rgba(168,85,247,0.10)", border: "rgba(168,85,247,0.4)", label: "Utfall", icon: "📊" },
};

const mdr = (msek: number) => (msek / 1000).toFixed(1);

export default function RinghalsCostPage() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/opinion/analysis/ringhals-cost")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("Kunde inte ladda analysdata"));
  }, []);

  const toggle = (i: number) => {
    setExpandedIdx((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  if (error) return <div style={{ color: "var(--accent-red)", padding: 20 }}>{error}</div>;
  if (!data) return <div style={{ padding: 20, color: "var(--text-muted)" }}>Laddar analysdata…</div>;

  const { reactors, timeline, cost_estimate, sources } = data;

  return (
    <div>
      <Link href="/opinion" style={{ fontSize: "0.85rem" }}>← Tillbaka till Opinion</Link>

      <div className="page-header" style={{ marginTop: 12 }}>
        <h1 className="page-title">⚛️ Ringhals 1 & 2 — Vad sa de? Vad hände?</h1>
        <p className="page-subtitle">
          Witness-tidslinje: dokumenterade uttalanden ställda mot verifierbara utfall.
          Inga värderingar — bara fakta i kronologisk ordning.
        </p>
      </div>

      {/* Witness mode notice */}
      <div style={{
        padding: "12px 16px",
        background: "rgba(59,130,246,0.08)",
        border: "1px solid rgba(59,130,246,0.25)",
        borderRadius: 6,
        marginBottom: 20,
        fontSize: "0.82rem",
        color: "var(--text-secondary)",
        display: "flex",
        gap: 8,
      }}>
        <span>🔍</span>
        <span>
          <strong>Witness Mode:</strong> Denna sida visar citat och fakta utan att tillskriva motiv.
          Varje post har källänk. Läsaren drar sin egen slutsats.
        </span>
      </div>

      {/* Reactor facts */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Stängda reaktorer — fakta</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {(["ringhals_1", "ringhals_2"] as const).map((key) => {
            const r = reactors[key];
            const label = key === "ringhals_1" ? "Ringhals 1" : "Ringhals 2";
            return (
              <div key={key} style={{
                padding: 14,
                background: "var(--bg-card-hover)",
                border: "1px solid var(--border-color)",
                borderRadius: 6,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: "0.9rem" }}>{label}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: "0.82rem", fontFamily: "var(--font-mono)" }}>
                  <span>Typ: <span style={{ color: "var(--text-primary)" }}>{r.type}</span></span>
                  <span>Effekt: <span style={{ color: "var(--accent-blue)" }}>{r.capacity_mw} MW</span></span>
                  <span>Stängd: <span style={{ color: "var(--accent-red)" }}>{r.closed}</span></span>
                  <span>Typisk produktion: <span style={{ color: "var(--accent-green)" }}>{r.typical_annual_twh} TWh/år</span></span>
                  <span>Livstid totalt: <span style={{ color: "var(--text-primary)" }}>{r.lifetime_production_twh} TWh</span></span>
                  <span>Zon: <span style={{ color: "var(--accent-amber)" }}>{r.zone}</span></span>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{
          marginTop: 12,
          padding: "10px 14px",
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 6,
          fontSize: "0.82rem",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-mono)",
        }}>
          Sammanlagd förlorad kapacitet: <strong style={{ color: "var(--accent-red)" }}>{reactors.combined_capacity_mw} MW</strong>
          {" · "}Förlorad årlig produktion: <strong style={{ color: "var(--accent-red)" }}>{reactors.combined_typical_annual_twh} TWh/år</strong>
          {" · "}Zon: <strong style={{ color: "var(--accent-amber)" }}>SE3</strong>
        </div>
      </div>

      {/* TIMELINE */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">📅 Kronologisk tidslinje</span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{timeline.length} händelser</span>
        </div>

        <div style={{ position: "relative", paddingLeft: 24 }}>
          {/* Vertical line */}
          <div style={{
            position: "absolute",
            left: 8,
            top: 0,
            bottom: 0,
            width: 2,
            background: "var(--border-color)",
          }} />

          {timeline.map((entry, i) => {
            const style = TYPE_COLORS[entry.type] || TYPE_COLORS.outcome;
            const isExpanded = expandedIdx.has(i);

            return (
              <div key={i} style={{ position: "relative", marginBottom: 12 }}>
                {/* Dot on timeline */}
                <div style={{
                  position: "absolute",
                  left: -20,
                  top: 14,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: style.border,
                  border: `2px solid ${style.border}`,
                }} />

                <div
                  onClick={() => toggle(i)}
                  style={{
                    padding: "12px 14px",
                    background: style.bg,
                    border: `1px solid ${style.border}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {/* Header row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: "0.95rem" }}>{style.icon}</span>
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      minWidth: 80,
                    }}>{entry.date}</span>
                    <span style={{
                      fontSize: "0.7rem",
                      padding: "1px 6px",
                      borderRadius: 3,
                      background: style.border,
                      color: "#fff",
                      fontWeight: 500,
                    }}>{style.label}</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                      {entry.actor}
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      {isExpanded ? "▼" : "▶"}
                    </span>
                  </div>

                  {/* Event text */}
                  <div style={{ fontWeight: 600, fontSize: "0.88rem", lineHeight: 1.4 }}>
                    {entry.event}
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{
                        fontSize: "0.82rem",
                        color: "var(--text-secondary)",
                        lineHeight: 1.5,
                        padding: "8px 10px",
                        background: "rgba(0,0,0,0.2)",
                        borderRadius: 4,
                        borderLeft: `3px solid ${style.border}`,
                      }}>
                        {entry.detail}
                      </div>

                      {entry.fact_check && (
                        <div style={{
                          marginTop: 8,
                          padding: "8px 10px",
                          background: "rgba(245,158,11,0.1)",
                          border: "1px solid rgba(245,158,11,0.3)",
                          borderRadius: 4,
                          fontSize: "0.78rem",
                          color: "var(--accent-amber)",
                        }}>
                          ⚖️ <strong>Faktagranskning:</strong> {entry.fact_check}
                        </div>
                      )}

                      {entry.source_url && (
                        <div style={{ marginTop: 6, fontSize: "0.75rem" }}>
                          <a href={entry.source_url} target="_blank" rel="noopener" style={{ color: "#93c5fd" }}>
                            🔗 {entry.source || "Källa"}
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* COST ESTIMATE */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">💰 Uppskattad kostnad — 5 år (2020–2024)</span>
        </div>

        {/* Disclaimer */}
        <div style={{
          padding: "10px 14px",
          background: "rgba(245,158,11,0.1)",
          border: "1px solid rgba(245,158,11,0.3)",
          borderRadius: 6,
          marginBottom: 16,
          fontSize: "0.78rem",
          color: "var(--accent-amber)",
        }}>
          ⚠️ <strong>Observera:</strong> {cost_estimate.note}
        </div>

        {/* Lost production */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 6 }}>Förlorad produktion</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <div style={{ padding: 12, background: "var(--bg-card-hover)", borderRadius: 6, textAlign: "center" }}>
              <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--accent-red)", fontFamily: "var(--font-mono)" }}>
                {cost_estimate.lost_production.annual_twh} TWh/år
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Per år</div>
            </div>
            <div style={{ padding: 12, background: "var(--bg-card-hover)", borderRadius: 6, textAlign: "center" }}>
              <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--accent-red)", fontFamily: "var(--font-mono)" }}>
                {cost_estimate.lost_production.period_years} år
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{cost_estimate.lost_production.period}</div>
            </div>
            <div style={{ padding: 12, background: "var(--bg-card-hover)", borderRadius: 6, textAlign: "center" }}>
              <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--accent-red)", fontFamily: "var(--font-mono)" }}>
                {cost_estimate.lost_production.total_lost_twh} TWh
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Total förlorad</div>
            </div>
          </div>
        </div>

        {/* Congestion explosion */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 6 }}>Flaskhalsintäkternas explosion</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ padding: 12, background: "var(--bg-card-hover)", borderRadius: 6 }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4 }}>Baseline 2018-2019 (snitt)</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-green)" }}>
                {mdr(cost_estimate.congestion_revenue_explosion.baseline_2018_2019_avg_msek)} mdr/år
              </div>
            </div>
            <div style={{ padding: 12, background: "var(--bg-card-hover)", borderRadius: 6 }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4 }}>Faktiskt utfall 2020-2024</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-red)" }}>
                {mdr(cost_estimate.congestion_revenue_explosion.actual_2020_2024_total_msek)} mdr totalt
              </div>
            </div>
          </div>
          <div style={{
            marginTop: 8,
            padding: "10px 14px",
            background: "rgba(168,85,247,0.08)",
            border: "1px solid rgba(168,85,247,0.3)",
            borderRadius: 6,
            textAlign: "center",
          }}>
            <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Överskjutande flaskhalsintäkter (utöver baseline): </span>
            <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#a855f7", fontFamily: "var(--font-mono)" }}>
              {mdr(cost_estimate.congestion_revenue_explosion.excess_congestion_msek)} miljarder SEK
            </span>
          </div>
          <div style={{ marginTop: 6, fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>
            {cost_estimate.congestion_revenue_explosion.note}
          </div>
        </div>

        {/* Price impact */}
        <div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 6 }}>Prispåverkan SE3/SE4</div>
          <div style={{
            padding: 12,
            background: "var(--bg-card-hover)",
            borderRadius: 6,
            fontSize: "0.85rem",
            lineHeight: 1.6,
          }}>
            <div>{cost_estimate.price_impact_se3_se4.description}</div>
            <div style={{ color: "var(--accent-amber)", marginTop: 4 }}>{cost_estimate.price_impact_se3_se4.note}</div>
            <div style={{ fontFamily: "var(--font-mono)", marginTop: 4, color: "var(--accent-red)" }}>
              {cost_estimate.price_impact_se3_se4.example_2022}
            </div>
          </div>
        </div>
      </div>

      {/* Link to solutions */}
      <div className="card" style={{ marginBottom: 20 }}>
        <Link href="/opinion/bottleneck-solutions" style={{ textDecoration: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <span style={{ fontSize: "1.5rem" }}>🔧</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>Hur löser vi flaskhalsproblemen?</div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Strategisk placering av vind, sol & mikrovattenkraft i SE3/SE4 →
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* SOURCES */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📚 Källor</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--accent-green)", marginBottom: 8 }}>PRIMÄR</div>
            {sources.primary.map((s: any, i: number) => (
              <div key={i} style={{ marginBottom: 6, fontSize: "0.78rem" }}>
                <a href={s.url} target="_blank" rel="noopener" style={{ color: "#93c5fd" }}>
                  {s.label}
                </a>
                <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>({s.type})</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--accent-amber)", marginBottom: 8 }}>SEKUNDÄR</div>
            {sources.secondary.map((s: any, i: number) => (
              <div key={i} style={{ marginBottom: 6, fontSize: "0.78rem" }}>
                <a href={s.url} target="_blank" rel="noopener" style={{ color: "#93c5fd" }}>
                  {s.label}
                </a>
                <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>({s.type})</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
