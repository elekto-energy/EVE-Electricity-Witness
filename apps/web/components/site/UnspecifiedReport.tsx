/**
 * "Hur öppen är datan?": share of each country's reported production (ENTSO-E A75, totals for one day) that is
 * reported as B20 "Other", i.e. without a production type. Straight from the data; no judgement, no estimate.
 */
import { unspecifiedShare, weekdayLabel, type Snapshot } from "@/lib/preview/snapshot";

export const REPORT_COUNTRIES: { name: string; zones: string[] }[] = [
  { name: "Sverige", zones: ["SE1", "SE2", "SE3", "SE4"] },
  { name: "Finland", zones: ["FI"] },
  { name: "Norge", zones: ["NO1", "NO3", "NO4"] },
  { name: "Danmark", zones: ["DK1", "DK2"] },
  { name: "Tyskland", zones: ["DE_LU"] },
  { name: "Polen", zones: ["PL"] },
  { name: "Litauen", zones: ["LT"] },
];

const gwh = (mwh: number) => (mwh / 1000).toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (x: number) => (x > 0 && x < 1 ? "under 1 %" : `${Math.round(x).toLocaleString("sv-SE")} %`);

export function unspecifiedRows(snapshot: Snapshot, day: string) {
  return REPORT_COUNTRIES.map(c => ({ ...c, r: unspecifiedShare(snapshot, c.zones, day) }));
}

export function UnspecifiedReport({ snapshot, day }: { snapshot: Snapshot; day: string }) {
  if (!snapshot.generation) return null;
  const rows = unspecifiedRows(snapshot, day);
  const se = rows[0].r;
  const de = rows.find(c => c.name === "Tyskland")?.r ?? null;
  return (
    <div className="s-panel s-unspec">
      <h3 className="s-h3">Hur mycket el redovisas utan kraftslag?</h3>
      <p className="s-note" style={{ marginTop: 4 }}>
        Länderna rapporterar sin elproduktion per kraftslag till ENTSO-E. En del rapporteras som &quot;Other&quot;, utan att det
        framgår om det är biobränsle, avfall eller fossilt. {weekdayLabel(day).replace(/^./, c => c.toUpperCase())}:
        {se ? <> i Sverige redovisades <b className="s-num">{gwh(se.unspecifiedMwh)} GWh ({pct(se.pct)})</b> av produktionen utan kraftslag.</> : " uppgift för Sverige saknas."}
        {se && de ? <> I Tyskland var motsvarande andel <b className="s-num">{pct(de.pct)}</b>.</> : null}
      </p>
      <div className="s-table-wrap">
        <table className="s-table">
          <thead><tr><th>Land</th><th>Utan kraftslag</th><th>Andel av produktionen</th></tr></thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td className="s-num">{c.r ? `${gwh(c.r.unspecifiedMwh)} GWh` : "–"}</td>
                <td className="s-num">{c.r ? `${pct(c.r.pct)}${c.r.complete ? "" : " *"}` : "data saknas"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.some(c => c.r && !c.r.complete) && <p className="s-note">* Dygnet är inte komplett hos källan; andelen gäller de uppmätta timmarna.</p>}
      <p className="s-note" style={{ marginTop: 6 }}>
        Källa: ENTSO-E, faktisk produktion per kraftslag (A75), summa över dygnets uppmätta timmar. Kategorin &quot;Other&quot; är
        tillåten i rapporteringen; Svenska kraftnät rapporterar Sveriges data.
      </p>
    </div>
  );
}
