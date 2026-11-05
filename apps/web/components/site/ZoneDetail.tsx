"use client";

/**
 * Zone detail dialog: quarter-hour prices for today/tomorrow (A44, PT15M) with hover/tap/keyboard readout, and the
 * zone's measured net exchange per border (A11, hourly) for the selected hour. Only measured values are shown;
 * an hour without a measurement is labelled as such, never filled.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MapDay } from "@/components/site/PowerMap";

const fmt = (x: number, d = 2) => x.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });
const clock = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const hourStart = (iso: string) => { const t = Date.parse(iso); return new Date(t - (t % 3600000)).toISOString(); };
const plus = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

const NAME: Record<string, string> = {
  SE1: "SE1 Luleå", SE2: "SE2 Sundsvall", SE3: "SE3 Stockholm", SE4: "SE4 Malmö", FI: "Finland", NO1: "Norge NO1",
  NO3: "Norge NO3", NO4: "Norge NO4", DK1: "Danmark DK1", DK2: "Danmark DK2", DE_LU: "Tyskland", PL: "Polen", LT: "Litauen",
};

const W = 640, H = 240, PL = 44, PR = 10, PT = 12, PB = 26;

function Chart({ points, color, sel, setSel, nowIso }: {
  points: [string, number][]; color: string; sel: number | null; setSel: (i: number | null) => void; nowIso: string | null;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const vals = points.map(p => p[1]);
  const lo = Math.min(0, ...vals), hi0 = Math.max(...vals);
  const step = hi0 - lo > 200 ? 100 : hi0 - lo > 80 ? 50 : hi0 - lo > 30 ? 20 : 10;
  const hi = Math.max(step, Math.ceil(hi0 / step) * step);
  const n = points.length;
  const x = (i: number) => PL + (i * (W - PL - PR)) / n;
  const y = (v: number) => PT + ((hi - v) * (H - PT - PB)) / (hi - lo);
  let d = "";
  points.forEach((p, i) => { d += `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}H${x(i + 1).toFixed(1)}`; });
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  const hourIdx = points.map((p, i) => [i, p[0]] as const).filter(([, t]) => clock(t).endsWith(":00") && Number(clock(t).slice(0, 2)) % 6 === 0);
  const nowI = nowIso ? points.findIndex(p => p[0] <= nowIso && nowIso < plus(p[0], 900000)) : -1;

  const pick = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    const i = Math.floor(((sx - PL) / (W - PL - PR)) * n);
    setSel(Math.max(0, Math.min(n - 1, i)));
  };
  const s = sel !== null && sel < n ? sel : null;
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="s-zd-chart" role="img"
      aria-label="Spotpris per kvart, öre per kilowattimme"
      onPointerMove={e => pick(e.clientX)} onPointerDown={e => pick(e.clientX)}>
      {ticks.map(v => (
        <g key={v}>
          <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} className={v === 0 ? "s-zd-zero" : "s-zd-grid"} />
          <text x={PL - 6} y={y(v) + 4} textAnchor="end" className="s-zd-tick">{v}</text>
        </g>
      ))}
      {hourIdx.map(([i, t]) => <text key={t} x={x(i)} y={H - 8} textAnchor="middle" className="s-zd-tick">{clock(t).slice(0, 2)}</text>)}
      <text x={W - PR} y={H - 8} textAnchor="end" className="s-zd-tick">24</text>
      {nowI >= 0 && <line x1={x(nowI)} x2={x(nowI)} y1={PT} y2={H - PB} className="s-zd-now" />}
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {s !== null && (
        <g pointerEvents="none">
          <line x1={x(s) + (x(s + 1) - x(s)) / 2} x2={x(s) + (x(s + 1) - x(s)) / 2} y1={PT} y2={H - PB} className="s-zd-cross" />
          <circle cx={x(s) + (x(s + 1) - x(s)) / 2} cy={y(points[s][1])} r={5} fill={color} className="s-zd-dot" />
        </g>
      )}
    </svg>
  );
}

export function ZoneDetail({ zone, city, days, onClose }: { zone: string; city: string; days: MapDay[]; onClose: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const avail = days.filter(d => (d.zones.find(z => z.zone === zone)?.quarters.length ?? 0) > 0);
  const [k, setK] = useState<MapDay["key"]>(avail[0]?.key ?? "today");
  const day = days.find(d => d.key === k) ?? days[0];
  const points = day.zones.find(z => z.zone === zone)?.quarters ?? [];
  const [nowIso, setNowIso] = useState<string | null>(null);
  useEffect(() => { setNowIso(new Date().toISOString()); }, []);
  const nowI = useMemo(() => (nowIso ? points.findIndex(p => p[0] <= nowIso && nowIso < plus(p[0], 900000)) : -1), [points, nowIso]);
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => { setSel(k === "today" && nowI >= 0 ? nowI : null); }, [k, nowI]);
  useEffect(() => { dlg.current?.showModal(); }, []);

  const color = `var(--s-${zone.toLowerCase()})`;
  const vals = points.map(p => p[1]);
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const iMin = vals.length ? vals.indexOf(Math.min(...vals)) : -1, iMax = vals.length ? vals.indexOf(Math.max(...vals)) : -1;
  const s = sel !== null && sel < points.length ? sel : null;

  // Measured exchange for the hour of the selected quarter, else the latest measured hour of today.
  const todayFlows = days.find(d => d.key === "today")?.flows ?? [];
  const mine = todayFlows.filter(f => f.from === zone || f.to === zone);
  const wantHour = k === "today" && s !== null ? hourStart(points[s][0]) : null;
  const measuredHours = [...new Set(mine.flatMap(f => f.hourly.map(h => h[0])))].sort();
  const hour = wantHour && measuredHours.includes(wantHour) ? wantHour : measuredHours.filter(h => !wantHour || h <= wantHour).pop() ?? null;
  const rows = hour ? mine.map(f => {
    const v = f.hourly.find(h => h[0] === hour)?.[1];
    if (v === undefined) return null;
    const other = f.from === zone ? f.to : f.from;
    const intoZone = f.from === zone ? -v : v; // + = import into zone
    return { other, mw: intoZone };
  }).filter((r): r is { other: string; mw: number } => r !== null).sort((a, b) => Math.abs(b.mw) - Math.abs(a.mw)) : [];
  const net = rows.reduce((a, r) => a + r.mw, 0);

  const move = (e: React.KeyboardEvent) => {
    if (!points.length) return;
    if (e.key === "ArrowRight") { setSel(i => Math.min(points.length - 1, (i ?? -1) + 1)); e.preventDefault(); }
    if (e.key === "ArrowLeft") { setSel(i => Math.max(0, (i ?? points.length) - 1)); e.preventDefault(); }
  };

  return (
    <dialog ref={dlg} className="s-zd" onClose={onClose} onClick={e => { if (e.target === dlg.current) dlg.current?.close(); }}
      aria-labelledby="s-zd-title" onKeyDown={move}>
      <div className="s-zd-inner" style={{ ["--zc" as string]: color }}>
        <div className="s-zd-head">
          <div>
            <h2 id="s-zd-title" className="s-zd-title"><span className="s-zd-code">{zone}</span> {city}</h2>
            <div className="s-note">Spotpris per kvart, öre/kWh, före skatt, moms och nätavgift.</div>
          </div>
          <button className="s-zd-close" onClick={() => dlg.current?.close()} aria-label="Stäng">×</button>
        </div>

        <div className="s-zd-tabs" role="tablist">
          {days.map(d => {
            const has = (d.zones.find(z => z.zone === zone)?.quarters.length ?? 0) > 0;
            return (
              <button key={d.key} role="tab" aria-selected={k === d.key} disabled={!has} onClick={() => setK(d.key)}>
                {d.label} <span>{d.dateLabel}</span>{!has && <em> publiceras runt kl 13</em>}
              </button>
            );
          })}
        </div>

        {points.length ? (
          <>
            <div className="s-zd-readout" aria-live="polite">
              {s !== null
                ? <><b className="s-num">{fmt(points[s][1])}</b> öre/kWh <span>{clock(points[s][0])}–{clock(plus(points[s][0], 900000))}{s === nowI && k === "today" ? " (nu)" : ""}</span></>
                : <span>Hovra, tryck eller använd piltangenterna för att se varje kvart.</span>}
            </div>
            <Chart points={points} color={color} sel={s} setSel={setSel} nowIso={k === "today" ? nowIso : null} />
            <div className="s-zd-stats">
              <div><span>Medel</span><b className="s-num">{mean !== null ? fmt(mean) : "–"}</b></div>
              <div><span>Lägst {iMin >= 0 ? clock(points[iMin][0]) : ""}</span><b className="s-num">{iMin >= 0 ? fmt(vals[iMin]) : "–"}</b></div>
              <div><span>Högst {iMax >= 0 ? clock(points[iMax][0]) : ""}</span><b className="s-num">{iMax >= 0 ? fmt(vals[iMax]) : "–"}</b></div>
            </div>
          </>
        ) : <p className="s-note">Inga kvartspriser för det här dygnet.</p>}

        <h3 className="s-zd-h3">Import och export {hour ? <span>{clock(hour)}–{clock(plus(hour, 3600000))}{wantHour && hour !== wantHour ? ", senaste uppmätta timme" : ""}</span> : null}</h3>
        {k !== "today" ? <p className="s-note">Flöden finns först när de har mätts.</p>
          : rows.length ? (
            <>
              <ul className="s-zd-flows">
                {rows.map(r => (
                  <li key={r.other}>
                    <span>{r.mw >= 0 ? "Import från" : "Export till"} <b>{NAME[r.other] ?? r.other}</b></span>
                    <span className={`s-num ${r.mw >= 0 ? "in" : "out"}`}>{r.mw >= 0 ? "←" : "→"} {fmt(Math.abs(r.mw), 0)} MW</span>
                  </li>
                ))}
              </ul>
              <p className="s-note">Netto {net >= 0 ? "import" : "export"} {fmt(Math.abs(net), 0)} MW. Uppmätta fysiska flöden (ENTSO-E), timmedel.</p>
            </>
          ) : <p className="s-note">Inga uppmätta flöden för timmen än.</p>}
        <p className="s-note s-zd-gen">Produktion per kraftslag (vatten, vind, kärnkraft …) visas här när den datan ingår i datakedjan.</p>
      </div>
    </dialog>
  );
}
