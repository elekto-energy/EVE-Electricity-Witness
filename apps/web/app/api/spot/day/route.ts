/**
 * GET /api/spot/day?zone=SE3&date=YYYY-MM-DD
 *
 * Returns day-ahead prices for a single zone on a single date.
 * Reads from canonical ENTSO-E data. Gate D: includes evidence metadata.
 *
 * CODEFACTORY scope.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  findRunByDate,
  findLatestRun,
  loadCanonicalRecords,
  loadEvidenceMetadata,
  getZoneDaySeries,
  computeStats,
} from "@/lib/spot/readCanonical";
import type { SpotDayResponse, ApiError } from "@/lib/types/spot";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const zone = searchParams.get("zone");
  const date = searchParams.get("date");

  // Validate params
  if (!zone) {
    return NextResponse.json<ApiError>(
      { error: "Missing required parameter: zone", detail: "Usage: /api/spot/day?zone=SE3&date=2025-02-13" },
      { status: 400 }
    );
  }

  // Resolve run_id
  let runId: string | null;
  if (date) {
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json<ApiError>(
        { error: "Invalid date format", detail: "Expected YYYY-MM-DD" },
        { status: 400 }
      );
    }
    runId = findRunByDate(date);
  } else {
    runId = findLatestRun();
  }

  if (!runId) {
    return NextResponse.json<ApiError>(
      { error: "No canonical data found", detail: date ? `No run found for date ${date}` : "No runs available" },
      { status: 404 }
    );
  }

  // Load records
  const records = loadCanonicalRecords(runId);
  if (records.length === 0) {
    return NextResponse.json<ApiError>(
      { error: "Empty canonical dataset", detail: `run_id=${runId} has no records` },
      { status: 404 }
    );
  }

  // Determine effective date from run if not specified
  const effectiveDate = date ?? extractDateFromRun(runId, records);
  if (!effectiveDate) {
    return NextResponse.json<ApiError>(
      { error: "Cannot determine date", detail: "Provide date parameter or ensure run_id contains date" },
      { status: 400 }
    );
  }

  // Get zone day series (merged, deduped, filtered to 24h)
  const { series, resolution } = getZoneDaySeries(records, zone.toUpperCase(), effectiveDate);

  if (series.length === 0) {
    return NextResponse.json<ApiError>(
      { error: "No data for zone", detail: `Zone ${zone.toUpperCase()} not found in run ${runId} for ${effectiveDate}` },
      { status: 404 }
    );
  }

  // Compute stats
  const prices = series.map(p => p.price);
  const stats = computeStats(prices);

  // Evidence metadata (Gate D)
  const evidence = loadEvidenceMetadata(runId);

  const response: SpotDayResponse = {
    zone: zone.toUpperCase(),
    date: effectiveDate,
    currency: "EUR/MWh",
    resolution,
    series,
    stats,
    evidence,
  };

  return NextResponse.json(response);
}

/** Try to extract YYYY-MM-DD from run_id or first record */
function extractDateFromRun(runId: string, records: { period_start: string }[]): string | null {
  // Try run_id pattern: entsoe_dayahead_SE_20250213
  const match = runId.match(/(\d{4})(\d{2})(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  // Fallback: first record period_start
  if (records.length > 0) {
    return records[0].period_start.slice(0, 10);
  }

  return null;
}
