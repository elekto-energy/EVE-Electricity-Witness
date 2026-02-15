/**
 * GET /api/witness/chain/:id
 *
 * Returns a single witness chain with all steps.
 * Gate D: includes evidence metadata.
 * TR7: No interpretation — structured fields + source links only.
 *
 * CODEFACTORY scope.
 */

import { NextRequest, NextResponse } from "next/server";
import { getChainById, loadWitnessEvidence } from "@/lib/witness/readWitnessSeed";
import type { WitnessChainDetailResponse } from "@/lib/types/witness";
import type { ApiError } from "@/lib/types/spot";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const chain = getChainById(id);
  if (!chain) {
    return NextResponse.json<ApiError>(
      { error: "Chain not found", detail: `id=${id}` },
      { status: 404 }
    );
  }

  const evidence = loadWitnessEvidence();

  const response: WitnessChainDetailResponse = { chain, evidence };
  return NextResponse.json(response);
}
