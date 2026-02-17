"use client";

export default function ProducerFinancialsPanel() {
  return (
    <section style={{ background: "#111", border: "1px solid #333", borderRadius: 8, padding: 20, marginBottom: 24 }}>
      <h3 style={{ color: "#f5f5f5", margin: "0 0 4px", fontSize: 16, fontWeight: 600 }}>
        Producenters årsresultat
      </h3>
      <p style={{ color: "#888", fontSize: 12, margin: "0 0 16px" }}>
        Koncern- och segmentresultat för elproducenter. Källa: publicerade årsredovisningar.
      </p>

      <div style={{ background: "#1a1a1a", borderRadius: 6, padding: 16, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>⏳ Fas C — Kommande</div>
        <div style={{ fontSize: 12, color: "#888" }}>
          Kräver PDF-ingest av årsredovisningar (Vattenfall, Fortum).
        </div>
        <div style={{ fontSize: 11, color: "#555", marginTop: 8 }}>
          Data visas på koncernnivå: Operating profit, Net profit, Segment Generation.
          <br />
          Inga värdeladdade formuleringar.
        </div>
      </div>

      <div style={{ fontSize: 10, color: "#555", marginTop: 12, borderTop: "1px solid #333", paddingTop: 8 }}>
        Status: pending_v2 — awaiting annual report data ingest
      </div>
    </section>
  );
}
