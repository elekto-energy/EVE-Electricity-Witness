/**
 * GET /api/opinion/polls
 * CODEFACTORY scope.
 */

import { NextResponse } from "next/server";
import { loadPolls, loadOpinionEvidence } from "@/lib/opinion/readOpinionSeed";
import type { OpinionPollsResponse } from "@/lib/types/opinion";

export async function GET() {
  const polls = loadPolls();
  const evidence = loadOpinionEvidence();
  const response: OpinionPollsResponse = { polls, evidence };
  return NextResponse.json(response);
}
