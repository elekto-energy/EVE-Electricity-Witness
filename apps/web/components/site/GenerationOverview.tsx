/**
 * "How Sweden's electricity is produced": measured generation per production type (ENTSO-E A75).
 * Now: latest hour measured for every reported type, per zone and summed for SE1-SE4 (only when all four zones are
 * measured for that same hour; otherwise no national sum is shown). Yesterday: energy per group (GWh) from the
 * measured hours only; an incomplete day is labelled with its status.
 */

import { FOSSIL_NOTE, GEN_GROUP_ORDER, GEN_GROUPS, generationMix, type GenGroup, type GenerationMix, type Snapshot } from "@/lib/preview/snapshot";
import { GenerationBar, GEN_STYLE } from "@/components/site/GenerationBar";

const SE = ["SE1", "SE2", "SE3", "SE4"];
const CITY: Record<string, string> = { SE1: "Luleå", SE2: "Sundsvall", SE3: "Stockholm", SE4: "Malmö" };
const groupOf = (t: string): GenGroup =>
  (Object.keys(GEN_GROUPS) as (keyof typeof GEN_GROUPS)[]).find(k => (GEN_GROUPS[k] as readonly string[]).includes(t)) ?? "other";
const fmt1 = (x: number) => x.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function GenerationOverview({ snapshot, today, yesterday, yesterdayLabel }: { snapshot: Snapshot; today: string; yesterday: string; yesterdayLabel: string }) {
  if (!snapshot.generation) {
    return <p className="s-note">Produktion per kraftslag kommer med nästa datakörning. Den visas här med samma färger som ovan.</p>;
  }
  const now = SE.map(z => generationMix(snapshot, z, today, null)).filter((m): m is GenerationMix => m !== null);
  // National sum only for an hour that all four zones have measured.
  const common = now.length === 4 ? [...new Set(now.map(m => m.hour))] : [];
  const national: GenerationMix | null = common.length === 1 ? {
    zone: "SE", day: today, status: "", hour: common[0], requested_hour_measured: true,
    groups: GEN_GROUP_ORDER.reduce((a, g) => ({ ...a, [g]: now.reduce((s, m) => s + m.groups[g], 0) }), {} as Record<GenGroup, number>),
    total: now.reduce((s, m) => s + m.total, 0), by_type: {},
  } : null;

  const daily = SE.map(z => {
    const d = snapshot.generation?.[z]?.days.find(x => x.day === yesterday);
    if (!d?.totals_mwh_by_type) return { zone: z, status: d?.status ?? "NO_RECORD", groups: null as Record<GenGroup, number> | null };
    const g = GEN_GROUP_ORDER.reduce((a, k) => ({ ...a, [k]: 0 }), {} as Record<GenGroup, number>);
    for (const [t, mwh] of Object.entries(d.totals_mwh_by_type)) g[groupOf(t)] += mwh;
    return { zone: z, status: String(d.status), groups: g };
  });
  const maxDay = Math.max(1, ...daily.map(d => (d.groups ? GEN_GROUP_ORDER.reduce((s, k) => s + Math.max(0, d.groups![k]), 0) : 0)));

  return (
    <div className="s-go">
      {national ? (
        <div className="s-go-national">
          <GenerationBar mix={national} title="Sverige, senaste uppmätta timme (SE1–SE4)" />
        </div>
      ) : null}
      <div className="s-go-grid">
        {SE.map(z => {
          const m = now.find(x => x.zone === z);
          return (
            <div key={z} className="s-go-card">
              <div className="s-go-head"><b style={{ color: `var(--s-${z.toLowerCase()})` }}>{z}</b> {CITY[z]}</div>
              {m ? <GenerationBar mix={{ ...m, requested_hour_measured: true }} compact title="" /> : <p className="s-note">Ingen uppmätt timme idag ännu.</p>}
            </div>
          );
        })}
      </div>

      <h3 className="s-zd-h3">Produktion {yesterdayLabel}, GWh</h3>
      <div className="s-go-daily">
        {daily.map(d => {
          const tot = d.groups ? GEN_GROUP_ORDER.reduce((s, k) => s + Math.max(0, d.groups![k]), 0) : 0;
          return (
            <div key={d.zone} className="s-go-row">
              <span className="s-go-z"><b style={{ color: `var(--s-${d.zone.toLowerCase()})` }}>{d.zone}</b></span>
              {d.groups ? (
                <>
                  <span className="s-go-track">
                    <span className="s-go-fill" style={{ width: `${(tot / maxDay) * 100}%` }}>
                      {GEN_GROUP_ORDER.filter(k => d.groups![k] > 0).map(k => (
                        <span key={k} style={{ flexGrow: d.groups![k], background: GEN_STYLE[k].color }}
                          title={`${GEN_STYLE[k].label}: ${fmt1(d.groups![k] / 1000)} GWh`} />
                      ))}
                    </span>
                  </span>
                  <span className="s-go-val s-num">{fmt1(tot / 1000)}{d.status !== "COMPLETE" ? " *" : ""}</span>
                </>
              ) : <span className="s-note">saknas</span>}
            </div>
          );
        })}
      </div>
      <div className="s-gen-mini" style={{ marginTop: 8 }}>
        {GEN_GROUP_ORDER.map(k => <span key={k}><i style={{ background: GEN_STYLE[k].color }} />{GEN_STYLE[k].label}</span>)}
      </div>
      {daily.some(d => d.groups && d.status !== "COMPLETE") ? <p className="s-note">* Dygnet är inte komplett hos källan; summan gäller bara de uppmätta timmarna.</p> : null}
      <p className="s-note" style={{ marginTop: 8 }}>
        Uppmätt produktion per kraftslag från ENTSO-E (faktisk produktion, A75). Vattenkraft och kärnkraft ger den stabila grunden,
        vindkraften varierar med vädret och solkraften med dagsljuset. Sverige producerar i regel mer än landet använder och
        exporterar resten. Timmar som inte är uppmätta för alla kraftslag räknas inte med.
      </p>
      <p className="s-note" style={{ marginTop: 8 }}>{FOSSIL_NOTE}</p>
    </div>
  );
}
