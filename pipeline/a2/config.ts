/**
 * ELMONITOR A2 - configuration (owner decisions, no defaults guessed).
 *
 * OWNER-GO 2026-11-03 "Elmonitor A2, lokal implementation": automated, verifiable data chain,
 * local implementation and offline tests only. No push, no cloud resource, no secret, no production change.
 */

export const A2_ID = "ELMONITOR_A2_DATA_CHAIN";
/** a2.2: dataset "generation" (A75) added; prices/flows rules and their values hashes unchanged. */
export const A2_VERSION = "a2.2";

/**
 * Semantic values hash (OWNER-DECISION 2026-11-03, A2 option 1).
 * V1 (a2.0) hashed the R/E origin marker; that marker depends on where the request window starts, so V1 reported
 * origin-only differences as source revisions. V2 hashes only start_utc + value (+ resolution, hourly, missing);
 * the origin marker stays in the stored values as provenance. Hashes of different methods are never compared.
 */
export const VALUES_HASH_METHOD_V1_LEGACY = "A2_VALUES_SHA256_V1_INCL_ORIGIN";
export const VALUES_HASH_METHOD = "A2_VALUES_SHA256_V2_EXCL_ORIGIN";

/**
 * First local delivery day covered by the chain.
 * Basis: Spike A/v2/v3 verified scope 2026-02-01.., and OWNER-DECISION 2026-11-03 (option 1 after Spike A):
 * the existing archive is superseded for 2026; 2020-01..2026-01 is to be re-verified separately before reuse.
 * Extending this date backwards is a separate owner decision.
 */
export const HISTORY_START = "2026-02-01";

/** COMPLETE days younger than this are re-fetched for revision checks only (OWNER-GO A2 item 3). */
export const REVISION_WINDOW_DAYS = 14;

/** ENTSO-E request window limit used by the verified spike runs. */
export const MAX_DAYS_PER_REQUEST = 31;

/** A44 day-ahead price zones: SE1-SE4 + neighbours used by the map (decision A6, run NBPRICES3). */
export const PRICE_ZONES = ["SE1", "SE2", "SE3", "SE4", "FI", "NO1", "NO3", "NO4", "DK1", "DK2", "DE_LU", "PL", "LT"] as const;

/** A11 physical-flow borders (each A-B gives A>B and B>A); the 14 borders verified in SEFLOWS/SEFLOWS3 (C7 PASS). */
export const FLOW_BORDERS = [
  "SE1-SE2", "SE2-SE3", "SE3-SE4", "SE1-FI", "SE3-FI", "SE1-NO4", "SE2-NO3", "SE2-NO4",
  "SE3-NO1", "SE3-DK1", "SE4-DK2", "SE4-DE_LU", "SE4-PL", "SE4-LT",
] as const;

/** A75 actual generation per production type: the same 13 zones as prices (SE1-SE4 mix + neighbours for import context). */
export const GENERATION_ZONES = PRICE_ZONES;

/**
 * First local day of the generation dataset. Producer choice 2026-11-05 (pending owner confirmation): keeps the first
 * backfill small (13 zones x about 2 request groups); the site shows generation for today and yesterday only.
 * Moving it earlier is a later decision; the dataset then backfills on its own.
 */
export const GENERATION_HISTORY_START = "2026-10-01";

export type Dataset = "prices" | "flows" | "generation";

export interface SeriesSpec { dataset: Dataset; label: string; zone?: string; out_zone?: string; in_zone?: string }

export function allSeries(): SeriesSpec[] {
  const out: SeriesSpec[] = PRICE_ZONES.map(z => ({ dataset: "prices" as const, label: z, zone: z }));
  for (const b of FLOW_BORDERS) {
    const [a, c] = b.split("-");
    out.push({ dataset: "flows", label: `${a}>${c}`, out_zone: a, in_zone: c });
    out.push({ dataset: "flows", label: `${c}>${a}`, out_zone: c, in_zone: a });
  }
  for (const z of GENERATION_ZONES) out.push({ dataset: "generation", label: z, zone: z });
  return out;
}
