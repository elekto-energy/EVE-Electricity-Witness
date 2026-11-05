"use client";

/**
 * Bottlenecks between the Swedish zones (SE1->SE2->SE3->SE4): hourly price difference (A44, hourly mean of quarters,
 * ore/kWh via ECB rate), measured net flow (A11, hourly mean) and an ESTIMATED congestion income per hour
 * = (price downstream - price upstream) x flow upstream->downstream. Labelled as an estimate: official congestion
 * income (Svk) is computed on commercial flows, not physical ones. Hours without both values are left out, never filled.
 */

import { useState } from "react";

export interface LinkHour { hour: string; diffOre: number; flowMw: number; incomeSek: number }
export interface LinkDay { from: string; to: string; hours: LinkHour[]; expectedHours: number }
export interface BottleneckDay { key: "yesterday" | "today"; label: string; dateLabel: string; links: LinkDay[]; fx: { rate: number; date: string } | null }

const CONGESTED_ORE = 0.01; // hours with a price difference above this (ore/kWh) count as "price difference"
const fmt = (x: number, d = 0) => x.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });
const clock = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit" }).format(new Date(iso));
const CITY: Record<string, string> = { SE1: "Luleå", SE2: "Sundsvall", SE3: "Stockholm", SE4: "Malmö" };

function Bars({ link }: { link: LinkDay }) {
  const W = 300, H = 64;
  const max = Math.max(0.01, ...link.hours.map(h => Math.abs(h.diffOre)));
  const hasNeg = link.hours.some(h => h.diffOre < -CONGESTED_ORE), hasPos = link.hours.some(h => h.diffOre > CONGESTED_ORE);
  const base = hasNeg && hasPos ? H / 2 : hasNeg ? 2 : H;           // baseline: middle only when both signs occur
  const span = hasNeg && hasPos ? H / 2 - 2 : H - 4;
  const bw = W / Math.max(24, link.hours.length);
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="s-bn-bars" role="img" aria-label={`Prisskillnad per timme ${link.from} till ${link.to}`}>
      <line x1={0} x2={W} y1={base} y2={base} className="s-bn-base" />
      {link.hours.map((h, i) => {
        const hgt = Math.max(1, (Math.abs(h.diffOre) / max) * span);
        const cls = h.diffOre > CONGESTED_ORE ? "s-bn-bar pos" : h.diffOre < -CONGESTED_ORE ? "s-bn-bar neg" : "s-bn-bar";
        return (
          <rect key={h.hour} x={i * bw + 1} y={h.diffOre >= 0 ? base - hgt : base} width={Math.max(1, bw - 2)} height={hgt} rx={1.5} className={cls}>
            <title>{`${clock(h.hour)}–${clock(new Date(Date.parse(h.hour) + 3600000).toISOString())}: ${link.to} ${h.diffOre >= 0 ? "dyrare" : "billigare"} än ${link.from} med ${fmt(Math.abs(h.diffOre), 2)} öre/kWh, flöde ${fmt(h.flowMw)} MW, uppskattad intäkt ${fmt(h.incomeSek / 1000)} tkr`}</title>
          </rect>
        );
      })}
      {[0, 6, 12, 18].map(k => link.hours[k] && <text key={k} x={k * bw} y={H + 12} className="s-bn-tick">{clock(link.hours[k].hour)}</text>)}
    </svg>
  );
}

export function Bottlenecks({ days }: { days: BottleneckDay[] }) {
  const usable = days.filter(d => d.links.some(l => l.hours.length));
  const [k, setK] = useState<BottleneckDay["key"]>(usable[0]?.key ?? "yesterday");
  const day = days.find(d => d.key === k) ?? days[0];
  if (!usable.length) return <p className="s-note">Flöden och priser för att visa flaskhalsar saknas i den här datan.</p>;
  const total = day.links.reduce((a, l) => a + l.hours.reduce((b, h) => b + h.incomeSek, 0), 0);
  return (
    <div className="s-bn">
      <div className="s-zd-tabs" role="tablist">
        {days.map(d => {
          const has = d.links.some(l => l.hours.length);
          return <button key={d.key} role="tab" aria-selected={k === d.key} disabled={!has} onClick={() => setK(d.key)}>{d.label} <span>{d.dateLabel}</span></button>;
        })}
      </div>
      <div className="s-bn-grid">
        {day.links.map(l => {
          const congested = l.hours.filter(h => Math.abs(h.diffOre) > CONGESTED_ORE);
          const meanDiff = l.hours.length ? l.hours.reduce((a, h) => a + h.diffOre, 0) / l.hours.length : null;
          const meanFlow = l.hours.length ? l.hours.reduce((a, h) => a + h.flowMw, 0) / l.hours.length : null;
          const income = l.hours.reduce((a, h) => a + h.incomeSek, 0);
          return (
            <div key={l.from + l.to} className="s-bn-card">
              <div className="s-bn-head">
                <span className="s-bn-zone" style={{ color: `var(--s-${l.from.toLowerCase()})` }}>{l.from}</span>
                <span className="s-bn-arrow" aria-hidden="true">→</span>
                <span className="s-bn-zone" style={{ color: `var(--s-${l.to.toLowerCase()})` }}>{l.to}</span>
                <span className="s-bn-cities">{CITY[l.from]} till {CITY[l.to]}</span>
              </div>
              {l.hours.length ? (
                <>
                  <div className="s-bn-big">
                    <b className="s-num">{congested.length}</b> av {l.hours.length} timmar med prisskillnad
                    {l.hours.length < l.expectedHours ? <span className="s-bn-gap"> ({l.expectedHours - l.hours.length} timmar utan mätning)</span> : null}
                  </div>
                  <Bars link={l} />
                  <div className="s-bn-legend"><span><i className="pos" />{l.to} dyrare</span>{l.hours.some(h => h.diffOre < -CONGESTED_ORE) && <span><i className="neg" />{l.to} billigare</span>}</div>
                  <dl className="s-bn-facts">
                    <div><dt>Prisskillnad, medel</dt><dd className="s-num">{meanDiff !== null ? `${fmt(meanDiff, 2)} öre/kWh` : "–"}</dd></div>
                    <div><dt>Flöde, medel</dt><dd className="s-num">{meanFlow !== null ? `${fmt(meanFlow)} MW` : "–"}</dd></div>
                    <div><dt>Uppskattad flaskhalsintäkt</dt><dd className="s-num">{fmt(income / 1e6, 1)} mkr</dd></div>
                  </dl>
                </>
              ) : <p className="s-note">Ingen timme med både pris och uppmätt flöde.</p>}
            </div>
          );
        })}
      </div>
      <p className="s-bn-total">
        Uppskattade flaskhalsintäkter inom Sverige {day.label.toLowerCase()}: <b className="s-num">{fmt(total / 1e6, 1)} miljoner kronor</b>
      </p>
      <p className="s-note">
        När nätet inte räcker till för att föra billig el dit den efterfrågas glider priserna isär mellan elområdena.
        Skillnaden betalas av köparna i det dyrare området och blir flaskhalsintäkt hos Svenska kraftnät. Här är den
        uppskattad som prisskillnad × uppmätt fysiskt flöde, timme för timme. Går flödet mot prisskillnaden (från det
        dyrare mot det billigare området) blir uppskattningen negativ. Det kan hända eftersom kapaciteten beräknas för
        hela nätet och det fysiska flödet inte är detsamma som det handlade. Svenska kraftnäts officiella intäkter räknas på
        de kommersiella flödena och kan därför skilja sig. Timmar utan både pris och mätning är utelämnade, inte uppskattade.
        {day.fx ? ` Omräknat med ECB:s kurs ${day.fx.rate.toLocaleString("sv-SE", { maximumFractionDigits: 6 })} kr/EUR (${day.fx.date}).` : ""}
      </p>
    </div>
  );
}
