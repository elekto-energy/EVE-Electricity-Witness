/**
 * GET /api/spot/compare?zones=SE1,SE2,SE3,SE4&date=YYYY-MM-DD
 *
 * Returns day-ahead prices for multiple zones for comparison.
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
import type { SpotCompareResponse, SpotCompareZone, ApiError } from "@/lib/types/spot";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const zonesParam = searchParams.get("zones");
  const date = searchParams.get("date");

  if (!zonesParam) {
    return NextResponse.json<ApiError>(
      { error: "Missing required parameter: zones", detail: "Usage: /api/spot/compare?zones=SE1,SE2,SE3,SE4&date=2025-02-13" },
      { status: 400 }
    );
  }

  const zoneCodes = zonesParam.split(",").map(z => z.trim().toUpperCase()).filter(Boolean);
  if (zoneCodes.length === 0) {
    return NextResponse.json<ApiError>(
      { error: "No valid zone codes", detail: "Provide comma-separated zone codes" },
      { status: 400 }
    );
  }

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json<ApiError>(
      { error: "Invalid date format", detail: "Expected YYYY-MM-DD" },
      { status: 400 }
    );
  }

  // Resolve run
  const runId = date ? findRunByDate(date) : findLatestRun();
  if (!runId) {
    return NextResponse.json<ApiError>(
      { error: "No canonical data found", detail: date ? `No run for date ${date}` : "No runs available" },
      { status: 404 }
    );
  }

  const records = loadCanonicalRecords(runId);
  if (records.length === 0) {
    return NextResponse.json<ApiError>(
      { error: "Empty canonical dataset", detail: `run_id=${runId}` },
      { status: 404 }
    );
  }

  // Effective date
  const effectiveDate = date ?? extractDateFromRun(runId, records);
  if (!effectiveDate) {
    return NextResponse.json<ApiError>(
      { error: "Cannot determine date" },
      { status: 400 }
    );
  }

  // Build per-zone series
  const zones: SpotCompareZone[] = [];
  for (const code of zoneCodes) {
    const { series } = getZoneDaySeries(records, code, effectiveDate);
    if (series.length > 0) {
      const prices = series.map(p => p.price);
      zones.push({ zone: code, series, stats: computeStats(prices) });
    }
  }

  if (zones.length === 0) {
    return NextResponse.json<ApiError>(
      { error: "No data for any requested zone", detail: `Zones: ${zoneCodes.join(", ")} in run ${runId}` },
      { status: 404 }
    );
  }

  const evidence = loadEvidenceMetadata(runId);

  const response: SpotCompareResponse = {
    date: effectiveDate,
    currency: "EUR/MWh",
    zones,
    evidence,
  };

  return NextResponse.json(response);
}

function extractDateFromRun(runId: string, records: { period_start: string }[]): string | null {
  const match = runId.match(/(\d{4})(\d{2})(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  if (records.length > 0) return records[0].period_start.slice(0, 10);
  return null;
}
