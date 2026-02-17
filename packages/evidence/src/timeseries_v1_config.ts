/**
 * Timeseries V1 — Zone Configuration
 *
 * Canonical zone register for the unified timeseries pipeline.
 * 10 zones: SE1-4, FI, DE_LU, FR, NL, PL, ES
 *
 * Weather coordinates: representative capital point per zone.
 * For multi-zone countries (SE), uses existing coordinates from weather ingest.
 * For single-zone countries, uses capital city center.
 *
 * These coordinates feed the Open-Meteo ERA5 API (0.25° grid).
 * The exact point is snapped to the nearest grid cell by the API.
 */

export interface TimeseriesZone {
  code: string;
  lat: number;
  lon: number;
  city: string;
  country: string;
}

/**
 * V1 zones — the 10 zones in scope.
 * Coordinates are WGS84.
 */
export const TIMESERIES_V1_ZONES: Record<string, TimeseriesZone> = {
  // === SWEDEN (existing, from ingest_openmeteo_weather.ts) ===
  SE1:   { code: "SE1",   lat: 65.58, lon: 22.15, city: "Luleå",      country: "SE" },
  SE2:   { code: "SE2",   lat: 62.39, lon: 17.31, city: "Sundsvall",   country: "SE" },
  SE3:   { code: "SE3",   lat: 59.33, lon: 18.07, city: "Stockholm",   country: "SE" },
  SE4:   { code: "SE4",   lat: 55.60, lon: 13.00, city: "Malmö",       country: "SE" },

  // === EU CAPITALS (v1 representative points) ===
  FI:    { code: "FI",    lat: 60.17, lon: 24.94, city: "Helsinki",    country: "FI" },
  DE_LU: { code: "DE_LU", lat: 52.52, lon: 13.41, city: "Berlin",      country: "DE" },
  FR:    { code: "FR",    lat: 48.86, lon:  2.35, city: "Paris",       country: "FR" },
  NL:    { code: "NL",    lat: 52.37, lon:  4.90, city: "Amsterdam",   country: "NL" },
  PL:    { code: "PL",    lat: 52.23, lon: 21.01, city: "Warsaw",      country: "PL" },
  ES:    { code: "ES",    lat: 40.42, lon: -3.70, city: "Madrid",      country: "ES" },
};

/** All V1 zone codes */
export const V1_ZONE_CODES = Object.keys(TIMESERIES_V1_ZONES);

/** SE zones only */
export const SE_ZONES = V1_ZONE_CODES.filter(z => z.startsWith("SE"));

/** EU (non-SE) zones */
export const EU_ZONES = V1_ZONE_CODES.filter(z => !z.startsWith("SE"));

/** HDD base temperature */
export const HDD_BASE = 18;

/** Calculate Heating Degree Day: max(0, base - temp) */
export function calcHDD(temp_c: number | null, base = HDD_BASE): number | null {
  if (temp_c === null || temp_c === undefined) return null;
  return Math.round(Math.max(0, base - temp_c) * 10) / 10;
}
