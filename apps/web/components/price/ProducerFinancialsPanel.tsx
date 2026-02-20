"use client";

export default function ProducerFinancialsPanel() {
  return (
    <section style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: 8, padding: 20, marginBottom: 24 }}>
      <h3 style={{ color: "var(--text-primary)", margin: "0 0 4px", fontSize: 16, fontWeight: 600 }}>
        Producenters årsresultat
      </h3>
      <p style={{ color: "var(--text-secondary)", fontSize: 12, margin: "0 0 16px" }}>
        Koncern- och segmentresultat för elproducenter. Källa: publicerade årsredovisningar.
      </p>

      <div style={{ background: "var(--bg-elevated)", borderRadius: 6, padding: 16, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>⏳ Fas C — Kommande</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Kräver PDF-ingest av årsredovisningar (Vattenfall, Fortum).
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
          Data visas på koncernnivå: Operating profit, Net profit, Segment Generation.
          <br />
          Inga värdeladdade formuleringar.
        </div>
      </div>

      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 12, borderTop: "1px solid var(--border-color)", paddingTop: 8 }}>
        Status: pending_v2 — awaiting annual report data ingest
      </div>
    </section>
  );
}
