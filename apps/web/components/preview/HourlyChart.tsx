/**
 * Minimal SVG line chart for hourly prices (one line per zone). Server component, no chart library.
 * Hours without a value are left as gaps; nothing is interpolated.
 */

import { hourLabel } from "@/lib/preview/snapshot";

export interface Series { key: string; label: string; color: string; points: [string, number][] }

export function HourlyChart({ series, unit, height = 260 }: { series: Series[]; unit: string; height?: number }) {
  const all = series.flatMap(s => s.points.map(p => p[1]));
  const times = [...new Set(series.flatMap(s => s.points.map(p => p[0])))].sort();
  if (!all.length || !times.length) {
    return <div style={{ padding: 24, color: "var(--s-muted)", fontSize: "0.9rem" }}>Ingen timdata att visa för dygnet.</div>;
  }
  const W = 1080, H = height, L = 52, R = 12, T = 20, B = 30;
  const span = Math.max(...all) - Math.min(0, Math.min(...all)) || 1;
  const step = [10, 20, 25, 50, 100, 200, 250, 500, 1000].find(s => span / s <= 6) ?? 1000;
  const lo = Math.min(0, Math.floor(Math.min(...all) / step) * step);
  const hi = Math.ceil(Math.max(...all) / step) * step || step;
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, times.length - 1);
  const y = (v: number) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const idx = new Map(times.map((t, i) => [t, i]));
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label={`Timpris ${unit}`}>
      {ticks.map(v => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} style={{ stroke: "var(--s-line)" }} strokeWidth={1} />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={12} style={{ fill: "var(--s-muted)" }}>{v}</text>
        </g>
      ))}
      {times.map((t, i) => (i % 3 === 0 ? (
        <text key={t} x={x(i)} y={H - 10} textAnchor="middle" fontSize={12} style={{ fill: "var(--s-muted)" }}>{hourLabel(t)}</text>
      ) : null))}
      {series.map(s => {
        const segs: string[] = [];
        let cur = "";
        let prev = -2;
        for (const [t, v] of s.points) {
          const i = idx.get(t)!;
          cur += `${i === prev + 1 && cur ? "L" : (cur ? " M" : "M")}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
          prev = i;
        }
        if (cur) segs.push(cur);
        return <path key={s.key} d={segs.join(" ")} fill="none" style={{ stroke: s.color }} strokeWidth={2.25} strokeLinejoin="round" />;
      })}
      <text x={L} y={T - 2} fontSize={12} style={{ fill: "var(--s-muted)" }}>{unit}</text>
    </svg>
  );
}
