"use client";

/**
 * SpotTable — hourly price table with zone comparison.
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
  if (zones.length === 0) return null;

  // Build hour rows from the first zone (all zones share same hours)
  const maxLen = Math.max(...zones.map(z => z.series.length));
  const hours = Array.from({ length: maxLen }, (_, i) => i);

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Hour (UTC)</th>
            {zones.map(z => (
              <th key={z.zone}>{z.zone} ({currency})</th>
            ))}
            {zones.length > 1 && <th>Spread</th>}
          </tr>
        </thead>
        <tbody>
          {hours.map(i => {
            const prices = zones.map(z => z.series[i]?.price ?? null);
            const validPrices = prices.filter((p): p is number => p !== null);
            const spread = validPrices.length > 1
              ? (Math.max(...validPrices) - Math.min(...validPrices)).toFixed(2)
              : null;

            const hourLabel = zones[0]?.series[i]
              ? new Date(zones[0].series[i].hourISO).getUTCHours().toString().padStart(2, "0") + ":00"
              : `${i}:00`;

            return (
              <tr key={i}>
                <td>{hourLabel}</td>
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
          {/* Summary row */}
          <tr style={{ fontWeight: 600, borderTop: "2px solid var(--border-color)" }}>
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
  const ratio = (price - min) / range; // 0 = min, 1 = max

  if (ratio > 0.8) return { color: "var(--accent-red)" };
  if (ratio < 0.2) return { color: "var(--accent-green)" };
  return {};
}
