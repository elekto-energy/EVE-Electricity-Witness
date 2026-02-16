/**
 * GET /api/witness/energy-decisions
 * Returns the complete energy policy decisions timeline.
 * Data source: data/canonical/witness/energy_decisions_v2.json
 */

import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\web") || cwd.endsWith("apps/web")) {
    return resolve(cwd, "../..");
  }
  return cwd;
}

export async function GET() {
  const root = getProjectRoot();
  const path = resolve(root, "data", "canonical", "witness", "energy_decisions_v2.json");

  if (!existsSync(path)) {
    return NextResponse.json(
      { error: "energy_decisions_v2.json not found" },
      { status: 404 }
    );
  }

  const data = JSON.parse(readFileSync(path, "utf-8"));
  return NextResponse.json(data);
}
