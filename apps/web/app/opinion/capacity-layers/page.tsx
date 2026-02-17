"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

/* ─── Types ───────────────────────────────────────────── */
interface Measure {
  id: string;
  name: string;
  description: string;
  effect_mw?: string;
  typical_size_kwh?: number;
  effect_kw_per_unit?: number;
  scenario_1000_units?: any;
  scenario_100_homes?: any;
  scenario_1000_homes?: any;
  cost_sek_per_unit?: string;
  investment_msek?: string;
  timeline?: string;
  capacity_factor_pct?: number;
  annual_twh?: string;
  pros?: string[];
  cons?: string[];
  projects?: string[];
  note?: string;
  requirements?: string[];
  payback_years?: string;
  source?: string;
}

interface Layer {
  id: string;
  level: number;
  name: string;
  icon: string;
  color: string;
  tagline: string;
  timeline: string;
  effect_scale: string;
  influence: string;
  description: string;
  current_status: { summary: string; source_url: string };
  measures: Measure[];
  perspective: string;
}

interface CalcExample {
  id: string;
  title: string;
  inputs: Record<string, any>;
  results: Record<string, any>;
  verdict: string;
}

interface CapacityData {
  model: { title: string; principle: string; analogy: string };
  layers: Layer[];
  combined_perspective: {
    title: string;
    table: { level: string; effect: string; timeline: string; cost: string; you_can: string }[];
    key_insight: string;
    what_this_platform_does: string;
  };
  calculation_examples: CalcExample[];
  sources: { name: string; url: string }[];
}

/* ─── Component ───────────────────────────────────────── */
export default function CapacityLayersPage() {
  const [data, setData] = useState<CapacityData | null>(null);
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set(["local"]));
  const [expandedMeasures, setExpandedMeasures] = useState<Set<string>>(new Set());
  const [expandedCalcs, setExpandedCalcs] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/opinion/analysis/capacity-layers")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  const toggleLayer = (id: string) => {
    setExpandedLayers((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleMeasure = (id: string) => {
    setExpandedMeasures((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleCalc = (id: string) => {
    setExpandedCalcs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (!data) {
    return <div className="card"><p style={{ color: "var(--text-muted)" }}>Laddar…</p></div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">⚡ Flaskhalslösningar — Central till Lokal</h1>
        <p className="page-subtitle">{data.model.principle}</p>
      </div>

      {/* Model explanation */}
      <div className="card" style={{ borderLeft: "3px solid #3b82f6" }}>
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          <strong>Modell:</strong> {data.model.analogy}
        </div>
      </div>

      {/* Overview table */}
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 10, fontSize: "0.9rem" }}>
          {data.combined_perspective.title}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                {["Nivå", "Effekt", "Tidshorisont", "Kostnad", "Du kan"].map((h) => (
                  <th key={h} style={{
                    textAlign: "left", padding: "8px 10px", fontWeight: 600,
                    color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.combined_perspective.table.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{row.level}</td>
                  <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)" }}>{row.effect}</td>
                  <td style={{ padding: "8px 10px" }}>{row.timeline}</td>
                  <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)" }}>{row.cost}</td>
                  <td style={{ padding: "8px 10px", color: "var(--text-secondary)" }}>{row.you_can}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Three layers */}
      {data.layers.map((layer) => {
        const isExpanded = expandedLayers.has(layer.id);
        return (
          <div key={layer.id} className="card" style={{
            borderLeft: `3px solid ${layer.color}`,
            marginBottom: 12,
          }}>
            {/* Layer header */}
            <div
              onClick={() => toggleLayer(layer.id)}
              style={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: "1.5rem" }}>{layer.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: "1rem" }}>
                  Nivå {layer.level}: {layer.name}
                  <span style={{
                    fontSize: "0.78rem", fontWeight: 400,
                    color: "var(--text-muted)", marginLeft: 8,
                  }}>
                    — {layer.tagline}
                  </span>
                </div>
                <div style={{
                  display: "flex", gap: 16, marginTop: 4,
                  fontSize: "0.75rem", color: "var(--text-muted)",
                }}>
                  <span>⏱ {layer.timeline}</span>
                  <span>📊 {layer.effect_scale}</span>
                  <span>🎯 {layer.influence}</span>
                </div>
              </div>
              <span style={{ color: "var(--text-muted)", fontSize: "1.2rem" }}>
                {isExpanded ? "▼" : "▶"}
              </span>
            </div>

            {isExpanded && (
              <div style={{ marginTop: 14 }}>
                {/* Description */}
                <div style={{
                  fontSize: "0.85rem", color: "var(--text-secondary)",
                  lineHeight: 1.5, marginBottom: 10,
                }}>
                  {layer.description}
                </div>

                {/* Current status */}
                <div style={{
                  padding: "8px 12px", marginBottom: 12,
                  background: `${layer.color}15`,
                  border: `1px solid ${layer.color}30`,
                  borderRadius: 4, fontSize: "0.8rem",
                }}>
                  <strong>Status:</strong> {layer.current_status.summary}
                  {layer.current_status.source_url && (
                    <a href={layer.current_status.source_url} target="_blank" rel="noopener"
                      style={{ marginLeft: 8, color: "#93c5fd", fontSize: "0.75rem" }}>
                      🔗 Källa
                    </a>
                  )}
                </div>

                {/* Measures */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {layer.measures.map((m) => {
                    const mExpanded = expandedMeasures.has(m.id);
                    return (
                      <div key={m.id} style={{
                        padding: "10px 12px",
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-color)",
                        borderRadius: 6,
                      }}>
                        <div
                          onClick={() => toggleMeasure(m.id)}
                          style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                        >
                          <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                            {m.name}
                            {m.effect_mw && (
                              <span style={{
                                marginLeft: 8, fontSize: "0.72rem",
                                padding: "2px 8px", borderRadius: 10,
                                background: `${layer.color}25`, color: layer.color,
                                fontFamily: "var(--font-mono)",
                              }}>
                                {m.effect_mw}
                              </span>
                            )}
                          </div>
                          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                            {mExpanded ? "▼" : "▶"}
                          </span>
                        </div>

                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 4 }}>
                          {m.description}
                        </div>

                        {mExpanded && (
                          <div style={{ marginTop: 10 }}>
                            {/* Key stats */}
                            <div style={{
                              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                              gap: 8, marginBottom: 10,
                            }}>
                              {m.investment_msek && (
                                <div style={statBox}>
                                  <div style={statLabel}>Investering</div>
                                  <div style={statValue}>{m.investment_msek} MSEK</div>
                                </div>
                              )}
                              {m.cost_sek_per_unit && (
                                <div style={statBox}>
                                  <div style={statLabel}>Kostnad/enhet</div>
                                  <div style={statValue}>{m.cost_sek_per_unit}</div>
                                </div>
                              )}
                              {m.timeline && (
                                <div style={statBox}>
                                  <div style={statLabel}>Tidshorisont</div>
                                  <div style={statValue}>{m.timeline}</div>
                                </div>
                              )}
                              {m.capacity_factor_pct && (
                                <div style={statBox}>
                                  <div style={statLabel}>Kapacitetsfaktor</div>
                                  <div style={statValue}>{m.capacity_factor_pct}%</div>
                                </div>
                              )}
                              {m.annual_twh && (
                                <div style={statBox}>
                                  <div style={statLabel}>Årlig produktion</div>
                                  <div style={statValue}>{m.annual_twh} TWh</div>
                                </div>
                              )}
                              {m.payback_years && (
                                <div style={statBox}>
                                  <div style={statLabel}>Återbetalningstid</div>
                                  <div style={statValue}>{m.payback_years}</div>
                                </div>
                              )}
                            </div>

                            {/* Scenario boxes */}
                            {m.scenario_1000_units && (
                              <ScenarioBox
                                title="Scenario: 1 000 enheter"
                                data={m.scenario_1000_units}
                                color={layer.color}
                              />
                            )}
                            {m.scenario_100_homes && (
                              <ScenarioBox
                                title="Scenario: 100 hushåll"
                                data={m.scenario_100_homes}
                                color={layer.color}
                              />
                            )}
                            {m.scenario_1000_homes && (
                              <ScenarioBox
                                title="Scenario: 1 000 hushåll"
                                data={m.scenario_1000_homes}
                                color={layer.color}
                              />
                            )}

                            {/* Pros / Cons */}
                            {(m.pros || m.cons) && (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                {m.pros && (
                                  <div style={{ fontSize: "0.78rem" }}>
                                    <div style={{ fontWeight: 600, color: "#22c55e", marginBottom: 4 }}>✅ Fördelar</div>
                                    {m.pros.map((p, i) => (
                                      <div key={i} style={{ color: "var(--text-secondary)", marginBottom: 2 }}>• {p}</div>
                                    ))}
                                  </div>
                                )}
                                {m.cons && (
                                  <div style={{ fontSize: "0.78rem" }}>
                                    <div style={{ fontWeight: 600, color: "#ef4444", marginBottom: 4 }}>⚠️ Nackdelar</div>
                                    {m.cons.map((c, i) => (
                                      <div key={i} style={{ color: "var(--text-secondary)", marginBottom: 2 }}>• {c}</div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Requirements */}
                            {m.requirements && (
                              <div style={{ fontSize: "0.78rem", marginBottom: 8 }}>
                                <strong>Krav:</strong>{" "}
                                <span style={{ color: "var(--text-secondary)" }}>
                                  {m.requirements.join(" · ")}
                                </span>
                              </div>
                            )}

                            {/* Note */}
                            {m.note && (
                              <div style={{
                                padding: "6px 10px", borderRadius: 4,
                                background: "rgba(245,158,11,0.08)",
                                border: "1px solid rgba(245,158,11,0.2)",
                                fontSize: "0.78rem", color: "#f59e0b",
                              }}>
                                ⚠️ {m.note}
                              </div>
                            )}

                            {/* Projects */}
                            {m.projects && m.projects.length > 0 && (
                              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 6 }}>
                                Planerade projekt: {m.projects.join(", ")}
                              </div>
                            )}

                            {m.source && (
                              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 4 }}>
                                Källa: {m.source}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Perspective */}
                <div style={{
                  marginTop: 12, padding: "10px 14px",
                  background: "rgba(59,130,246,0.06)",
                  border: "1px solid rgba(59,130,246,0.2)",
                  borderRadius: 6, fontSize: "0.82rem",
                  lineHeight: 1.5,
                }}>
                  🔍 <strong>Perspektiv:</strong>{" "}
                  <span style={{ color: "var(--text-secondary)" }}>{layer.perspective}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Calculation examples */}
      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 12 }}>
          🧮 Beräkningsexempel — realistiska siffror
        </h2>

        {data.calculation_examples.map((calc) => {
          const isOpen = expandedCalcs.has(calc.id);
          return (
            <div key={calc.id} className="card" style={{ marginBottom: 8 }}>
              <div
                onClick={() => toggleCalc(calc.id)}
                style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{calc.title}</div>
                <span style={{ color: "var(--text-muted)" }}>{isOpen ? "▼" : "▶"}</span>
              </div>

              {isOpen && (
                <div style={{ marginTop: 10 }}>
                  {/* Inputs */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 6 }}>
                      INDATA
                    </div>
                    <div style={{
                      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                      gap: 6,
                    }}>
                      {Object.entries(calc.inputs).map(([k, v]) => (
                        <div key={k} style={statBox}>
                          <div style={statLabel}>{formatKey(k)}</div>
                          <div style={statValue}>{String(v)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Results */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 6 }}>
                      RESULTAT
                    </div>
                    <div style={{
                      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: 6,
                    }}>
                      {Object.entries(calc.results).map(([k, v]) => (
                        <div key={k} style={{
                          ...statBox,
                          background: "rgba(16,185,129,0.06)",
                          borderColor: "rgba(16,185,129,0.2)",
                        }}>
                          <div style={statLabel}>{formatKey(k)}</div>
                          <div style={{ ...statValue, color: "#22c55e" }}>{String(v)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Verdict */}
                  <div style={{
                    padding: "8px 12px",
                    background: "rgba(59,130,246,0.06)",
                    border: "1px solid rgba(59,130,246,0.2)",
                    borderRadius: 4, fontSize: "0.82rem",
                  }}>
                    💡 <strong>Slutsats:</strong>{" "}
                    <span style={{ color: "var(--text-secondary)" }}>{calc.verdict}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Key insight */}
      <div className="card" style={{
        borderLeft: "3px solid #f59e0b",
        background: "rgba(245,158,11,0.04)",
        marginTop: 20,
      }}>
        <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 6 }}>
          🔑 Nyckelinsikt
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {data.combined_perspective.key_insight}
        </div>
      </div>

      {/* What this platform does */}
      <div className="card" style={{
        borderLeft: "3px solid #22c55e",
        background: "rgba(16,185,129,0.04)",
      }}>
        <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 6 }}>
          📊 Vad ELEKTO gör
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {data.combined_perspective.what_this_platform_does}
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        <Link href="/opinion/bottleneck-solutions" style={{
          padding: "8px 16px", borderRadius: 6, fontSize: "0.82rem",
          background: "var(--bg-card)", border: "1px solid var(--border-color)",
          color: "#93c5fd",
        }}>
          ← Detaljerade strategier per energislag
        </Link>
        <Link href="/witness/ringhals-cost" style={{
          padding: "8px 16px", borderRadius: 6, fontSize: "0.82rem",
          background: "var(--bg-card)", border: "1px solid var(--border-color)",
          color: "#93c5fd",
        }}>
          📜 Ringhals-tidslinje: Vad sa de? Vad hände?
        </Link>
        <Link href="/witness/price-structure" style={{
          padding: "8px 16px", borderRadius: 6, fontSize: "0.82rem",
          background: "var(--bg-card)", border: "1px solid var(--border-color)",
          color: "#93c5fd",
        }}>
          💰 Flaskhalsintäkter — se datan
        </Link>
      </div>

      {/* Sources */}
      <div style={{
        marginTop: 20, padding: "12px 16px",
        background: "var(--bg-card)", border: "1px solid var(--border-color)",
        borderRadius: 6, fontSize: "0.75rem",
      }}>
        <strong>Källor:</strong>
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
          {data.sources.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener"
              style={{ color: "#93c5fd" }}>
              {s.name}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────── */
function ScenarioBox({ title, data, color }: { title: string; data: any; color: string }) {
  return (
    <div style={{
      padding: "8px 12px", marginBottom: 8,
      background: `${color}08`, border: `1px solid ${color}25`,
      borderRadius: 6,
    }}>
      <div style={{ fontWeight: 600, fontSize: "0.78rem", marginBottom: 6 }}>{title}</div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        gap: 6,
      }}>
        {Object.entries(data).filter(([k]) => k !== "note").map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
              {formatKey(k)}
            </div>
            <div style={{ fontSize: "0.82rem", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
              {String(v)}
            </div>
          </div>
        ))}
      </div>
      {data.note && (
        <div style={{
          marginTop: 6, fontSize: "0.75rem", color: "#f59e0b",
          padding: "4px 8px", borderRadius: 3,
          background: "rgba(245,158,11,0.08)",
        }}>
          ⚠️ {data.note}
        </div>
      )}
    </div>
  );
}

function formatKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace("Pct", "%")
    .replace("Mw", "MW")
    .replace("Mwh", "MWh")
    .replace("Kwh", "kWh")
    .replace("Kw", "kW")
    .replace("Sek", "SEK")
    .replace("Twh", "TWh");
}

const statBox: React.CSSProperties = {
  padding: "6px 10px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid var(--border-color)",
  borderRadius: 4,
};

const statLabel: React.CSSProperties = {
  fontSize: "0.68rem",
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const statValue: React.CSSProperties = {
  fontSize: "0.85rem",
  fontWeight: 600,
  fontFamily: "var(--font-mono)",
};
