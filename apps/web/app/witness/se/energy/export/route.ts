/**
 * /witness/se/energy/export — Proof Pack Export
 *
 * Returns a ZIP containing: raw/ + canonical/ + manifest files + root_hash
 * for a given run_id or doc_id.
 *
 * TR9: Proof Pack export must include raw + canonical + manifest + hashes.
 *
 * STUB: Returns placeholder. Implement ZIP generation when archiver is added.
 */

import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const run_id = url.searchParams.get("run_id");
  const doc_id = url.searchParams.get("doc_id");

  if (!run_id && !doc_id) {
    return NextResponse.json(
      { error: "Missing run_id or doc_id parameter" },
      { status: 400 }
    );
  }

  // TODO: Implement ZIP generation
  // 1. Locate files in data/raw/witness/riksdagen/{run_id}/
  // 2. Locate files in data/canonical/witness/riksdagen/{run_id}/
  // 3. Locate manifest in manifests/witness/{run_id}/
  // 4. Bundle into ZIP with archiver
  // 5. Return as application/zip

  return NextResponse.json({
    status: "stub",
    message: "Proof Pack export not yet implemented. Files are available on disk.",
    paths: {
      raw: `data/raw/witness/riksdagen/${run_id ?? "?"}`,
      canonical: `data/canonical/witness/riksdagen/${run_id ?? "?"}`,
      manifests: `manifests/witness/${run_id ?? "?"}`,
    },
  });
}
