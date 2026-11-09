import "./globals.css";
import "./site.css";
import { SiteHeader, SiteMain } from "@/components/site/SiteHeader";
import { StructuredData } from "@/components/StructuredData";

import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Elpriset idag i SE1–SE4 – spotpris kvart för kvart | Elmonitor",
    template: "%s | Elmonitor",
  },
  // Describes what the pages show today: spot price (before tax, VAT, grid fee), measured flows, production per
  // type and bottlenecks, from ENTSO-E with the ECB rate. No claims about features the site does not have.
  description:
    "Dagens elpris i Sveriges fyra elområden SE1–SE4: spotpris kvart för kvart och timme för timme, priset imorgon, " +
    "elflöden mellan elområden och grannländer, elproduktion per kraftslag och flaskhalsar. Öppen data från ENTSO-E.",
  applicationName: "Elmonitor",
  creator: "Organiq Sweden AB",
  publisher: "Organiq Sweden AB",
  // Default for every route: not indexed. Finished pages opt in with their own robots (lib/site.ts INDEXABLE_PATHS);
  // older routes that only show "Den här vyn uppdateras" stay out of search results.
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: "Elmonitor",
    title: "Elpriset idag i SE1–SE4",
    description: "Spotpris kvart för kvart, elflöden, produktion och flaskhalsar i Sveriges elområden. Öppen data från ENTSO-E.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Elpriset idag i SE1–SE4 | Elmonitor",
    description: "Spotpris kvart för kvart, elflöden, produktion och flaskhalsar i Sveriges elområden.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('eve-theme')||'light';document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','light')}})()`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&display=swap" />
        <StructuredData />
      </head>
      <body className="s-body">
        <SiteHeader />
        <SiteMain>{children}</SiteMain>
      </body>
    </html>
  );
}
