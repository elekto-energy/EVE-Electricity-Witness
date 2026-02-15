/**
 * GET /api/witness/topic/:id
 *
 * Returns a single witness topic with its chains.
 * Gate D: includes evidence metadata.
 * TR7: No interpretation.
 *
 * CODEFACTORY scope.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTopicById, getChainsForTopic, loadWitnessEvidence } from "@/lib/witness/readWitnessSeed";
import type { WitnessTopicDetailResponse } from "@/lib/types/witness";
import type { ApiError } from "@/lib/types/spot";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const topic = getTopicById(id);
  if (!topic) {
    return NextResponse.json<ApiError>(
      { error: "Topic not found", detail: `id=${id}` },
      { status: 404 }
    );
  }

  const chains = getChainsForTopic(id);
  const evidence = loadWitnessEvidence();

  const response: WitnessTopicDetailResponse = { topic, chains, evidence };
  return NextResponse.json(response);
}
