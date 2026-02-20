import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Detaljerad elprisrapport — Spotpris, elskatt & prisuppdelning per timme",
  description:
    "Generera en detaljerad rapport för valfritt datum och elområde. " +
    "Spotpris per timme, energiskatt, nätavgift, moms, prisområdesdifferens och CO₂. " +
    "Verifierad data med kryptografisk hash.",
};

export default function AskEveLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
