/**
 * Consumer price: what one kWh costs a household, built from the spot price.
 *
 *   total (inkl. moms) = (spot + energiskatt) x (1 + moms)  +  nätöverföring (inkl. moms)  +  påslag (inkl. moms)
 *
 * - Energiskatt: the general rate for the calendar year, from the original site's verified data
 *   (data/canonical/witness/energy_decisions_v2.json, ev_2026_energiskatt_sankning: 36,0 öre/kWh exkl. moms,
 *   SFS 2025:1357, from 2026-01-01). Some municipalities in northern Sweden pay a lower rate; that rate is not in
 *   our data, so the visitor enters it. No rate is assumed for a year we do not have: the result is null.
 * - Moms: 25 % on electricity, including on the energy tax.
 * - Nätavgift and elhandlarens påslag differ between companies and contracts: only the visitor's own values are used.
 *   Fixed monthly fees (abonnemang, fast nätavgift) are not per kWh and are not included.
 */

export const VAT = 0.25;

export const ENERGY_TAX: Record<number, { oreExVat: number; source: string; from: string }> = {
  2026: { oreExVat: 36.0, source: "SFS 2025:1357", from: "2026-01-01" },
};

/** General energy tax for the year of `day` (YYYY-MM-DD); null when the year is not in ENERGY_TAX. */
export function energyTaxFor(day: string) {
  return ENERGY_TAX[Number(day.slice(0, 4))] ?? null;
}

export interface Extras { taxExVat: number; gridInclVat: number; markupInclVat: number }

export interface ConsumerPrice {
  spot: number;        // spot incl. VAT
  tax: number;         // energy tax incl. VAT
  grid: number;        // as entered, incl. VAT
  markup: number;      // as entered, incl. VAT
  vat: number;         // VAT contained in the total
  total: number;
}

/** All values öre/kWh. `spotExVat` is the spot price as published (excl. VAT). */
export function consumerPrice(spotExVat: number, e: Extras): ConsumerPrice {
  const spot = spotExVat * (1 + VAT);
  const tax = e.taxExVat * (1 + VAT);
  const total = spot + tax + e.gridInclVat + e.markupInclVat;
  return { spot, tax, grid: e.gridInclVat, markup: e.markupInclVat, vat: total - total / (1 + VAT), total };
}
