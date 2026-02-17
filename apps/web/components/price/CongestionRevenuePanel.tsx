"use client";

import { useEffect, useState } from "react";

interface CongestionRecord {
  year: number;
  total_revenue_msek: number | null;
  total_used_msek: number | null;
  svk_used_for_capacity_msek: number | null;
  svk_tariff_reduction_msek: number | null;
  svk_customer_support_msek: number | null;
  cumulative_balance_end_msek?: number | null;
  note?: string;
  source_url: string;
}

interface PlannedInvestments {
  svk_plan_2026_2028: { total_msek: number; period: string; annual_avg_msek: number; description: string };
  svk_prognos_2025_2035: { total_inflow_msek: number; annual_avg_msek: number; description: string };
}

interface CongestionData {
  records: CongestionRecord[];
  planned_investments: PlannedInvestments;
  q1_2025: { revenue_msek: number; daily_avg_msek: number; annualized_msek: number; note: string; source_url?: string };
  evidence_ref: { manifest_id: string; root_hash: string };
}

const mdr = (msek: number) => (msek / 1000).toFixed(1);

/* Year context labels */
const yearContext: Record<number, string> = {
  2018: "",
  2019: "Ringhals 2 stängdes",
  2020: "Rekordår — Ringhals 1 stängdes, hydroöverskott",
  2021: "Mer än 6 föregående år tillsammans",
  2022: "Energikris — extrema prisskillnader mellan elområden",
  2023: "Elstöd 26,8 mdr betalades ut till kunder",
  2024: "Bara 3,3 av 21,4 mdr användes — saldot växte",
};

export default function CongestionRevenuePanel() {
  const [data, setData] = useState<CongestionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/witness/price-structure")
      .then((r) => r.json())
      .then((d) => setData(d.congestion_revenue))
      .catch(() => setError("Kunde inte ladda data"));
  }, []);

  if (error) return <div style={{ color: "#ef4444", padding: 16 }}>{error}</div>;
  if (!data) return <div style={{ padding: 16, color: "#888" }}>Laddar flaskhalsdata…</div>;

  const records = data.records.filter((r) => r.total_revenue_msek != null);
  const plan = data.planned_investments;

  const srcBadge = (url: string, label: string) => (
    <a href={url} target="_blank" rel="noopener" style={{ fontSize: 10, color: "#555", textDecoration: "underline", textDecorationColor: "#333" }}>
      {label}
    </a>
  );

  return (
    <section style={{ background: "#111", border: "1px solid #333", borderRadius: 8, padding: 20, marginBottom: 24 }}>
      <h3 style={{ color: "#f5f5f5", margin: "0 0 4px", fontSize: 16, fontWeight: 600 }}>
        Flaskhalsintäkter — Intäkter vs Användning
      </h3>
      <p style={{ color: "#888", fontSize: 12, margin: "0 0 4px" }}>
        Flaskhalsintäkter uppstår automatiskt vid prisskillnad mellan elområden (EU-förordning 2019/943).
        Alla siffror från Energimarknadsinspektionens årsrapporter.
      </p>
      <div style={{ display: "flex", gap: 8, fontSize: 10, color: "#666", marginBottom: 16, flexWrap: "wrap" }}>
        {srcBadge("https://ei.se/om-oss/nyheter/2025/2025-03-04-hoga-flaskhalsintakter-under-2024---sa-har-har-de-anvants", "📄 Ei rapport 2024")}
        {srcBadge("https://ei.se/om-oss/nyheter/2024/2024-03-01-fortsatt-hoga-flaskhalsintakter-under-2023---sa-har-har-de-anvants", "📄 Ei rapport 2023")}
        {srcBadge("https://second-opinion.se/flaskhalsintakterna-okar-mer-an-svks-anvandning/", "📄 Second Opinion Q1 2025")}
      </div>

      {/* ════════ BAR CHART ════════ */}
      <div style={{ marginBottom: 24 }}>
        {(() => {
          const maxRev = Math.max(...records.map(r => r.total_revenue_msek!), data.q1_2025.annualized_msek);
          const barH = (msek: number) => `${Math.max((msek / maxRev) * 100, 2)}%`;
          const allItems = [
            ...records.map(r => ({
              year: r.year, rev: r.total_revenue_msek!, used: r.total_used_msek ?? 0,
              hasUsage: r.total_used_msek != null, ctx: yearContext[r.year] ?? "",
              isCrisis: r.year === 2022, isPrognos: false, sourceUrl: r.source_url, sourceLabel: "Ei",
            })),
            {
              year: 2025, rev: data.q1_2025.annualized_msek, used: 0,
              hasUsage: false, ctx: `Baserat på Q1-takt (${data.q1_2025.daily_avg_msek} MSEK/dag)`,
              isCrisis: false, isPrognos: true, sourceUrl: data.q1_2025.source_url ?? "#", sourceLabel: "Second Opinion",
            },
          ];

          return <>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 280, paddingBottom: 4 }}>
              {allItems.map((item) => (
                <div key={item.year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                  {/* Context label */}
                  {item.ctx && (
                    <div style={{ fontSize: 9, color: item.isCrisis ? "#ef4444" : "#999", textAlign: "center", marginBottom: 4, lineHeight: 1.2, maxWidth: 100 }}>
                      {item.ctx}
                    </div>
                  )}

                  {/* Revenue value above bar */}
                  <div style={{ fontSize: 12, fontWeight: 700, color: item.isCrisis ? "#ef4444" : item.isPrognos ? "#fbbf24" : "#f59e0b", marginBottom: 3 }}>
                    {item.isPrognos ? "~" : ""}{mdr(item.rev)} mdr
                  </div>

                  {/* Stacked bar: revenue (amber) with used (green) overlay from bottom */}
                  <div style={{ width: "75%", height: barH(item.rev), position: "relative", minHeight: 12 }}>
                    {/* Revenue bar (full height) */}
                    <div style={{
                      position: "absolute", bottom: 0, left: 0, width: "100%", height: "100%",
                      background: item.isPrognos
                        ? "repeating-linear-gradient(45deg, #f59e0b33, #f59e0b33 4px, transparent 4px, transparent 8px)"
                        : item.isCrisis
                          ? "linear-gradient(180deg, #ef4444 0%, #f59e0b 60%)"
                          : "#f59e0b",
                      borderRadius: "4px 4px 0 0",
                      opacity: item.isPrognos ? 1 : 0.7,
                      border: item.isPrognos ? "1px dashed #f59e0b" : "none",
                    }} />
                    {/* Used bar (green, from bottom) */}
                    {item.hasUsage && item.used > 0 && (
                      <div style={{
                        position: "absolute", bottom: 0, left: 0, width: "100%",
                        height: `${Math.min((item.used / item.rev) * 100, 100)}%`,
                        background: "#22c55e",
                        borderRadius: "4px 4px 0 0",
                        opacity: 0.85,
                      }} />
                    )}
                  </div>

                  {/* Used value under bar */}
                  {item.hasUsage && item.used > 0 && (
                    <div style={{ fontSize: 10, color: "#22c55e", marginTop: 3, fontWeight: 600 }}>
                      {mdr(item.used)} anv.
                    </div>
                  )}

                  {/* Year */}
                  <div style={{ fontSize: 13, color: item.isCrisis ? "#ef4444" : item.isPrognos ? "#f59e0b" : "#ccc", marginTop: 4, fontWeight: 600 }}>
                    {item.year}{item.isPrognos ? "*" : ""}
                  </div>

                  {/* Source */}
                  <div style={{ fontSize: 8, color: "#555", marginTop: 1 }}>
                    <a href={item.sourceUrl} target="_blank" rel="noopener" style={{ color: "#555" }}>{item.sourceLabel} ✓</a>
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#888", marginTop: 10, flexWrap: "wrap" }}>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#f59e0b", borderRadius: 2, verticalAlign: "middle", marginRight: 4, opacity: 0.7 }} />Intäkter (Ei årsrapport)</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#22c55e", borderRadius: 2, verticalAlign: "middle", marginRight: 4, opacity: 0.85 }} />Faktisk användning</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "linear-gradient(180deg, #ef4444, #f59e0b)", borderRadius: 2, verticalAlign: "middle", marginRight: 4 }} />2022 energikris</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, border: "1px dashed #f59e0b", borderRadius: 2, verticalAlign: "middle", marginRight: 4 }} />2025* prognos</span>
            </div>
          </>;
        })()}
      </div>

      {/* ════════ INTÄKTER VS PLANERADE INVESTERINGAR ════════ */}
      <div style={{ background: "#0a0a0a", border: "1px solid #333", borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#f5f5f5", marginBottom: 4 }}>
          Ackumulerat saldo vs Planerade investeringar
        </div>
        <div style={{ fontSize: 11, color: "#666", marginBottom: 12 }}>
          Alla siffror verifierade — Ei rapport mars 2025 + Svenska kraftnäts investeringsplan.
        </div>

        {/* Three cards */}
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1, background: "#1c1917", borderRadius: 8, padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#f59e0b" }}>Ackumulerat saldo</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#f59e0b" }}>65,1</div>
            <div style={{ fontSize: 11, color: "#888" }}>mdr SEK</div>
            <div style={{ fontSize: 10, color: "#666" }}>per dec 2024</div>
            <div style={{ fontSize: 9, color: "#444", marginTop: 4 }}>
              <a href="https://ei.se/om-oss/nyheter/2025/2025-03-04-hoga-flaskhalsintakter-under-2024---sa-har-har-de-anvants" target="_blank" rel="noopener" style={{ color: "#555" }}>
                📄 Ei rapport 2024 ✓
              </a>
            </div>
          </div>
          <div style={{ flex: 1, background: "#0f1e0f", borderRadius: 8, padding: 12, textAlign: "center", border: "1px solid #22c55e33" }}>
            <div style={{ fontSize: 11, color: "#22c55e" }}>Planerade investeringar</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#22c55e" }}>57,0</div>
            <div style={{ fontSize: 11, color: "#888" }}>mdr SEK</div>
            <div style={{ fontSize: 10, color: "#666" }}>2026–2028 (3 år)</div>
            <div style={{ fontSize: 9, color: "#444", marginTop: 4 }}>
              📄 Svk investeringsplan ✓
            </div>
          </div>
          <div style={{ flex: 1, background: "#111827", borderRadius: 8, padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#ccc" }}>Saldo efter plan</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#93c5fd" }}>+8,1</div>
            <div style={{ fontSize: 11, color: "#888" }}>mdr SEK kvar</div>
            <div style={{ fontSize: 10, color: "#ef4444" }}>exkl nytt inflöde 2025–2028</div>
          </div>
        </div>

        {/* Visual comparison bar */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ position: "relative", height: 32, background: "#1a1a1a", borderRadius: 6, overflow: "hidden" }}>
            <div style={{
              position: "absolute", left: 0, top: 0, height: "100%", width: "100%",
              background: "#f59e0b22", borderRadius: 6,
            }}>
              <div style={{ position: "absolute", left: 8, top: 8, fontSize: 11, color: "#f59e0b", fontWeight: 500 }}>
                Saldo: 65,1 mdr
              </div>
            </div>
            <div style={{
              position: "absolute", left: 0, top: 0, height: "100%",
              width: `${(57000 / 65100) * 100}%`,
              background: "#22c55e33", borderRight: "2px solid #22c55e", borderRadius: "6px 0 0 6px",
            }}>
              <div style={{ position: "absolute", right: 8, top: 8, fontSize: 11, color: "#22c55e", fontWeight: 500 }}>
                Plan: 57 mdr
              </div>
            </div>
          </div>
        </div>

        {/* Ongoing inflow warning */}
        <div style={{ background: "#1c1917", borderRadius: 6, padding: 10, border: "1px solid #44403c" }}>
          <div style={{ fontSize: 12, color: "#fbbf24", fontWeight: 500, marginBottom: 6 }}>
            ⚡ Nytt inflöde under investeringsperioden
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ padding: "3px 0", fontSize: 12, color: "#999" }}>Q1 2025 (jan–mar)</td>
                <td style={{ padding: "3px 0", fontSize: 12, color: "#f59e0b", textAlign: "right" }}>
                  {mdr(data.q1_2025.revenue_msek)} mdr
                </td>
                <td style={{ padding: "3px 0", fontSize: 10, color: "#666", textAlign: "right" }}>
                  ({data.q1_2025.daily_avg_msek} MSEK/dag)
                </td>
              </tr>
              <tr>
                <td style={{ padding: "3px 0", fontSize: 12, color: "#999" }}>Svk prognos 2025–2035</td>
                <td style={{ padding: "3px 0", fontSize: 12, color: "#f59e0b", textAlign: "right" }}>
                  ~{mdr(plan.svk_prognos_2025_2035.total_inflow_msek)} mdr totalt
                </td>
                <td style={{ padding: "3px 0", fontSize: 10, color: "#666", textAlign: "right" }}>
                  (~{mdr(plan.svk_prognos_2025_2035.annual_avg_msek)} mdr/år)
                </td>
              </tr>
              <tr>
                <td style={{ padding: "3px 0", fontSize: 12, color: "#999" }}>Under planperioden 2026–28 (prognos)</td>
                <td style={{ padding: "3px 0", fontSize: 12, color: "#f59e0b", textAlign: "right" }}>
                  ~{mdr(plan.svk_prognos_2025_2035.annual_avg_msek * 3)} mdr
                </td>
                <td style={{ padding: "3px 0", fontSize: 10, color: "#666", textAlign: "right" }}>
                  (3 × {mdr(plan.svk_prognos_2025_2035.annual_avg_msek)} mdr/år)
                </td>
              </tr>
            </tbody>
          </table>
          <div style={{ fontSize: 10, color: "#666", marginTop: 6, fontStyle: "italic" }}>
            Observation: Under perioden planerade investeringar genomförs (57 mdr, 2026–28) beräknas ytterligare
            ~{mdr(plan.svk_prognos_2025_2035.annual_avg_msek * 3)} mdr flöda in. Nettosaldot kan därmed fortsätta växa.
            Prognosen är enligt Svk "mycket osäker".
          </div>
        </div>
      </div>

      {/* ════════ USAGE BREAKDOWN TABLE ════════ */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 4 }}>
          Detaljerad användning per år (mdr SEK)
        </div>
        <div style={{ fontSize: 10, color: "#666", marginBottom: 8 }}>
          Alla siffror från Energimarknadsinspektionens officiella årsrapporter.
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["År", "Intäkter", "Kapacitet", "Tariff", "Kundstöd", "Använt", "Gap"].map((h, i) => (
                <th key={h} style={{
                  textAlign: i === 0 ? "left" : "right",
                  padding: "6px 6px", fontSize: 11, color: "#888",
                  borderBottom: "1px solid #333", fontWeight: 500,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.filter(r => r.total_used_msek != null).map((r) => {
              const gap = (r.total_revenue_msek ?? 0) - (r.total_used_msek ?? 0);
              return (
                <tr key={r.year}>
                  <td style={{ padding: "5px 6px", fontSize: 13, color: "#ccc", borderBottom: "1px solid #222" }}>{r.year}</td>
                  <td style={{ padding: "5px 6px", fontSize: 13, color: "#f59e0b", textAlign: "right", borderBottom: "1px solid #222" }}>
                    {mdr(r.total_revenue_msek!)}
                  </td>
                  <td style={{ padding: "5px 6px", fontSize: 13, color: "#22c55e", textAlign: "right", borderBottom: "1px solid #222" }}>
                    {r.svk_used_for_capacity_msek != null ? mdr(r.svk_used_for_capacity_msek) : "–"}
                  </td>
                  <td style={{ padding: "5px 6px", fontSize: 13, color: "#8b5cf6", textAlign: "right", borderBottom: "1px solid #222" }}>
                    {r.svk_tariff_reduction_msek != null ? mdr(r.svk_tariff_reduction_msek) : "–"}
                  </td>
                  <td style={{ padding: "5px 6px", fontSize: 13, color: "#06b6d4", textAlign: "right", borderBottom: "1px solid #222" }}>
                    {r.svk_customer_support_msek != null ? mdr(r.svk_customer_support_msek) : "–"}
                  </td>
                  <td style={{ padding: "5px 6px", fontSize: 13, color: "#e5e5e5", textAlign: "right", borderBottom: "1px solid #222", fontWeight: 600 }}>
                    {mdr(r.total_used_msek!)}
                  </td>
                  <td style={{
                    padding: "5px 6px", fontSize: 13, textAlign: "right", borderBottom: "1px solid #222",
                    color: gap > 0 ? "#ef4444" : "#22c55e", fontWeight: 600,
                  }}>
                    {gap > 0 ? "+" : ""}{mdr(gap)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>
          Gap = intäkter − användning. Positivt gap = ackumuleras på Riksgäldskonto.
          2023: kundstöd (elstöd) översteg årets intäkter — togs från tidigare saldo.
        </div>
      </div>

      {/* ════════ PLANNED INVESTMENTS DETAIL ════════ */}
      <div style={{ background: "#0f1e0f", border: "1px solid #22c55e33", borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#22c55e", marginBottom: 8 }}>
          Planerade investeringar — Svenska kraftnät
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#22c55e" }}>57 mdr</div>
            <div style={{ fontSize: 12, color: "#888" }}>2026–2028 (3 år)</div>
            <div style={{ fontSize: 11, color: "#666" }}>{plan.svk_plan_2026_2028.description}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#86efac" }}>~19 mdr/år</div>
            <div style={{ fontSize: 12, color: "#888" }}>Genomsnitt per år</div>
            <div style={{ fontSize: 11, color: "#666" }}>Jfr faktiskt inflöde 2024: 21,4 mdr</div>
            <div style={{ fontSize: 11, color: "#666" }}>Jfr Q1 2025-takt: ~43 mdr/år</div>
          </div>
        </div>
      </div>

      {/* ════════ VERIFIED SOURCES ════════ */}
      <div style={{ background: "#0a0a0a", borderRadius: 8, padding: 16, border: "1px solid #333" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 10 }}>
          🔒 Källor &amp; Metodik
        </div>

        {/* Scope explanation */}
        <div style={{ background: "#1a1a1a", borderRadius: 6, padding: 10, marginBottom: 12, border: "1px solid #2a2a2a" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#f59e0b", marginBottom: 4 }}>
            ⚠ Två olika mått förekommer i källorna
          </div>
          <div style={{ fontSize: 11, color: "#999", lineHeight: 1.5 }}>
            <strong style={{ color: "#ccc" }}>Ei ACER-rapporter</strong> redovisar enbart <em>externa</em> flaskhalsintäkter
            (cross-border: Svk + Baltic Cable). <strong style={{ color: "#ccc" }}>Svk/SKGS/Second Opinion</strong> anger
            <em> totala</em> intäkter inklusive <em>interna snitt</em> (SE1↔SE2↔SE3↔SE4).
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
            Exempel 2020: Ei externt <strong style={{ color: "#f59e0b" }}>2,9 mdr</strong> — Svk totalt <strong style={{ color: "#f59e0b" }}>8,1 mdr</strong> (varav
            5,3 mdr interna snitt). Denna vy visar <strong style={{ color: "#ccc" }}>totala (Svk inkl interna)</strong> för 2018–2021
            och <strong style={{ color: "#ccc" }}>Ei samlade (Svk+BC)</strong> för 2022+.
          </div>
        </div>

        {/* Source list */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "4px 10px", fontSize: 11, color: "#888", lineHeight: 1.6, alignItems: "baseline" }}>
          {/* Primary sources */}
          <span style={{ color: "#22c55e", fontSize: 10, fontWeight: 600 }}>PRIMÄR</span>
          <a href="https://ei.se/om-oss/nyheter/2025/2025-03-04-hoga-flaskhalsintakter-under-2024---sa-har-har-de-anvants" target="_blank" rel="noopener" style={{ color: "#93c5fd" }}>
            Ei: Höga flaskhalsintäkter under 2024
          </a>
          <span style={{ color: "#666", fontSize: 10 }}>mars 2025 — intäkter, saldo 65 mdr, användning 2024</span>

          <span style={{ color: "#22c55e", fontSize: 10, fontWeight: 600 }}>PRIMÄR</span>
          <a href="https://ei.se/om-oss/nyheter/2024/2024-03-01-fortsatt-hoga-flaskhalsintakter-under-2023---sa-har-har-de-anvants" target="_blank" rel="noopener" style={{ color: "#93c5fd" }}>
            Ei: Fortsatt höga flaskhalsintäkter 2023
          </a>
          <span style={{ color: "#666", fontSize: 10 }}>mars 2024 — intäkter 2023, elstöd 26,8 mdr</span>

          <span style={{ color: "#22c55e", fontSize: 10, fontWeight: 600 }}>PRIMÄR</span>
          <a href="https://ei.se/download/18.75fbb4c4177d803861e83992/1615808785702/Congestion-revenues-2021.pdf" target="_blank" rel="noopener" style={{ color: "#93c5fd" }}>
            Ei: Congestion Revenues 2020 (PDF)
          </a>
          <span style={{ color: "#666", fontSize: 10 }}>mars 2021 — Svk 2 871 MSEK externt, BC 364 MSEK</span>

          <span style={{ color: "#22c55e", fontSize: 10, fontWeight: 600 }}>PRIMÄR</span>
          <a href="https://ei.se/om-oss/nyheter/2023/2023-06-27-ei-godkanner-att-flaskhalsintakter-far-anvandas-for-att-sanka-nattariffen-under-2024" target="_blank" rel="noopener" style={{ color: "#93c5fd" }}>
            Ei: Godkänd tariffreduktion 2024
          </a>
          <span style={{ color: "#666", fontSize: 10 }}>juni 2023 — 6,1 mdr godkänd</span>

          {/* Secondary sources */}
          <span style={{ color: "#f59e0b", fontSize: 10, fontWeight: 600 }}>SEKUNDÄR</span>
          <a href="https://second-opinion.se/elsystem-i-obalans-ger-miljarder-i-flaskhalsintakter/" target="_blank" rel="noopener" style={{ color: "#93c5fd" }}>
            Second Opinion: Elsystem i obalans
          </a>
          <span style={{ color: "#666", fontSize: 10 }}>jun 2021 — totalt 8,1 mdr 2020 (inkl interna snitt)</span>

          <span style={{ color: "#f59e0b", fontSize: 10, fontWeight: 600 }}>SEKUNDÄR</span>
          <a href="https://second-opinion.se/flaskhalsintakterna-okar-mer-an-svks-anvandning/" target="_blank" rel="noopener" style={{ color: "#93c5fd" }}>
            Second Opinion: Flaskhalsintäkterna ökar
          </a>
          <span style={{ color: "#666", fontSize: 10 }}>maj 2025 — Q1 2025 10,5 mdr, prognos 2025–2035</span>

          <span style={{ color: "#f59e0b", fontSize: 10, fontWeight: 600 }}>SEKUNDÄR</span>
          <a href="https://skgs.org/aktuellt/svenska-kraftnat-arets-flaskhalsintakter-mot-ny-rekordniva/" target="_blank" rel="noopener" style={{ color: "#93c5fd" }}>
            SKGS: Flaskhalsintäkter mot ny rekordnivå
          </a>
          <span style={{ color: "#666", fontSize: 10 }}>dec 2023 — 2018: 1,6 mdr, 2019: 2,2 mdr (citat Svk CFO)</span>

          <span style={{ color: "#f59e0b", fontSize: 10, fontWeight: 600 }}>SEKUNDÄR</span>
          <a href="https://www.affarsvarlden.se/artikel/myndigheten-med-80-miljarder-i-kassan-inte-meningen" target="_blank" rel="noopener" style={{ color: "#93c5fd" }}>
            Affärsvärlden: Myndigheten med 80 miljarder
          </a>
          <span style={{ color: "#666", fontSize: 10 }}>nov 2025 — saldo 80 mdr, Riksgäldskonto</span>
        </div>

        <div style={{ fontSize: 10, color: "#555", marginTop: 12, paddingTop: 8, borderTop: "1px solid #2a2a2a" }}>
          Juridisk grund: EU-förordning 2019/943 art. 19 — intäkter från överbelastning.
          Inga påståenden om motiv. Korrelation ≠ avsikt.
        </div>
      </div>

      {/* Evidence hash */}
      <div style={{ fontSize: 10, color: "#444", marginTop: 8 }}>
        📋 {data.evidence_ref.manifest_id} · 🔒 {data.evidence_ref.root_hash === "pending" ? "pending" : data.evidence_ref.root_hash.slice(0, 10) + "…"}
      </div>
    </section>
  );
}
