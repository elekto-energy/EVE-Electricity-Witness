"use client";

interface ResultPanelProps {
  result: any;
}

function fmt(v: number | null, d = 2): string {
  if (v === null || v === undefined) return "–";
  return v.toFixed(d);
}

function fmtInt(v: number | null): string {
  if (v === null || v === undefined) return "–";
  return Math.round(v).toLocaleString("en-US");
}

function Stat({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div style={{
      background: "var(--bg-primary)", border: "1px solid var(--border-color)",
      borderRadius: 6, padding: "8px 10px", flex: "1 1 100px", minWidth: 80,
    }}>
      <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? "var(--text-primary)", fontFamily: "var(--font-mono)", lineHeight: 1.2 }}>
        {value}
        {unit && <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 3, color: "var(--text-muted)" }}>{unit}</span>}
      </div>
    </div>
  );
}

const GEN_COLORS: Record<string, string> = {
  nuclear: "#a78bfa", hydro: "#3b82f6", wind_onshore: "#22d3ee", wind_offshore: "#06b6d4",
  solar: "#facc15", gas: "#f97316", coal: "#78716c", lignite: "#57534e", oil: "#44403c", other: "#a8a29e",
};

const GEN_LABELS: Record<string, string> = {
  nuclear: "Kärnkraft", hydro: "Vatten", wind_onshore: "Vind", wind_offshore: "Vind hav",
  solar: "Sol", gas: "Gas", coal: "Kol", lignite: "Brunkol", oil: "Olja", other: "Övrigt",
};

export default function ResultPanel({ result }: ResultPanelProps) {
  const gm = result.generation_mix_avg_mw;

  // Generation mix bar
  const genEntries = Object.entries(gm as Record<string, number | null>)
    .filter(([k, v]) => k !== "total" && v != null && v > 0)
    .map(([k, v]) => ({ key: k, value: v as number }));
  const genTotal = genEntries.reduce((s, e) => s + e.value, 0);

  return (
    <div className="card" style={{ padding: 20, marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
          {result.zone} — {result.period.from} → {result.period.to}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          {result.rows_count} rows · {result.hours_total}h
        </span>
      </div>

      {/* Key metrics */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <Stat label="Spot Mean" value={fmt(result.spot.mean)} unit="€/MWh" color="#f59e0b" />
        <Stat label="CO₂ Produktion" value={fmt(result.production_co2.mean)} unit="g/kWh" color="#22c55e" />
        <Stat label="CO₂ Konsumtion" value={fmt(result.consumption_co2.mean)} unit="g/kWh" color="#ef4444" />
        <Stat label="Nettoimport" value={fmtInt(result.net_import.mean)} unit="MW" color="#3b82f6" />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <Stat label="Spot Min" value={fmt(result.spot.min)} unit="€" />
        <Stat label="Spot Max" value={fmt(result.spot.max)} unit="€" />
        <Stat label="Temp" value={fmt(result.temperature.mean, 1)} unit="°C" color="#22d3ee" />
        <Stat label="HDD" value={fmtInt(result.hdd.sum)} />
      </div>

      {/* Generation mix stacked bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Produktionsmix (medel MW)
        </div>
        {genTotal > 0 && (
          <>
            <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden", marginBottom: 6 }}>
              {genEntries.map(e => {
                const pct = (e.value / genTotal) * 100;
                if (pct < 0.5) return null;
                return (
                  <div key={e.key} style={{
                    width: `${pct}%`, background: GEN_COLORS[e.key] ?? "#666",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: pct > 8 ? 8 : 0, color: "#fff", fontWeight: 600, fontFamily: "var(--font-mono)",
                  }} title={`${GEN_LABELS[e.key] ?? e.key}: ${Math.round(e.value)} MW (${pct.toFixed(1)}%)`}>
                    {pct > 12 ? `${GEN_LABELS[e.key] ?? e.key} ${pct.toFixed(0)}%` : pct > 5 ? `${pct.toFixed(0)}%` : ""}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px" }}>
              {genEntries.filter(e => (e.value / genTotal) * 100 >= 1).map(e => (
                <span key={e.key} style={{ fontSize: 9, color: "var(--text-muted)" }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: GEN_COLORS[e.key] ?? "#666", marginRight: 3, verticalAlign: "middle" }} />
                  {GEN_LABELS[e.key] ?? e.key} {fmtInt(e.value)} MW
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
