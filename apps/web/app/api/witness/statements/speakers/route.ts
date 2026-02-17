/**
 * GET /api/witness/statements/speakers?from=...&to=...&source_type=...&q=...
 *
 * Returns observed speakers aggregated from canonical statements,
 * with verified flag from speaker registry.
 *
 * Slice 1B: GATE_NO_PAGING_DERIVATION — UI must use this endpoint.
 * CODEFACTORY scope.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  loadAllStatements,
  filterStatements,
  aggregateObservedSpeakers,
  loadStatementsEvidence,
  loadSpeakersRegistry,
} from "@/lib/statements/readCanonical";
import type { ObservedSpeakersResponse } from "@/lib/types/statements";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const source_type = searchParams.get("source_type") ?? undefined;
  const q = searchParams.get("q") ?? undefined;

  const all = loadAllStatements();
  const filtered = filterStatements(all, { from, to, source: source_type, q });
  const observed = aggregateObservedSpeakers(filtered);

  const statementsEvidence = loadStatementsEvidence();
  const registryData = loadSpeakersRegistry();

  const response: ObservedSpeakersResponse = {
    observed,
    evidence: {
      statements: statementsEvidence,
      registry: registryData.evidence,
    },
  };

  return NextResponse.json(response);
}
