"use client";

/**
 * CongestionPanel — EVE DDM Flaskhals & Prisstruktur
 *
 * Shows real-time congestion decomposition: zonpris = systempris + flaskhals.
 * All values in kr/kWh (Swedish consumer perspective).
 * Flaskhals area pulses when > 10% of zone price.
 *
 * Data: /api/energy/ddm?zone=XX&date=YYYY-MM-DD
 *
 * Layer: 🟢 CMD + 🔵 DDM
 * TR1: No source, no number.
 * TR6: Code renders — never invents.
 */

import { useEffect, useState, useMemo, useCallback, useRef } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface RentEntry {
  border: string;
  total_eur: number;
  avg_delta: number;
}

interface DDMData {
  zone: string;
  period: string;
  count: number;
  resolution: string;
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

// ─── Constants ───────────────────────────────────────────────────────────────

const EUR_SEK = 11.2; // TODO: fetch from ECB
const toKr = (eur_mwh: number) => +((eur_mwh * EUR_SEK) / 1000).toFixed(2);

const NET_KR = 0.32; // Nätavgift öre→kr (32 öre)
const TAX_KR = 0.36; // Energiskatt (36 öre)

// ─── Styles ──────────────────────────────────────────────────────────────────

const pulseKeyframes = `
@keyframes congestion-pulse {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.55; }
}
@keyframes congestion-glow {
  0%, 100% { filter: drop-shadow(0 0 2px rgba(239,68,68,0)); }
  50% { filter: drop-shadow(0 0 6px rgba(239,68,68,0.4)); }
}
`;

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  zone: string;
  date: string; // YYYY-MM-DD
}

export default function CongestionPanel({ zone, date }: Props) {
  const [data, setData] = useState<DDMData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [mode, setMode] = useState<"hour" | "day">("hour");

  // Fetch DDM data
  const fetchDDM = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/energy/ddm?zone=${zone}&date=${date}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? "Kunde inte hämta DDM-data");
        setData(null);
        return;
      }
      const d: DDMData = await res.json();
      setData(d);
      // Default to peak hour
      if (d.rows.length > 0) {
        const peakIdx = d.rows.reduce((best, r, i) =>
          r.zonpris_eur_mwh > (d.rows[best]?.zonpris_eur_mwh ?? 0) ? i : best, 0);
        setSelectedIdx(peakIdx);
      }
    } catch {
      setError("Nätverksfel");
    } finally {
      setLoading(false);
    }
  }, [zone, date]);

  useEffect(() => { fetchDDM(); }, [fetchDDM]);

  // Auto-refresh every 5 min for today's date
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (date !== today) return;
    const iv = setInterval(fetchDDM, 300_000); // 5 min
    return () => clearInterval(iv);
  }, [date, fetchDDM]);

  // Computed values
  const rows = data?.rows ?? [];
  const idx = selectedIdx ?? 0;
  const current = rows[idx];
  const summary = data?.daily_summary;

  const src = useMemo(() => {
    if (!current || !summary) return null;
    const r = mode === "day"
      ? { z: summary.avg_zonpris ?? 0, s: summary.avg_systempris ?? 0 }
      : { z: current.zonpris_eur_mwh, s: current.systempris_eur_mwh ?? 0 };

    const spKr = toKr(r.z);
    const syKr = toKr(r.s);
    const fkKr = +(spKr - syKr).toFixed(2);
    const subKr = spKr + NET_KR + TAX_KR;
    const moKr = +(subKr * 0.25).toFixed(2);
    const totKr = +(subKr + moKr).toFixed(2);
    const stKr = +(TAX_KR + moKr).toFixed(2);
    const stPct = totKr > 0 ? +((stKr / totKr) * 100).toFixed(0) : 0;
    const sh = r.z > 0 ? +((Math.max(0, r.z - r.s) / r.z) * 100).toFixed(1) : 0;
    const f = +(r.z - r.s).toFixed(2);

    // Import/Export for current hour
    const imp = mode === "day" ? (summary.total_import_mw ?? 0) / rows.length
      : Object.values(current.flows_in).reduce((s, v) => s + v, 0);
    const exp = mode === "day" ? (summary.total_export_mw ?? 0) / rows.length
      : Object.values(current.flows_out).reduce((s, v) => s + v, 0);

    return { z: r.z, s: r.s, f, spKr, syKr, fkKr, subKr, moKr, totKr, stKr, stPct, sh, imp, exp, net: imp - exp };
  }, [current, summary, mode, rows.length]);

  // Should pulse? (flaskhals > 10% of zon)
  const shouldPulse = src ? src.sh > 10 : false;

  if (loading && !data) {
    return <div className="card"><p style={{ color: "var(--text-muted)" }}>Laddar DDM-data…</p></div>;
  }
  if (error) {
    return (
      <div className="card" style={{ borderColor: "var(--accent-red)" }}>
        <p style={{ color: "var(--accent-red)", fontSize: "0.85rem" }}>{error}</p>
      </div>
    );
  }
  if (!data || !src || !current) return null;

  const ts = new Date(current.ts);
  const hourLabel = `${ts.getUTCHours().toString().padStart(2, "0")}:00`;

  return (
    <>
      <style>{pulseKeyframes}</style>

      <div className="card">
        {/* Header */}
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              ⚡ Prisstruktur & Prisdifferenser
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                padding: "1px 6px", borderRadius: 3, fontSize: 9, fontWeight: 600,
                background: "rgba(34,197,94,0.12)", color: "var(--accent-green)",
                border: "1px solid rgba(34,197,94,0.25)",
              }}>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--accent-green)" }} />CMD
              </span>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                padding: "1px 6px", borderRadius: 3, fontSize: 9, fontWeight: 600,
                background: "rgba(96,165,250,0.12)", color: "var(--accent-blue)",
                border: "1px solid rgba(96,165,250,0.25)",
              }}>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--accent-blue)" }} />DDM
              </span>
            </span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => setMode("hour")}
              style={{
                background: mode === "hour" ? "var(--bg-elevated)" : "transparent",
                color: mode === "hour" ? "var(--text-primary)" : "var(--text-muted)",
                border: `1px solid ${mode === "hour" ? "var(--accent-amber)" : "var(--border-color)"}`,
                borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer",
                fontFamily: "var(--font-mono)",
              }}
            >
              {hourLabel}
            </button>
            <button
              onClick={() => setMode("day")}
              style={{
                background: mode === "day" ? "var(--bg-elevated)" : "transparent",
                color: mode === "day" ? "var(--text-primary)" : "var(--text-muted)",
                border: `1px solid ${mode === "day" ? "var(--accent-amber)" : "var(--border-color)"}`,
                borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer",
                fontFamily: "var(--font-mono)",
              }}
            >
              Dagsmedel
            </button>
          </div>
        </div>

        {/* Warnings */}
        {data.warnings.length > 0 && (
          <div style={{ padding: "4px 8px", background: "rgba(245,158,11,0.1)", borderRadius: 4, marginBottom: 8, fontSize: 10, color: "var(--accent-amber)" }}>
            ⚠ {data.warnings[0]}
          </div>
        )}

        {/* ═══ TOP BAR — Liggande stapel kr/kWh ═══ */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {mode === "hour" ? `${hourLabel} UTC` : "Dagsmedel"} — kr/kWh
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
              {src.totKr.toFixed(2)} kr/kWh
            </span>
          </div>

          {/* Stacked bar */}
          <div style={{ display: "flex", height: 36, borderRadius: 6, overflow: "hidden", position: "relative" }}>
            {/* Systempris */}
            <div style={{
              width: `${(src.syKr / src.totKr) * 100}%`, background: "#2563eb",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, color: "#fff", fontWeight: 600,
            }}>
              {src.syKr / src.totKr > 0.08 && `Sys ${src.syKr.toFixed(2)}`}
            </div>

            {/* Flaskhals — STRIPED + PULSE */}
            {src.fkKr > 0 && (
              <div style={{
                width: `${(src.fkKr / src.totKr) * 100}%`,
                background: "repeating-linear-gradient(45deg, #2563eb, #2563eb 3px, rgba(239,68,68,0.5) 3px, rgba(239,68,68,0.5) 6px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, color: "#fff", fontWeight: 600,
                animation: shouldPulse ? "congestion-pulse 2s ease-in-out infinite" : "none",
                borderLeft: "1px dashed rgba(255,255,255,0.3)",
              }}>
                {src.fkKr / src.totKr > 0.06 && `ΔP ${src.fkKr.toFixed(2)}`}
              </div>
            )}

            {/* Export-rabatt */}
            {src.fkKr < 0 && (
              <div style={{
                width: `${(Math.abs(src.fkKr) / src.totKr) * 100}%`,
                background: "repeating-linear-gradient(-45deg, #2563eb, #2563eb 3px, rgba(96,165,250,0.4) 3px, rgba(96,165,250,0.4) 6px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, color: "#fff", fontWeight: 600,
              }}>
                Exp
              </div>
            )}

            {/* Nät */}
            <div style={{
              width: `${(NET_KR / src.totKr) * 100}%`, background: "#7c3aed",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, color: "#fff", fontWeight: 600,
            }}>
              {NET_KR / src.totKr > 0.06 && `Nät ${NET_KR.toFixed(2)}`}
            </div>

            {/* Skatt */}
            <div style={{
              width: `${(TAX_KR / src.totKr) * 100}%`, background: "#ef4444",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, color: "#fff", fontWeight: 600,
            }}>
              {TAX_KR / src.totKr > 0.06 && `Skatt ${TAX_KR.toFixed(2)}`}
            </div>

            {/* Moms */}
            <div style={{
              width: `${(src.moKr / src.totKr) * 100}%`, background: "#f59e0b",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, color: "#fff", fontWeight: 600,
            }}>
              {src.moKr / src.totKr > 0.06 && `Moms ${src.moKr.toFixed(2)}`}
            </div>
          </div>

          {/* Legend row */}
          <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 9, color: "var(--text-muted)", flexWrap: "wrap" }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#2563eb", borderRadius: 1, marginRight: 3 }} />Systempris</span>
            <span style={{ position: "relative" }}>
            <span style={{
            display: "inline-block", width: 8, height: 8, borderRadius: 1, marginRight: 3,
            background: "repeating-linear-gradient(45deg, #2563eb, #2563eb 2px, rgba(239,68,68,0.5) 2px, rgba(239,68,68,0.5) 4px)",
            }} />
            Prisdifferens
            </span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#7c3aed", borderRadius: 1, marginRight: 3 }} />Nätavgift</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#ef4444", borderRadius: 1, marginRight: 3 }} />Energiskatt</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#f59e0b", borderRadius: 1, marginRight: 3 }} />Moms 25%</span>
          </div>
        </div>

        {/* ═══ KPI ROW ═══ */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {[
            { l: "Zonpris", v: src.spKr.toFixed(2), u: "kr/kWh", c: "var(--accent-amber)" },
            { l: "Systempris", v: src.syKr.toFixed(2), u: "kr/kWh", c: "var(--accent-green)" },
            { l: "Prisdifferens", v: (src.fkKr >= 0 ? "+" : "") + src.fkKr.toFixed(2), u: "kr/kWh", c: src.f >= 0 ? "#f87171" : "#60a5fa" },
            { l: "Netto", v: `${src.net >= 0 ? "+" : ""}${(src.net / 1000).toFixed(1)}k`, u: "MW", c: src.net >= 0 ? "var(--accent-green)" : "#f87171" },
            { l: "Import", v: `${(src.imp / 1000).toFixed(1)}k`, u: "MW", c: "var(--accent-blue)" },
            { l: "Export", v: `${(src.exp / 1000).toFixed(1)}k`, u: "MW", c: "#f87171" },
          ].map(k => (
            <div key={k.l} style={{
              flex: "1 1 80px", background: "var(--bg-card)", border: "1px solid var(--border-color)",
              borderRadius: 6, padding: "6px 8px",
            }}>
              <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{k.l}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: k.c, fontFamily: "var(--font-mono)" }}>
                {k.v}<span style={{ fontSize: 8, fontWeight: 400, marginLeft: 2, color: "var(--text-muted)" }}>{k.u}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ═══ AREA CHART — kr/kWh ═══ */}
        <AreaChart
          rows={rows}
          selectedIdx={mode === "hour" ? idx : null}
          onSelect={(i) => { setSelectedIdx(i); setMode("hour"); }}
          shouldPulse={shouldPulse}
        />

        {/* ═══ PRICE TABLE ═══ */}
        <div style={{ marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <tbody>
              <tr>
                <td style={{ padding: "3px 0", color: "var(--text-muted)" }}>⚡ Spotpris (zonpris)</td>
                <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{src.spKr.toFixed(2)}</td>
                <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--accent-blue)", width: 50 }}>
                  {((src.spKr / src.totKr) * 100).toFixed(0)}%
                </td>
              </tr>
              <tr style={{ fontSize: 10 }}>
                <td style={{ paddingLeft: 12, color: "var(--text-muted)" }}>├ Systempris (CMD)</td>
                <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{src.syKr.toFixed(2)}</td>
                <td />
              </tr>
              <tr style={{ fontSize: 10 }}>
                <td style={{ paddingLeft: 12, color: src.f >= 0 ? "#f87171" : "#60a5fa" }}>
                  └ {src.f >= 0 ? "Prisdifferens" : "Export-differens"} (DDM)
                </td>
                <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: src.f >= 0 ? "#f87171" : "#60a5fa" }}>
                  {src.fkKr >= 0 ? "+" : ""}{src.fkKr.toFixed(2)}
                </td>
                <td style={{ textAlign: "right", fontSize: 9, color: "var(--text-muted)" }}>
                  {src.sh > 0 ? `${src.sh}%` : ""}
                </td>
              </tr>
              <tr><td colSpan={3} style={{ borderBottom: "1px solid var(--border-color)", padding: 0 }} /></tr>
              <tr>
                <td style={{ padding: "3px 0", color: "var(--text-muted)" }}>🔌 Nätavgift</td>
                <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{NET_KR.toFixed(2)}</td>
                <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "#7c3aed" }}>{((NET_KR / src.totKr) * 100).toFixed(0)}%</td>
              </tr>
              <tr>
                <td style={{ padding: "3px 0", color: "var(--text-muted)" }}>🏛 Energiskatt</td>
                <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{TAX_KR.toFixed(2)}</td>
                <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "#ef4444" }}>{((TAX_KR / src.totKr) * 100).toFixed(0)}%</td>
              </tr>
              <tr>
                <td style={{ padding: "3px 0", color: "var(--text-muted)" }}>📄 Moms 25%</td>
                <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{src.moKr.toFixed(2)}</td>
                <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "#f59e0b" }}>{((src.moKr / src.totKr) * 100).toFixed(0)}%</td>
              </tr>
              <tr style={{ borderTop: "2px solid var(--border-color)" }}>
                <td style={{ padding: "4px 0", fontWeight: 700 }}>Totalt</td>
                <td style={{ textAlign: "right", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{src.totKr.toFixed(2)}</td>
                <td style={{ textAlign: "right", color: "var(--text-muted)" }}>100%</td>
              </tr>
            </tbody>
          </table>
          <div style={{ fontSize: 10, color: "#ef4444", marginTop: 4 }}>
            Varav stat: {src.stKr.toFixed(2)} kr/kWh ({src.stPct}%)
          </div>
        </div>

        {/* ═══ CONSTRAINT RENT ═══ */}
        {summary && summary.constraint_rent.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
              Prisområdesintäkt per gräns (DDM)
            </div>
            {summary.constraint_rent.slice(0, 5).map(r => {
              const maxR = summary.constraint_rent[0]?.total_eur || 1;
              const sek = r.total_eur * EUR_SEK / 1000;
              return (
                <div key={r.border} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ width: 70, fontSize: 10, color: "var(--text-muted)", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                    {r.border}
                  </span>
                  <div style={{ flex: 1, height: 12, background: "var(--border-color)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: `${(r.total_eur / maxR) * 100}%`,
                      background: "linear-gradient(90deg, rgba(245,158,11,0.4), var(--accent-amber))",
                      borderRadius: 3,
                    }} />
                  </div>
                  <span style={{ width: 75, fontSize: 10, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                    {sek.toFixed(0)}k SEK
                  </span>
                </div>
              );
            })}
            <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>
              Totalt: <span style={{ color: "var(--accent-amber)", fontWeight: 600 }}>
                {(summary.total_rent_eur * EUR_SEK / 1000).toFixed(0)}k SEK
              </span> per dygn
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 12, fontSize: 9, color: "var(--text-muted)", lineHeight: 1.5, borderTop: "1px solid var(--border-color)", paddingTop: 6 }}>
          <strong>Metodik:</strong> EVE-DDM v1.0 — Inga parametrar. Ren algebra.
          Prisdiff = Zonpris − Systempris. Rent = max(0, Δp × flow).
          <br />
          <strong>Datakällor:</strong> {data.sources.join(" · ")}
          <br />
          <em>EVE Transparent — Reproducerbar, ej auktoritativ. EUR/SEK {EUR_SEK}. Nät 32 öre (typkund). Skatt {TAX_KR * 100} öre (Skatteverket 2026).</em>
        </div>
      </div>
    </>
  );
}

// ─── Area Chart Sub-component ────────────────────────────────────────────────

function AreaChart({
  rows, selectedIdx, onSelect, shouldPulse,
}: {
  rows: DDMRow[];
  selectedIdx: number | null;
  onSelect: (i: number) => void;
  shouldPulse: boolean;
}) {
  if (rows.length < 2) return null;

  const W = 680, H = 180;
  const P = { t: 14, r: 10, b: 26, l: 48 };
  const cw = W - P.l - P.r, ch = H - P.t - P.b;

  const maxP = Math.max(...rows.map(r => Math.max(r.zonpris_eur_mwh, r.systempris_eur_mwh ?? 0))) * 1.05;
  const x = (i: number) => P.l + (i / (rows.length - 1)) * cw;
  const y = (v: number) => P.t + (1 - v / maxP) * ch;

  // Sys area fill
  const sysArea = `M${x(0)},${y(0)} ` +
    rows.map((r, i) => `L${x(i)},${y(r.systempris_eur_mwh ?? 0)}`).join(" ") +
    ` L${x(rows.length - 1)},${y(0)} Z`;

  // Flask area (between sys and zon when F >= 0)
  let flaskPath = `M${x(0)},${y(rows[0].systempris_eur_mwh ?? 0)}`;
  rows.forEach((r, i) => {
    const f = (r.flaskhals_eur_mwh ?? 0);
    flaskPath += ` L${x(i)},${y(f >= 0 ? r.zonpris_eur_mwh : (r.systempris_eur_mwh ?? 0))}`;
  });
  for (let i = rows.length - 1; i >= 0; i--) {
    flaskPath += ` L${x(i)},${y(rows[i].systempris_eur_mwh ?? 0)}`;
  }
  flaskPath += " Z";

  const zonLine = rows.map((r, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(r.zonpris_eur_mwh)}`).join(" ");
  const sysLine = rows.map((r, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(r.systempris_eur_mwh ?? 0)}`).join(" ");

  const ticks = [50, 100, 150, 200, 250].filter(v => v <= maxP);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const mx = ((e.clientX - rect.left) / rect.width) * W;
        const idx = Math.round(((mx - P.l) / cw) * (rows.length - 1));
        if (idx >= 0 && idx < rows.length) onSelect(idx);
      }}
    >
      {/* Stripe pattern */}
      <defs>
        <pattern id="cp-stripes" patternUnits="userSpaceOnUse" width={5} height={5} patternTransform="rotate(45)">
          <rect width={5} height={5} fill="#2563eb" opacity={0.3} />
          <line x1={0} y1={0} x2={0} y2={5} stroke="#ef4444" strokeWidth={2} opacity={0.5} />
        </pattern>
      </defs>

      {/* Grid */}
      {ticks.map(v => (
        <g key={v}>
          <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="var(--border-color)" strokeWidth={0.5} />
          <text x={P.l - 4} y={y(v) + 3} textAnchor="end" fill="var(--text-muted)" fontSize={8} fontFamily="var(--font-mono)">
            {toKr(v).toFixed(1)}
          </text>
        </g>
      ))}

      {/* Sys fill */}
      <path d={sysArea} fill="#15803d" opacity={0.2} />

      {/* Flask fill — PULSES */}
      <path
        d={flaskPath}
        fill="url(#cp-stripes)"
        style={{
          animation: shouldPulse ? "congestion-pulse 2s ease-in-out infinite" : "none",
        }}
      />

      {/* Lines */}
      <path d={sysLine} fill="none" stroke="#22c55e" strokeWidth={1.5} opacity={0.5} />
      <path
        d={zonLine}
        fill="none"
        stroke="var(--accent-amber)"
        strokeWidth={2}
        style={{
          animation: shouldPulse ? "congestion-glow 2s ease-in-out infinite" : "none",
        }}
      />

      {/* Selected hour */}
      {selectedIdx !== null && selectedIdx < rows.length && (
        <g>
          <line x1={x(selectedIdx)} x2={x(selectedIdx)} y1={P.t} y2={H - P.b}
            stroke="var(--accent-amber)" strokeWidth={1} strokeDasharray="3,2" />
          <circle cx={x(selectedIdx)} cy={y(rows[selectedIdx].zonpris_eur_mwh)} r={4} fill="var(--accent-amber)" />
          <circle cx={x(selectedIdx)} cy={y(rows[selectedIdx].systempris_eur_mwh ?? 0)} r={3} fill="#22c55e" />
        </g>
      )}

      {/* Hour labels */}
      {rows.length <= 96 && [0, 3, 6, 9, 12, 15, 18, 21].map(hr => {
        const idx = rows.findIndex(r => new Date(r.ts).getUTCHours() === hr);
        if (idx < 0) return null;
        return (
          <text key={hr} x={x(idx)} y={H - P.b + 14} textAnchor="middle" fill="var(--text-muted)" fontSize={9}
            fontFamily="var(--font-mono)">
            {String(hr).padStart(2, "0")}
          </text>
        );
      })}

      <text x={P.l - 4} y={P.t - 4} textAnchor="end" fill="var(--text-muted)" fontSize={7}>kr/kWh</text>
    </svg>
  );
}
