"use client";

/**
 * PriceDriverPanel — Visual correlation between spot price and its drivers.
 *
 * Shows spot price alongside temp, wind, solar, and generation mix
 * in a way that makes the causal patterns visually obvious:
 *   - Cold → high demand → high price
 *   - Low wind/solar → less supply → high price
 *   - High fossil share → high CO₂ → high price
 *
 * Witness-mode: Correlation shown, causation never claimed.
 *
 * TR1: No source, no number.
 * TR6: Code renders — never invents.
 */

import { useMemo } from "react";

interface V2Row {
  ts: string;
  spot: number | null;
  temp: number | null;
  wind_speed: number | null;
  solar_rad: number | null;
  hdd: number | null;
  nuclear_mw: number | null;
  hydro_mw: number | null;
  wind_onshore_mw: number | null;
  wind_offshore_mw: number | null;
  solar_mw: number | null;
  gas_mw: number | null;
  coal_mw: number | null;
  lignite_mw: number | null;
  oil_mw: number | null;
  other_mw: number | null;
  total_gen_mw: number | null;
  net_import_mw: number | null;
  production_co2_g_kwh: number | null;
  consumption_co2_g_kwh: number | null;
}

interface Props {
  rows: V2Row[];
  zone: string;
  mode: "day" | "month";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const r1 = (n: number | null) => n !== null ? n.toFixed(1) : "–";

function norm(val: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (val - min) / (max - min)));
}

function pearson(xs: number[], ys: number[]): number | null {
  const paired: [number, number][] = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    if (!isNaN(xs[i]) && !isNaN(ys[i])) paired.push([xs[i], ys[i]]);
  }
  if (paired.length < 3) return null;
  const n = paired.length;
  const sx = paired.reduce((s, [x]) => s + x, 0);
  const sy = paired.reduce((s, [, y]) => s + y, 0);
  const sxy = paired.reduce((s, [x, y]) => s + x * y, 0);
  const sx2 = paired.reduce((s, [x]) => s + x * x, 0);
  const sy2 = paired.reduce((s, [, y]) => s + y * y, 0);
  const den = Math.sqrt((n * sx2 - sx ** 2) * (n * sy2 - sy ** 2));
  return den > 0 ? Math.round((n * sxy - sx * sy) / den * 100) / 100 : null;
}

// ─── Correlation Badge ───────────────────────────────────────────────────────

function CorrBadge({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  const abs = Math.abs(value);
  const color = abs > 0.5 ? "var(--accent-red)" : abs > 0.3 ? "var(--accent-amber)" : "var(--text-muted)";
  const strength = abs > 0.7 ? "stark" : abs > 0.5 ? "tydlig" : abs > 0.3 ? "svag" : "ingen";
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: "var(--bg-card)", border: "1px solid var(--border-color)",
      borderRadius: 6, padding: "4px 10px", fontSize: 11,
    }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ color, fontWeight: 700, fontFamily: "var(--font-mono)" }}>r = {value.toFixed(2)}</span>
      <span style={{ color: "var(--text-muted)", fontSize: 9 }}>({strength})</span>
    </div>
  );
}

// ─── Multi-line SVG Chart ────────────────────────────────────────────────────

function MultiLineChart({ rows, mode }: { rows: V2Row[]; mode: "day" | "month" }) {
  if (rows.length < 2) return null;

  const W = 760, H = 280;
  const PAD = { top: 16, right: 16, bottom: 32, left: 48 };
  const pW = W - PAD.left - PAD.right;
  const pH = H - PAD.top - PAD.bottom;

  // Normalize all series to 0-1 for overlay
  const extract = (fn: (r: V2Row) => number | null) => rows.map(fn);

  const spotRaw = extract(r => r.spot);
  const tempRaw = extract(r => r.temp);
  const windRaw = extract(r => r.wind_onshore_mw !== null && r.wind_offshore_mw !== null
    ? (r.wind_onshore_mw + r.wind_offshore_mw) : r.wind_speed);
  const solarRaw = extract(r => r.solar_mw ?? r.solar_rad);
  const co2Raw = extract(r => r.production_co2_g_kwh);

  const series: { label: string; color: string; dash?: string; data: (number | null)[] }[] = [
    { label: "Spot", color: "var(--accent-amber)", data: spotRaw },
    { label: "Temp", color: "#22d3ee", dash: "4 2", data: tempRaw },
    { label: "Wind", color: "#94a3b8", dash: "6 2", data: windRaw },
    { label: "Solar", color: "#facc15", dash: "3 3", data: solarRaw },
    { label: "CO₂", color: "var(--accent-green)", dash: "2 2", data: co2Raw },
  ];

  const x = (i: number) => PAD.left + (i / (rows.length - 1)) * pW;

  function makePath(data: (number | null)[]): string {
    const valid = data.filter((v): v is number => v !== null);
    if (valid.length < 2) return "";
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const range = max - min || 1;
    const yScale = (v: number) => PAD.top + pH - ((v - min) / range) * pH;

    return data.map((v, i) => {
      if (v === null) return "";
      const prev = i > 0 ? data[i - 1] : null;
      return `${prev === null ? "M" : "L"} ${x(i)} ${yScale(v)}`;
    }).filter(Boolean).join(" ");
  }

  // X ticks
  const xStep = rows.length <= 25 ? 4 : rows.length <= 168 ? 24 : Math.floor(rows.length / 8);
  const xTicks: number[] = [];
  for (let i = 0; i < rows.length; i += xStep) xTicks.push(i);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + pH * (1 - f)} y2={PAD.top + pH * (1 - f)}
            stroke="var(--border-color)" strokeWidth={0.5} />
        ))}
        {/* Y labels */}
        <text x={PAD.left - 4} y={PAD.top + 4} textAnchor="end" fontSize={8} fill="var(--text-muted)">high</text>
        <text x={PAD.left - 4} y={PAD.top + pH + 4} textAnchor="end" fontSize={8} fill="var(--text-muted)">low</text>
        {/* X labels */}
        {xTicks.map(i => {
          const row = rows[i];
          if (!row) return null;
          const d = new Date(row.ts);
          const label = mode === "day"
            ? d.getUTCHours().toString().padStart(2, "0") + ":00"
            : `${(d.getUTCMonth() + 1).toString().padStart(2, "0")}/${d.getUTCDate().toString().padStart(2, "0")}`;
          return <text key={i} x={x(i)} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--text-muted)" fontFamily="var(--font-mono)">{label}</text>;
        })}
        {/* Series */}
        {series.map(s => {
          const path = makePath(s.data);
          if (!path) return null;
          return (
            <path key={s.label} d={path} fill="none" stroke={s.color}
              strokeWidth={s.label === "Spot" ? 2.5 : 1.5}
              strokeDasharray={s.dash ?? "none"}
              opacity={s.label === "Spot" ? 1 : 0.7} />
          );
        })}
      </svg>
      {/* Legend */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 4, paddingLeft: PAD.left }}>
        {series.map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <svg width={20} height={3}>
              <line x1={0} y1={1.5} x2={20} y2={1.5} stroke={s.color}
                strokeWidth={s.label === "Spot" ? 2.5 : 1.5}
                strokeDasharray={s.dash ?? "none"} />
            </svg>
            <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Heatmap Row ─────────────────────────────────────────────────────────────

function HeatmapStrip({ rows, field, label, color, invert }: {
  rows: V2Row[];
  field: keyof V2Row;
  label: string;
  color: string;
  invert?: boolean;
}) {
  const values = rows.map(r => r[field] as number | null);
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  const min = Math.min(...valid);
  const max = Math.max(...valid);

  return (
    <div style={{ marginBottom: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)", width: 80, textAlign: "right" }}>{label}</span>
        <div style={{ display: "flex", flex: 1, height: 18, borderRadius: 3, overflow: "hidden" }}>
          {values.map((v, i) => {
            if (v === null) return <div key={i} style={{ flex: 1, background: "var(--bg-primary)" }} />;
            let intensity = norm(v, min, max);
            if (invert) intensity = 1 - intensity;
            return (
              <div
                key={i}
                style={{ flex: 1, background: color, opacity: 0.15 + intensity * 0.85 }}
                title={`${new Date(rows[i].ts).getUTCHours()}:00 — ${r1(v)}`}
              />
            );
          })}
        </div>
        <span style={{ fontSize: 9, color: "var(--text-muted)", width: 50, fontFamily: "var(--font-mono)" }}>
          {r1(valid.reduce((s, v) => s + v, 0) / valid.length)}
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PriceDriverPanel({ rows, zone, mode }: Props) {
  const correlations = useMemo(() => {
    const spots = rows.map(r => r.spot).filter((v): v is number => v !== null);
    const temps = rows.filter(r => r.spot !== null && r.temp !== null).map(r => r.temp!);
    const winds = rows.filter(r => r.spot !== null && r.wind_speed !== null).map(r => r.wind_speed!);
    const windMw = rows.filter(r => r.spot !== null && r.wind_onshore_mw !== null)
      .map(r => (r.wind_onshore_mw ?? 0) + (r.wind_offshore_mw ?? 0));
    const solarMw = rows.filter(r => r.spot !== null && r.solar_mw !== null).map(r => r.solar_mw!);
    const co2s = rows.filter(r => r.spot !== null && r.production_co2_g_kwh !== null).map(r => r.production_co2_g_kwh!);
    const spotsForTemp = rows.filter(r => r.spot !== null && r.temp !== null).map(r => r.spot!);
    const spotsForWind = rows.filter(r => r.spot !== null && r.wind_speed !== null).map(r => r.spot!);
    const spotsForWindMw = rows.filter(r => r.spot !== null && r.wind_onshore_mw !== null).map(r => r.spot!);
    const spotsForSolar = rows.filter(r => r.spot !== null && r.solar_mw !== null).map(r => r.spot!);
    const spotsForCo2 = rows.filter(r => r.spot !== null && r.production_co2_g_kwh !== null).map(r => r.spot!);

    return {
      temp: pearson(spotsForTemp, temps),
      wind: pearson(spotsForWind, winds),
      windMw: pearson(spotsForWindMw, windMw),
      solar: pearson(spotsForSolar, solarMw),
      co2: pearson(spotsForCo2, co2s),
    };
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Price Drivers — {zone}</span>
        <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
          Alla serier normaliserade (0–1) för jämförelse
        </span>
      </div>

      {/* Overlay chart */}
      <MultiLineChart rows={rows} mode={mode} />

      {/* Correlation badges */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        <CorrBadge label="Spot ↔ Temp" value={correlations.temp} />
        <CorrBadge label="Spot ↔ Wind MW" value={correlations.windMw} />
        <CorrBadge label="Spot ↔ Solar MW" value={correlations.solar} />
        <CorrBadge label="Spot ↔ CO₂" value={correlations.co2} />
      </div>

      {/* Heatmap strips */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
          Intensitetskarta — mörk = hög, ljus = låg
        </div>
        <HeatmapStrip rows={rows} field="spot" label="Spot €/MWh" color="var(--accent-amber)" />
        <HeatmapStrip rows={rows} field="temp" label="Temp °C" color="#22d3ee" invert />
        <HeatmapStrip rows={rows} field="wind_onshore_mw" label="Wind MW" color="#94a3b8" invert />
        <HeatmapStrip rows={rows} field="solar_mw" label="Solar MW" color="#facc15" invert />
        <HeatmapStrip rows={rows} field="production_co2_g_kwh" label="CO₂ g/kWh" color="var(--accent-green)" />
        <HeatmapStrip rows={rows} field="hdd" label="HDD" color="var(--accent-red)" />
        <HeatmapStrip rows={rows} field="net_import_mw" label="Net import" color="var(--accent-blue)" />
      </div>

      {/* Witness disclaimer */}
      <div style={{ fontSize: 9, color: "var(--text-muted)", borderTop: "1px solid var(--border-color)", paddingTop: 8, marginTop: 12 }}>
        Korrelation ≠ kausalitet. Visad r-koefficient är Pearson-korrelation för vald period.
        Priser påverkas även av: vattenkraftmagasin, gasmarknadspriser, transmissionsflöden, politiska beslut.
      </div>
    </div>
  );
}
