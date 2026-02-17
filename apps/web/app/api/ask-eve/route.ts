/**
 * POST /api/ask-eve
 *
 * Ask-EVE API endpoint.
 * Accepts either:
 *   A) Strict query (direct parameters) — no LLM involved
 *   B) Natural language question — LLM translates to strict query (future)
 *
 * Returns: JSON query result with full provenance.
 * PDF generation available via /api/ask-eve/pdf endpoint.
 *
 * Architecture:
 *   LLM = interface layer (tolkning, aldrig beräkning)
 *   Query Engine = deterministic computation on locked data
 *   PDF = render layer only
 */

import { NextResponse } from "next/server";
import { resolve } from "path";

// Inline query logic to avoid monorepo import issues in Next.js standalone
// In production, this would import from packages/evidence

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\web") || cwd.endsWith("apps/web")) {
    return resolve(cwd, "../..");
  }
  return cwd;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    const { zone, start, end, metrics, aggregation } = body;

    if (!zone || !start || !end) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          required: { zone: "string (e.g. SE3)", start: "YYYY-MM-DD", end: "YYYY-MM-DD" },
          optional: { metrics: "string[] (default: all)", aggregation: "string (default: mean)" },
        },
        { status: 400 },
      );
    }

    // Sovereign mode check
    if (process.env.SOVEREIGN_MODE === "true") {
      // In sovereign mode, only strict queries allowed (no LLM)
      // This is correct — sovereign = deterministic only
    }

    // Dynamic import of query engine
    // Note: In production standalone build, this may need adjustment
    const root = getProjectRoot();
    const { query } = await import(
      /* webpackIgnore: true */
      `${root}/packages/evidence/src/ask-eve/query_v2`
    );

    const result = query({
      zone,
      from: start,
      to: end,
    });

    return NextResponse.json({
      status: "ok",
      query: { zone, start, end, metrics: metrics ?? "all", aggregation: aggregation ?? "mean" },
      result,
    });

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: err.message.includes("No data") ? 404 : 500 },
    );
  }
}
