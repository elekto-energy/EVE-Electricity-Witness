/**
 * SimulatePanel.tsx — 15-min Effekttariff-Simulering
 *
 * Frikopplad komponent. Får all kontext via props från SpotDashboard.
 * Anropar POST /api/simulate med panelens zone/period/datum.
 *
 * Sparar inputs i localStorage.
 * Visar totaler, breakdown, peak, och "Så räknar vi"-expander.
 */

"use client";

import { useState, useEffect, useCallback } from "react";

const FONT = "var(--font-mono, 'JetBrains Mono', monospace)";

const C = {
  bg:     "var(--bg-primary)",
  card:   "var(--bg-card)",
  card2:  "var(--bg-primary)",
  border: "var(--border-color)",
  text:   "var(--text-primary)",
  muted:  "var(--text-muted)",
  dim:    "var(--text-ghost)",
  spot:   "#f59e0b",
  green:  "#22c55e",
  blue:   "#3b82f6",
  red:    "#ef4444",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface SimulateResult {
  totalCost: number;
  spotCost: number;
  energyFee: number;
  effectFee: number;
  fixedFee: number;
  tax: number;
  vat: number;
  totalKwh: number;
  peakKw: number;
  avgCostOrePerKwh: number;
  monthlyPeaks: Array<{
    month: string;
    peakKw: number;
    topHours: number[];
  }>;
  meta: {
    zone: string;
    period: string;
    start: string;
    end: string;
    annualKwh: number;
    fuse: string;
    tariff: string;
    resolution: string;
    spotPoints: number;
    eurSek: number;
    tariffVerified: boolean;
  };
}

interface SimulatePanelProps {
  zone: string;
  period: "day" | "week" | "month" | "year";
  start: string;   // YYYY-MM-DD
  end: string;     // YYYY-MM-DD
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(`eve-sim-${key}`);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

function saveStored(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(`eve-sim-${key}`, JSON.stringify(value)); } catch {}
}

// ─── Fuse options ─────────────────────────────────────────────────────────────

const FUSES = ["16A", "20A", "25A", "35A"];
const TARIFFS = [
  { id: "vattenfall_stockholm", label: "Vattenfall Stockholm" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function SimulatePanel({ zone, period, start, end }: SimulatePanelProps) {
  const [annualKwh, setAnnualKwh] = useState(() => loadStored("annualKwh", 20000));
  const [fuse, setFuse] = useState(() => loadStored("fuse", "20A"));
  const [tariff, setTariff] = useState(() => loadStored("tariff", "vattenfall_stockholm"));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulateResult | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [showMath, setShowMath] = useState(false);

  // Persist inputs
  useEffect(() => { saveStored("annualKwh", annualKwh); }, [annualKwh]);
  useEffect(() => { saveStored("fuse", fuse); }, [fuse]);
  useEffect(() => { saveStored("tariff", tariff); }, [tariff]);

  const runSimulation = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const payload = {
        zone,
        period,
        start,
        end,
        annual_kwh: annualKwh,
        fuse,
        tariff,
        has_heat_pump: true,
        has_ev: false,
      };

      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data: SimulateResult = await res.json();
      setResult(data);
      setLastRun(new Date().toLocaleTimeString("sv-SE"));
    } catch (e: any) {
      setError(e.message || "Simulation failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [zone, period, start, end, annualKwh, fuse, tariff]);

  const isFullPeriod = period === "month" || period === "year";

  return (
    <div style={{ padding: "12px 0" }}>

      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        marginBottom: 12, paddingBottom: 8,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
          ⚡ Simulera din elkostnad
        </span>
        <span style={{
          fontSize: 8, padding: "2px 6px", borderRadius: 3,
          background: "rgba(59,130,246,0.12)", color: C.blue,
          border: "1px solid rgba(59,130,246,0.25)", fontWeight: 600,
        }}>BETA</span>
        {!isFullPeriod && (
          <span style={{ fontSize: 9, color: C.muted, marginLeft: "auto" }}>
            Välj Månad/År för full simulering
          </span>
        )}
      </div>

      {/* ── Layout: inputs left, results right ── */}
      <div className="sim-layout" style={{
        display: "flex", gap: 16, flexWrap: "wrap",
      }}>

        {/* ── Inputs ── */}
        <div className="sim-inputs" style={{
          flex: "0 0 220px", minWidth: 180,
          display: "flex", flexDirection: "column", gap: 10,
        }}>

          {/* Annual kWh */}
          <div>
            <label style={{ fontSize: 9, color: C.muted, display: "block", marginBottom: 3 }}>
              Årsförbrukning (kWh/år)
            </label>
            <input
              type="number"
              value={annualKwh}
              onChange={e => setAnnualKwh(Number(e.target.value) || 0)}
              min={100} max={500000} step={1000}
              style={{
                width: "100%", padding: "6px 8px", fontSize: 13,
                fontFamily: FONT, fontWeight: 600,
                background: C.card2, color: C.text,
                border: `1px solid ${C.border}`, borderRadius: 5,
              }}
            />
          </div>

          {/* Fuse */}
          <div>
            <label style={{ fontSize: 9, color: C.muted, display: "block", marginBottom: 3 }}>
              Säkring
            </label>
            <select
              value={fuse}
              onChange={e => setFuse(e.target.value)}
              style={{
                width: "100%", padding: "6px 8px", fontSize: 12,
                fontFamily: FONT,
                background: C.card2, color: C.text,
                border: `1px solid ${C.border}`, borderRadius: 5,
              }}
            >
              {FUSES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          {/* Tariff */}
          <div>
            <label style={{ fontSize: 9, color: C.muted, display: "block", marginBottom: 3 }}>
              Nätbolag
            </label>
            <select
              value={tariff}
              onChange={e => setTariff(e.target.value)}
              style={{
                width: "100%", padding: "6px 8px", fontSize: 12,
                fontFamily: FONT,
                background: C.card2, color: C.text,
                border: `1px solid ${C.border}`, borderRadius: 5,
              }}
            >
              {TARIFFS.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Run button */}
          <button
            onClick={runSimulation}
            disabled={loading}
            style={{
              padding: "8px 16px", fontSize: 12, fontWeight: 700,
              fontFamily: FONT,
              background: loading ? C.muted : C.blue,
              color: "#fff", border: "none", borderRadius: 6,
              cursor: loading ? "wait" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {loading ? "Beräknar…" : "Kör simulering"}
          </button>

          {lastRun && (
            <div style={{ fontSize: 8, color: C.dim }}>
              Senast beräknad: {lastRun}
            </div>
          )}

          {error && (
            <div style={{ fontSize: 10, color: C.red, padding: "4px 0" }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Results ── */}
        {result && (
          <div className="sim-results" style={{
            flex: "1 1 300px", minWidth: 260,
          }}>

            {/* ── Totaler ── */}
            <div style={{
              display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap",
            }}>
              {/* Total cost */}
              <div style={{
                flex: "1 1 120px", padding: "10px 12px",
                background: "rgba(59,130,246,0.06)",
                border: "1px solid rgba(59,130,246,0.2)",
                borderRadius: 8,
              }}>
                <div style={{ fontSize: 9, color: C.blue, marginBottom: 3 }}>
                  Total kostnad
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.blue, fontFamily: FONT }}>
                  {Math.round(result.totalCost).toLocaleString("sv-SE")}
                  <span style={{ fontSize: 11, color: C.muted, marginLeft: 4 }}>kr</span>
                </div>
                <div style={{ fontSize: 9, color: C.muted }}>
                  {period === "day" ? "denna dag" : period === "week" ? "denna vecka" : period === "month" ? "denna månad" : "detta år"}
                </div>
              </div>

              {/* Avg cost */}
              <div style={{
                flex: "1 1 120px", padding: "10px 12px",
                background: "rgba(245,158,11,0.06)",
                border: "1px solid rgba(245,158,11,0.2)",
                borderRadius: 8,
              }}>
                <div style={{ fontSize: 9, color: C.spot, marginBottom: 3 }}>
                  Snittpris inkl allt
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.spot, fontFamily: FONT }}>
                  {result.avgCostOrePerKwh.toFixed(1)}
                  <span style={{ fontSize: 11, color: C.muted, marginLeft: 4 }}>öre/kWh</span>
                </div>
                <div style={{ fontSize: 9, color: C.muted }}>
                  spot + nät + skatt + effekt + moms
                </div>
              </div>

              {/* Peak */}
              <div style={{
                flex: "1 1 100px", padding: "10px 12px",
                background: isFullPeriod && result.effectFee > 0
                  ? "rgba(239,68,68,0.06)" : `${C.card2}`,
                border: `1px solid ${isFullPeriod && result.effectFee > 0
                  ? "rgba(239,68,68,0.2)" : C.border}`,
                borderRadius: 8,
              }}>
                <div style={{
                  fontSize: 9, marginBottom: 3,
                  color: isFullPeriod ? C.red : C.muted,
                }}>
                  Effekttopp
                </div>
                <div style={{
                  fontSize: 24, fontWeight: 800, fontFamily: FONT,
                  color: isFullPeriod ? C.red : C.text,
                }}>
                  {result.peakKw.toFixed(1)}
                  <span style={{ fontSize: 11, color: C.muted, marginLeft: 4 }}>kW</span>
                </div>
                <div style={{ fontSize: 9, color: C.muted }}>
                  {isFullPeriod
                    ? `${Math.round(result.effectFee)} kr effektavgift`
                    : "Debiteras ej (månadsbaserat)"
                  }
                </div>
              </div>
            </div>

            {/* ── Breakdown ── */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 6, marginBottom: 10,
            }}>
              {[
                { label: "Spot", value: result.spotCost, color: C.spot },
                { label: "Nät (rörlig)", value: result.energyFee, color: C.text },
                { label: "Nät (fast)", value: result.fixedFee, color: C.text },
                { label: "Effektavgift", value: result.effectFee, color: isFullPeriod ? C.red : C.dim },
                { label: "Energiskatt", value: result.tax, color: C.text },
                { label: "Moms", value: result.vat, color: C.text },
              ].map(item => (
                <div key={item.label} style={{
                  padding: "6px 8px", background: C.card2,
                  border: `1px solid ${C.border}`, borderRadius: 6,
                }}>
                  <div style={{ fontSize: 8, color: C.muted, marginBottom: 2 }}>
                    {item.label}
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 700, fontFamily: FONT,
                    color: item.color,
                  }}>
                    {Math.round(item.value).toLocaleString("sv-SE")}
                    <span style={{ fontSize: 8, color: C.dim, marginLeft: 2 }}>kr</span>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Total kWh ── */}
            <div style={{
              fontSize: 9, color: C.muted, marginBottom: 8,
              display: "flex", gap: 12,
            }}>
              <span>Förbrukning: <strong style={{ color: C.text }}>{result.totalKwh.toFixed(0)} kWh</strong></span>
              <span>Spotpunkter: <strong style={{ color: C.text }}>{result.meta.spotPoints}</strong></span>
              <span>Resolution: <strong style={{ color: C.text }}>{result.meta.resolution}</strong></span>
            </div>

            {/* ── Monthly peaks (year only) ── */}
            {period === "year" && result.monthlyPeaks.length > 1 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>
                  Effekttoppar per månad (kW)
                </div>
                <div style={{
                  display: "flex", gap: 3, alignItems: "flex-end", height: 50,
                }}>
                  {result.monthlyPeaks
                    .sort((a, b) => a.month.localeCompare(b.month))
                    .map(mp => {
                      const maxP = Math.max(...result.monthlyPeaks.map(m => m.peakKw));
                      const h = maxP > 0 ? (mp.peakKw / maxP) * 40 + 6 : 6;
                      const monthNum = parseInt(mp.month.split("-")[1]);
                      const labels = ["", "J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
                      return (
                        <div key={mp.month} style={{
                          flex: 1, display: "flex", flexDirection: "column",
                          alignItems: "center", gap: 2,
                        }}>
                          <div style={{
                            width: "100%", height: h,
                            background: mp.peakKw > 5 ? "rgba(239,68,68,0.5)" :
                              mp.peakKw > 3 ? "rgba(245,158,11,0.5)" : "rgba(34,197,94,0.4)",
                            borderRadius: 2,
                          }} title={`${mp.month}: ${mp.peakKw.toFixed(2)} kW`} />
                          <div style={{ fontSize: 7, color: C.dim }}>{labels[monthNum]}</div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* ── Tariff warning ── */}
            {!result.meta.tariffVerified && (
              <div style={{
                fontSize: 8, color: C.spot, padding: "4px 8px",
                background: "rgba(245,158,11,0.06)",
                border: "1px solid rgba(245,158,11,0.15)",
                borderRadius: 4, marginBottom: 8,
              }}>
                ⚠ Tariffvärden ej verifierade mot prisblad — beräkningen är indikativ.
              </div>
            )}

            {/* ── Så räknar vi ── */}
            <button
              onClick={() => setShowMath(v => !v)}
              style={{
                background: "none", border: "none",
                color: C.muted, fontSize: 9, cursor: "pointer",
                fontFamily: FONT, padding: "4px 0",
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <span style={{
                transform: showMath ? "rotate(180deg)" : "none",
                transition: "transform 0.2s", display: "inline-block",
              }}>▾</span>
              {showMath ? "Dölj beräkning" : "Så räknar vi"}
            </button>

            {showMath && result.meta && (
              <div style={{
                marginTop: 6, padding: "8px 10px",
                background: C.card2, border: `1px solid ${C.border}`,
                borderRadius: 6, fontSize: 9, color: C.muted,
                fontFamily: FONT, lineHeight: 1.6,
              }}>
                <div><strong style={{ color: C.text }}>Zon:</strong> {result.meta.zone}</div>
                <div><strong style={{ color: C.text }}>Period:</strong> {result.meta.start} → {result.meta.end} ({result.meta.period})</div>
                <div><strong style={{ color: C.text }}>Årsförbrukning:</strong> {result.meta.annualKwh.toLocaleString("sv-SE")} kWh</div>
                <div><strong style={{ color: C.text }}>Säkring:</strong> {result.meta.fuse}</div>
                <div><strong style={{ color: C.text }}>Tariff:</strong> {result.meta.tariff} {result.meta.tariffVerified ? "✓" : "(ej verifierad)"}</div>
                <div><strong style={{ color: C.text }}>Resolution:</strong> {result.meta.resolution}</div>
                <div><strong style={{ color: C.text }}>Spotpunkter:</strong> {result.meta.spotPoints}</div>
                <div><strong style={{ color: C.text }}>EUR/SEK:</strong> {result.meta.eurSek}</div>

                {result.monthlyPeaks.length > 0 && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
                    <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>Effekttoppar:</div>
                    {result.monthlyPeaks
                      .sort((a, b) => a.month.localeCompare(b.month))
                      .map(mp => (
                        <div key={mp.month}>
                          {mp.month}: top3 avg = {mp.peakKw.toFixed(2)} kW
                          → {isFullPeriod ? `${(mp.peakKw * 75).toFixed(0)} kr` : "(ej debiterad)"}
                        </div>
                      ))}
                  </div>
                )}

                <div style={{ marginTop: 6, borderTop: `1px solid ${C.border}`, paddingTop: 6, color: C.dim }}>
                  Beräkning: spot×load + nätavgift + energiskatt + effektavgift + fast + moms 25%
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Empty state ── */}
        {!result && !loading && !error && (
          <div className="sim-results" style={{
            flex: "1 1 300px", minWidth: 260,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "40px 20px",
            color: C.dim, fontSize: 12,
            border: `1px dashed ${C.border}`, borderRadius: 8,
          }}>
            Tryck "Kör simulering" för att beräkna din elkostnad
          </div>
        )}
      </div>
    </div>
  );
}
