"use client";

/**
 * Start page price cards: one card per Swedish bidding zone with today's and tomorrow's daily mean,
 * the change between them and a small sparkline of today's hours. Values are ore/kWh from the A2
 * snapshot converted with the ECB reference rate; status comes from the coverage record.
 */

import { useState } from "react";
import { StatusBadge } from "@/components/preview/Badges";
import type { MapDay } from "@/components/site/PowerMap";
import { ZoneDetail, type GenerationData } from "@/components/site/ZoneDetail";

export interface CardDay { status: string; mean: number | null; hourly: [string, number][]; selectionVerified: boolean | null; missing: number | null }
export interface CardZone { zone: string; city: string; today: CardDay; tomorrow: CardDay }

const fmt2 = (x: number) => x.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usable = (d: CardDay) => (d.status === "COMPLETE" || d.status === "PARTIAL") && d.mean !== null;

function Spark({ points, color }: { points: [string, number][]; color: string }) {
  if (points.length < 2) return null;
  const vals = points.map(p => p[1]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const W = 120, H = 34;
  const x = (i: number) => (i * W) / (points.length - 1);
  const y = (v: number) => (hi === lo ? H / 2 : H - 3 - ((v - lo) * (H - 6)) / (hi - lo));
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="s-card-spark" aria-hidden="true">
      <path d={d} fill="none" style={{ stroke: color }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function PriceCards({ zones, tomorrowLabel, days, gen, today }: {
  zones: CardZone[]; tomorrowLabel: string; days: MapDay[]; gen?: GenerationData; today: string;
}) {
  const [open, setOpen] = useState<CardZone | null>(null);
  return (
    <>
    {open && <ZoneDetail zone={open.zone} city={open.city} days={days} gen={gen} today={today} onClose={() => setOpen(null)} />}
    <div className="s-cards">
      {zones.map(z => {
        const color = `var(--s-${z.zone.toLowerCase()})`;
        const t = z.today, m = z.tomorrow;
        const delta = usable(t) && usable(m) ? (m.mean as number) - (t.mean as number) : null;
        return (
          <button type="button" key={z.zone} className="s-card" style={{ ["--zc" as string]: color }}
            onClick={() => setOpen(z)} aria-haspopup="dialog" aria-label={`${z.zone} ${z.city}: visa kvartspriser och flöden`}>
            <div className="s-card-code">{z.zone}</div>
            <div className="s-card-body">
              <div className="s-card-city">{z.city}</div>
              <div className="s-card-price s-num">
                {usable(t) ? fmt2(t.mean as number) : "–"}<span> öre/kWh</span>
              </div>
              <div className="s-card-tomorrow s-num">
                {tomorrowLabel}:{" "}
                {usable(m) ? (
                  <b className={delta !== null && delta > 0 ? "up" : delta !== null && delta < 0 ? "down" : ""}>
                    {delta !== null && delta > 0 ? "↑" : delta !== null && delta < 0 ? "↓" : ""}{fmt2(m.mean as number)} öre/kWh
                  </b>
                ) : (
                  <span className="s-card-na">{m.status === "NOT_PUBLISHED_YET" ? "publiceras runt kl 13" : "saknas"}</span>
                )}
              </div>
              <div className="s-card-foot">
                <Spark points={t.hourly} color={color} />
                {t.status !== "COMPLETE" || t.selectionVerified === false
                  ? <StatusBadge status={t.status} selectionVerified={t.selectionVerified} missing={t.missing} />
                  : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
    </>
  );
}
