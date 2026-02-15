/**
 * ENTSO-E REST API Client
 *
 * Fetches day-ahead spot prices from ENTSO-E Transparency Platform.
 * Returns raw XML + parsed canonical JSON.
 *
 * API endpoint: https://web-api.tp.entsoe.eu/api
 * Document type A44 = Day-ahead prices
 * Resolution: PT60M (hourly) — some zones may return PT15M (e.g., Italy 2025+)
 *
 * TR1: No source, no number — every price traces to ENTSO-E API response.
 * TR6: Code fetches data; NEVER invents values.
 */

import { BIDDING_ZONES, type BiddingZone } from "./entsoe_zones";

const API_BASE = "https://web-api.tp.entsoe.eu/api";
const DOCUMENT_TYPE_DAY_AHEAD = "A44";

export interface EntsoeClientConfig {
  securityToken: string;
  timeoutMs?: number;
}

export interface SpotPricePoint {
  position: number;          // 1-based hour/quarter position
  price_eur_mwh: number;     // EUR/MWh
}

export interface SpotPricePeriod {
  start: string;             // ISO datetime (UTC)
  end: string;               // ISO datetime (UTC)
  resolution: string;        // PT60M or PT15M
  points: SpotPricePoint[];
}

export interface SpotPriceResponse {
  zone: BiddingZone;
  currency: string;          // EUR
  unit: string;              // MWH
  periods: SpotPricePeriod[];
  fetched_at_utc: string;
  raw_xml: string;           // Complete API response for evidence trail
}

export interface SpotPriceError {
  zone: BiddingZone;
  error_code: string;
  error_text: string;
  fetched_at_utc: string;
}

/**
 * Format date as ENTSO-E period string: YYYYMMDDHHMM
 */
function formatPeriod(date: Date): string {
  const y = date.getUTCFullYear().toString();
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  const h = date.getUTCHours().toString().padStart(2, "0");
  const min = date.getUTCMinutes().toString().padStart(2, "0");
  return `${y}${m}${d}${h}${min}`;
}

/**
 * Minimal XML parser for ENTSO-E responses.
 * No dependency — extracts what we need from the known schema.
 */
function extractText(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`);
  const m = xml.match(re);
  return m ? m[1] : null;
}

function extractAllBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "g");
  return xml.match(re) ?? [];
}

function parsePricePoints(periodXml: string): SpotPricePoint[] {
  const points: SpotPricePoint[] = [];
  const pointBlocks = extractAllBlocks(periodXml, "Point");

  for (const block of pointBlocks) {
    const pos = extractText(block, "position");
    const price = extractText(block, "price.amount");
    if (pos && price) {
      points.push({
        position: parseInt(pos, 10),
        price_eur_mwh: parseFloat(price),
      });
    }
  }

  return points.sort((a, b) => a.position - b.position);
}

function parseSpotPriceXml(xml: string, zone: BiddingZone): SpotPriceResponse | SpotPriceError {
  const now = new Date().toISOString();

  // Check for error/acknowledgement response
  if (xml.includes("Acknowledgement_MarketDocument")) {
    const code = extractText(xml, "code") ?? "UNKNOWN";
    const text = extractText(xml, "text") ?? "Unknown error";
    return { zone, error_code: code, error_text: text, fetched_at_utc: now };
  }

  // Parse Publication_MarketDocument
  const currency = extractText(xml, "currency_Unit.name") ?? "EUR";
  const unit = extractText(xml, "price_Measure_Unit.name") ?? "MWH";

  const periodBlocks = extractAllBlocks(xml, "Period");
  const periods: SpotPricePeriod[] = [];

  for (const periodXml of periodBlocks) {
    const start = extractText(periodXml, "start");
    const end = extractText(periodXml, "end");
    const resolution = extractText(periodXml, "resolution") ?? "PT60M";
    const points = parsePricePoints(periodXml);

    if (start && end && points.length > 0) {
      periods.push({ start, end, resolution, points });
    }
  }

  return {
    zone,
    currency,
    unit,
    periods,
    fetched_at_utc: now,
    raw_xml: xml,
  };
}

/**
 * Fetch day-ahead prices for a single bidding zone.
 */
export async function fetchDayAheadPrices(
  config: EntsoeClientConfig,
  zoneCode: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<SpotPriceResponse | SpotPriceError> {
  const zone = BIDDING_ZONES[zoneCode];
  if (!zone) {
    return {
      zone: { code: zoneCode, eic: "UNKNOWN", country: "??", name: "Unknown", verified: false },
      error_code: "INVALID_ZONE",
      error_text: `Unknown zone code: ${zoneCode}`,
      fetched_at_utc: new Date().toISOString(),
    };
  }

  const params = new URLSearchParams({
    securityToken: config.securityToken,
    documentType: DOCUMENT_TYPE_DAY_AHEAD,
    in_Domain: zone.eic,
    out_Domain: zone.eic,
    periodStart: formatPeriod(periodStart),
    periodEnd: formatPeriod(periodEnd),
  });

  const url = `${API_BASE}?${params.toString()}`;
  const timeout = config.timeoutMs ?? 15000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    const xml = await response.text();
    return parseSpotPriceXml(xml, zone);
  } catch (err: any) {
    clearTimeout(timer);
    return {
      zone,
      error_code: "FETCH_ERROR",
      error_text: err.message ?? String(err),
      fetched_at_utc: new Date().toISOString(),
    };
  }
}

/**
 * Fetch day-ahead prices for multiple zones.
 * Sequential to respect ENTSO-E rate limits (400 req/min).
 */
export async function fetchMultipleZones(
  config: EntsoeClientConfig,
  zoneCodes: string[],
  periodStart: Date,
  periodEnd: Date,
  delayMs: number = 200,
): Promise<(SpotPriceResponse | SpotPriceError)[]> {
  const results: (SpotPriceResponse | SpotPriceError)[] = [];

  for (let i = 0; i < zoneCodes.length; i++) {
    const result = await fetchDayAheadPrices(config, zoneCodes[i], periodStart, periodEnd);
    results.push(result);

    // Rate limit delay (skip after last)
    if (i < zoneCodes.length - 1 && delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return results;
}

/** Type guard: is this a successful response? */
export function isSpotPriceResponse(r: SpotPriceResponse | SpotPriceError): r is SpotPriceResponse {
  return "periods" in r;
}

/** Type guard: is this an error? */
export function isSpotPriceError(r: SpotPriceResponse | SpotPriceError): r is SpotPriceError {
  return "error_code" in r;
}
