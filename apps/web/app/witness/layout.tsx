import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Witness — Verifierade beslut om svensk elmarknad",
  description:
    "Kryptografiskt verifierade riksdagsbeslut, Ei-beslut och myndighetsbeslut om elmarknaden. " +
    "Energiskatt, prisområden, elstöd, kärnkraft och nätreglering. " +
    "EVE Witness Standard v1.1 med SHA-256 och X-Vault.",
};

export default function WitnessLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
