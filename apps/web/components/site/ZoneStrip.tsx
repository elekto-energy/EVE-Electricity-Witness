"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/preview/Badges";
import { HourlyChart } from "@/components/preview/HourlyChart";

export interface ZoneDay {
  zone: string;
  city: string;
  status: string;
  selectionVerified: boolean | null;
  missing: number | null;
  mean: number | null;
  min: number | null;
  max: number | null;
  hourly: [string, number][];
}

export interface DayView { key: "today" | "tomorrow"; label: string; dateLabel: string; zones: ZoneDay[] }

const ZC: Record<string, string> = { SE1: "var(--s-se1)", SE2: "var(--s-se2)", SE3: "var(--s-se3)", SE4: "var(--s-se4)" };
const fmt = (x: number | null, d = 1) => (x === null ? "–" : x.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }));
const usable = (z: ZoneDay) => (z.status === "COMPLETE" || z.status === "PARTIAL") && z.mean !== null;

export function ZoneStrip({ views, unit }: { views: DayView[]; unit: string }) {
  const [k, setK] = useState<DayView["key"]>("today");
  const v = views.find(x => x.key === k) ?? views[0];
  const top = Math.max(1, ...v.zones.filter(usable).map(z => z.mean!));

  return (
    <div style={{ display: "contents" }}>
    <div className="s-hero-strip">
      <div className="s-section-head" style={{ marginBottom: 0 }}>
        <div className="s-toggle" role="group" aria-label="Välj dygn">
          {views.map(x => (
            <button key={x.key} type="button" aria-pressed={x.key === k} onClick={() => setK(x.key)}>{x.label}</button>
          ))}
        </div>
        <span className="s-note">Dygnsmedel för {v.dateLabel}, {unit}</span>
      </div>

      <div className="s-strip" aria-label="Elområden från norr till söder">
        <div className="s-strip-axis" aria-hidden="true" />
        {v.zones.map((z, i) => {
          const prev = v.zones[i - 1];
          const gap = i > 0 && usable(z) && usable(prev) ? z.mean! - prev.mean! : null;
          return (
            <div key={z.zone}>
              <div className="s-zone" style={{ ["--zc" as string]: ZC[z.zone] }}>
                <div className="s-zone-top">
                  <span className="s-zone-code">{z.zone}</span>
                  <span className="s-zone-city">{z.city}</span>
                  <span className="s-zone-value s-num">{usable(z) ? fmt(z.mean) : "–"}<span className="s-zone-unit">{unit}</span></span>
                </div>
                <div className="s-bar" aria-hidden="true"><span style={{ width: usable(z) ? `${Math.max(2, (z.mean! / top) * 100)}%` : 0 }} /></div>
                <div className="s-zone-meta">
                  <StatusBadge status={z.status} selectionVerified={z.selectionVerified} missing={z.missing} />
                  {usable(z) && <span className="s-num">lägst {fmt(z.min)}, högst {fmt(z.max)}</span>}
                  {i > 0 && (gap === null
                    ? <span>jämförelse med {prev.zone} saknas</span>
                    : Math.abs(gap) < 0.05
                      ? <span>samma pris som {prev.zone}</span>
                      : <span><b className="s-num" style={{ color: "var(--s-ink)" }}>{fmt(Math.abs(gap))}</b> {gap > 0 ? "dyrare" : "billigare"} än {prev.zone}</span>)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
      <div className="s-hero-chart">
        <div className="s-section-head">
          <h2 className="s-h2">Timme för timme, {v.label.toLowerCase()} {v.dateLabel}</h2>
          <span style={{ display: "flex", gap: 12, fontSize: "0.85rem", fontWeight: 600 }}>
            {v.zones.map(z => <span key={z.zone} style={{ color: ZC[z.zone] }}>{z.zone}</span>)}
          </span>
        </div>
        <div className="s-panel s-chart">
          <HourlyChart unit={unit} series={v.zones.map(z => ({ key: z.zone, label: z.zone, color: ZC[z.zone], points: z.hourly }))} />
        </div>
      </div>
    </div>
  );
}
