/**
 * GET /api/registry/sources
 * Gate C: UI loads source list from here.
 * Gate D: includes evidence metadata.
 * CODEFACTORY scope.
 */

import { NextResponse } from "next/server";
import { loadSourcesRegistry } from "@/lib/statements/readCanonical";
import type { SourcesRegistryResponse } from "@/lib/types/statements";

export async function GET() {
  const { sources, evidence } = loadSourcesRegistry();
  const response: SourcesRegistryResponse = { sources, evidence };
  return NextResponse.json(response);
}
