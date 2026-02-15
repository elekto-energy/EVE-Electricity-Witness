/**
 * GET /api/registry/zones
 * GET /api/registry/zones?country=SE
 *
 * Returns the authoritative zone registry for UI selectors.
 * Gate C: UI loads zone list from this endpoint, never hardcodes.
 * Gate D: Includes evidence metadata.
 *
 * CODEFACTORY scope.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadZoneRegistry, zonesByCountry } from "@/lib/registry/readZoneRegistry";
import type { ZoneRegistryResponse, ZoneInfo } from "@/lib/types/registry";
import type { ApiError } from "@/lib/types/spot";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const countryFilter = searchParams.get("country");

  const { zones, evidence } = loadZoneRegistry();

  if (zones.length === 0) {
    return NextResponse.json<ApiError>(
      { error: "Zone registry not available", detail: "Neither canonical zones.json nor entsoe_zones.ts found" },
      { status: 500 }
    );
  }

  let filtered: ZoneInfo[];
  if (countryFilter) {
    filtered = zonesByCountry(zones, countryFilter);
    if (filtered.length === 0) {
      return NextResponse.json<ApiError>(
        { error: "No zones for country", detail: `Country: ${countryFilter.toUpperCase()}` },
        { status: 404 }
      );
    }
  } else {
    filtered = zones;
  }

  const response: ZoneRegistryResponse = {
    zones: filtered,
    evidence,
  };

  return NextResponse.json(response);
}
