import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Metodik — Hur vi beräknar elpris, elskatt och flaskhalsintäkter",
  description:
    "Öppen metodbeskrivning för EVE Electricity Witness. Deterministisk prisdekomposition: " +
    "spotpris, systempris, prisområdesdifferens, nätavgift, energiskatt och moms. " +
    "Inga modellparametrar, inga antaganden. Källor: ENTSO-E, Nord Pool, ECB, Skatteverket.",
};

export default function MethodologyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
