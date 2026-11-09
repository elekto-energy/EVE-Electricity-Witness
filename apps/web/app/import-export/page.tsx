import Link from "next/link";
import { addDays, weekdayLabel } from "@/lib/preview/snapshot";
import { loadSnapshot } from "@/lib/preview/load";
import { tradeForDay, fossilPct } from "@/lib/preview/trade";
import { DataFreshness } from "@/components/preview/Badges";
import { TradeOverview, TRADE_METHOD_NOTE } from "@/components/site/TradeOverview";
import { SITE_URL } from "@/lib/site";

export const revalidate = 300;

export const metadata = {
  title: "Sveriges import och export av el idag – och hur fossil den är",
  description:
    "Hur mycket el Sverige importerar och exporterar idag och igår, per land (Norge, Finland, Danmark, Tyskland, Polen, " +
    "Litauen), och hur stor andel fossil produktion det finns i elområdet elen kommer ifrån. Uppmätt data från ENTSO-E.",
  alternates: { canonical: "/import-export" },
  robots: { index: true, follow: true },
};

const clock = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const mw = (x: number) => Math.round(x).toLocaleString("sv-SE");
const pct = (x: number | null) => (x === null ? "–" : x > 0 && x < 1 ? "<1 %" : `${Math.round(x)} %`);

export default async function ImportExportPage() {
  const { snapshot } = await loadSnapshot();
  const today = snapshot.today;
  const yesterday = addDays(today, -1);
  const tToday = tradeForDay(snapshot, today);
  const tYesterday = tradeForDay(snapshot, yesterday);
  const yf = { exp: fossilPct(tYesterday.exp), imp: fossilPct(tYesterday.imp) };

  const faq = [
    {
      q: "Importerar eller exporterar Sverige el?",
      a: tYesterday.hoursMeasured > 0
        ? `Igår (${weekdayLabel(yesterday)}) ${tYesterday.exp.mwh >= tYesterday.imp.mwh ? "exporterade" : "importerade"} Sverige netto ` +
          `${Math.round(Math.abs(tYesterday.exp.mwh - tYesterday.imp.mwh) / 100) / 10} GWh enligt uppmätta flöden.`
        : "Uppmätta flöden för igår saknas i datan just nu.",
    },
    {
      q: "Är elen som Sverige importerar fossil?",
      a: yf.imp !== null
        ? `Igår kom importen från elområden där i genomsnitt ${pct(yf.imp)} av produktionen var fossil samma timme. ` +
          "Det beror på varifrån elen kommer: från Tyskland och Polen är andelen ofta hög, från Norge nästan noll."
        : "Produktion per kraftslag saknas för att beräkna det just nu.",
    },
    {
      q: "Hur räknas den fossila andelen?",
      a: TRADE_METHOD_NOTE,
    },
  ];
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Elpriset idag", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Import och export", item: `${SITE_URL}/import-export` },
    ] },
    { "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: faq.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="s-crumbs" aria-label="Brödsmulor"><Link href="/">Elpriset idag</Link> / <span>Import och export</span></nav>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px 18px" }}>
        <h1 className="s-h1" style={{ marginBottom: 6 }}>Sveriges import och export av el</h1>
        <DataFreshness publishedAtUtc={snapshot.source.published_at_utc} snapshotToday={today} />
      </div>
      <p className="s-lede">
        Hur mycket el som går in och ut över Sveriges gränser, och hur stor del av produktionen i ursprungsområdet som var fossil
        samma timme.
      </p>

      <section className="s-section">
        <h2 className="s-h2">Idag, {weekdayLabel(today)}</h2>
        <TradeOverview trade={tToday} label="Idag" />
      </section>

      <section className="s-section">
        <h2 className="s-h2">Igår, {weekdayLabel(yesterday)}</h2>
        <TradeOverview trade={tYesterday} label="Igår" />
      </section>

      {tToday.hours.length > 0 && (
        <section className="s-section">
          <h2 className="s-h2">Timme för timme idag</h2>
          <div className="s-table-wrap">
            <table className="s-table s-trade-table">
              <thead><tr><th>Timme</th><th>Import, MW</th><th>Export, MW</th><th>Fossilt i importen</th><th>Fossilt i exporten</th></tr></thead>
              <tbody>
                {tToday.hours.map(h => (
                  <tr key={h.hour}>
                    <td className="s-num">{clock(h.hour)}</td>
                    <td className="s-num">{mw(h.importMw)}</td>
                    <td className="s-num">{mw(h.exportMw)}</td>
                    <td className="s-num">{pct(h.importFossilPct)}</td>
                    <td className="s-num">{pct(h.exportFossilPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="s-section s-plain">
        <h2 className="s-h2">Så räknar vi</h2>
        <p className="s-note" style={{ marginTop: 6 }}>{TRADE_METHOD_NOTE}</p>
        <p className="s-note" style={{ marginTop: 8 }}>
          Sverige rapporterar en stor del av sin värmekraft som ospecificerad. Den räknas inte som fossil, men inte heller som
          fossilfri; andelen visas som övrigt. Se flödena gräns för gräns på <Link href="/#karta">kartan</Link> och på
          {" "}<Link href="/omraden">Grannländer och flöden</Link>.
        </p>
        <h2 className="s-h2" style={{ marginTop: 28 }}>Vanliga frågor</h2>
        <dl className="s-faq">
          {faq.map(f => (<div key={f.q}><dt>{f.q}</dt><dd>{f.a}</dd></div>))}
        </dl>
      </section>

      <footer className="s-footer">
        Källa: ENTSO-E (fysiska flöden och produktion per kraftslag). Full spårbarhet finns under <Link href="/data">Datakvalitet</Link>.
        Detta är en förhandsversion.
      </footer>
    </>
  );
}
