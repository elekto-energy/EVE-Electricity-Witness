import { SE_ZONES, priceDay, toOre, fmt, weekdayLabel } from "@/lib/preview/snapshot";
import { loadSnapshot } from "@/lib/preview/load";
import { SITE_URL } from "@/lib/site";

export const revalidate = 300;

const CITY: Record<string, string> = { SE1: "Luleå", SE2: "Sundsvall", SE3: "Stockholm", SE4: "Malmö" };

/** llms.txt: a plain-text guide for AI assistants to what the site contains, with today's figures and their date. */
export async function GET() {
  const { snapshot } = await loadSnapshot();
  const day = snapshot.today;
  const means = SE_ZONES.map(z => {
    const d = priceDay(snapshot, z, day);
    const ok = d && (d.status === "COMPLETE" || d.status === "PARTIAL");
    const v = ok ? toOre(snapshot, d!.mean, day) : null;
    return `- ${z} (${CITY[z]}): ${v === null ? "saknas i datan" : `${fmt(v)} öre/kWh i dygnsmedel`} – ${SITE_URL}/elpris/${z.toLowerCase()}`;
  });
  const body = `# Elmonitor

> Elmonitor visar dagens elpris i Sveriges fyra elområden (SE1–SE4): spotpris kvart för kvart och timme för timme, priset imorgon, uppmätta elflöden mellan elområden och grannländer, elproduktion per kraftslag och flaskhalsar. Svenska. Öppen data från ENTSO-E, omräknad med ECB:s referenskurs.

Priserna är spotpriser före elskatt, moms, nätavgift och elbolagens påslag, i öre/kWh. Saknade värden fylls aldrig i; de visas som saknade.
Morgondagens priser publiceras runt klockan 13 dagen före.

## Dagens elpris (${weekdayLabel(day)}, data publicerad ${snapshot.source.published_at_utc})

${means.join("\n")}

## Sidor

- [Elpriset idag](${SITE_URL}/): alla elområden, karta kvart för kvart med flöden, timpriser, produktion och flaskhalsar
- [Elpris SE1 Luleå](${SITE_URL}/elpris/se1)
- [Elpris SE2 Sundsvall](${SITE_URL}/elpris/se2)
- [Elpris SE3 Stockholm](${SITE_URL}/elpris/se3)
- [Elpris SE4 Malmö](${SITE_URL}/elpris/se4)
- [Grannländer och flöden](${SITE_URL}/omraden): priser i Norge, Finland, Danmark, Tyskland, Polen och Litauen, import och export per gräns
- [Datakvalitet](${SITE_URL}/data): status och täckning per serie, saknade kvartar, källor

## Källor

- ENTSO-E Transparency Platform: dagen-före-priser, fysiska flöden, produktion per kraftslag
- Europeiska centralbanken: referenskurs EUR/SEK
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
