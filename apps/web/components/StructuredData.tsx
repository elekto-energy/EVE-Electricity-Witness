/**
 * Site-wide JSON-LD: WebSite + Organization. Only facts about the site itself; page-specific data
 * (breadcrumbs, FAQ) is emitted by the pages. No search action and no logo: the site has neither.
 */
import { SITE_URL } from "@/lib/site";

export function StructuredData() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "Elmonitor",
        alternateName: "elmonitor.se",
        url: `${SITE_URL}/`,
        inLanguage: "sv-SE",
        description:
          "Dagens elpris i Sveriges elområden SE1–SE4: spotpris kvart för kvart, elflöden, elproduktion per kraftslag och flaskhalsar. Öppen data från ENTSO-E.",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "Organiq Sweden AB",
        url: `${SITE_URL}/`,
      },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }} />;
}
