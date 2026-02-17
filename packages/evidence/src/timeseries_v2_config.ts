/**
 * Timeseries V2 — Zone Configuration
 *
 * Extends V1 (10 zones) with:
 *   - IT_NORD (Italy North) per V2 spec
 *   - EE, LV, LT (Baltic chain for FI→PL flow path)
 *
 * Period: 2020-01 → present (V2 Golden Scope decision 2026-02-17)
 *
 * Emission factors: direct combustion only (Scope 1).
 * Margin CO₂ is V3 scope.
 */

import { TIMESERIES_V1_ZONES, type TimeseriesZone, calcHDD } from "./timeseries_v1_config";

export { calcHDD, type TimeseriesZone };
export { HDD_BASE } from "./timeseries_v1_config";

/**
 * V2 zones — 16 zones total.
 * V1 core (10) + IT_NORD + EE + LV + LT + NO1 + NO2
 *
 * NO1/NO2 added for V2 Golden Scope:
 *   - NO1 (Oslo): SE3 ↔ NO1 interconnector, largest Nordic consumption zone
 *   - NO2 (Kristiansand): SE3 ↔ NO2 + SE4 ↔ NO2, cable to DE (NorNed via NO2→NL not in V2 scope)
 *
 * Coordinate policy: national capital or zone's primary load center.
 * Coordinates are WGS84, snapped to Open-Meteo ERA5 0.25° grid by API.
 */
export const TIMESERIES_V2_ZONES: Record<string, TimeseriesZone> = {
  // === V1 zones (unchanged) ===
  ...TIMESERIES_V1_ZONES,

  // === V2 additions: Nordic ===
  NO1:     { code: "NO1",     lat: 59.91, lon: 10.75, city: "Oslo",        country: "NO" }, // Largest NO consumption zone, interconnected SE3
  NO2:     { code: "NO2",     lat: 58.15, lon:  8.00, city: "Kristiansand", country: "NO" }, // Southern Norway, interconnected SE3 + SE4

  // === V2 additions: Baltic ===
  EE:      { code: "EE",      lat: 59.44, lon: 24.75, city: "Tallinn",    country: "EE" },
  LV:      { code: "LV",      lat: 56.95, lon: 24.11, city: "Riga",       country: "LV" },
  LT:      { code: "LT",      lat: 54.69, lon: 25.28, city: "Vilnius",    country: "LT" },

  // === V2 additions: Southern Europe ===
  IT_NORD: { code: "IT_NORD", lat: 45.46, lon:  9.19, city: "Milan",      country: "IT" },
};

export const V2_ZONE_CODES = Object.keys(TIMESERIES_V2_ZONES);

/** V2 period start — locked per Golden Scope decision 2026-02-17 */
export const V2_PERIOD_START = "2020-01-01";

/**
 * V2 Golden Zones — 14 zones locked per Golden Scope decision 2026-02-17.
 * Any addition = V3. No removal allowed.
 *
 * Coverage: All Swedish bidding zones + all physical interconnector neighbours
 * in scope for production/consumption CO₂ and cross-border flow analysis.
 */
export const V2_GOLDEN_ZONES = [
  "SE1", "SE2", "SE3", "SE4",  // Sweden (full internal structure)
  "NO1", "NO2",                // Norway (Oslo + Kristiansand, SE3/SE4 interconnected)
  "FI",                        // Finland (SE1/SE3 + Baltic chain via EE)
  "DE_LU",                     // Germany/Luxembourg (SE4, FR, NL, PL interconnected)
  "PL",                        // Poland (SE4, LT, DE_LU interconnected)
  "EE", "LV", "LT",           // Baltic chain (FI→EE→LV→LT→PL)
  "FR", "NL",                  // EU core (DE_LU interconnected)
] as const;
