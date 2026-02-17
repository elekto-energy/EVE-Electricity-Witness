"use client";

interface ResultPanelProps {
  result: any;
}

function Stat({ label, value, unit }: { label: string; value: string | number | null; unit?: string }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded p-3">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-lg font-mono font-semibold text-slate-100">
        {value ?? "—"}
        {unit && <span className="text-xs text-slate-500 ml-1">{unit}</span>}
      </div>
    </div>
  );
}

function fmt(v: number | null, d = 2): string {
  if (v === null) return "—";
  return v.toFixed(d);
}

function fmtInt(v: number | null): string {
  if (v === null) return "—";
  return Math.round(v).toLocaleString("en-US");
}

export default function ResultPanel({ result }: ResultPanelProps) {
  const gm = result.generation_mix_avg_mw;

  return (
    <div className="mt-4 bg-slate-900 border border-slate-800 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
        Result — {result.zone} — {result.period.from} to {result.period.to}
      </h2>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat label="Spot Mean" value={fmt(result.spot.mean)} unit="EUR/MWh" />
        <Stat label="CO₂ Production" value={fmt(result.production_co2.mean)} unit="g/kWh" />
        <Stat label="CO₂ Consumption" value={fmt(result.consumption_co2.mean)} unit="g/kWh" />
        <Stat label="Net Import" value={fmtInt(result.net_import.mean)} unit="MW" />
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-5">
        <Stat label="Spot Min" value={fmt(result.spot.min)} />
        <Stat label="Spot Max" value={fmt(result.spot.max)} />
        <Stat label="Temp Mean" value={fmt(result.temperature.mean, 1)} unit="°C" />
        <Stat label="HDD" value={fmtInt(result.hdd.sum)} />
        <Stat label="Hours" value={result.hours_total} />
        <Stat label="Rows" value={result.rows_count} />
      </div>

      {/* Generation mix */}
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        Generation Mix (Avg MW)
      </h3>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[
          ["Nuclear", gm.nuclear],
          ["Hydro", gm.hydro],
          ["Wind", gm.wind_onshore],
          ["Solar", gm.solar],
          ["Gas", gm.gas],
          ["Other", gm.other],
        ].map(([label, val]) => (
          <div key={label as string} className="text-center p-2 bg-slate-800/30 rounded">
            <div className="text-[10px] text-slate-500">{label as string}</div>
            <div className="text-sm font-mono text-slate-300">{fmtInt(val as number)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
