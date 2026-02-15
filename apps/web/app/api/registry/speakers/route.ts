/**
 * GET /api/registry/speakers
 * Gate C: UI loads speaker list from here.
 * Gate D: includes evidence metadata.
 * CODEFACTORY scope.
 */

import { NextResponse } from "next/server";
import { loadSpeakersRegistry } from "@/lib/statements/readCanonical";
import type { SpeakersRegistryResponse } from "@/lib/types/statements";

export async function GET() {
  const { speakers, evidence } = loadSpeakersRegistry();
  const response: SpeakersRegistryResponse = { speakers, evidence };
  return NextResponse.json(response);
}
