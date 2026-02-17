"use client";

import { useState } from "react";

/**
 * SpotTable — price table with expand/collapse for detail rows.
 * Summary (avg/min/max) always visible. Full price points behind expand.
 * Gate C: no hardcoded values, all data from props.
 */

interface PricePoint {
  hourISO: string;
  price: number;
}

interface TableZone {
  zone: string;
  series: PricePoint[];
  stats: { avg: number; min: number; max: number };
}

interface SpotTableProps {
  zones: TableZone[];
  currency?: string;
}

export function SpotTable({ zones, currency = "EUR/MWh" }: SpotTableProps) {
  const [expanded, setExpanded] = useState(false);

  if (zones.length === 0) return null;

  const maxLen = Math.max(...zones.map(z => z.series.length));
  const hours = Array.from({ length: maxLen }, (_, i) => i);

  // Format time label: HH:MM for 15-min data
  function timeLabel(i: number): string {
    const point = zones[0]?.series[i];
    if (!point) return `${i}`;
    const d = new Date(point.hourISO);
    return d.getUTCHours().toString().padStart(2, "0") + ":" +
           d.getUTCMinutes().toString().padStart(2, "0");
  }

  const colSpan = zones.length + (zones.length > 1 ? 2 : 1);

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Time (UTC)</th>
            {zones.map(z => (
              <th key={z.zone}>{z.zone} ({currency})</th>
            ))}
            {zones.length > 1 && <th>Spread</th>}
          </tr>
        </thead>
        <tbody>
          {/* Summary rows — always visible */}
          <tr style={{ fontWeight: 600 }}>
            <td>Avg</td>
            {zones.map(z => (
              <td key={z.zone}>{z.stats.avg.toFixed(2)}</td>
            ))}
            {zones.length > 1 && (
              <td style={{ color: "var(--accent-amber)" }}>
                {(Math.max(...zones.map(z => z.stats.avg)) - Math.min(...zones.map(z => z.stats.avg))).toFixed(2)}
              </td>
            )}
          </tr>
          <tr>
            <td>Min</td>
            {zones.map(z => (
              <td key={z.zone} style={{ color: "var(--accent-green)" }}>{z.stats.min.toFixed(2)}</td>
            ))}
            {zones.length > 1 && <td />}
          </tr>
          <tr>
            <td>Max</td>
            {zones.map(z => (
              <td key={z.zone} style={{ color: "var(--accent-red)" }}>{z.stats.max.toFixed(2)}</td>
            ))}
            {zones.length > 1 && <td />}
          </tr>

          {/* Expand toggle */}
          <tr>
            <td colSpan={colSpan} style={{ padding: 0 }}>
              <button
                onClick={() => setExpanded(e => !e)}
                style={{
                  width: "100%", padding: "8px", cursor: "pointer",
                  background: "transparent", border: "none",
                  borderTop: "1px solid var(--border-color)",
                  color: "var(--accent-blue)", fontSize: "0.82rem",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {expanded ? "▲ Hide price points" : `▼ Show all ${maxLen} price points`}
              </button>
            </td>
          </tr>

          {/* Detail rows — only when expanded */}
          {expanded && hours.map(i => {
            const prices = zones.map(z => z.series[i]?.price ?? null);
            const validPrices = prices.filter((p): p is number => p !== null);
            const spread = validPrices.length > 1
              ? (Math.max(...validPrices) - Math.min(...validPrices)).toFixed(2)
              : null;

            return (
              <tr key={i}>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}>{timeLabel(i)}</td>
                {prices.map((p, zi) => (
                  <td key={zi} style={getHeatStyle(p, zones[zi])}>
                    {p !== null ? p.toFixed(2) : "—"}
                  </td>
                ))}
                {zones.length > 1 && (
                  <td style={{ color: "var(--text-muted)" }}>{spread ?? "—"}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Subtle heat coloring based on price relative to zone min/max */
function getHeatStyle(price: number | null, zone: TableZone): React.CSSProperties {
  if (price === null) return {};
  const { min, max } = zone.stats;
  const range = max - min || 1;
  const ratio = (price - min) / range;

  if (ratio > 0.8) return { color: "var(--accent-red)" };
  if (ratio < 0.2) return { color: "var(--accent-green)" };
  return {};
}
