/** Evidence metadata included in every API response that carries numbers. Gate D. */
export interface EvidenceMetadata {
  manifest_id: string;
  root_hash: string;
  files_sha256_path: string;
}

/** Single hour price point */
export interface SpotPricePoint {
  hourISO: string;   // ISO datetime for this hour
  price: number;     // EUR/MWh
}

/** Aggregate stats for a series */
export interface SpotStats {
  avg: number;
  min: number;
  max: number;
}

/** Response: /api/spot/day?zone=XX&date=YYYY-MM-DD */
export interface SpotDayResponse {
  zone: string;
  date: string;
  currency: "EUR/MWh";
  resolution: "PT60M" | "PT15M";
  series: SpotPricePoint[];
  stats: SpotStats;
  evidence: EvidenceMetadata;
}

/** Response: /api/spot/compare?zones=XX,YY&date=YYYY-MM-DD */
export interface SpotCompareZone {
  zone: string;
  series: SpotPricePoint[];
  stats: SpotStats;
}

export interface SpotCompareResponse {
  date: string;
  currency: "EUR/MWh";
  zones: SpotCompareZone[];
  evidence: EvidenceMetadata;
}

/** Error shape for all API routes */
export interface ApiError {
  error: string;
  detail?: string;
}
