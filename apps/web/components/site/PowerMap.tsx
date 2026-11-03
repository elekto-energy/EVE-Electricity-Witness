"use client";

import { useEffect, useMemo, useState } from "react";
import { COUNTRY_PATHS, MAP_W, MAP_H, project } from "@/lib/map/geo";

export interface MapZone {
  zone: string;
  name: string;
  status: string;
  mean: number | null;
  quarters: [string, number][]; // UTC start, ore/kWh
}
export interface MapFlow { border: string; from: string; to: string; hourly: [string, number][] } // net MW from->to
export interface MapDay { key: "today" | "tomorrow"; label: string; dateLabel: string; zones: MapZone[]; flows: MapFlow[]; fx: { rate: number; date: string } | null }

/** Approximate marker positions inside each bidding zone (lon, lat). Not zone borders. */
const POS: Record<string, [number, number]> = {
  SE1: [20.2, 66.7], SE2: [16.0, 63.5], SE3: [15.4, 59.4], SE4: [14.1, 56.6],
  FI: [26.0, 62.6], NO4: [18.9, 69.4], NO3: [10.6, 63.2], NO1: [10.4, 60.6],
  DK1: [9.2, 56.2], DK2: [12.0, 55.45], DE_LU: [10.3, 53.75], PL: [18.4, 53.9], LT: [23.4, 55.4],
};
const SE = new Set(["SE1", "SE2", "SE3", "SE4"]);

const STOPS: [number, [number, number, number]][] = [
  [0, [63, 143, 176]], [50, [118, 160, 120]], [100, [214, 162, 30]], [200, [196, 90, 60]], [300, [176, 40, 92]],
];
function priceColor(v: number | null): string {
  if (v === null) return "var(--s-line)";
  const x = Math.max(STOPS[0][0], Math.min(STOPS[STOPS.length - 1][0], v));
  for (let i = 1; i < STOPS.length; i++) {
    const [b, cb] = STOPS[i], [a, ca] = STOPS[i - 1];
    if (x <= b) {
      const t = (x - a) / (b - a);
      const c = ca.map((q, j) => Math.round(q + (cb[j] - q) * t));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return "rgb(176,40,92)";
}

const fmt = (x: number | null, d = 1) => (x === null ? "–" : x.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }));
const clock = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function stockholmDateNow(): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const g = (t: string) => p.find(x => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

export function PowerMap({ days, snapshotToday }: { days: MapDay[]; snapshotToday: string }) {
  const [k, setK] = useState<MapDay["key"]>("today");
  const day = days.find(d => d.key === k) ?? days[0];
  const times = useMemo(() => {
    const ref = day.zones.find(z => z.quarters.length > 0);
    return ref ? ref.quarters.map(q => q[0]) : [];
  }, [day]);
  const [qi, setQi] = useState(48);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null); // set by tap/click, survives mouseleave

  // Start at the current quarter when the viewer is on the snapshot's day; otherwise 12:00.
  useEffect(() => {
    if (k !== "today" || stockholmDateNow() !== snapshotToday) return;
    const now = Date.now();
    const i = times.findIndex((t, j) => Date.parse(t) <= now && (j === times.length - 1 || Date.parse(times[j + 1]) > now));
    if (i >= 0) setQi(i);
  }, [k, times, snapshotToday]);

  const idx = Math.min(qi, Math.max(0, times.length - 1));
  const t = times[idx] ?? null;
  const tEnd = times[idx + 1] ?? (t ? new Date(Date.parse(t) + 15 * 60000).toISOString() : null);
  const priceAt = (z: MapZone) => {
    if (z.status !== "COMPLETE" && z.status !== "PARTIAL") return null;
    const q = z.quarters.find(q => q[0] === t);
    return q ? q[1] : null;
  };
  const hourKey = t ? new Date(Math.floor(Date.parse(t) / 3600000) * 3600000).toISOString() : null;
  const zoneBy = new Map(day.zones.map(z => [z.zone, z]));
  // Flows: the measured hour that contains the selected quarter; if that hour is not measured yet,
  // the latest measured hour before it (labelled as such). Never extrapolated.
  const flowsNow = day.flows.map(f => {
    const exact = f.hourly.find(h => h[0] === hourKey);
    if (exact) return { ...f, mw: exact[1], at: exact[0], stale: false };
    const prev = hourKey ? [...f.hourly].filter(h => h[0] < hourKey).pop() : undefined;
    return prev ? { ...f, mw: prev[1], at: prev[0], stale: true } : { ...f, mw: null as number | null, at: null as string | null, stale: false };
  });
  const hasFlows = flowsNow.some(f => f.mw !== null);
  const topFlow = [...flowsNow].filter(f => f.mw !== null).sort((a, b) => Math.abs(b.mw as number) - Math.abs(a.mw as number))[0] ?? null;
  const staleAt = flowsNow.filter(f => f.stale && f.at).map(f => f.at as string).sort().pop() ?? null;
  const sel = hover ?? pinned;
  const hz = sel ? zoneBy.get(sel) ?? null : null;

  return (
    <div className="s-map">
      <div className="s-map-controls">
        <div className="s-toggle" role="group" aria-label="Välj dygn">
          {days.map(d => (
            <button key={d.key} type="button" aria-pressed={d.key === k} onClick={() => { setK(d.key); setQi(48); setHover(null); setPinned(null); }}>{d.label}</button>
          ))}
        </div>
        <label className="s-time">
          <span className="s-num"><b>{t ? `${clock(t)}–${tEnd ? clock(tEnd) : ""}` : "–"}</b> {day.dateLabel}</span>
          <input type="range" min={0} max={Math.max(0, times.length - 1)} step={1} value={idx}
            onChange={e => setQi(Number(e.target.value))} aria-label="Välj kvart" disabled={times.length === 0} />
        </label>
      </div>

      <div className="s-map-stage">
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="s-map-svg" role="img"
          aria-label={`Karta med elpriser per elområde, ${day.dateLabel}${t ? " klockan " + clock(t) : ""}`}
          onClick={() => { setHover(null); setPinned(null); }}>
          <rect width={MAP_W} height={MAP_H} className="s-map-water" />
          {Object.entries(COUNTRY_PATHS).map(([iso, d]) => (
            <path key={iso} d={d} className={iso === "SWE" ? "s-map-se" : "s-map-land"} />
          ))}

          {flowsNow.map(f => {
            if (f.mw === null || !POS[f.from] || !POS[f.to]) return null;
            const forward = f.mw >= 0;
            const [ax, ay] = project(...POS[forward ? f.from : f.to]);
            const [bx, by] = project(...POS[forward ? f.to : f.from]);
            const mx = (ax + bx) / 2, my = (ay + by) / 2;
            const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
            const cx = mx - (dy / len) * len * 0.12, cy = my + (dx / len) * len * 0.12;
            const d = `M${ax},${ay} Q${cx},${cy} ${bx},${by}`;
            const w = 1.5 + Math.min(8, Math.abs(f.mw) / 450);
            const lx = 0.25 * ax + 0.5 * cx + 0.25 * bx, ly = 0.25 * ay + 0.5 * cy + 0.25 * by;
            return (
              <g key={f.border} className="s-flow">
                <path d={d} className="s-flow-base" style={{ strokeWidth: w }} />
                <path d={d} className="s-flow-dash" style={{ strokeWidth: Math.max(1.2, w * 0.45) }} />
                <g transform={`translate(${lx},${ly})`}>
                  <rect x={-24} y={-9} width={48} height={18} rx={9} className="s-flow-pill" />
                  <text textAnchor="middle" y={4} className="s-flow-text">{Math.round(Math.abs(f.mw)).toLocaleString("sv-SE")}</text>
                </g>
              </g>
            );
          })}

          {day.zones.map(z => {
            if (!POS[z.zone]) return null;
            const [x, y] = project(...POS[z.zone]);
            const v = priceAt(z);
            const big = SE.has(z.zone);
            const r = big ? 25 : 17;
            const active = sel === z.zone;
            return (
              <g key={z.zone} className="s-zmark" transform={`translate(${x},${y})`} tabIndex={0} role="button"
                aria-label={`${z.name}: ${v === null ? "pris saknas" : fmt(v) + " öre per kilowattimme"}`}
                onMouseEnter={() => setHover(z.zone)} onMouseLeave={() => setHover(h => (h === z.zone ? null : h))}
                onFocus={() => setHover(z.zone)} onBlur={() => setHover(h => (h === z.zone ? null : h))}
                onClick={e => { e.stopPropagation(); setPinned(z.zone); }}>
                <circle r={r + (active ? 4 : 0)} style={{ fill: priceColor(v) }} className={active ? "s-zdot s-zdot-on" : "s-zdot"} />
                <text y={big ? 5 : 4} textAnchor="middle" className={big ? "s-zval" : "s-zval s-zval-sm"}>{v === null ? "–" : v < 10 ? fmt(v) : Math.round(v)}</text>
                <text y={-r - 6} textAnchor="middle" className={big ? "s-zcode" : "s-zcode s-zcode-sm"}>{z.zone.replace("_LU", "")}</text>
              </g>
            );
          })}
        </svg>

        <aside className="s-map-panel" aria-live="polite">
          <div className="s-panel-head">
            <span>Spotpris</span>
            <b className="s-num">{t ? `${clock(t)}–${tEnd ? clock(tEnd) : ""}` : "–"}</b>
          </div>
          <ul className="s-plist">
            {day.zones.filter(z => SE.has(z.zone)).map(z => {
              const v = priceAt(z);
              const on = sel === z.zone;
              return (
                <li key={z.zone}>
                  <button type="button" className={on ? "s-prow on" : "s-prow"} aria-pressed={on}
                    onClick={() => setPinned(p => (p === z.zone ? null : z.zone))}
                    onMouseEnter={() => setHover(z.zone)} onMouseLeave={() => setHover(h => (h === z.zone ? null : h))}>
                    <span className="s-pdot" style={{ background: priceColor(v) }} />
                    <span className="s-pname"><b>{z.zone}</b> {z.name.replace(/^SE\d\s*/, "")}</span>
                    <span className="s-pval s-num">{fmt(v)}<small> öre/kWh</small></span>
                    <span className="s-pmean s-num">
                      {z.status === "COMPLETE" || z.status === "PARTIAL" ? `dygnsmedel ${fmt(z.mean)}` : z.status === "NOT_PUBLISHED_YET" ? "ej publicerat ännu" : "saknas"}
                      {z.status === "PARTIAL" ? ", delvis" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {hz && !SE.has(hz.zone) && (
            <div className="s-pextra">
              <div className="s-tip-name">{hz.name}</div>
              <div className="s-tip-price s-num">{fmt(priceAt(hz))} <span>öre/kWh</span></div>
              <div className="s-tip-meta s-num">dygnsmedel {fmt(hz.status === "COMPLETE" || hz.status === "PARTIAL" ? hz.mean : null)}</div>
            </div>
          )}
          {hz && priceAt(hz) !== null && day.fx && (
            <div className="s-tip-meta s-num" style={{ marginTop: 8 }}>
              {hz.zone.replace("_LU", "")}: {fmt(((priceAt(hz) as number) * 10) / day.fx.rate)} EUR/MWh på börsen
            </div>
          )}
          {topFlow && (
            <div className="s-pflow">
              Störst flöde just då: <b className="s-num">{Math.round(Math.abs(topFlow.mw as number)).toLocaleString("sv-SE")} MW</b>{" "}
              från {(topFlow.mw as number) >= 0 ? topFlow.from : topFlow.to} till {(topFlow.mw as number) >= 0 ? topFlow.to : topFlow.from}
              {topFlow.stale && topFlow.at ? ` (uppmätt ${clock(topFlow.at)})` : ""}
            </div>
          )}
          <p className="s-tip-hint">Peka eller tryck på ett område eller en rad.</p>
        </aside>
      </div>

      <div className="s-map-legend">
        <div className="s-scale" aria-hidden="true">
          <span style={{ background: `linear-gradient(90deg, ${[0, 50, 100, 200, 300].map(priceColor).join(",")})` }} />
          <div className="s-scale-ticks s-num"><i>0</i><i>50</i><i>100</i><i>200</i><i>300+ öre/kWh</i></div>
        </div>
        <p className="s-note">
          {hasFlows
            ? `Pilarna visar uppmätt nettoflöde över gränsen i MW${staleAt ? `, senast uppmätta timme ${clock(staleAt)}` : " under timmen"}. Tjockare pil betyder mer el.`
            : "Uppmätta flöden finns bara för timmar som har passerat."}
          {" "}Punkterna markerar ungefär var elområdet ligger; områdenas gränser ritas inte.
          {day.fx ? ` Priser i öre/kWh före skatt, moms och nätavgift, omräknade med ECB:s kurs ${day.fx.rate.toLocaleString("sv-SE")} kr/EUR (${day.fx.date}).` : " Valutakurs saknas, så priset kan inte visas i öre/kWh."}
        </p>
      </div>
    </div>
  );
}
