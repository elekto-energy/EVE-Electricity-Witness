/**
 * JSON-LD Structured Data for SEO
 * WebSite + Organization schema for Google rich results
 */

export function StructuredData() {
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "EVE Electricity Witness",
    alternateName: ["elmonitor.se", "EVE Elmonitor"],
    url: "https://elmonitor.se",
    description:
      "Spotpris på el i realtid. Elräkning uppdelad: spotpris, nätavgift, elskatt, moms. " +
      "Flaskhalsintäkter, prisområden, CO₂ och elproduktion. Verifierad öppen data.",
    inLanguage: "sv",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://elmonitor.se/energy?zone={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  };

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Organiq Sweden AB",
    url: "https://elmonitor.se",
    logo: "https://elmonitor.se/logo.png",
    description:
      "EVE — Evidence & Verification Engine. " +
      "Deterministisk AI-plattform för verifierad energidata.",
    foundingDate: "2024",
    knowsAbout: [
      "Spotpris el",
      "Elpriser Sverige",
      "Flaskhalsintäkter",
      "Prisområden el",
      "Energiskatt",
      "ENTSO-E",
      "Nord Pool",
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
    </>
  );
}
