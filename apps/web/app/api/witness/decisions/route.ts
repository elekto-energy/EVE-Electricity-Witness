/**
 * GET /api/witness/decisions?type=prop|bet|vote&from=...&to=...&q=...&topic=energy&cursor=...&sz=20
 *
 * Returns filtered, paginated decision nodes with evidence.
 * CODEFACTORY scope.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  loadDecisionGraph,
  filterDecisionNodes,
  paginateNodes,
  loadGraphEvidence,
} from "@/lib/decisions/readDecisionGraph";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const nodeType = searchParams.get("type") ?? undefined;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const q = searchParams.get("q") ?? undefined;
  const topic = searchParams.get("topic") ?? undefined;
  const cursor = searchParams.get("cursor") ?? undefined;
  const pageSizeStr = searchParams.get("sz");
  const pageSize = pageSizeStr ? Math.min(parseInt(pageSizeStr, 10), 100) : 20;

  const graph = loadDecisionGraph();

  // Sort nodes: published_at_utc desc, then node_id
  const sorted = [...graph.nodes].sort((a, b) => {
    const dateCompare = b.published_at_utc.localeCompare(a.published_at_utc);
    if (dateCompare !== 0) return dateCompare;
    return a.node_id.localeCompare(b.node_id);
  });

  const filtered = filterDecisionNodes(sorted, { nodeType, from, to, q, topic });
  const { page, next_cursor } = paginateNodes(filtered, cursor, pageSize);
  const evidence = loadGraphEvidence();

  return NextResponse.json({
    items: page,
    page: { next_cursor },
    evidence,
    stats: graph.stats,
  });
}
