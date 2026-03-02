/**
 * POST /api/ask-eve/verify
 *
 * Accepts a PDF SHA-256 hash and verifies it against the report vault.
 * No PDF upload needed — only the hash is sent.
 *
 * Returns:
 *   - verified: true/false
 *   - vault entry if found
 *   - chain integrity status
 */

import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";

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
  query_hash: string;
  zone: string;
  period_start: string;
  period_end: string;
  language: string;
  template_version: string;
  query_command: string;
  fx_rate: number | null;
  fx_period: string | null;
  created_at_utc: string;
  prev_hash: string | null;
  event_hash: string;
  chain_hash: string;
}

function stableStringify(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of keys) sorted[k] = obj[k];
  return JSON.stringify(sorted);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { hash } = body;

    if (!hash || typeof hash !== "string" || hash.length !== 64) {
      return NextResponse.json(
        { error: "Invalid hash. Expected SHA-256 hex string (64 chars)." },
        { status: 400 },
      );
    }

    const root = getProjectRoot();
    const vaultPath = resolve(root, "data", "reports", "report_vault.jsonl");

    if (!existsSync(vaultPath)) {
      return NextResponse.json({
        verified: false,
        reason: "Report vault not found on server.",
      });
    }

    const lines = readFileSync(vaultPath, "utf-8").trim().split("\n").filter(Boolean);
    const entries: ReportVaultEntry[] = lines.map(l => JSON.parse(l));

    // Find matching report
    const match = entries.find(e => e.report_hash === hash);

    if (!match) {
      return NextResponse.json({
        verified: false,
        reason: "PDF hash not found in report vault.",
        vault_entries_total: entries.length,
      });
    }

    // Verify chain integrity up to and including this entry
    let chainValid = true;
    const chainErrors: string[] = [];

    for (let i = 0; i <= entries.indexOf(match); i++) {
      const entry = entries[i];
      if (i === 0) {
        if (entry.prev_hash !== null) {
          chainErrors.push(`Entry ${entry.report_index}: first entry has non-null prev_hash`);
          chainValid = false;
        }
      } else {
        if (entry.prev_hash !== entries[i - 1].chain_hash) {
          chainErrors.push(`Entry ${entry.report_index}: prev_hash mismatch`);
          chainValid = false;
        }
      }

      // Verify event_hash
      const eventPayload: Record<string, unknown> = {
        report_index: entry.report_index,
        report_hash: entry.report_hash,
        dataset_eve_id: entry.dataset_eve_id,
        root_hash: entry.root_hash,
        query_hash: entry.query_hash,
        zone: entry.zone,
        period_start: entry.period_start,
        period_end: entry.period_end,
        language: entry.language,
        template_version: entry.template_version,
        query_command: entry.query_command,
        fx_rate: entry.fx_rate ?? null,
        fx_period: entry.fx_period ?? null,
        fx_source: (entry as any).fx_source ?? null,
        fx_file_hash: (entry as any).fx_file_hash ?? null,
        created_at_utc: entry.created_at_utc,
        prev_hash: entry.prev_hash,
      };

      const expectedEventHash = createHash("sha256")
        .update(stableStringify(eventPayload))
        .digest("hex");

      if (expectedEventHash !== entry.event_hash) {
        chainErrors.push(`Entry ${entry.report_index}: event_hash mismatch`);
        chainValid = false;
      }

      // Verify chain_hash
      const expectedChainHash = createHash("sha256")
        .update((entry.prev_hash ?? "") + entry.event_hash)
        .digest("hex");

      if (expectedChainHash !== entry.chain_hash) {
        chainErrors.push(`Entry ${entry.report_index}: chain_hash mismatch`);
        chainValid = false;
      }
    }

    // Cross-reference dataset vault
    let datasetVerified = false;
    const datasetVaultPath = resolve(root, "data", "xvault", "elekto_v2_worm.jsonl");
    if (existsSync(datasetVaultPath)) {
      try {
        const dsLines = readFileSync(datasetVaultPath, "utf-8").trim().split("\n").filter(Boolean);
        for (const line of dsLines) {
          const ds = JSON.parse(line);
          if (ds.event?.dataset_eve_id === match.dataset_eve_id) {
            datasetVerified = true;
            break;
          }
        }
      } catch {}
    }

    return NextResponse.json({
      verified: true,
      chain_valid: chainValid,
      chain_errors: chainErrors,
      dataset_verified: datasetVerified,
      report: {
        report_index: match.report_index,
        zone: match.zone,
        period_start: match.period_start,
        period_end: match.period_end,
        language: match.language,
        template_version: match.template_version,
        created_at_utc: match.created_at_utc,
        query_hash: match.query_hash,
        chain_hash: match.chain_hash,
        dataset_eve_id: match.dataset_eve_id,
        root_hash: match.root_hash,
        query_command: match.query_command,
      },
      vault_entries_total: entries.length,
    });

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 },
    );
  }
}
