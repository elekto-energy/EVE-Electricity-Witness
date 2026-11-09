import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  SE_ZONES, ZONE_LABEL, addDays, priceDay, weekdayLabel, toOre, rateFor, generationMix, fmt, PRICE_UNIT, type Snapshot,
} from "@/lib/preview/snapshot";
import { loadSnapshot } from "@/lib/preview/load";
import { DataFreshness } from "@/components/preview/Badges";
import { HourlyChart } from "@/components/preview/HourlyChart";
import { GenerationBar } from "@/components/site/GenerationBar";
import { SITE_URL } from "@/lib/site";

export const revalidate = 300;
export const dynamicParams = false;

/** Swedish bidding zones only; anything else is a 404. Descriptions are geography, not data. */
const ZONES: Record<string, { code: string; city: string; region: string; places: string }> = {
  se1: { code: "SE1", city: "Luleå", region: "norra Norrland", places: "bland annat Luleå och Kiruna" },
  se2: { code: "SE2", city: "Sundsvall", region: "södra Norrland", places: "bland annat Sundsvall och Östersund" },
  se3: { code: "SE3", city: "Stockholm", region: "mellersta Sverige", places: "bland annat Stockholm och Göteborg" },
  se4: { code: "SE4", city: "Malmö", region: "södra Sverige", places: "bland annat hela Skåne med Malmö" },
};

export function generateStaticParams() {
  return Object.keys(ZONES).map(zone => ({ zone }));
}

export async function generateMetadata({ params }: { params: Promise<{ zone: string }> }): Promise<Metadata> {
  const { zone } = await params;
  const z = ZONES[zone];
  if (!z) return {};
  return {
    title: `Elpris ${z.code} ${z.city} idag – spotpris timme för timme`,
    description:
      `Dagens elpris i elområde ${z.code} (${z.city}, ${z.region}): spotpris timme för timme, billigaste och dyraste timmen, ` +
      `priset imorgon, elflöden till grannområdena och elproduktion per kraftslag. Öre/kWh före skatt, moms och nätavgift.`,
    alternates: { canonical: `/elpris/${zone}` },
    robots: { index: true, follow: true },
    openGraph: {
      url: `/elpris/${zone}`, title: `Elpris ${z.code} ${z.city} idag`, type: "website",
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Elmonitor – elpriset idag i SE1–SE4" }],
    },
  };
}

const clock = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const hourSpan = (iso: string) => `${clock(iso)}–${clock(new Date(Date.parse(iso) + 3600000).toISOString())}`;
const usable = (status: string | undefined) => status === "COMPLETE" || status === "PARTIAL";

function dayFigures(snapshot: Snapshot, code: string, day: string) {
  const d = priceDay(snapshot, code, day);
  const hourly = ((d?.hourly ?? []) as [string, number][])
    .map(([t, v]) => [t, toOre(snapshot, v, day)] as [string, number | null])
    .filter((h): h is [string, number] => h[1] !== null);
  const ok = usable(d?.status) && hourly.length > 0;
  const sorted = ok ? [...hourly].sort((a, b) => a[1] - b[1]) : [];
  return {
    status: d?.status ?? "NO_RECORD",
    hourly,
    mean: ok ? toOre(snapshot, d?.mean, day) : null,
    cheapest: sorted[0] ?? null,
    dearest: sorted[sorted.length - 1] ?? null,
  };
}

/** Net flow per border touching the zone: mean of the hours measured on that day (never extrapolated). */
function zoneFlows(snapshot: Snapshot, code: string, day: string) {
  return Object.entries(snapshot.flows)
    .filter(([, f]) => f.from === code || f.to === code)
    .map(([border, f]) => {
      const h = (f.days.find(x => x.day === day)?.hourly_net ?? []) as [string, number][];
      if (h.length === 0) return null;
      const mean = h.reduce((s, x) => s + x[1], 0) / h.length;             // + = from -> to
      const out = f.from === code ? mean >= 0 : mean < 0;
      const other = (f.from === code ? f.to : f.from).replace("_LU", "");
      return { border, other, out, mw: Math.abs(mean), hours: h.length };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.mw - a.mw);
}

function statusText(status: string) {
  return status === "NOT_PUBLISHED_YET" ? "Inte publicerat ännu (publiceras runt klockan 13 dagen före)." : "Priset saknas i datan för den här dagen.";
}

export default async function ZonePage({ params }: { params: Promise<{ zone: string }> }) {
  const { zone } = await params;
  const z = ZONES[zone];
  if (!z) notFound();
  const { snapshot } = await loadSnapshot();
  const today = snapshot.today;
  const tomorrow = addDays(today, 1);
  const td = dayFigures(snapshot, z.code, today);
  const tm = dayFigures(snapshot, z.code, tomorrow);
  const flows = zoneFlows(snapshot, z.code, today);
  const mix = generationMix(snapshot, z.code, today, null);
  const fx = rateFor(snapshot, today);
  const others = SE_ZONES.filter(c => c !== z.code);
  const otherMeans = others.map(c => ({ code: c, mean: dayFigures(snapshot, c, today).mean }));
  const color = `var(--s-${zone})`;

  const faq = [
    {
      q: `Vad kostar elen i ${z.code} idag?`,
      a: td.mean !== null
        ? `Spotpriset i ${z.code} (${z.city}) är i genomsnitt ${fmt(td.mean)} öre/kWh ${weekdayLabel(today)}, före elskatt, moms och nätavgift.` +
          (td.cheapest && td.dearest ? ` Billigast är timmen ${hourSpan(td.cheapest[0])} (${fmt(td.cheapest[1])} öre/kWh) och dyrast ${hourSpan(td.dearest[0])} (${fmt(td.dearest[1])} öre/kWh).` : "")
        : `Dagens pris för ${z.code} finns inte i datan just nu.`,
    },
    {
      q: `När kommer elpriset för imorgon i ${z.code}?`,
      a: "Morgondagens spotpriser publiceras runt klockan 13 dagen före. De visas här så snart de finns i datan.",
    },
    {
      q: `Varför skiljer sig elpriset mellan ${z.code} och andra elområden?`,
      a: "Mycket el produceras i norra Sverige men används i söder. När ledningarna mellan elområdena inte räcker till kan priserna inte jämnas ut, och priset blir högre där efterfrågan är större än vad som kan överföras.",
    },
    {
      q: "Vad ingår i priset som visas?",
      a: "Det är spotpriset på elbörsen omräknat till öre per kilowattimme med Europeiska centralbankens referenskurs. Elskatt, moms, nätavgift och elbolagets påslag ingår inte.",
    },
  ];
  const jsonLd = [
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Elpriset idag", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: `Elpris ${z.code} ${z.city}`, item: `${SITE_URL}/elpris/${zone}` },
      ],
    },
    {
      "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: faq.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="s-crumbs" aria-label="Brödsmulor"><Link href="/">Elpriset idag</Link> / <span>{z.code} {z.city}</span></nav>

      <section>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px 18px" }}>
          <h1 className="s-h1" style={{ marginBottom: 6 }}>Elpriset i {z.code} ({z.city}) idag</h1>
          <DataFreshness publishedAtUtc={snapshot.source.published_at_utc} snapshotToday={today} />
        </div>
        <p className="s-lede">
          Spotpris i elområde {z.code}, {z.region}, {weekdayLabel(today)}. Före elskatt, moms och nätavgift.
        </p>

        <div className="s-zone-figs">
          <div className="s-panel">
            <div className="s-note">Dygnsmedel idag</div>
            <div className="s-zone-big s-num" style={{ color }}>{td.mean !== null ? fmt(td.mean) : "–"}<span className="s-zone-unit">{PRICE_UNIT}</span></div>
            {td.mean === null && <p className="s-note">{statusText(td.status)}</p>}
          </div>
          <div className="s-panel">
            <div className="s-note">Billigaste timmen</div>
            <div className="s-zone-mid s-num">{td.cheapest ? fmt(td.cheapest[1]) : "–"}<span className="s-zone-unit">{PRICE_UNIT}</span></div>
            <div className="s-note s-num">{td.cheapest ? hourSpan(td.cheapest[0]) : ""}</div>
          </div>
          <div className="s-panel">
            <div className="s-note">Dyraste timmen</div>
            <div className="s-zone-mid s-num">{td.dearest ? fmt(td.dearest[1]) : "–"}<span className="s-zone-unit">{PRICE_UNIT}</span></div>
            <div className="s-note s-num">{td.dearest ? hourSpan(td.dearest[0]) : ""}</div>
          </div>
          <div className="s-panel">
            <div className="s-note">Imorgon, {weekdayLabel(tomorrow)}</div>
            <div className="s-zone-mid s-num">{tm.mean !== null ? fmt(tm.mean) : "–"}<span className="s-zone-unit">{PRICE_UNIT}</span></div>
            {tm.mean === null && <div className="s-note">{statusText(tm.status)}</div>}
          </div>
        </div>
      </section>

      <section className="s-section">
        <h2 className="s-h2">Timme för timme i {z.code}</h2>
        {[{ key: "today", label: "Idag", day: today, f: td }, { key: "tomorrow", label: "Imorgon", day: tomorrow, f: tm }].map(v => (
          <div key={v.key} style={{ marginBottom: 16 }}>
            <div className="s-note" style={{ marginBottom: 6 }}>{v.label}, {weekdayLabel(v.day)}, {PRICE_UNIT}</div>
            {v.f.hourly.length > 0
              ? <div className="s-panel s-chart"><HourlyChart unit={PRICE_UNIT} height={v.key === "today" ? 240 : 200} series={[{ key: z.code, label: z.code, color, points: v.f.hourly }]} /></div>
              : <p className="s-note">{statusText(v.f.status)}</p>}
          </div>
        ))}
      </section>

      <section className="s-section">
        <h2 className="s-h2">Jämfört med övriga Sverige idag</h2>
        <ul className="s-zone-compare">
          {otherMeans.map(o => (
            <li key={o.code}>
              <Link href={`/elpris/${o.code.toLowerCase()}`}><b>{o.code}</b> {ZONE_LABEL[o.code].replace(/^SE\d\s*/, "")}</Link>
              <span className="s-num">{o.mean !== null ? `${fmt(o.mean)} ${PRICE_UNIT}` : "–"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="s-section">
        <h2 className="s-h2">Elflöden till och från {z.code}</h2>
        {flows.length > 0 ? (
          <>
            <ul className="s-zone-flows">
              {flows.map(f => (
                <li key={f.border} className="s-num">
                  {f.out ? "Export till" : "Import från"} <b>{f.other}</b>: {Math.round(f.mw).toLocaleString("sv-SE")} MW i genomsnitt
                </li>
              ))}
            </ul>
            <p className="s-note">Uppmätt fysiskt nettoflöde, medel av de timmar som har mätts idag ({flows[0].hours} timmar). Se flödena på <Link href="/#karta">kartan</Link>.</p>
          </>
        ) : <p className="s-note">Inga uppmätta flöden för idag ännu.</p>}
      </section>

      <section className="s-section">
        <h2 className="s-h2">Så produceras elen i {z.code}</h2>
        {mix ? <GenerationBar mix={mix} title={`Produktion i ${z.code}, senast uppmätta timme ${hourSpan(mix.hour)}`} />
          : <p className="s-note">Produktion per kraftslag saknas för {z.code} just nu.</p>}
      </section>

      <section className="s-section s-plain">
        <h2 className="s-h2">Om elområde {z.code}</h2>
        <p className="s-note" style={{ marginTop: 6 }}>
          Sverige är sedan 1 november 2011 indelat i fyra elområden, SE1–SE4. {z.code} omfattar {z.region}, {z.places}.
          Spotpriset sätts per elområde och timme på elbörsen, så samma timme kan ha olika pris i olika delar av landet.
        </p>
        <h2 className="s-h2" style={{ marginTop: 28 }}>Vanliga frågor</h2>
        <dl className="s-faq">
          {faq.map(f => (<div key={f.q}><dt>{f.q}</dt><dd>{f.a}</dd></div>))}
        </dl>
      </section>

      <footer className="s-footer">
        Källa: ENTSO-E (dagen-före-priser, fysiska flöden och produktion per kraftslag), ECB (valutakurs{fx ? ` ${fx.rate.toLocaleString("sv-SE", { maximumFractionDigits: 6 })} kr/EUR, ${fx.date}` : ""}).
        Full spårbarhet finns under <Link href="/data">Datakvalitet</Link>. Detta är en förhandsversion.
      </footer>
    </>
  );
}
