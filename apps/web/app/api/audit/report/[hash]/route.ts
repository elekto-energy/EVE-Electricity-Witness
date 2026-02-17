/**
 * GET /api/audit/report/:hash
 *
 * Verify a generated PDF report by its SHA256 hash.
 * Returns report vault entry with full provenance chain.
 *
 * Verification flow:
 *   1. User hashes downloaded PDF: sha256sum evidence_SE3.pdf
 *   2. GET /api/audit/report/{hash}
 *   3. Response includes dataset_eve_id → can verify dataset via /api/audit/dataset/:id
 *   4. Full chain: PDF → report_vault → dataset_vault → canonical data → rebuild
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

interface ReportVaultEntry {
  report_index: number;
  report_hash: string;
  dataset_eve_id: string;
  root_hash: string;
  zone: string;
  period_start: string;
  period_end: string;
  query_command: string;
  created_at_utc: string;
  prev_hash: string | null;
  event_hash: string;
  chain_hash: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hash: string }> },
) {
  const { hash } = await params;
  const root = getProjectRoot();
  const vaultPath = resolve(root, "data", "reports", "report_vault.jsonl");

  if (!existsSync(vaultPath)) {
    return NextResponse.json(
      { error: "Report vault not found", report_hash: hash },
      { status: 404 },
    );
  }

  try {
    const lines = readFileSync(vaultPath, "utf-8").trim().split("\n").filter(Boolean);
    let found: ReportVaultEntry | null = null;

    for (const line of lines) {
      const entry: ReportVaultEntry = JSON.parse(line);
      if (entry.report_hash === hash) {
        found = entry;
        break;
      }
    }

    if (!found) {
      return NextResponse.json(
        {
          error: "Report not found in vault",
          report_hash: hash,
          hint: "Verify the SHA256 hash of your PDF file matches this hash",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      status: "verified",
      report: {
        report_index: found.report_index,
        report_hash: found.report_hash,
        created_at_utc: found.created_at_utc,
        zone: found.zone,
        period: { start: found.period_start, end: found.period_end },
      },
      dataset: {
        dataset_eve_id: found.dataset_eve_id,
        root_hash: found.root_hash,
        audit_url: `/api/audit/dataset/${found.dataset_eve_id}`,
      },
      chain: {
        event_hash: found.event_hash,
        chain_hash: found.chain_hash,
        prev_hash: found.prev_hash,
      },
      rebuild: {
        command: found.query_command,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Vault read error: ${err.message}` },
      { status: 500 },
    );
  }
}
