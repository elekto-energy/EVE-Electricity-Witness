/**
 * GET /api/witness/statements?from=YYYY-MM-DD&to=YYYY-MM-DD&speaker=...&q=...&source=...&cursor=...
 *
 * Returns filtered, paginated StatementEvents with evidence metadata.
 * Gate D: every response includes manifest_id + root_hash.
 *
 * CODEFACTORY scope.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  loadAllStatements,
  filterStatements,
  paginate,
  loadStatementsEvidence,
} from "@/lib/statements/readCanonical";
import type { StatementsResponse } from "@/lib/types/statements";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const speaker = searchParams.get("speaker") ?? undefined;
  const q = searchParams.get("q") ?? undefined;
  const source = searchParams.get("source") ?? undefined;
  const cursor = searchParams.get("cursor") ?? undefined;
  const pageSizeStr = searchParams.get("sz");
  const pageSize = pageSizeStr ? Math.min(parseInt(pageSizeStr, 10), 100) : 20;

  const energyOnlyParam = searchParams.get("energyOnly");
  const energyOnly = energyOnlyParam === "false" ? false : true; // default: true

  const all = loadAllStatements();
  const filtered = filterStatements(all, { from, to, speaker, q, source, energyOnly });
  const { page, next_cursor } = paginate(filtered, cursor, pageSize);

  const evidence = loadStatementsEvidence();

  const response: StatementsResponse = {
    items: page,
    page: { next_cursor },
    evidence,
  };

  return NextResponse.json(response);
}
