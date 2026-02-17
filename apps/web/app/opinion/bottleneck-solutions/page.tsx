"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface SolutionOption {
  subtype: string;
  name: string;
  potential_mw?: string;
  potential_twh_yr?: string;
  capacity_factor_pct?: number;
  pros: string[];
  cons: string[];
  projects_planned?: string[];
  regulatory_note?: string;
  duration_hours?: string;
  note?: string;
}

interface Strategy {
  id: string;
  title: string;
  type: string;
  rationale: string;
  options: SolutionOption[];
}

interface ScenarioComponent {
  type: string;
  capacity_mw: number;
  annual_twh: number | null;
  firm_pct: number | null;
}

interface AnalysisData {
  _meta: any;
  problem_definition: any;
  solution_strategies: Strategy[];
  combined_scenario: {
    title: string;
    target: string;
    components: ScenarioComponent[];
    total_annual_twh: number;
    key_challenge: string;
    system_services_gap: string;
    estimated_investment_msek: string;
    note: string;
  };
  key_insight: { text: string; regulatory_reference: string };
  sources: any[];
}

const TYPE_ICONS: Record<string, string> = {
  wind: "💨",
  solar: "☀️",
  hydro_micro: "💧",
  storage: "🔋",
};

const TYPE_COLORS: Record<string, string> = {
  wind: "rgba(59,130,246,0.3)",
  solar: "rgba(245,158,11,0.3)",
  hydro_micro: "rgba(16,185,129,0.3)",
  storage: "rgba(168,85,247,0.3)",
};

export default function BottleneckSolutionsPage() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedStrategy, setExpandedStrategy] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/opinion/analysis/bottleneck-solutions")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("Kunde inte ladda analysdata"));
  }, []);

  const toggleStrategy = (id: string) => {
    setExpandedStrategy((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (error) return <div style={{ color: "var(--accent-red)", padding: 20 }}>{error}</div>;
  if (!data) return <div style={{ padding: 20, color: "var(--text-muted)" }}>Laddar analysdata…</div>;

  const { problem_definition, solution_strategies, combined_scenario, key_insight, sources } = data;

  return (
    <div>
      <Link href="/opinion" style={{ fontSize: "0.85rem" }}>← Tillbaka till Opinion</Link>

      <div className="page-header" style={{ marginTop: 12 }}>
        <h1 className="page-title">🔧 Lösa flaskhalsproblemen — strategisk energiplacering</h1>
        <p className="page-subtitle">
          Hur kan vind, sol och mikrovattenkraft i SE3/SE4 minska systemstressen?
          En evidensbaserad genomgång av alternativ.
        </p>
      </div>

      {/* Witness mode */}
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
          <strong>Witness Mode:</strong> Visar tekniska alternativ med för- och nackdelar.
          Plattformen rekommenderar inte — den visar data.
        </span>
      </div>

      {/* PROBLEM DEFINITION */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">🔴 Problemet: {problem_definition.title}</span>
        </div>
        <p style={{ fontSize: "0.85rem", lineHeight: 1.6, color: "var(--text-secondary)", marginBottom: 12 }}>
          {problem_definition.summary}
        </p>

        {/* Bottlenecks */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          {problem_definition.bottlenecks.map((b: any) => (
            <div key={b.id} style={{
              padding: 12,
              background: "rgba(239,68,68,0.06)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 6,
            }}>
              <div style={{ fontWeight: 600, fontSize: "0.88rem", marginBottom: 4 }}>{b.name}</div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 4 }}>{b.description}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}>
                Kapacitet: <span style={{ color: "var(--accent-blue)" }}>{b.capacity_mw?.toLocaleString()} MW</span>
                {b.congestion_2020_msek && (
                  <span> · Flaskhals 2020: <span style={{ color: "var(--accent-red)" }}>{(b.congestion_2020_msek / 1000).toFixed(1)} mdr</span></span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Lost nuclear summary */}
        <div style={{
          padding: "10px 14px",
          background: "rgba(107,114,128,0.1)",
          border: "1px solid rgba(107,114,128,0.3)",
          borderRadius: 6,
          fontSize: "0.82rem",
          color: "var(--text-secondary)",
        }}>
          <strong>Stängd kärnkraft i SE3/SE4:</strong> {problem_definition.lost_nuclear_in_se3.total_lost_se3_se4_mw.toLocaleString()} MW
          {" · "}{problem_definition.lost_nuclear_in_se3.total_lost_se3_se4_twh_yr} TWh/år
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
            {problem_definition.lost_nuclear_in_se3.closed_reactors}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--accent-amber)", marginTop: 2 }}>
            {problem_definition.lost_nuclear_in_se3.note}
          </div>
        </div>
      </div>

      {/* SOLUTION STRATEGIES */}
      {solution_strategies.map((strategy) => {
        const isOpen = expandedStrategy.has(strategy.id);
        const icon = TYPE_ICONS[strategy.type] || "⚡";
        const borderColor = TYPE_COLORS[strategy.type] || "var(--border-color)";

        return (
          <div key={strategy.id} className="card" style={{ marginBottom: 16, borderColor }}>
            <div
              onClick={() => toggleStrategy(strategy.id)}
              style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
            >
              <span style={{ fontSize: "1.3rem" }}>{icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{strategy.title}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{strategy.rationale.slice(0, 120)}…</div>
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{isOpen ? "▼" : "▶"}</span>
            </div>

            {isOpen && (
              <div style={{ marginTop: 16 }}>
                <div style={{
                  padding: "10px 14px",
                  background: "rgba(0,0,0,0.15)",
                  borderRadius: 6,
                  fontSize: "0.82rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                  marginBottom: 16,
                }}>
                  {strategy.rationale}
                </div>

                {strategy.options.map((opt, oi) => (
                  <div key={oi} style={{
                    padding: 14,
                    background: "var(--bg-card-hover)",
                    border: "1px solid var(--border-color)",
                    borderRadius: 6,
                    marginBottom: 12,
                  }}>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem", marginBottom: 6 }}>{opt.name}</div>

                    {/* Stats row */}
                    <div style={{ display: "flex", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
                      {opt.potential_mw && (
                        <div style={{ fontSize: "0.78rem", fontFamily: "var(--font-mono)" }}>
                          Potential: <span style={{ color: "var(--accent-blue)" }}>{opt.potential_mw} MW</span>
                        </div>
                      )}
                      {opt.potential_twh_yr && (
                        <div style={{ fontSize: "0.78rem", fontFamily: "var(--font-mono)" }}>
                          Produktion: <span style={{ color: "var(--accent-green)" }}>{opt.potential_twh_yr} TWh/år</span>
                        </div>
                      )}
                      {opt.capacity_factor_pct && (
                        <div style={{ fontSize: "0.78rem", fontFamily: "var(--font-mono)" }}>
                          Kapacitetsfaktor: <span style={{ color: "var(--accent-amber)" }}>{opt.capacity_factor_pct}%</span>
                        </div>
                      )}
                    </div>

                    {/* Pros / Cons grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--accent-green)", marginBottom: 4 }}>FÖRDELAR</div>
                        {opt.pros.map((p, pi) => (
                          <div key={pi} style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 3, paddingLeft: 10, position: "relative" }}>
                            <span style={{ position: "absolute", left: 0, color: "var(--accent-green)" }}>+</span>
                            {p}
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--accent-red)", marginBottom: 4 }}>NACKDELAR</div>
                        {opt.cons.map((c, ci) => (
                          <div key={ci} style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 3, paddingLeft: 10, position: "relative" }}>
                            <span style={{ position: "absolute", left: 0, color: "var(--accent-red)" }}>−</span>
                            {c}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Planned projects */}
                    {opt.projects_planned && (
                      <div style={{ marginTop: 10, fontSize: "0.78rem" }}>
                        <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>Planerade projekt: </span>
                        {opt.projects_planned.map((p, pi) => (
                          <span key={pi}>
                            <span style={{ color: "var(--accent-blue)" }}>{p}</span>
                            {pi < opt.projects_planned!.length - 1 && " · "}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Regulatory note */}
                    {opt.regulatory_note && (
                      <div style={{
                        marginTop: 8,
                        padding: "8px 10px",
                        background: "rgba(245,158,11,0.08)",
                        border: "1px solid rgba(245,158,11,0.2)",
                        borderRadius: 4,
                        fontSize: "0.75rem",
                        color: "var(--accent-amber)",
                      }}>
                        ⚠️ {opt.regulatory_note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* COMBINED SCENARIO */}
      <div className="card" style={{ marginBottom: 20, borderColor: "rgba(168,85,247,0.3)" }}>
        <div className="card-header">
          <span className="card-title">🎯 {combined_scenario.title}</span>
        </div>
        <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 12 }}>
          Mål: {combined_scenario.target}
        </div>

        {/* Components table */}
        <table className="data-table">
          <thead>
            <tr>
              <th>Typ</th>
              <th style={{ textAlign: "right" }}>Kapacitet (MW)</th>
              <th style={{ textAlign: "right" }}>Produktion (TWh/år)</th>
              <th style={{ textAlign: "right" }}>Firmness (%)</th>
            </tr>
          </thead>
          <tbody>
            {combined_scenario.components.map((c, i) => (
              <tr key={i}>
                <td style={{ fontFamily: "inherit", fontWeight: 500 }}>{c.type}</td>
                <td style={{ textAlign: "right", color: "var(--accent-blue)" }}>{c.capacity_mw.toLocaleString()}</td>
                <td style={{ textAlign: "right", color: "var(--accent-green)" }}>
                  {c.annual_twh !== null ? c.annual_twh.toFixed(1) : "—"}
                </td>
                <td style={{ textAlign: "right", color: "var(--accent-amber)" }}>
                  {c.firm_pct !== null ? `${c.firm_pct}%` : "—"}
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid var(--border-color)" }}>
              <td style={{ fontWeight: 700 }}>TOTALT</td>
              <td style={{ textAlign: "right", fontWeight: 700, color: "var(--accent-blue)" }}>
                {combined_scenario.components.reduce((s, c) => s + c.capacity_mw, 0).toLocaleString()}
              </td>
              <td style={{ textAlign: "right", fontWeight: 700, color: "var(--accent-green)" }}>
                {combined_scenario.total_annual_twh.toFixed(1)}
              </td>
              <td style={{ textAlign: "right", color: "var(--text-muted)" }}>mix</td>
            </tr>
          </tbody>
        </table>

        {/* Challenges */}
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{
            padding: "10px 14px",
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
            borderRadius: 6,
            fontSize: "0.78rem",
            color: "var(--accent-amber)",
          }}>
            <strong>Utmaning — firmness:</strong> {combined_scenario.key_challenge}
          </div>
          <div style={{
            padding: "10px 14px",
            background: "rgba(239,68,68,0.06)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 6,
            fontSize: "0.78rem",
            color: "var(--text-secondary)",
          }}>
            <strong>Systemtjänster:</strong> {combined_scenario.system_services_gap}
          </div>
        </div>

        {/* Investment */}
        <div style={{
          marginTop: 12,
          padding: "12px 16px",
          background: "rgba(168,85,247,0.08)",
          border: "1px solid rgba(168,85,247,0.3)",
          borderRadius: 6,
          textAlign: "center",
        }}>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 4 }}>Uppskattad investering</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#a855f7", fontFamily: "var(--font-mono)" }}>
            {combined_scenario.estimated_investment_msek.replace("-", "–")} MSEK
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
            {combined_scenario.note}
          </div>
        </div>
      </div>

      {/* KEY INSIGHT */}
      <div className="card" style={{ marginBottom: 20, borderColor: "rgba(16,185,129,0.4)" }}>
        <div className="card-header">
          <span className="card-title">💡 Nyckelinsikt</span>
        </div>
        <div style={{ fontSize: "0.88rem", lineHeight: 1.6, color: "var(--text-primary)" }}>
          {key_insight.text}
        </div>
        <div style={{
          marginTop: 8,
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          padding: "6px 10px",
          background: "rgba(0,0,0,0.2)",
          borderRadius: 4,
        }}>
          {key_insight.regulatory_reference}
        </div>
      </div>

      {/* Link back */}
      <div className="card" style={{ marginBottom: 20 }}>
        <Link href="/opinion/ringhals-cost" style={{ textDecoration: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <span style={{ fontSize: "1.5rem" }}>⚛️</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>Ringhals 1 & 2 — Vad sa de? Vad hände?</div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Witness-tidslinje med politiska uttalanden vs verifierade utfall →
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
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {sources.map((s: any, i: number) => (
            <div key={i} style={{ fontSize: "0.78rem" }}>
              <a href={s.url} target="_blank" rel="noopener" style={{ color: "#93c5fd" }}>
                {s.label}
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
