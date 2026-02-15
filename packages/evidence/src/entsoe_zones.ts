/**
 * ENTSO-E Bidding Zone Registry
 *
 * Verified EIC domain codes for all EU day-ahead bidding zones.
 * CRITICAL: SE3 is 10Y1001A1001A46L (not 10Y1001A1001A46J — widespread bug in many libs).
 *
 * Source: ENTSO-E Transparency Platform, verified 2026-02-15 via API.
 * TR1: No source, no number.
 * TR6: These codes are verified against live API responses, not invented.
 */

export interface BiddingZone {
  code: string;        // Short code (SE1, DE_LU, FR, etc.)
  eic: string;         // EIC Y-code for ENTSO-E API
  country: string;     // ISO 3166-1 alpha-2
  name: string;        // Human-readable name
  verified: boolean;   // API-tested 2026-02-15
}

export const BIDDING_ZONES: Record<string, BiddingZone> = {
  // === SWEDEN (4 zones) ===
  SE1:  { code: "SE1",  eic: "10Y1001A1001A44P", country: "SE", name: "Luleå",       verified: true },
  SE2:  { code: "SE2",  eic: "10Y1001A1001A45N", country: "SE", name: "Sundsvall",    verified: true },
  SE3:  { code: "SE3",  eic: "10Y1001A1001A46L", country: "SE", name: "Stockholm",    verified: true }, // ⚠️ NOT 46J
  SE4:  { code: "SE4",  eic: "10Y1001A1001A47J", country: "SE", name: "Malmö",        verified: true },

  // === NORDIC ===
  NO1:  { code: "NO1",  eic: "10YNO-1--------2", country: "NO", name: "Oslo",         verified: true },
  NO2:  { code: "NO2",  eic: "10YNO-2--------T", country: "NO", name: "Kristiansand", verified: false },
  NO3:  { code: "NO3",  eic: "10YNO-3--------J", country: "NO", name: "Trondheim",    verified: false },
  NO4:  { code: "NO4",  eic: "10YNO-4--------9", country: "NO", name: "Tromsø",       verified: false },
  NO5:  { code: "NO5",  eic: "10Y1001A1001A48H", country: "NO", name: "Bergen",       verified: false },
  FI:   { code: "FI",   eic: "10YFI-1--------U", country: "FI", name: "Finland",      verified: true },
  DK1:  { code: "DK1",  eic: "10YDK-1--------W", country: "DK", name: "Vestdanmark",  verified: true },
  DK2:  { code: "DK2",  eic: "10YDK-2--------M", country: "DK", name: "Østdanmark",   verified: true },

  // === CENTRAL EUROPE ===
  DE_LU: { code: "DE_LU", eic: "10Y1001A1001A82H", country: "DE", name: "Germany-Luxembourg", verified: true },
  FR:    { code: "FR",    eic: "10YFR-RTE------C", country: "FR", name: "France",              verified: true },
  NL:    { code: "NL",    eic: "10YNL----------L", country: "NL", name: "Netherlands",         verified: true },
  BE:    { code: "BE",    eic: "10YBE----------2", country: "BE", name: "Belgium",             verified: true },
  AT:    { code: "AT",    eic: "10YAT-APG------L", country: "AT", name: "Austria",             verified: true },
  CZ:    { code: "CZ",    eic: "10YCZ-CEPS-----N", country: "CZ", name: "Czech Republic",     verified: true },
  PL:    { code: "PL",    eic: "10YPL-AREA-----S", country: "PL", name: "Poland",              verified: true },
  SK:    { code: "SK",    eic: "10YSK-SEPS-----K", country: "SK", name: "Slovakia",            verified: true },
  HU:    { code: "HU",    eic: "10YHU-MAVIR----U", country: "HU", name: "Hungary",             verified: true },
  SI:    { code: "SI",    eic: "10YSI-ELES-----O", country: "SI", name: "Slovenia",            verified: true },
  HR:    { code: "HR",    eic: "10YHR-HEP------M", country: "HR", name: "Croatia",             verified: true },

  // === SOUTHERN EUROPE ===
  ES:      { code: "ES",      eic: "10YES-REE------0", country: "ES", name: "Spain",          verified: true },
  PT:      { code: "PT",      eic: "10YPT-REN------W", country: "PT", name: "Portugal",       verified: true },
  IT_NORD: { code: "IT_NORD", eic: "10Y1001A1001A73I", country: "IT", name: "Italy North",    verified: true },
  GR:      { code: "GR",      eic: "10YGR-HTSO-----Y", country: "GR", name: "Greece",         verified: true },

  // === SOUTHEAST EUROPE ===
  RO:  { code: "RO",  eic: "10YRO-TEL------P", country: "RO", name: "Romania",  verified: true },
  BG:  { code: "BG",  eic: "10YCA-BULGARIA-R", country: "BG", name: "Bulgaria", verified: true },

  // === BALTIC ===
  EE:  { code: "EE",  eic: "10Y1001A1001A39I", country: "EE", name: "Estonia",   verified: true },
  LV:  { code: "LV",  eic: "10YLV-1001A00074", country: "LV", name: "Latvia",    verified: true },
  LT:  { code: "LT",  eic: "10YLT-1001A0008Q", country: "LT", name: "Lithuania", verified: true },

  // === ISLANDS / OTHER ===
  IE:  { code: "IE",  eic: "10Y1001A1001A59C", country: "IE", name: "Ireland (SEM)", verified: true },
};

/** Get all zones for a country */
export function zonesByCountry(countryCode: string): BiddingZone[] {
  return Object.values(BIDDING_ZONES).filter(z => z.country === countryCode);
}

/** Get all verified zones */
export function verifiedZones(): BiddingZone[] {
  return Object.values(BIDDING_ZONES).filter(z => z.verified);
}

/** Get all unique country codes */
export function allCountries(): string[] {
  return [...new Set(Object.values(BIDDING_ZONES).map(z => z.country))].sort();
}
