"use client";

import { useState, useEffect } from "react";

/**
 * EnergyPulsePanel — "barometer" for the energy policy landscape.
 *
 * Three witness-safe signals (no interpretation):
 * 1. Decision activity — prop/bet/vote count last 90d vs baseline
 * 2. Statement frequency — statements/week recent vs baseline
 * 3. Price volatility — SE-zone spread + price range
 *
 * Combined into a visual gauge + individual indicators.
 * All values from API (evidence-backed). No opinions.
 */

interface PulseData {
  decisions: {
    last_90d: number;
    baseline_90d: number;   // historical average per 90d
    recent_types: { prop: number; bet: number; vote: number };
  };
  statements: {
    last_30d: number;
    baseline_30d: number;
    per_week_avg: number;
  };
  spot: {
    se3_avg_7d: number | null;
    se_spread_avg_7d: number | null;   // cross-zone spread
    se3_range_7d: { min: number; max: number } | null;
  };
  evidence: {
    manifest_id: string;
    root_hash: string;
  };
}

// Gauge level: purely quantitative (high activity ≠ good/bad)
function activityLevel(ratio: number): { label: string; color: string; angle: number } {
  if (ratio <= 0.5)  return { label: "Låg", color: "#10b981", angle: 30 };
  if (ratio <= 0.8)  return { label: "Under snitt", color: "#10b981", angle: 55 };
  if (ratio <= 1.2)  return { label: "Normal", color: "#f59e0b", angle: 90 };
  if (ratio <= 1.8)  return { label: "Över snitt", color: "#f97316", angle: 125 };
  return { label: "Hög", color: "#ef4444", angle: 155 };
}

function MiniGauge({ angle, color, size = 80 }: { angle: number; color: string; size?: number }) {
  const cx = size / 2;
  const cy = size * 0.65;
  const r = size * 0.4;

  // Arc from 10° to 170° (left to right)
  const startAngle = 10 * Math.PI / 180;
  const endAngle = 170 * Math.PI / 180;
  const needleAngle = (180 - angle) * Math.PI / 180;

  const arcStart = { x: cx + r * Math.cos(Math.PI - startAngle), y: cy - r * Math.sin(startAngle) };
  const arcEnd = { x: cx + r * Math.cos(Math.PI - endAngle), y: cy - r * Math.sin(endAngle) };
  const needleTip = { x: cx + (r - 4) * Math.cos(needleAngle), y: cy - (r - 4) * Math.sin(needleAngle) };

  return (
    <svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.7}`}>
      {/* Background arc */}
      <path
        d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 0 1 ${arcEnd.x} ${arcEnd.y}`}
        fill="none" stroke="var(--border-color)" strokeWidth={4} strokeLinecap="round"
      />
      {/* Colored arc (partial, up to needle) */}
      {(() => {
        const fillAngle = (180 - angle) * Math.PI / 180;
        const fillEnd = {
          x: cx + r * Math.cos(fillAngle),
          y: cy - r * Math.sin(fillAngle),
        };
        const sweep = angle > 90 ? 1 : 0;
        return (
          <path
            d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 ${sweep} 1 ${fillEnd.x} ${fillEnd.y}`}
            fill="none" stroke={color} strokeWidth={4} strokeLinecap="round"
          />
        );
      })()}
      {/* Needle */}
      <line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y}
        stroke={color} strokeWidth={2} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={3} fill={color} />
    </svg>
  );
}

function SignalRow({ label, value, unit, subtext, color }: {
  label: string; value: string; unit?: string; subtext?: string; color?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0" }}>
      <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{label}</span>
      <div style={{ textAlign: "right" }}>
        <span style={{ fontSize: "0.88rem", fontWeight: 600, fontFamily: "var(--font-mono)", color: color ?? "var(--text-primary)" }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginLeft: "3px" }}>{unit}</span>}
        {subtext && (
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{subtext}</div>
        )}
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
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Laddar puls…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card" style={{ padding: "12px" }}>
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Pulsdata ej tillgänglig</div>
      </div>
    );
  }

  // Combined activity ratio
  const decisionRatio = data.decisions.baseline_90d > 0
    ? data.decisions.last_90d / data.decisions.baseline_90d : 1;
  const statementRatio = data.statements.baseline_30d > 0
    ? data.statements.last_30d / data.statements.baseline_30d : 1;
  const combinedRatio = (decisionRatio + statementRatio) / 2;

  const level = activityLevel(combinedRatio);

  return (
    <div className="card" style={{ padding: "12px" }}>
      {/* Header */}
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
        Energipuls
      </div>

      {/* Gauge */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
        <MiniGauge angle={level.angle} color={level.color} size={80} />
        <div>
          <div style={{ fontSize: "1rem", fontWeight: 700, color: level.color }}>{level.label}</div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
            aktivitet vs historiskt snitt
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: "1px solid var(--border-color)", margin: "8px 0" }} />

      {/* Signal rows */}
      <SignalRow
        label="Beslut (90d)"
        value={String(data.decisions.last_90d)}
        subtext={`snitt: ${data.decisions.baseline_90d}/90d`}
      />
      <SignalRow
        label="Uttalanden (30d)"
        value={String(data.statements.last_30d)}
        subtext={`~${data.statements.per_week_avg.toFixed(1)}/vecka`}
      />
      {data.spot.se3_avg_7d !== null && (
        <>
          <div style={{ borderTop: "1px solid var(--border-color)", margin: "6px 0" }} />
          <SignalRow
            label="SE3 snitt (7d)"
            value={data.spot.se3_avg_7d.toFixed(1)}
            unit="EUR/MWh"
          />
          {data.spot.se_spread_avg_7d !== null && (
            <SignalRow
              label="Zonspread (7d)"
              value={data.spot.se_spread_avg_7d.toFixed(1)}
              unit="EUR/MWh"
              color={data.spot.se_spread_avg_7d > 10 ? "#ef4444" : data.spot.se_spread_avg_7d > 5 ? "#f59e0b" : "#10b981"}
            />
          )}
        </>
      )}

      {/* Evidence */}
      <div style={{ borderTop: "1px solid var(--border-color)", margin: "8px 0 4px" }} />
      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
        ● {data.evidence.manifest_id} | {data.evidence.root_hash.slice(0, 10)}…
      </div>
    </div>
  );
}
