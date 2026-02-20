import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Spotpris el realtid — Timpris, CO₂, väder & elproduktion SE1–SE4",
  description:
    "Spotpris på el i realtid per timme för alla svenska elområden. " +
    "Temperatur, vindkraft, kärnkraft, vattenkraft och CO₂-intensitet. " +
    "Dag- och månadsvy med data från ENTSO-E och Nord Pool.",
};

export default function EnergyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
