import {
  snapshot, NEIGHBOUR_ZONES, ZONE_LABEL, priceDay, fmt, weekdayLabel,
} from "@/lib/preview/snapshot";
import { StatusBadge, DataFreshness } from "@/components/preview/Badges";
import { SourceFooter } from "@/components/preview/SourceFooter";

export const metadata = { title: "Grannländer och flöden" };

export default function AreasPage() {
  const today = snapshot.today;
  const unit = snapshot.units.price;
  const flowRows = Object.entries(snapshot.flows).map(([border, f]) => {
    const done = [...f.days].reverse().find(d => d.status_ab === "COMPLETE" && d.status_ba === "COMPLETE" && d.net_mean_mw !== null);
    return { border, f, done };
  });
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
                const d = priceDay(z, today);
                const show = d?.status === "COMPLETE" || d?.status === "PARTIAL";
                return (
                  <tr key={z}>
                    <td>{ZONE_LABEL[z] ?? z}</td>
                    <td className="s-r s-num">{show ? fmt(d?.mean) : "–"}</td>
                    <td className="s-r s-num">{show ? fmt(d?.min) : "–"}</td>
                    <td className="s-r s-num">{show ? fmt(d?.max) : "–"}</td>
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
            <thead><tr><th>Gräns</th><th>Riktning</th><th className="s-r">Nettoflöde</th><th>Dygn</th></tr></thead>
            <tbody>
              {flowRows.map(({ border, f, done }) => (
                <tr key={border}>
                  <td>{f.from} och {f.to}</td>
                  <td>{done ? (done.net_mean_mw! >= 0 ? `${f.from} till ${f.to}` : `${f.to} till ${f.from}`) : "–"}</td>
                  <td className="s-r s-num">{done ? `${fmt(Math.abs(done.net_mean_mw!), 0)} MW` : <StatusBadge status="MISSING" />}</td>
                  <td className="s-num">{done ? done.day : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="s-note" style={{ marginTop: 10 }}>
          Fysiska flöden enligt ENTSO-E. Nettot är flödet i ena riktningen minus den andra, räknat på timmar där båda finns.
          Kartan med flöden och flaskhalsar kommer i nästa steg.
        </p>
      </section>

      <SourceFooter />
    </>
  );
}
