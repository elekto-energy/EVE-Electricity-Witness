import Link from "next/link";
import {
  snapshot, SE_ZONES, addDays, priceDay, weekdayLabel,
} from "@/lib/preview/snapshot";
import { DataFreshness } from "@/components/preview/Badges";
import { ZoneStrip, type DayView } from "@/components/site/ZoneStrip";

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
        mean: d?.mean ?? null, min: d?.min ?? null, max: d?.max ?? null, hourly: (d?.hourly ?? []) as [string, number][],
      };
    }),
  };
}

export default function HomePage() {
  const today = snapshot.today;
  const tomorrow = addDays(today, 1);
  const unit = snapshot.units.price;
  const views = [view("today", "Idag", today), view("tomorrow", "Imorgon", tomorrow)];

  return (
    <>
      <section className="s-hero">
        <div>
          <h1 className="s-h1">Elpriset idag</h1>
          <p className="s-lede">
            Sverige har fyra elområden, från Luleå i norr till Malmö i söder. Mycket el produceras i norr men används i söder.
            När ledningarna däremellan inte räcker till blir priset högre längre söderut. Det kallas en flaskhals.
          </p>
          <div style={{ marginTop: 18 }}>
            <DataFreshness publishedAtUtc={snapshot.source.published_at_utc} snapshotToday={today} />
          </div>
          <p className="s-note" style={{ marginTop: 14 }}>
            Vid varje pris står om det är komplett. Saknas något visas det, det gissas aldrig.
          </p>
        </div>
        <ZoneStrip views={views} unit={unit} />
      </section>

      <section className="s-section s-plain">
        <h2 className="s-h2">Vad betyder siffrorna?</h2>
        <p className="s-note" style={{ marginTop: 6 }}>
          Priset är det som elbolagen betalar på elbörsen, före skatt, moms och nätavgift. Det anges i euro per megawattimme.
          100 EUR/MWh motsvarar ungefär 10 euro-cent per kilowattimme. Priset för imorgon publiceras runt klockan 13 dagen före.
        </p>
        <p className="s-note" style={{ marginTop: 10 }}>
          Vill du se mer? <Link href="/omraden">Grannländer och flöden</Link>, <Link href="/data">datakvaliteten</Link> eller <Link href="/methodology">metoden</Link>.
        </p>
      </section>

      <footer className="s-footer">
        Källa: ENTSO-E (dagen-före-priser). Detta är en förhandsversion och inte elmonitor.se. Full spårbarhet finns under <Link href="/data">Datakvalitet</Link>.
      </footer>
    </>
  );
}
