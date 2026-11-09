/**
 * "Sveriges import och export": measured cross-border volumes for one day and the reported fossil share of the
 * production mix where the electricity came from (see lib/preview/trade.ts for the method and its limits).
 */
import { fossilPct, otherPct, type DayTrade, type TradeSide } from "@/lib/preview/trade";

const energy = (mwh: number) =>
  mwh >= 1000
    ? `${(mwh / 1000).toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GWh`
    : `${Math.round(mwh).toLocaleString("sv-SE")} MWh`;
const pct = (x: number | null) => (x === null ? "–" : x > 0 && x < 1 ? "under 1 %" : `${Math.round(x).toLocaleString("sv-SE")} %`);

function MixCard({ title, s, unspecifiedNote }: { title: string; s: TradeSide; unspecifiedNote?: boolean }) {
  const f = fossilPct(s), o = otherPct(s);
  const known = s.mwh > 0 ? (s.knownMwh / s.mwh) * 100 : 0;
  return (
    <div className="s-panel s-trade-card">
      <div className="s-note">{title}</div>
      <div className="s-trade-big s-num">{energy(s.mwh)}</div>
      {f === null
        ? <div className="s-note">{s.mwh > 0 ? "Produktionsmixen i ursprungsområdet saknas i datan för de här timmarna." : ""}</div>
        : <div className="s-trade-fossil s-num"><b>{pct(f)}</b> fossilt i ursprungsmixen</div>}
      {o !== null && o >= 5 && (
        <div className="s-note s-num">{pct(o)} övrigt{unspecifiedNote ? " (i Sverige mest ospecificerat i källan)" : ""}</div>
      )}
      {f !== null && known < 99.5 && <div className="s-note s-num">Mixen känd för {pct(known)} av volymen</div>}
    </div>
  );
}

export function TradeOverview({ trade, label }: { trade: DayTrade; label: string }) {
  if (trade.hoursMeasured === 0) {
    return <p className="s-note">Inga uppmätta flöden över Sveriges gränser {label.toLowerCase()} ännu.</p>;
  }
  const net = trade.exp.mwh - trade.imp.mwh;
  return (
    <div className="s-trade">
      <p className="s-note" style={{ marginBottom: 12 }}>
        {label}, {trade.hoursMeasured} uppmätta timmar: Sverige {net >= 0 ? "exporterade netto" : "importerade netto"}{" "}
        <b className="s-num">{energy(Math.abs(net))}</b>.
      </p>
      <div className="s-trade-cards">
        <MixCard title="Export från Sverige" s={trade.exp} unspecifiedNote />
        <MixCard title="Import till Sverige" s={trade.imp} />
      </div>
      <div className="s-table-wrap">
        <table className="s-table s-trade-table">
          <thead><tr><th>Land</th><th>Import</th><th>Export</th><th>Netto</th><th>Fossilt i importen</th></tr></thead>
          <tbody>
            {trade.byCountry.map(c => {
              const n = c.exp.mwh - c.imp.mwh;
              return (
                <tr key={c.country}>
                  <td>{c.name}</td>
                  <td className="s-num">{energy(c.imp.mwh)}</td>
                  <td className="s-num">{energy(c.exp.mwh)}</td>
                  <td className="s-num">{n >= 0 ? "export " : "import "}{energy(Math.abs(n))}</td>
                  <td className="s-num">{c.imp.mwh > 0 ? pct(fossilPct(c.imp)) : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const TRADE_METHOD_NOTE =
  "Uppmätta fysiska flöden över Sveriges elva gränsförbindelser (ENTSO-E), timme för timme. Fossil andel är andelen " +
  "fossila kraftslag (gas, kol, olja, torv) i produktionen i det elområde elen lämnar, samma timme. Det är en " +
  "uppskattning: el går inte att spåra och kan passera genom ett land. Andelar, inte koldioxid. Timmar utan uppmätt " +
  "produktion i ursprungsområdet räknas inte in i andelen.";
