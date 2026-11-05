/**
 * Measured generation mix (ENTSO-E A75) of one zone and hour as one stacked bar with a legend.
 * Colours are the agreed ones: hydro blue, wind turquoise, nuclear purple, solar yellow, other grey.
 * Identity is never colour alone: every group with output is named with MW and share in the legend.
 */

import type { GenerationMix, GenGroup } from "@/lib/preview/snapshot";
import { GEN_GROUP_ORDER } from "@/lib/preview/snapshot";

export const GEN_STYLE: Record<GenGroup, { label: string; color: string }> = {
  hydro: { label: "Vattenkraft", color: "#2f6fb3" },
  wind: { label: "Vindkraft", color: "#2bb3a8" },
  nuclear: { label: "Kärnkraft", color: "#7a4fb5" },
  solar: { label: "Solkraft", color: "#e2b416" },
  other: { label: "Övrigt", color: "#9aa5ad" },
};

const fmt = (x: number) => Math.round(x).toLocaleString("sv-SE");
const clock = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function GenerationBar({ mix, compact = false, title }: { mix: GenerationMix; compact?: boolean; title?: string }) {
  const parts = GEN_GROUP_ORDER.map(g => ({ g, mw: Math.max(0, mix.groups[g]) })).filter(p => p.mw > 0);
  const total = parts.reduce((a, p) => a + p.mw, 0);
  const end = new Date(Date.parse(mix.hour) + 3600000).toISOString();
  return (
    <div className={compact ? "s-gen s-gen-compact" : "s-gen"}>
      {title !== undefined && (
        <div className="s-gen-head">
          <span>{title}</span>
          <span className="s-gen-when">{clock(mix.hour)}–{clock(end)}{mix.requested_hour_measured ? "" : ", senaste uppmätta timme"}</span>
        </div>
      )}
      <div className="s-gen-bar" role="img"
        aria-label={parts.map(p => `${GEN_STYLE[p.g].label} ${fmt(p.mw)} MW`).join(", ")}>
        {parts.map(p => (
          <span key={p.g} style={{ flexGrow: p.mw, background: GEN_STYLE[p.g].color }} title={`${GEN_STYLE[p.g].label}: ${fmt(p.mw)} MW`} />
        ))}
      </div>
      {!compact && (
        <ul className="s-gen-legend">
          {parts.map(p => (
            <li key={p.g}>
              <i style={{ background: GEN_STYLE[p.g].color }} />
              <span>{GEN_STYLE[p.g].label}</span>
              <b className="s-num">{fmt(p.mw)} MW</b>
              <em className="s-num">{total > 0 ? Math.round((p.mw / total) * 100) : 0} %</em>
            </li>
          ))}
          <li className="s-gen-total"><span>Totalt</span><b className="s-num">{fmt(total)} MW</b></li>
        </ul>
      )}
      {compact && (
        <div className="s-gen-mini">
          {parts.map(p => <span key={p.g}><i style={{ background: GEN_STYLE[p.g].color }} />{GEN_STYLE[p.g].label} {total > 0 ? Math.round((p.mw / total) * 100) : 0} %</span>)}
        </div>
      )}
    </div>
  );
}
