"use client";

/**
 * SpotChart — inline SVG area chart for day-ahead prices.
 * No external charting library. Deterministic rendering.
 * Gate C: receives data via props, no hardcoded values.
 */

interface PricePoint {
  hourISO: string;
  price: number;
}

interface ChartSeries {
  zone: string;
  series: PricePoint[];
  color: string;
}

interface SpotChartProps {
  data: ChartSeries[];
  currency?: string;
}

import { ZONE_COLORS, getZoneColor } from "@/lib/zone-colors";
export { getZoneColor };

export function SpotChart({ data, currency = "EUR/MWh" }: SpotChartProps) {
  if (data.length === 0 || data.every(d => d.series.length === 0)) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
        No price data available
      </div>
    );
  }

  const W = 760;
  const H = 300;
  const PAD = { top: 20, right: 60, bottom: 40, left: 60 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Find global min/max price
  const allPrices = data.flatMap(d => d.series.map(p => p.price));
  const minP = Math.floor(Math.min(...allPrices) / 10) * 10;
  const maxP = Math.ceil(Math.max(...allPrices) / 10) * 10;
  const priceRange = maxP - minP || 1;

  // Assume 24 hours
  const maxHours = Math.max(...data.map(d => d.series.length));

  const scaleX = (i: number) => PAD.left + (i / (maxHours - 1)) * plotW;
  const scaleY = (v: number) => PAD.top + plotH - ((v - minP) / priceRange) * plotH;

  // Y-axis ticks
  const yTicks: number[] = [];
  const yStep = priceRange <= 50 ? 10 : priceRange <= 200 ? 25 : 50;
  for (let v = minP; v <= maxP; v += yStep) yTicks.push(v);

  // X-axis ticks (adapt to resolution)
  const xTicks: number[] = [];
  const xStep = maxHours > 48 ? Math.floor(maxHours / 6) : maxHours > 24 ? Math.floor(maxHours / 8) : 4;
  for (let i = 0; i < maxHours; i += xStep) xTicks.push(i);

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, height: "auto" }}>
        {/* Grid lines */}
        {yTicks.map(v => (
          <line
            key={`yg-${v}`}
            x1={PAD.left} y1={scaleY(v)}
            x2={W - PAD.right} y2={scaleY(v)}
            stroke="var(--border-color)" strokeWidth={0.5}
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map(v => (
          <text
            key={`yl-${v}`}
            x={PAD.left - 8} y={scaleY(v) + 4}
            textAnchor="end" fontSize={10} fill="var(--text-muted)"
            fontFamily="var(--font-mono)"
          >
            {v}
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map(i => {
          const point = data[0]?.series[i];
          const label = point
            ? new Date(point.hourISO).getUTCHours().toString().padStart(2, "0") + ":00"
            : `${i}:00`;
          return (
            <text
              key={`xl-${i}`}
              x={scaleX(i)} y={H - PAD.bottom + 20}
              textAnchor="middle" fontSize={10} fill="var(--text-muted)"
              fontFamily="var(--font-mono)"
            >
              {label}
            </text>
          );
        })}

        {/* Y-axis title */}
        <text
          x={14} y={H / 2}
          textAnchor="middle" fontSize={10} fill="var(--text-muted)"
          transform={`rotate(-90, 14, ${H / 2})`}
        >
          {currency}
        </text>

        {/* Series lines */}
        {data.map(({ zone, series, color }) => {
          if (series.length === 0) return null;
          const pathD = series
            .map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(i)} ${scaleY(p.price)}`)
            .join(" ");

          // Area fill
          const areaD = pathD
            + ` L ${scaleX(series.length - 1)} ${scaleY(minP)}`
            + ` L ${scaleX(0)} ${scaleY(minP)} Z`;

          return (
            <g key={zone}>
              <path d={areaD} fill={color} fillOpacity={0.08} />
              <path d={pathD} fill="none" stroke={color} strokeWidth={2} />
              {/* Price dots — only for hourly or fewer points */}
              {series.length <= 24 && series.map((p, i) => (
                <circle
                  key={i}
                  cx={scaleX(i)} cy={scaleY(p.price)}
                  r={2.5}
                  fill={color}
                  opacity={0.7}
                >
                  <title>{zone} {new Date(p.hourISO).getUTCHours()}:00 — {p.price} {currency}</title>
                </circle>
              ))}
            </g>
          );
        })}

        {/* Average line per series */}
        {data.map(({ zone, series, color }) => {
          if (series.length === 0) return null;
          const avg = series.reduce((s, p) => s + p.price, 0) / series.length;
          const y = scaleY(avg);
          return (
            <g key={`avg-${zone}`}>
              <line
                x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                stroke={color} strokeWidth={1} strokeDasharray="6 3" opacity={0.6}
              />
              <text
                x={W - PAD.right + 4} y={y + 3}
                fontSize={9} fill={color} fontFamily="var(--font-mono)" opacity={0.8}
              >
                avg {avg.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Current time indicator (vertical line) */}
        {(() => {
          const now = new Date();
          const todayStr = now.toISOString().slice(0, 10);
          // Only show if chart date is today and we have series data
          const firstPoint = data[0]?.series[0];
          if (!firstPoint) return null;
          const chartDate = firstPoint.hourISO.slice(0, 10);
          if (chartDate !== todayStr) return null;

          const currentHour = now.getHours() + now.getMinutes() / 60;
          // Map currentHour to series index
          const step = 24 / maxHours; // hours per data point
          const idx = currentHour / step;
          if (idx < 0 || idx >= maxHours) return null;
          const x = scaleX(idx);

          return (
            <g>
              <line
                x1={x} y1={PAD.top} x2={x} y2={PAD.top + plotH}
                stroke="var(--accent-amber)" strokeWidth={1.5} strokeDasharray="4 2" opacity={0.8}
              />
              <text
                x={x} y={PAD.top - 4}
                textAnchor="middle" fontSize={9} fill="var(--accent-amber)"
                fontFamily="var(--font-mono)"
              >
                {now.getHours().toString().padStart(2, "0")}:{now.getMinutes().toString().padStart(2, "0")}
              </text>
            </g>
          );
        })()}

        {/* Legend */}
        {data.length > 1 && data.map(({ zone, color }, i) => (
          <g key={`leg-${zone}`} transform={`translate(${PAD.left + i * 80}, ${H - 8})`}>
            <rect width={12} height={3} fill={color} rx={1} />
            <text x={16} y={4} fontSize={10} fill="var(--text-secondary)" fontFamily="var(--font-mono)">
              {zone}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
