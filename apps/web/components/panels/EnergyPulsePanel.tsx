"use client";

import { useState, useEffect } from "react";

/**
 * EnergyPulsePanel — witness-safe activity counters.
 * Pure counts from canonical data. No interpretation, no gauges.
 */

interface PulseData {
  decisions: {
    last_90d: number;
    baseline_90d: number;
    recent_types: { prop: number; bet: number; vote: number };
  };
  statements: {
    last_30d: number;
    baseline_30d: number;
    per_week_avg: number;
  };
  spot: {
    se3_avg_7d: number | null;
    se_spread_avg_7d: number | null;
    se3_range_7d: { min: number; max: number } | null;
  };
  evidence: {
    manifest_id: string;
    root_hash: string;
  };
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0" }}>
      <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{label}</span>
      <div style={{ textAlign: "right" }}>
        <span style={{ fontSize: "0.88rem", fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
          {value}
        </span>
        {sub && <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{sub}</div>}
      </div>
    </div>
  );
}

export function EnergyPulsePanel() {
  const [data, setData] = useState<PulseData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/witness/pulse")
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="card" style={{ padding: "12px" }}>
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Laddar…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card" style={{ padding: "12px" }}>
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Data ej tillgänglig</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: "12px" }}>
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
        Aktivitet
      </div>

      <Row label="Propositioner (90d)" value={String(data.decisions.recent_types.prop)} />
      <Row label="Betänkanden (90d)" value={String(data.decisions.recent_types.bet)} />
      <Row label="Voteringar (90d)" value={String(data.decisions.recent_types.vote)} />

      <div style={{ borderTop: "1px solid var(--border-color)", margin: "6px 0" }} />

      <Row label="Uttalanden (30d)" value={String(data.statements.last_30d)} sub={`${data.statements.per_week_avg.toFixed(1)}/vecka`} />

      {data.spot.se3_avg_7d !== null && (
        <>
          <div style={{ borderTop: "1px solid var(--border-color)", margin: "6px 0" }} />
          <Row label="SE3 medel (7d)" value={`${data.spot.se3_avg_7d.toFixed(1)} EUR/MWh`} />
        </>
      )}

      <div style={{ borderTop: "1px solid var(--border-color)", margin: "8px 0 4px" }} />
      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
        ● {data.evidence.manifest_id} | {data.evidence.root_hash.slice(0, 10)}…
      </div>
    </div>
  );
}
