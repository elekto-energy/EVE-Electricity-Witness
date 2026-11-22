"use client";

/**
 * "Vad kostar elen i plånboken?": the spot price with energy tax and VAT, plus the visitor's own grid fee, supplier
 * markup and consumption (see lib/consumer.ts). A slider lets the visitor try other spot prices; the pie shows how
 * large a share of the bill the spot price is. The visitor's values are kept in this browser only.
 *
 * Bottleneck part: at today's price, the spot price is split into SE1's price and the difference to SE1 (what the
 * transmission limits between the zones add). Measured prices only; shown only when the zone is above SE1.
 */

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { consumerPrice, VAT } from "@/lib/consumer";

export interface WalletDay { key: string; label: string; mean: number | null; hourly: [string, number][]; note?: string }

const STORE = "elmonitor.wallet.v2";
const f1 = (x: number) => x.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f0 = (x: number) => Math.round(x).toLocaleString("sv-SE");
const kr = (ore: number) => (ore / 100).toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const parse = (s: string) => {
  const v = Number(s.replace(/\s/g, "").replace(",", "."));
  return s.trim() === "" || !Number.isFinite(v) || v < 0 ? null : v;
};
const clock = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

interface Slice { k: string; label: string; color: string; v: number }

function Donut({ slices, center, sub }: { slices: Slice[]; center: string; sub: string }) {
  const total = slices.reduce((s, x) => s + x.v, 0);
  const R = 70, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <svg viewBox="0 0 200 200" className="s-donut" role="img" aria-label={`Fördelning av priset: ${slices.map(s => `${s.label} ${f0((s.v / total) * 100)} %`).join(", ")}`}>
      <g transform="rotate(-90 100 100)">
        {total > 0 && slices.filter(s => s.v > 0).map(s => {
          const len = (s.v / total) * C;
          const el = <circle key={s.k} cx={100} cy={100} r={R} fill="none" stroke={s.color} strokeWidth={34} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} />;
          acc += len;
          return el;
        })}
      </g>
      <text x={100} y={98} textAnchor="middle" className="s-donut-big">{center}</text>
      <text x={100} y={120} textAnchor="middle" className="s-donut-sub">{sub}</text>
    </svg>
  );
}

export function WalletPrice({ zone, color, days, taxDefault, taxSource, se1Mean, moreHref }: {
  zone: string; color: string; days: WalletDay[]; taxDefault: number | null;
  /** Full source line from energyTaxSourceText(). */
  taxSource: string | null;
  /** SE1's daily mean today (öre/kWh excl. VAT), for the bottleneck split; null when missing. */
  se1Mean: number | null;
  /** When set (compact use, e.g. in the zone dialog), the hourly tables are replaced by a link here. */
  moreHref?: string;
}) {
  const uid = useId();
  const spotId = `${uid}-spot`, helpId = `${uid}-help`;
  const today = days[0];
  const [grid, setGrid] = useState("");
  const [markup, setMarkup] = useState("");
  const [tax, setTax] = useState(taxDefault !== null ? f1(taxDefault) : "");
  const [kwh, setKwh] = useState("");
  const [spot, setSpot] = useState<number | null>(today.mean);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) ?? "null");
      if (s && typeof s === "object") {
        if (typeof s.grid === "string") setGrid(s.grid);
        if (typeof s.markup === "string") setMarkup(s.markup);
        if (typeof s.tax === "string" && s.tax.trim() !== "") setTax(s.tax);
        if (typeof s.kwh === "string") setKwh(s.kwh);
      }
    } catch { /* storage unavailable: defaults */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORE, JSON.stringify({ grid, markup, tax, kwh })); } catch { /* ignore */ }
  }, [grid, markup, tax, kwh, loaded]);

  const taxV = parse(tax), gridV = parse(grid), markupV = parse(markup), kwhV = parse(kwh);
  const extras = taxV === null ? null : { taxExVat: taxV, gridInclVat: gridV ?? 0, markupInclVat: markupV ?? 0 };
  const atToday = spot !== null && today.mean !== null && Math.abs(spot - today.mean) < 0.05;
  const p = extras && spot !== null ? consumerPrice(spot, extras) : null;
  const missing = [gridV === null && "nätavgift", markupV === null && "elbolagets påslag"].filter(Boolean) as string[];
  const sliderMax = Math.max(300, Math.ceil(((today.mean ?? 0) * 2) / 50) * 50, ...today.hourly.map(h => Math.ceil(h[1] / 50) * 50));

  // Pie slices, all excl. VAT, with VAT as its own slice.
  const slices: Slice[] = [];
  if (p && spot !== null && extras) {
    const bottleneck = atToday && se1Mean !== null && zone !== "SE1" && spot > se1Mean ? spot - se1Mean : 0;
    slices.push({ k: "spot", label: bottleneck > 0 ? "Spotpris som i SE1" : "Spotpris", color: "#3f8a63", v: Math.max(0, spot - bottleneck) });
    if (bottleneck > 0) slices.push({ k: "bottleneck", label: "Tillägg p.g.a. flaskhalsar", color: "#e3a52f", v: bottleneck });
    slices.push({ k: "markup", label: "Elbolagets påslag", color: "#8a7fb8", v: extras.markupInclVat / (1 + VAT) });
    slices.push({ k: "grid", label: "Nätavgift", color: "#3f6f9e", v: extras.gridInclVat / (1 + VAT) });
    slices.push({ k: "tax", label: "Energiskatt", color: "#b0644f", v: extras.taxExVat });
    slices.push({ k: "vat", label: "Moms", color: "#7a8790", v: p.vat });
  }
  const sumNet = slices.reduce((s, x) => s + x.v, 0);
  const spotPct = p && sumNet > 0 ? (slices.filter(s => s.k === "spot" || s.k === "bottleneck").reduce((s, x) => s + x.v, 0) / sumNet) * 100 : null;

  return (
    <div className="s-wallet" style={{ ["--zc" as string]: color }}>
      <div className="s-wallet-inputs">
        <label>
          <span>Din förbrukning</span>
          <span className="s-wallet-field"><input inputMode="decimal" value={kwh} onChange={e => setKwh(e.target.value)} placeholder="t.ex. 1500" /> kWh/månad</span>
        </label>
        <label>
          <span>Nätavgift (överföring)</span>
          <span className="s-wallet-field"><input inputMode="decimal" value={grid} onChange={e => setGrid(e.target.value)} placeholder="från elnätsfakturan" /> öre/kWh</span>
        </label>
        <label>
          <span>Elbolagets påslag</span>
          <span className="s-wallet-field"><input inputMode="decimal" value={markup} onChange={e => setMarkup(e.target.value)} placeholder="från elavtalet" /> öre/kWh</span>
        </label>
        <label>
          <span>Energiskatt, exkl. moms</span>
          <span className="s-wallet-field"><input inputMode="decimal" value={tax} onChange={e => setTax(e.target.value)} /> öre/kWh</span>
        </label>
      </div>
      <p className="s-note" style={{ marginTop: 6 }}>
        Nätavgift och påslag anges inklusive moms, som på fakturan. Allt du fyller i sparas bara i din webbläsare.
        {taxDefault !== null && <> Energiskatt: {taxSource}. I vissa kommuner i norra Sverige är den lägre; ändra då värdet.</>}
      </p>

      {spot !== null && (
        <div className="s-wallet-slider">
          <label htmlFor={spotId}>
            Spotpris, exkl. moms: <b className="s-num">{f1(spot)} öre/kWh</b>
            {atToday ? <span className="s-note"> (dagens dygnsmedel i {zone})</span> : today.mean !== null && (
              <button type="button" className="s-linkbtn" onClick={() => setSpot(today.mean)}>tillbaka till idag ({f1(today.mean)})</button>
            )}
          </label>
          <input id={spotId} type="range" min={0} max={sliderMax} step={1} value={Math.min(spot, sliderMax)}
            onChange={e => setSpot(Number(e.target.value))} aria-describedby={helpId} />
          <div className="s-note" id={helpId}>Dra för att se hur mycket av priset som är avgifter när spotpriset är lågt eller högt.</div>
        </div>
      )}

      {taxV === null ? (
        <p className="s-note" style={{ color: "var(--s-warn)" }}>Ange energiskatten för att räkna fram priset.</p>
      ) : !p || spot === null ? (
        <p className="s-note">{today.note ?? "Dagens spotpris saknas i datan."}</p>
      ) : (
        <div className="s-panel s-wallet-result">
          <div className="s-wallet-grid">
            <div>
              <div className="s-note">Du betalar per kWh</div>
              <div className="s-wallet-total s-num">{f1(p.total)}<span> öre/kWh</span></div>
              <div className="s-note s-num">
                Bara spotpriset: <b>{f1(spot)} öre</b>. Med skatt och moms{missing.length ? `, utan ${missing.join(" och ")}` : ""}: <b>{f1(p.total)} öre</b>.
              </div>
              {kwhV !== null && kwhV > 0 && (
                <div className="s-wallet-kr s-num">
                  {f0(kwhV)} kWh till {atToday ? "dagens pris" : "det här priset"} ≈ <b>{kr(p.total * kwhV)} kr</b>
                  <div className="s-note">varav spotpriset {kr(spot * kwhV)} kr och energiskatt plus moms {kr((extras!.taxExVat + p.vat) * kwhV)} kr. Fasta månadsavgifter tillkommer.</div>
                </div>
              )}
              {spotPct !== null && (
                <p className="s-wallet-share">
                  Spotpriset är <b className="s-num">{f0(spotPct)} %</b> av det du betalar. Resten är avgifter, skatt och moms.
                </p>
              )}
            </div>
            <div className="s-wallet-pie">
              <Donut slices={slices} center={`${f0(p.total)} öre`} sub="per kWh" />
              <ul className="s-wallet-legend s-num">
                {slices.filter(s => s.v > 0).map(s => (
                  <li key={s.k}><i style={{ background: s.color }} />{s.label} <b>{f1(s.v)}</b> <span>({f0((s.v / sumNet) * 100)} %)</span></li>
                ))}
              </ul>
            </div>
          </div>
          <p className="s-note" style={{ marginTop: 8 }}>
            Öre/kWh exkl. moms per del; momsen ({f0(VAT * 100)} %) visas som en egen del.
            {slices.some(s => s.k === "bottleneck") && <> Tillägget för flaskhalsar är skillnaden mellan dygnsmedlet i {zone} och i SE1 idag: det som överföringsbegränsningarna mellan elområdena lägger på.</>}
          </p>
        </div>
      )}

      {moreHref && (
        <p className="s-wallet-more"><Link href={moreHref}>Pris per timme med skatt och moms, idag och imorgon →</Link></p>
      )}
      {!moreHref && extras && days.some(d => d.hourly.length > 0) && (
        <div className="s-wallet-hours">
          {days.filter(d => d.hourly.length > 0).map(d => {
            const sorted = [...d.hourly].sort((a, b) => a[1] - b[1]);
            const cheap = new Set(sorted.slice(0, 3).map(h => h[0])), dear = new Set(sorted.slice(-3).map(h => h[0]));
            return (
              <div key={d.key} className="s-wallet-day">
                <h3 className="s-h3">{d.label}: pris per timme med skatt och moms</h3>
                <div className="s-table-wrap">
                  <table className="s-table">
                    <thead><tr><th>Timme</th><th className="s-r">Spotpris</th><th className="s-r">Du betalar</th></tr></thead>
                    <tbody>
                      {d.hourly.map(([t, v]) => (
                        <tr key={t} className={cheap.has(t) ? "cheap" : dear.has(t) ? "dear" : undefined}>
                          <td className="s-num">{clock(t)}–{clock(new Date(Date.parse(t) + 3600000).toISOString())}</td>
                          <td className="s-num s-r">{f1(v)}</td>
                          <td className="s-num s-r"><b>{f1(consumerPrice(v, extras).total)}</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="s-note">Öre/kWh. Spotpriset exkl. moms; Du betalar = med energiskatt, moms och det du fyllt i. Grönt = dygnets tre billigaste timmar, rött = de tre dyraste.</p>
              </div>
            );
          })}
        </div>
      )}
      <p className="s-note" style={{ marginTop: 8 }}>
        Så räknar vi: (spotpris + energiskatt) × {(1 + VAT).toLocaleString("sv-SE")} + nätavgift + påslag. Fasta månadsavgifter (abonnemang) ingår inte.
        Har du timpris (eller kvartspris) betalar du priset för respektive timme; har du rörligt månadspris betalar du ett medelpris för hela månaden.
      </p>
    </div>
  );
}
