/**
 * POST /api/ask-eve
 *
 * Ask-EVE query endpoint.
 * Runs deterministic query on locked V2 dataset.
 * Returns JSON with full provenance.
 *
 * FX metadata is added as presentation-layer info.
 * It does NOT affect dataset_eve_id, root_hash, or query_hash.
 */

import { NextResponse } from "next/server";
import { resolve } from "path";
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { createHash } from "crypto";

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\web") || cwd.endsWith("apps/web")) {
    return resolve(cwd, "../..");
  }
  return cwd;
}

function resolveFxForApi(root: string, periodStart: string): {
  fx_rate: number;
  fx_period: string;
  fx_source: string;
  fx_file_hash: string;
} | null {
  try {
    const fxPath = resolve(root, "packages/evidence/src/fx/ecb_eur_sek_monthly.json");
    if (!existsSync(fxPath)) return null;

    const raw = readFileSync(fxPath, "utf-8");
    const fxData = JSON.parse(raw);
    const fxFileHash = createHash("sha256").update(raw).digest("hex");

    // Extract YYYY-MM from periodStart
    const match = periodStart.match(/^(\d{4})-(\d{2})/);
    if (!match) return null;

    const key = `${match[1]}-${match[2]}`;
    const rate = fxData.data?.[key];
    if (typeof rate !== "number") return null;

    return {
      fx_rate: rate,
      fx_period: key,
      fx_source: "ECB Monthly Average",
      fx_file_hash: fxFileHash,
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { zone, start, end } = body;

    if (!zone || !start || !end) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          required: { zone: "string (e.g. SE3)", start: "YYYY-MM-DD", end: "YYYY-MM-DD" },
        },
        { status: 400 },
      );
    }

    const root = getProjectRoot();
    const script = resolve(root, "packages/evidence/src/ask-eve/query_v2.ts");

    if (!existsSync(script)) {
      return NextResponse.json(
        { error: `Query engine not found: ${script}` },
        { status: 500 },
      );
    }

    // Shell out to query_v2 CLI and capture JSON output
    const cmd = `npx tsx "${script}" --zone ${zone} --from ${start} --to ${end} --json`;

    const output = execSync(cmd, {
      cwd: root,
      timeout: 30_000,
      encoding: "utf-8",
      env: { ...process.env, NODE_ENV: "production" },
    });

    // Find the JSON object in output (skip any log lines)
    const jsonStart = output.indexOf("{");
    if (jsonStart === -1) {
      return NextResponse.json(
        { error: "Query engine did not return JSON", raw: output.slice(0, 500) },
        { status: 500 },
      );
    }

    const jsonStr = output.slice(jsonStart);
    const result = JSON.parse(jsonStr);

    // Resolve FX — presentation layer only
    const fx = resolveFxForApi(root, start);

    return NextResponse.json({
      status: "ok",
      query: { zone, start, end },
      result,
      fx,  // null if no rate available — client handles gracefully
    });

  } catch (err: any) {
    const msg = err.stderr || err.message || "Unknown error";
    const status = msg.includes("No data") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
