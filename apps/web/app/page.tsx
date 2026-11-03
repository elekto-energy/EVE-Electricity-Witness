import Link from "next/link";
import {
  snapshot, SE_ZONES, NEIGHBOUR_ZONES, ZONE_LABEL, addDays, priceDay, weekdayLabel, toOre, rateFor, PRICE_UNIT,
} from "@/lib/preview/snapshot";
import { DataFreshness } from "@/components/preview/Badges";
import { type DayView } from "@/components/site/ZoneStrip";
import { PowerMap, type MapDay } from "@/components/site/PowerMap";
import { PriceCards } from "@/components/site/PriceCards";
import { HourlyChart } from "@/components/preview/HourlyChart";

export const metadata = { title: "Elpriset idag" };

const CITY: Record<string, string> = { SE1: "Luleå", SE2: "Sundsvall", SE3: "Stockholm", SE4: "Malmö" };

function view(key: DayView["key"], label: string, day: string): DayView {
  return {
    key, label, dateLabel: weekdayLabel(day),
    zones: SE_ZONES.map(z => {
      const d = priceDay(z, day);
      return {
        zone: z, city: CITY[z], status: d?.status ?? (key === "tomorrow" ? "NOT_PUBLISHED_YET" : "NO_RECORD"),
        selectionVerified: d?.selection_verified ?? null, missing: d?.missing_intervals ?? null,
        mean: toOre(d?.mean, day), min: toOre(d?.min, day), max: toOre(d?.max, day),
        hourly: ((d?.hourly ?? []) as [string, number][]).map(h => [h[0], toOre(h[1], day)]).filter((h): h is [string, number] => h[1] !== null),
      };
    }),
  };
}

function mapDay(key: MapDay["key"], label: string, day: string): MapDay {
  return {
    key, label, dateLabel: weekdayLabel(day),
    zones: [...SE_ZONES, ...NEIGHBOUR_ZONES].map(z => {
      const d = priceDay(z, day);
      return {
        zone: z, name: ZONE_LABEL[z] ?? z, status: d?.status ?? (key === "tomorrow" ? "NOT_PUBLISHED_YET" : "NO_RECORD"),
        mean: toOre(d?.mean, day),
        quarters: ((d?.quarters ?? []) as [string, number][]).map(q => [q[0], toOre(q[1], day)]).filter((q): q is [string, number] => q[1] !== null),
      };
    }),
    flows: Object.entries(snapshot.flows).map(([border, f]) => ({
      border, from: f.from, to: f.to,
      hourly: (f.days.find(x => x.day === day)?.hourly_net ?? []) as [string, number][],
    })),
    fx: rateFor(day),
  };
}

const GEN = [
  { label: "Vattenkraft", color: "#2f6fb3" },
  { label: "Vindkraft", color: "#2bb3a8" },
  { label: "Kärnkraft", color: "#7a4fb5" },
  { label: "Solkraft", color: "#e2b416" },
  { label: "Övrigt", color: "#9aa5ad" },
];

export default function HomePage() {
  const today = snapshot.today;
  const tomorrow = addDays(today, 1);
  const unit = PRICE_UNIT;
  const fxToday = rateFor(today);
  const vToday = view("today", "Idag", today);
  const vTomorrow = view("tomorrow", "Imorgon", tomorrow);

  return (
    <>
      <section>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px 18px" }}>
          <h1 className="s-h1" style={{ marginBottom: 6 }}>Elpriset idag</h1>
          <DataFreshness publishedAtUtc={snapshot.source.published_at_utc} snapshotToday={today} />
        </div>
        <p className="s-lede">Dygnsmedel per elområde {weekdayLabel(today)}, före skatt, moms och nätavgift.</p>
        <PriceCards tomorrowLabel="Imorgon" zones={vToday.zones.map((z, i) => ({
          zone: z.zone, city: z.city,
          today: { status: z.status, mean: z.mean, hourly: z.hourly, selectionVerified: z.selectionVerified, missing: z.missing },
          tomorrow: { status: vTomorrow.zones[i].status, mean: vTomorrow.zones[i].mean, hourly: vTomorrow.zones[i].hourly, selectionVerified: vTomorrow.zones[i].selectionVerified, missing: vTomorrow.zones[i].missing },
        }))} />
      </section>

      <section className="s-section" id="karta">
        <h2 className="s-h2">Kartan kvart för kvart</h2>
        <p className="s-note" style={{ marginBottom: 4 }}>
          Mycket el produceras i norr men används i söder. När ledningarna däremellan inte räcker till blir priset högre söderut.
          Dra i tidslinjen för att se priset kvart för kvart och hur elen flödar mellan områdena.
        </p>
        <PowerMap days={[mapDay("today", "Idag", today), mapDay("tomorrow", "Imorgon", tomorrow)]} snapshotToday={today} />
      </section>

      <section className="s-section">
        <div className="s-section-head">
          <h2 className="s-h2">Timme för timme</h2>
          <span style={{ display: "flex", gap: 12, fontSize: "0.85rem", fontWeight: 600 }}>
            {SE_ZONES.map(z => <span key={z} style={{ color: `var(--s-${z.toLowerCase()})` }}>{z}</span>)}
          </span>
        </div>
        {[vToday, vTomorrow].map(v => (
          <div key={v.key} style={{ marginBottom: 16 }}>
            <div className="s-note" style={{ marginBottom: 6 }}>{v.label}, {v.dateLabel}, {unit}</div>
            <div className="s-panel s-chart">
              <HourlyChart unit={unit} height={v.key === "today" ? 260 : 200}
                series={v.zones.map(z => ({ key: z.zone, label: z.zone, color: `var(--s-${z.zone.toLowerCase()})`, points: z.hourly }))} />
            </div>
          </div>
        ))}
      </section>

      <section className="s-section">
        <h2 className="s-h2">Elproduktion per kraftslag</h2>
        <div className="s-gen-legend" aria-label="Färger för kraftslag">
          {GEN.map(g => <span key={g.label}><i style={{ background: g.color }} />{g.label}</span>)}
        </div>
        <p className="s-note" style={{ marginTop: 10 }}>
          Saknas i den här versionen. Produktionsdata per kraftslag hämtas från ENTSO-E i nästa datakörning och visas här med samma färger.
        </p>
      </section>

      <section className="s-section s-plain">
        <h2 className="s-h2">Vad betyder siffrorna?</h2>
        <p className="s-note" style={{ marginTop: 6 }}>
          Priset är spotpriset på elbörsen, före elskatt, moms och nätavgift. Börsen sätter priset i euro per megawattimme; här är det
          omräknat till öre per kilowattimme med Europeiska centralbankens referenskurs{fxToday ? ` (${fxToday.rate.toLocaleString("sv-SE")} kr/EUR, ${fxToday.date})` : ""}.
          Elbolagens egna omräkningar kan skilja sig något. Priset för imorgon publiceras runt klockan 13 dagen före.
        </p>
        <p className="s-note" style={{ marginTop: 10 }}>
          Vill du se mer? <Link href="/omraden">Grannländer och flöden</Link>, <Link href="/data">datakvaliteten</Link> eller <Link href="/methodology">metoden</Link>.
        </p>
      </section>

      <footer className="s-footer">
        Källa: ENTSO-E (dagen-före-priser och fysiska flöden), ECB (valutakurs). Karta: Natural Earth (public domain). Detta är en förhandsversion.
        Full spårbarhet finns under <Link href="/data">Datakvalitet</Link>.
      </footer>
    </>
  );
}
