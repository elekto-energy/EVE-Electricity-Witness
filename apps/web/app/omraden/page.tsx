import {
  NEIGHBOUR_ZONES, ZONE_LABEL, priceDay, fmt, weekdayLabel, toOre, PRICE_UNIT,
} from "@/lib/preview/snapshot";
import { loadSnapshot } from "@/lib/preview/load";
import { StatusBadge, DataFreshness } from "@/components/preview/Badges";
import { SourceFooter } from "@/components/preview/SourceFooter";

export const metadata = { title: "Grannländer och flöden" };
export const revalidate = 300;

const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** Direction arrow for one border; length scales with net MW relative to the largest border shown. */
function FlowArrow({ from, to, share }: { from: string; to: string; share: number }) {
  const len = 14 + Math.round(Math.min(1, Math.max(0, share)) * 66);
  return (
    <span className="s-flowarrow" aria-label={`${from} till ${to}`}>
      <b>{from}</b>
      <svg width={len + 8} height="12" viewBox={`0 0 ${len + 8} 12`} aria-hidden="true">
        <line x1="1" y1="6" x2={len} y2="6" strokeWidth="2.5" strokeLinecap="round" />
        <path d={`M${len - 1},1.5 L${len + 7},6 L${len - 1},10.5 Z`} />
      </svg>
      <b>{to}</b>
    </span>
  );
}

export default async function AreasPage() {
  const { snapshot } = await loadSnapshot();
  const today = snapshot.today;
  const unit = PRICE_UNIT;
  const flowRows = Object.entries(snapshot.flows).map(([border, f]) => {
    const done = [...f.days].reverse().find(d => d.status_ab === "COMPLETE" && d.status_ba === "COMPLETE" && d.net_mean_mw !== null);
    return { border, f, done };
  });
  const maxMw = Math.max(1, ...flowRows.map(r => (r.done ? Math.abs(r.done.net_mean_mw!) : 0)));
  return (
    <>
      <h1 className="s-h1">Grannländer och flöden</h1>
      <p className="s-lede">Elpriset i länderna runt Sverige {weekdayLabel(today)}, och hur mycket el som flödade över gränserna.</p>
      <div style={{ marginTop: 14 }}><DataFreshness publishedAtUtc={snapshot.source.published_at_utc} snapshotToday={today} /></div>
      <section className="s-section">
        <div className="s-section-head">
          <h2 className="s-h2">Grannländerna idag</h2>
          <span className="s-note">Dygnsmedel, {unit}</span>
        </div>
        <div className="s-scroll">
          <table className="s-table">
            <thead><tr><th>Område</th><th className="s-r">Medel</th><th className="s-r">Lägst</th><th className="s-r">Högst</th><th>Status</th></tr></thead>
            <tbody>
              {NEIGHBOUR_ZONES.map(z => {
                const d = priceDay(snapshot, z, today);
                const show = d?.status === "COMPLETE" || d?.status === "PARTIAL";
                return (
                  <tr key={z}>
                    <td>{ZONE_LABEL[z] ?? z}</td>
                    <td className="s-r s-num">{show ? fmt(toOre(snapshot, d?.mean, today)) : "–"}</td>
                    <td className="s-r s-num">{show ? fmt(toOre(snapshot, d?.min, today)) : "–"}</td>
                    <td className="s-r s-num">{show ? fmt(toOre(snapshot, d?.max, today)) : "–"}</td>
                    <td><StatusBadge status={d?.status ?? "NO_RECORD"} selectionVerified={d?.selection_verified} missing={d?.missing_intervals} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="s-section">
        <div className="s-section-head">
          <h2 className="s-h2">Så flödade elen över gränserna</h2>
          <span className="s-note">Senaste kompletta dygn, medel i MW</span>
        </div>
        <div className="s-scroll">
          <table className="s-table">
            <thead><tr><th>Riktning</th><th className="s-r">Nettoflöde</th><th className="s-r">Dygn</th></tr></thead>
            <tbody>
              {flowRows.map(({ border, f, done }) => (
                <tr key={border}>
                  <td>{done ? <FlowArrow from={done.net_mean_mw! >= 0 ? f.from : f.to} to={done.net_mean_mw! >= 0 ? f.to : f.from} share={Math.abs(done.net_mean_mw!) / maxMw} /> : `${f.from} och ${f.to}`}</td>
                  <td className="s-r s-num">{done ? `${fmt(Math.abs(done.net_mean_mw!), 0)} MW` : <StatusBadge status="MISSING" />}</td>
                  <td className="s-r s-num" style={{ whiteSpace: "nowrap" }}>{done ? shortDate(done.day) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="s-note" style={{ marginTop: 10 }}>
          Fysiska flöden enligt ENTSO-E. Nettot är flödet i ena riktningen minus den andra, räknat på timmar där båda finns.
          Pilens längd visar nettoflödet i förhållande till den största gränsen. Flödet timme för timme visas på kartan på startsidan.
        </p>
      </section>

      <SourceFooter snapshot={snapshot} />
    </>
  );
}
