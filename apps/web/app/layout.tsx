import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { StructuredData } from "@/components/StructuredData";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Spotpris el idag — Elpris realtid per timme SE1–SE4 | EVE Electricity Witness",
    template: "%s | EVE Electricity Witness",
  },
  description:
    "Se dagens spotpris på el i realtid för SE1, SE2, SE3 och SE4. " +
    "Elpriser per timme, elskatt, nätavgifter, moms — hela elräkningen uppdelad. " +
    "Flaskhalsintäkter, prisområdesdifferenser, producentresultat och CO₂-intensitet. " +
    "Verifierad data från ENTSO-E, Nord Pool och Energimarknadsinspektionen.",
  keywords: [
    "spotpris el", "elpris idag", "elpris realtid", "elpris per timme",
    "elpris SE3", "elpris SE1", "elpris SE2", "elpris SE4",
    "elskatt", "elräkning", "nätavgift", "moms el",
    "elpriser Sverige", "spotpris idag", "timpris el",
    "flaskhalsintäkter", "prisområden el", "prisområdesdifferens",
    "energiskatt", "Svenska kraftnät", "Energimarknadsinspektionen",
    "CO2 el", "elproduktion Sverige", "kärnkraft Sverige",
    "vattenkraft", "vindkraft", "elområden Sverige",
    "Nord Pool", "ENTSO-E", "systempris",
    "elstöd", "constraint rent", "flaskhalsavgifter",
  ],
  authors: [{ name: "EVE — Evidence & Verification Engine", url: "https://elmonitor.se" }],
  creator: "Organiq Sweden AB",
  publisher: "EVE Electricity Witness",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    url: "https://elmonitor.se",
    siteName: "EVE Electricity Witness",
    title: "Spotpris el idag — Elpris realtid per timme SE1–SE4",
    description:
      "Dagens elpris i realtid. Spotpris, elskatt, nätavgift, moms — hela din elräkning uppdelad. " +
      "Flaskhalsintäkter, prisområden och CO₂. Verifierad öppen data.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Spotpris el idag — SE1–SE4 realtid | EVE",
    description: "Elpris per timme, elskatt, flaskhalsintäkter och CO₂. Verifierad data.",
  },
  alternates: {
    canonical: "https://elmonitor.se",
  },
  other: {
    "google-site-verification": "",  // Fyll i när du verifierar
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
        <StructuredData />
      </head>
      <body>
        <div className="app-layout">
          <Sidebar />
          <Topbar />
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
