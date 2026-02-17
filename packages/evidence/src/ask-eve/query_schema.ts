/**
 * Ask-EVE Strict Query Schema
 *
 * Validates queries against V2 locked constraints.
 * LLM output must pass this validation — no exceptions.
 *
 * If LLM hallucinates a zone, metric, or date outside bounds → REJECT.
 */

import { V2_GOLDEN_ZONES, V2_PERIOD_START } from "../timeseries_v2_config";

// ─── Schema Definition ──────────────────────────────────────────────────────

export const ALLOWED_METRICS = [
  "spot",
  "production_co2_g_kwh",
  "consumption_co2_g_kwh",
  "net_import_mw",
  "total_gen_mw",
  "nuclear_mw",
  "hydro_mw",
  "wind_onshore_mw",
  "wind_offshore_mw",
  "solar_mw",
  "gas_mw",
  "coal_mw",
  "lignite_mw",
  "oil_mw",
  "other_mw",
  "temp",
  "wind_speed",
  "solar_rad",
  "hdd",
] as const;

export type AllowedMetric = typeof ALLOWED_METRICS[number];

export const ALLOWED_AGGREGATIONS = ["mean", "sum", "min", "max", "median", "hourly"] as const;
export type AllowedAggregation = typeof ALLOWED_AGGREGATIONS[number];

export interface StrictQuery {
  zone: string;
  start: string;       // YYYY-MM-DD
  end: string;         // YYYY-MM-DD
  metrics: AllowedMetric[];
  aggregation: AllowedAggregation;
  compare_zone?: string;  // Optional second zone for comparison
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  query?: StrictQuery;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateQuery(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof input !== "object" || input === null) {
    return { valid: false, errors: ["Input must be an object"] };
  }

  const q = input as Record<string, unknown>;

  // Zone
  if (typeof q.zone !== "string" || !(V2_GOLDEN_ZONES as readonly string[]).includes(q.zone)) {
    errors.push(`Invalid zone: "${q.zone}". Allowed: ${V2_GOLDEN_ZONES.join(", ")}`);
  }

  // Compare zone (optional)
  if (q.compare_zone !== undefined) {
    if (typeof q.compare_zone !== "string" || !(V2_GOLDEN_ZONES as readonly string[]).includes(q.compare_zone)) {
      errors.push(`Invalid compare_zone: "${q.compare_zone}". Allowed: ${V2_GOLDEN_ZONES.join(", ")}`);
    }
  }

  // Start date
  if (typeof q.start !== "string" || !DATE_RE.test(q.start)) {
    errors.push(`Invalid start date: "${q.start}". Format: YYYY-MM-DD`);
  } else {
    const startDate = new Date(q.start + "T00:00:00Z");
    const periodStart = new Date(V2_PERIOD_START + "T00:00:00Z");
    if (startDate < periodStart) {
      errors.push(`Start date ${q.start} before V2 period start ${V2_PERIOD_START}`);
    }
  }

  // End date
  if (typeof q.end !== "string" || !DATE_RE.test(q.end)) {
    errors.push(`Invalid end date: "${q.end}". Format: YYYY-MM-DD`);
  } else if (typeof q.start === "string" && DATE_RE.test(q.start)) {
    if (new Date(q.end) < new Date(q.start as string)) {
      errors.push(`End date ${q.end} before start date ${q.start}`);
    }
  }

  // Metrics
  if (!Array.isArray(q.metrics) || q.metrics.length === 0) {
    errors.push("metrics must be a non-empty array");
  } else {
    for (const m of q.metrics) {
      if (!(ALLOWED_METRICS as readonly string[]).includes(m)) {
        errors.push(`Invalid metric: "${m}". Allowed: ${ALLOWED_METRICS.join(", ")}`);
      }
    }
  }

  // Aggregation
  if (typeof q.aggregation !== "string" || !(ALLOWED_AGGREGATIONS as readonly string[]).includes(q.aggregation)) {
    errors.push(`Invalid aggregation: "${q.aggregation}". Allowed: ${ALLOWED_AGGREGATIONS.join(", ")}`);
  }

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    errors: [],
    query: {
      zone: q.zone as string,
      start: q.start as string,
      end: q.end as string,
      metrics: q.metrics as AllowedMetric[],
      aggregation: q.aggregation as AllowedAggregation,
      compare_zone: q.compare_zone as string | undefined,
    },
  };
}
