/**
 * GET /api/witness/decisions/:id
 *
 * Returns single decision node + edges + neighbors + evidence.
 * CODEFACTORY scope.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDecisionNodeWithEdges, loadGraphEvidence } from "@/lib/decisions/readDecisionGraph";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const nodeId = decodeURIComponent(id);

  const result = getDecisionNodeWithEdges(nodeId);

  if (!result.node) {
    return NextResponse.json({ error: "Decision node not found" }, { status: 404 });
  }

  const evidence = loadGraphEvidence();

  return NextResponse.json({
    ...result,
    evidence,
  });
}
