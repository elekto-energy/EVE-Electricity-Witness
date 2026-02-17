/**
 * ENTSO-E Generation & Cross-Border Flows Client
 *
 * Fetches:
 *   - A75: Actual aggregated generation per type (psrType B01-B20)
 *   - A11: Cross-border physical flows
 *
 * Same patterns as entsoe_client.ts: minimal XML parser, raw XML saved,
 * type guards, sequential rate-limited requests.
 *
 * API: https://web-api.tp.entsoe.eu/api
 *
 * TR1: No source, no number.
 * TR6: Code fetches — never invents.
 */

import { BIDDING_ZONES, type BiddingZone } from "./entsoe_zones";

const API_BASE = "https://web-api.tp.entsoe.eu/api";

export interface EntsoeClientConfig {
  securityToken: string;
  timeoutMs?: number;
}

// ─── PSR Type Registry ───────────────────────────────────────────────────────

/**
 * ENTSO-E PsrType codes.
 * Source: ENTSO-E Code List v36, AssetType.
 * Only generation-relevant types (B01-B20) included.
 */
export const PSR_TYPES = {
  B01: "Biomass",
  B02: "Fossil Brown coal/Lignite",
  B03: "Fossil Coal-derived gas",
  B04: "Fossil Gas",
  B05: "Fossil Hard coal",
  B06: "Fossil Oil",
  B07: "Fossil Oil shale",
  B08: "Fossil Peat",
  B09: "Geothermal",
  B10: "Hydro Pumped Storage",
  B11: "Hydro Run-of-river and poundage",
  B12: "Hydro Water Reservoir",
  B13: "Marine",
  B14: "Nuclear",
  B15: "Other renewable",
  B16: "Solar",
  B17: "Waste",
  B18: "Wind Offshore",
  B19: "Wind Onshore",
  B20: "Other",
} as const;

export type PsrTypeCode = keyof typeof PSR_TYPES;

/**
 * Mapping from ENTSO-E PsrType → V2 canonical field name.
 * Multiple PSR types may map to the same canonical field.
 */
export const PSR_TO_CANONICAL: Record<string, string> = {
  B14: "nuclear_mw",
  B10: "hydro_pumped_mw",
  B11: "hydro_ror_mw",
  B12: "hydro_reservoir_mw",
  B19: "wind_onshore_mw",
  B18: "wind_offshore_mw",
  B16: "solar_mw",
  B04: "gas_mw",
  B05: "coal_mw",
  B02: "lignite_mw",
  B06: "oil_mw",
  B01: "biomass_mw",
  B17: "waste_mw",
  B03: "coal_gas_mw",
  B07: "oil_shale_mw",
  B08: "peat_mw",
  B09: "geothermal_mw",
  B13: "marine_mw",
  B15: "other_renewable_mw",
  B20: "other_mw",
};

/**
 * Aggregated canonical field names for V2 generation_mix.
 * Maps multiple PSR sub-types into the 10 fields specified in the V2 contract.
 */
export const V2_GENERATION_FIELDS: Record<string, PsrTypeCode[]> = {
  nuclear_mw:        ["B14"],
  hydro_mw:          ["B10", "B11", "B12"],
  wind_onshore_mw:   ["B19"],
  wind_offshore_mw:  ["B18"],
  solar_mw:          ["B16"],
  gas_mw:            ["B04"],
  coal_mw:           ["B05"],
  lignite_mw:        ["B02"],
  oil_mw:            ["B06"],
  other_mw:          ["B01", "B03", "B07", "B08", "B09", "B13", "B15", "B17", "B20"],
};

// ─── XML Helpers ─────────────────────────────────────────────────────────────

function formatPeriod(date: Date): string {
  const y = date.getUTCFullYear().toString();
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  const h = date.getUTCHours().toString().padStart(2, "0");
  const min = date.getUTCMinutes().toString().padStart(2, "0");
  return `${y}${m}${d}${h}${min}`;
}

function extractText(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`);
  const m = xml.match(re);
  return m ? m[1] : null;
}

function extractAllBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "g");
  return xml.match(re) ?? [];
}

// ─── A75: Generation Per Type ────────────────────────────────────────────────

export interface GenerationPoint {
  position: number;
  quantity_mw: number;
}

export interface GenerationTimeSeries {
  psr_type: string;         // B01, B02, ..., B20
  psr_name: string;         // "Nuclear", "Fossil Gas", etc.
  in_domain: string;        // EIC code
  period_start: string;     // ISO 8601
  period_end: string;
  resolution: string;       // PT15M or PT60M
  points: GenerationPoint[];
}

export interface GenerationResponse {
  zone: BiddingZone;
  time_series: GenerationTimeSeries[];
  fetched_at_utc: string;
  raw_xml: string;
}

export interface GenerationError {
  zone: BiddingZone;
  error_code: string;
  error_text: string;
  fetched_at_utc: string;
}

/**
 * Parse A75 XML response.
 *
 * XML structure (GL_MarketDocument):
 *   <TimeSeries>
 *     <MktPSRType>
 *       <psrType>B04</psrType>     ← PSR type code
 *     </MktPSRType>
 *     <inBiddingZone_Domain.mRID codingScheme="A01">10Y...</inBiddingZone_Domain.mRID>
 *     <Period>
 *       <timeInterval>
 *         <start>2024-01-01T23:00Z</start>
 *         <end>2024-01-02T23:00Z</end>
 *       </timeInterval>
 *       <resolution>PT60M</resolution>
 *       <Point>
 *         <position>1</position>
 *         <quantity>1234</quantity>
 *       </Point>
 *       ...
 *     </Period>
 *   </TimeSeries>
 *
 * NOTE: A75 can return multiple TimeSeries for the same psrType if there's
 * both production and consumption (e.g., B10 Hydro Pumped Storage has
 * inBiddingZone for production, outBiddingZone for consumption/pumping).
 * We only take inBiddingZone (production) here.
 */
function parseGenerationXml(xml: string, zone: BiddingZone): GenerationResponse | GenerationError {
  const now = new Date().toISOString();

  if (xml.includes("Acknowledgement_MarketDocument")) {
    const code = extractText(xml, "code") ?? "UNKNOWN";
    const text = extractText(xml, "text") ?? "Unknown error";
    return { zone, error_code: code, error_text: text, fetched_at_utc: now };
  }

  const timeSeriesBlocks = extractAllBlocks(xml, "TimeSeries");
  const timeSeries: GenerationTimeSeries[] = [];

  for (const tsXml of timeSeriesBlocks) {
    // Extract PSR type
    const psrType = extractText(tsXml, "psrType");
    if (!psrType) continue;

    // Only take production (inBiddingZone), skip consumption (outBiddingZone)
    // Production series have inBiddingZone_Domain.mRID
    const hasInDomain = tsXml.includes("inBiddingZone_Domain.mRID");
    const hasOutDomain = tsXml.includes("outBiddingZone_Domain.mRID");

    // For B10 (pumped storage): production has inBiddingZone only,
    // consumption has outBiddingZone only.
    // For other types: only inBiddingZone present.
    if (!hasInDomain && hasOutDomain) continue; // Skip consumption series

    const inDomainMatch = tsXml.match(/inBiddingZone_Domain\.mRID[^>]*>([^<]+)/);
    const inDomain = inDomainMatch ? inDomainMatch[1] : zone.eic;

    // Parse periods
    const periodBlocks = extractAllBlocks(tsXml, "Period");
    for (const periodXml of periodBlocks) {
      const start = extractText(periodXml, "start");
      const end = extractText(periodXml, "end");
      const resolution = extractText(periodXml, "resolution") ?? "PT60M";

      const pointBlocks = extractAllBlocks(periodXml, "Point");
      const points: GenerationPoint[] = [];

      for (const ptXml of pointBlocks) {
        const pos = extractText(ptXml, "position");
        const qty = extractText(ptXml, "quantity");
        if (pos && qty) {
          points.push({
            position: parseInt(pos, 10),
            quantity_mw: parseFloat(qty),
          });
        }
      }

      if (start && end && points.length > 0) {
        timeSeries.push({
          psr_type: psrType,
          psr_name: PSR_TYPES[psrType as PsrTypeCode] ?? "Unknown",
          in_domain: inDomain,
          period_start: start,
          period_end: end,
          resolution,
          points: points.sort((a, b) => a.position - b.position),
        });
      }
    }
  }

  return {
    zone,
    time_series: timeSeries,
    fetched_at_utc: now,
    raw_xml: xml,
  };
}

/**
 * Fetch aggregated actual generation per type (A75) for a zone.
 *
 * API call:
 *   documentType=A75
 *   processType=A16 (Realised)
 *   in_Domain={zone EIC}
 */
export async function fetchGenerationPerType(
  config: EntsoeClientConfig,
  zoneCode: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<GenerationResponse | GenerationError> {
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
    documentType: "A75",
    processType: "A16",
    in_Domain: zone.eic,
    periodStart: formatPeriod(periodStart),
    periodEnd: formatPeriod(periodEnd),
  });

  const url = `${API_BASE}?${params.toString()}`;
  const timeout = config.timeoutMs ?? 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const xml = await response.text();
    return parseGenerationXml(xml, zone);
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

// ─── A11: Cross-Border Physical Flows ────────────────────────────────────────

export interface FlowPoint {
  position: number;
  quantity_mw: number;
}

export interface FlowTimeSeries {
  in_domain: string;       // EIC of importing zone
  out_domain: string;      // EIC of exporting zone
  period_start: string;
  period_end: string;
  resolution: string;
  points: FlowPoint[];
}

export interface FlowResponse {
  in_zone: BiddingZone;     // Importing zone
  out_zone: BiddingZone;    // Exporting zone
  direction: string;        // "{out_code}→{in_code}"
  time_series: FlowTimeSeries[];
  fetched_at_utc: string;
  raw_xml: string;
}

export interface FlowError {
  in_zone: BiddingZone;
  out_zone: BiddingZone;
  error_code: string;
  error_text: string;
  fetched_at_utc: string;
}

/**
 * Parse A11 XML response.
 *
 * XML structure (Publication_MarketDocument):
 *   <TimeSeries>
 *     <in_Domain.mRID codingScheme="A01">10Y...</in_Domain.mRID>
 *     <out_Domain.mRID codingScheme="A01">10Y...</out_Domain.mRID>
 *     <quantity_Measure_Unit.name>MAW</quantity_Measure_Unit.name>
 *     <Period>
 *       <timeInterval>
 *         <start>...</start>
 *         <end>...</end>
 *       </timeInterval>
 *       <resolution>PT60M</resolution>
 *       <Point>
 *         <position>1</position>
 *         <quantity>500</quantity>
 *       </Point>
 *     </Period>
 *   </TimeSeries>
 */
function parseFlowXml(
  xml: string,
  inZone: BiddingZone,
  outZone: BiddingZone,
): FlowResponse | FlowError {
  const now = new Date().toISOString();

  if (xml.includes("Acknowledgement_MarketDocument")) {
    const code = extractText(xml, "code") ?? "UNKNOWN";
    const text = extractText(xml, "text") ?? "Unknown error";
    return { in_zone: inZone, out_zone: outZone, error_code: code, error_text: text, fetched_at_utc: now };
  }

  const timeSeriesBlocks = extractAllBlocks(xml, "TimeSeries");
  const timeSeries: FlowTimeSeries[] = [];

  for (const tsXml of timeSeriesBlocks) {
    const inDomainMatch = tsXml.match(/in_Domain\.mRID[^>]*>([^<]+)/);
    const outDomainMatch = tsXml.match(/out_Domain\.mRID[^>]*>([^<]+)/);
    const inDomain = inDomainMatch ? inDomainMatch[1] : inZone.eic;
    const outDomain = outDomainMatch ? outDomainMatch[1] : outZone.eic;

    const periodBlocks = extractAllBlocks(tsXml, "Period");
    for (const periodXml of periodBlocks) {
      const start = extractText(periodXml, "start");
      const end = extractText(periodXml, "end");
      const resolution = extractText(periodXml, "resolution") ?? "PT60M";

      const pointBlocks = extractAllBlocks(periodXml, "Point");
      const points: FlowPoint[] = [];

      for (const ptXml of pointBlocks) {
        const pos = extractText(ptXml, "position");
        const qty = extractText(ptXml, "quantity");
        if (pos && qty) {
          points.push({
            position: parseInt(pos, 10),
            quantity_mw: parseFloat(qty),
          });
        }
      }

      if (start && end && points.length > 0) {
        timeSeries.push({
          in_domain: inDomain,
          out_domain: outDomain,
          period_start: start,
          period_end: end,
          resolution,
          points: points.sort((a, b) => a.position - b.position),
        });
      }
    }
  }

  return {
    in_zone: inZone,
    out_zone: outZone,
    direction: `${outZone.code}→${inZone.code}`,
    time_series: timeSeries,
    fetched_at_utc: now,
    raw_xml: xml,
  };
}

/**
 * Fetch cross-border physical flows (A11) between two zones.
 *
 * API call:
 *   documentType=A11
 *   in_Domain={importing zone EIC}
 *   out_Domain={exporting zone EIC}
 *
 * Returns flow FROM out_Domain TO in_Domain (MW).
 * To get net flow for a zone, call once per neighbour in each direction.
 */
export async function fetchCrossBorderFlows(
  config: EntsoeClientConfig,
  inZoneCode: string,
  outZoneCode: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<FlowResponse | FlowError> {
  const inZone = BIDDING_ZONES[inZoneCode];
  const outZone = BIDDING_ZONES[outZoneCode];
  if (!inZone || !outZone) {
    const dummyZone = (code: string) => ({
      code, eic: "UNKNOWN", country: "??", name: "Unknown", verified: false,
    });
    return {
      in_zone: inZone ?? dummyZone(inZoneCode),
      out_zone: outZone ?? dummyZone(outZoneCode),
      error_code: "INVALID_ZONE",
      error_text: `Unknown zone: ${!inZone ? inZoneCode : outZoneCode}`,
      fetched_at_utc: new Date().toISOString(),
    };
  }

  const params = new URLSearchParams({
    securityToken: config.securityToken,
    documentType: "A11",
    in_Domain: inZone.eic,
    out_Domain: outZone.eic,
    periodStart: formatPeriod(periodStart),
    periodEnd: formatPeriod(periodEnd),
  });

  const url = `${API_BASE}?${params.toString()}`;
  const timeout = config.timeoutMs ?? 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const xml = await response.text();
    return parseFlowXml(xml, inZone, outZone);
  } catch (err: any) {
    clearTimeout(timer);
    return {
      in_zone: inZone,
      out_zone: outZone,
      error_code: "FETCH_ERROR",
      error_text: err.message ?? String(err),
      fetched_at_utc: new Date().toISOString(),
    };
  }
}

// ─── Type Guards ─────────────────────────────────────────────────────────────

export function isGenerationResponse(r: GenerationResponse | GenerationError): r is GenerationResponse {
  return "time_series" in r;
}

export function isGenerationError(r: GenerationResponse | GenerationError): r is GenerationError {
  return "error_code" in r;
}

export function isFlowResponse(r: FlowResponse | FlowError): r is FlowResponse {
  return "time_series" in r;
}

export function isFlowError(r: FlowResponse | FlowError): r is FlowError {
  return "error_code" in r;
}

// ─── Zone Neighbour Map ──────────────────────────────────────────────────────

/**
 * Cross-border interconnections relevant to V2 zones.
 * Each entry: [zoneA, zoneB] — flows exist in both directions.
 *
 * Source: ENTSO-E grid map, verified zone pairs.
 * Only pairs where BOTH zones are in V2 scope.
 *
 * IMPORTANT: For each pair, you need TWO API calls:
 *   fetchCrossBorderFlows(config, A, B, ...) → flow FROM B TO A
 *   fetchCrossBorderFlows(config, B, A, ...) → flow FROM A TO B
 */
export const V2_ZONE_INTERCONNECTIONS: [string, string][] = [
  // SE internal
  ["SE1", "SE2"],
  ["SE2", "SE3"],
  ["SE3", "SE4"],
  // SE ↔ Nordic
  ["SE1", "FI"],
  ["SE3", "FI"],
  ["SE3", "NO1"],   // Hasle interconnector
  ["SE3", "NO2"],   // Skagerrak (partial)
  ["SE4", "NO2"],   // Skagerrak / Konti-Skan adjacent
  // NO internal
  ["NO1", "NO2"],   // Internal Norwegian transmission
  // SE ↔ EU
  ["SE4", "DE_LU"],
  ["SE4", "PL"],
  // Baltic chain (no direct FI↔PL)
  ["FI", "EE"],    // Estlink 1 & 2
  ["EE", "LV"],
  ["LV", "LT"],
  ["LT", "PL"],
  // Central EU
  ["DE_LU", "FR"],
  ["DE_LU", "NL"],
  ["DE_LU", "PL"],
  ["FR", "ES"],
];

/**
 * Get all neighbours for a zone (within V2 scope).
 */
export function getNeighbours(zoneCode: string): string[] {
  const neighbours = new Set<string>();
  for (const [a, b] of V2_ZONE_INTERCONNECTIONS) {
    if (a === zoneCode) neighbours.add(b);
    if (b === zoneCode) neighbours.add(a);
  }
  return [...neighbours].sort();
}
