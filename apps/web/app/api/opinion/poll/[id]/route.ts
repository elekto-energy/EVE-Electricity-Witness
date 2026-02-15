/**
 * GET /api/opinion/poll/:id
 * CODEFACTORY scope. No vote endpoint in Phase B.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPollById, loadOpinionEvidence } from "@/lib/opinion/readOpinionSeed";
import type { OpinionPollDetailResponse } from "@/lib/types/opinion";
import type { ApiError } from "@/lib/types/spot";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const poll = getPollById(id);

  if (!poll) {
    return NextResponse.json<ApiError>(
      { error: "Poll not found", detail: `id=${id}` },
      { status: 404 }
    );
  }

  const evidence = loadOpinionEvidence();
  const response: OpinionPollDetailResponse = { poll, evidence };
  return NextResponse.json(response);
}
