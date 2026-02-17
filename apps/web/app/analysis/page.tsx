"use client";

import Link from "next/link";

const ANALYSES = [
  {
    slug: "heating-cost",
    icon: "🌡️",
    title: "Uppvärmningskostnad EU",
    subtitle: "Vad kostar det att hålla 18°C i en 150 m² villa? 14 EU-länder jämförda. Eurostat H1 2025.",
    status: "live",
  },
];

export default function AnalysisIndexPage() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📊 Analysis</h1>
        <p className="page-subtitle">
          Beräknade insikter från verifierade data. Synlig metodik, öppna källor, inga dolda antaganden.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {ANALYSES.map((a) => (
          <Link key={a.slug} href={`/analysis/${a.slug}`} style={{ textDecoration: "none" }}>
            <div className="card" style={{
              cursor: "pointer",
              marginBottom: 0,
              display: "flex",
              alignItems: "center",
              gap: 14,
              transition: "border-color 0.15s",
            }}>
              <span style={{ fontSize: "1.5rem" }}>{a.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{a.title}</div>
                <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>{a.subtitle}</div>
              </div>
              <span className="status-pill live">{a.status}</span>
              <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>→</span>
            </div>
          </Link>
        ))}
      </div>

      <div style={{
        marginTop: "24px",
        fontSize: "0.72rem",
        color: "var(--text-muted)",
        fontFamily: "var(--font-mono)",
        textAlign: "center",
      }}>
        EVE Analysis · Insikter härledda från Witness-data & offentliga källor
      </div>
    </div>
  );
}
