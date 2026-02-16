"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

/* ─── Types ───────────────────────────────────────────── */
interface LegalBasis {
  type: string;
  reference: string;
  url?: string;
  effective_date: string;
}

interface Verification {
  primary_source_checked: boolean;
  checked_by: string;
  last_checked: string;
}

interface TimelineEvent {
  id: string;
  date: string;
  category: string;
  government: string;
  direction: string;
  title: string;
  description: string;
  amount?: string;
  amount_ore_kwh?: number;
  amount_ore_kwh_exmoms?: number;
  total_annual_msek?: number | string;
  annual_cost_msek?: number;
  total_collected_msek?: number;
  cost_msek?: number;
  motivation_claimed?: string;
  warning_svk?: string;
  consequence?: string;
  note?: string;
  source: string;
  verification_status: "verified" | "draft";
  verification_type: "legal" | "system_event";
  legal_basis?: LegalBasis;
  verification?: Verification;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

interface Government {
  id: string;
  label: string;
  years: string;
  pm: string;
}

interface GovSummary {
  government: string;
  label: string;
  actions?: string[];
  actions_up?: string[];
  actions_down?: string[];
  actions_other?: string[];
  net_effect: string;
}

interface DecisionsData {
  _meta: { total_events: number };
  overview: {
    title: string;
    summary: string;
    total_categories: Category[];
  };
  governments: Government[];
  timeline: TimelineEvent[];
  summary_by_government: GovSummary[];
  key_numbers: Record<string, string>;
  sources: { name: string; url: string }[];
}

/* ─── Direction styling ────────────────────────────────── */
const DIR_STYLE: Record<string, { icon: string; color: string; label: string }> = {
  up: { icon: "📈", color: "#ef4444", label: "Höjning" },
  down: { icon: "📉", color: "#22c55e", label: "Sänkning" },
  new: { icon: "🆕", color: "#3b82f6", label: "Nytt" },
  abolished: { icon: "❌", color: "#f59e0b", label: "Avskaffat" },
  change: { icon: "🔄", color: "#a855f7", label: "Ändring" },
  context: { icon: "📌", color: "#6b7280", label: "Kontext" },
};

/* ─── Component ───────────────────────────────────────── */
export default function EnergyDecisionsPage() {
  const [data, setData] = useState<DecisionsData | null>(null);
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const [filterGov, setFilterGov] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [showGovSummary, setShowGovSummary] = useState(false);

  useEffect(() => {
    fetch("/api/witness/energy-decisions")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  const toggleEvent = (id: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (!data) {
    return <div className="card"><p style={{ color: "var(--text-muted)" }}>Laddar…</p></div>;
  }

  const catMap = Object.fromEntries(data.overview.total_categories.map((c) => [c.id, c]));
  const govMap = Object.fromEntries(data.governments.map((g) => [g.id, g]));

  // Only render verified events (EVE Witness Standard v1.1)
  const verified = data.timeline.filter((e) => e.verification_status === "verified");

  const filtered = verified.filter((e) => {
    if (filterCat && e.category !== filterCat) return false;
    if (filterGov && e.government !== filterGov) return false;
    return true;
  });

  const eventCount = data._meta?.total_events || data.timeline.length;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">⚖️ Svensk energipolitik — beslut för beslut</h1>
        <p className="page-subtitle">
          Alla större energipolitiska beslut sedan 1951. Skatter, subventioner, lagändringar och nedläggningar.
          Endast verkställda beslut med juridiskt ikraftträdandedatum.
        </p>
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 6 }}>
          🔎 {eventCount} beslut · 10 kategorier · 10 regeringar · Filtrera nedan
        </div>
      </div>

      {/* Key numbers */}
      <div className="card" style={{ borderLeft: "3px solid #f59e0b" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
        }}>
          {Object.entries(data.key_numbers).map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                {k.replace(/_/g, " ")}
              </div>
              <div style={{ fontSize: "0.9rem", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Category filter */}
      <div className="card">
        <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 8, color: "var(--text-muted)" }}>
          KATEGORIER — klicka för att filtrera
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            onClick={() => setFilterCat(null)}
            style={{
              ...chipStyle,
              background: !filterCat ? "rgba(255,255,255,0.1)" : "transparent",
              borderColor: !filterCat ? "#fff" : "var(--border-color)",
            }}
          >
            Alla ({verified.length})
          </button>
          {data.overview.total_categories.map((c) => {
            const count = verified.filter((e) => e.category === c.id).length;
            if (count === 0) return null;
            return (
              <button
                key={c.id}
                onClick={() => setFilterCat(filterCat === c.id ? null : c.id)}
                style={{
                  ...chipStyle,
                  background: filterCat === c.id ? `${c.color}20` : "transparent",
                  borderColor: filterCat === c.id ? c.color : "var(--border-color)",
                  color: filterCat === c.id ? c.color : "var(--text-secondary)",
                }}
              >
                {c.icon} {c.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Government filter */}
      <div className="card">
        <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 8, color: "var(--text-muted)" }}>
          REGERING — klicka för att filtrera
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            onClick={() => setFilterGov(null)}
            style={{
              ...chipStyle,
              background: !filterGov ? "rgba(255,255,255,0.1)" : "transparent",
              borderColor: !filterGov ? "#fff" : "var(--border-color)",
            }}
          >
            Alla
          </button>
          {data.governments.filter((g) => verified.some((e) => e.government === g.id)).map((g) => {
            const count = verified.filter((e) => e.government === g.id).length;
            return (
              <button
                key={g.id}
                onClick={() => setFilterGov(filterGov === g.id ? null : g.id)}
                style={{
                  ...chipStyle,
                  background: filterGov === g.id ? "rgba(255,255,255,0.1)" : "transparent",
                  borderColor: filterGov === g.id ? "#fff" : "var(--border-color)",
                }}
              >
                {g.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Active filter indicator */}
      {(filterCat || filterGov) && (
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 8, padding: "0 4px" }}>
          Visar {filtered.length} av {verified.length} verifierade beslut
          {filterCat && <span> · Kategori: <strong style={{ color: catMap[filterCat]?.color }}>{catMap[filterCat]?.name}</strong></span>}
          {filterGov && <span> · Regering: <strong>{govMap[filterGov]?.label}</strong></span>}
          <button onClick={() => { setFilterCat(null); setFilterGov(null); }} style={{ marginLeft: 8, background: "none", border: "none", color: "#93c5fd", cursor: "pointer", fontSize: "0.78rem" }}>
            ✕ Rensa filter
          </button>
        </div>
      )}

      {/* Timeline */}
      <div style={{ position: "relative", paddingLeft: 24 }}>
        {/* Vertical line */}
        <div style={{
          position: "absolute", left: 8, top: 0, bottom: 0, width: 2,
          background: "var(--border-color)",
        }} />

        {filtered.map((ev) => {
          const cat = catMap[ev.category];
          const gov = govMap[ev.government];
          const dir = DIR_STYLE[ev.direction] || DIR_STYLE.context;
          const isOpen = expandedEvents.has(ev.id);

          return (
            <div key={ev.id} style={{ position: "relative", marginBottom: 12 }}>
              {/* Timeline dot */}
              <div style={{
                position: "absolute", left: -20, top: 12,
                width: 12, height: 12, borderRadius: "50%",
                background: dir.color, border: "2px solid var(--bg-card)",
              }} />

              <div className="card" style={{
                marginBottom: 0,
                borderLeft: `3px solid ${cat?.color || "#6b7280"}`,
                cursor: "pointer",
              }} onClick={() => toggleEvent(ev.id)}>
                {/* Header row */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: "0.72rem", fontFamily: "var(--font-mono)",
                    color: "var(--text-muted)", minWidth: 60,
                  }}>
                    {ev.date}
                  </span>
                  <span style={{
                    fontSize: "0.7rem", padding: "1px 6px", borderRadius: 3,
                    background: `${dir.color}20`, color: dir.color,
                  }}>
                    {dir.icon} {dir.label}
                  </span>
                  <span style={{
                    fontSize: "0.7rem", padding: "1px 6px", borderRadius: 3,
                    background: `${cat?.color || "#6b7280"}15`,
                    color: cat?.color || "#6b7280",
                  }}>
                    {cat?.icon} {cat?.name || ev.category}
                  </span>
                  <span style={{
                    fontSize: "0.68rem", color: "var(--text-muted)",
                    marginLeft: "auto",
                  }}>
                    {gov?.label || ev.government}
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                    {isOpen ? "▼" : "▶"}
                  </span>
                </div>

                {/* Title + amount */}
                <div style={{ marginTop: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{ev.title}</span>
                  {ev.amount && (
                    <span style={{
                      marginLeft: 10, fontSize: "0.78rem",
                      fontFamily: "var(--font-mono)", color: dir.color,
                      fontWeight: 600,
                    }}>
                      {ev.amount}
                    </span>
                  )}
                </div>

                {/* Expanded details */}
                {isOpen && (
                  <div style={{ marginTop: 10, fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    <p style={{ margin: 0 }}>{ev.description}</p>

                    {ev.motivation_claimed && (
                      <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 4, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-color)" }}>
                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Angiven motivering:</span>{" "}
                        <span>{ev.motivation_claimed}</span>
                      </div>
                    )}

                    {ev.warning_svk && (
                      <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 4, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                        <span style={{ fontSize: "0.72rem", color: "#f59e0b" }}>⚠️ SVK:s varning:</span>{" "}
                        <span style={{ fontSize: "0.8rem" }}>{ev.warning_svk}</span>
                      </div>
                    )}

                    {ev.consequence && (
                      <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 4, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                        <span style={{ fontSize: "0.72rem", color: "#ef4444" }}>Konsekvens:</span>{" "}
                        <span style={{ fontSize: "0.8rem" }}>{ev.consequence}</span>
                      </div>
                    )}

                    {ev.note && (
                      <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 4, background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)" }}>
                        <span style={{ fontSize: "0.8rem" }}>📌 {ev.note}</span>
                      </div>
                    )}

                    {(ev.total_collected_msek || ev.annual_cost_msek || ev.cost_msek || ev.total_annual_msek) && (
                      <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                        {ev.total_collected_msek && (
                          <div style={numBox}>
                            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>TOTAL INBETALT</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{(ev.total_collected_msek / 1000).toFixed(0)} mdr SEK</div>
                          </div>
                        )}
                        {ev.cost_msek && (
                          <div style={numBox}>
                            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>KOSTNAD</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{ev.cost_msek >= 1000 ? `${(ev.cost_msek / 1000).toFixed(1)} mdr SEK` : `${ev.cost_msek} MSEK`}</div>
                          </div>
                        )}
                        {ev.annual_cost_msek && (
                          <div style={numBox}>
                            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>ÅRLIG KOSTNAD</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{ev.annual_cost_msek >= 1000 ? `${(ev.annual_cost_msek / 1000).toFixed(0)} mdr SEK` : `${ev.annual_cost_msek} MSEK`}</div>
                          </div>
                        )}
                        {ev.total_annual_msek && (
                          <div style={numBox}>
                            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>ÅRLIG INTÄKT STATEN</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{ev.total_annual_msek} MSEK</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Legal basis (EVE Witness Standard v1.1) */}
                    {ev.legal_basis && (
                      <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 4, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
                        <span style={{ fontSize: "0.68rem", color: "#22c55e", fontWeight: 600 }}>
                          {ev.verification_type === "system_event" ? "🔧 Systemhändelse" : "⚖️ Juridisk grund"}
                        </span>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 2 }}>
                          {ev.legal_basis.type}: {ev.legal_basis.reference}
                        </div>
                        {ev.legal_basis.url && (
                          <a href={ev.legal_basis.url} target="_blank" rel="noopener" style={{ fontSize: "0.72rem", color: "#93c5fd" }}>
                            → Primärkälla
                          </a>
                        )}
                      </div>
                    )}

                    <div style={{ marginTop: 8, fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      Källa: {ev.source}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Government summary toggle */}
      <div className="card" style={{ marginTop: 20 }}>
        <div
          onClick={() => setShowGovSummary(!showGovSummary)}
          style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
            🏛 Sammanfattning per regering
          </div>
          <span style={{ color: "var(--text-muted)" }}>{showGovSummary ? "▼" : "▶"}</span>
        </div>

        {showGovSummary && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
            {data.summary_by_government.map((gs) => (
              <div key={gs.government} style={{
                padding: "12px 14px",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--border-color)",
                borderRadius: 6,
              }}>
                <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: 8 }}>{gs.label}</div>

                {gs.actions && gs.actions.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 600 }}>Beslut:</span>
                    {gs.actions.map((a, i) => (
                      <div key={i} style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginLeft: 16 }}>• {a}</div>
                    ))}
                  </div>
                )}

                {gs.actions_up && gs.actions_up.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: "0.72rem", color: "#ef4444", fontWeight: 600 }}>📈 Höjningar/nya skatter:</span>
                    {gs.actions_up.map((a, i) => (
                      <div key={i} style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginLeft: 16 }}>• {a}</div>
                    ))}
                  </div>
                )}

                {gs.actions_down && gs.actions_down.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: "0.72rem", color: "#22c55e", fontWeight: 600 }}>📉 Sänkningar/avskaffanden:</span>
                    {gs.actions_down.map((a, i) => (
                      <div key={i} style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginLeft: 16 }}>• {a}</div>
                    ))}
                  </div>
                )}

                {gs.actions_other && gs.actions_other.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: "0.72rem", color: "#0ea5e9", fontWeight: 600 }}>🔄 Övriga beslut:</span>
                    {gs.actions_other.map((a, i) => (
                      <div key={i} style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginLeft: 16 }}>• {a}</div>
                    ))}
                  </div>
                )}

                <div style={{
                  fontSize: "0.82rem", padding: "6px 10px",
                  background: "rgba(59,130,246,0.06)",
                  border: "1px solid rgba(59,130,246,0.15)",
                  borderRadius: 4, marginTop: 4,
                }}>
                  <strong>Nettoeffekt:</strong> {gs.net_effect}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        <Link href="/witness/ringhals-cost" style={navLink}>
          ⚛️ Ringhals-tidslinje — Vad sa de? Vad hände?
        </Link>
        <Link href="/opinion/capacity-layers" style={navLink}>
          ⚡ Flaskhalslösningar — tre nivåer
        </Link>
        <Link href="/witness/price-structure" style={navLink}>
          💰 Flaskhalsintäkter — se datan
        </Link>
      </div>

      {/* Sources */}
      <div style={{
        marginTop: 20, padding: "12px 16px",
        background: "var(--bg-card)", border: "1px solid var(--border-color)",
        borderRadius: 6, fontSize: "0.75rem",
      }}>
        <strong>Källor ({data.sources.length}):</strong>
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

/* ─── Styles ──────────────────────────────────────────── */
const chipStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: "0.75rem",
  border: "1px solid var(--border-color)",
  borderRadius: 20,
  background: "transparent",
  color: "var(--text-secondary)",
  cursor: "pointer",
};

const numBox: React.CSSProperties = {
  padding: "6px 10px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid var(--border-color)",
  borderRadius: 4,
};

const navLink: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 6,
  fontSize: "0.82rem",
  background: "var(--bg-card)",
  border: "1px solid var(--border-color)",
  color: "#93c5fd",
};
