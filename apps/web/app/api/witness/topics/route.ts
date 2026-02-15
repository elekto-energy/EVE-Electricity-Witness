/**
 * GET /api/witness/topics
 * GET /api/witness/topics?tag=ENERGY.NUCLEAR
 * GET /api/witness/topics?q=kärnkraft
 *
 * Returns all witness topics with optional filtering.
 * Gate D: includes evidence metadata.
 * TR7: No interpretation.
 *
 * CODEFACTORY scope.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadTopics, loadWitnessEvidence } from "@/lib/witness/readWitnessSeed";
import type { WitnessTopicsResponse } from "@/lib/types/witness";
import type { ApiError } from "@/lib/types/spot";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tagFilter = searchParams.get("tag");
  const query = searchParams.get("q")?.toLowerCase();

  let topics = loadTopics();

  if (topics.length === 0) {
    return NextResponse.json<ApiError>(
      { error: "No witness seed data found", detail: "Expected data/canonical/witness/riksdagen_seed_v1/topics.json" },
      { status: 404 }
    );
  }

  if (tagFilter) {
    topics = topics.filter(t => t.tag === tagFilter);
  }

  if (query) {
    topics = topics.filter(t =>
      t.title.toLowerCase().includes(query) ||
      t.title_en.toLowerCase().includes(query) ||
      t.tag.toLowerCase().includes(query)
    );
  }

  const evidence = loadWitnessEvidence();

  const response: WitnessTopicsResponse = { topics, evidence };
  return NextResponse.json(response);
}
