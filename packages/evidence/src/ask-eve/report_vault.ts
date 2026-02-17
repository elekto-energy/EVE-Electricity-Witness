/**
 * Report Vault — Append-Only Chain for Generated Evidence Reports
 *
 * Separate from dataset vault (elekto_v2_worm.jsonl).
 * Each PDF report gets:
 *   - SHA256 of PDF content
 *   - dataset_eve_id reference
 *   - chain_hash linking to previous report
 *
 * This allows verification: PDF hash → vault entry → dataset → rebuild.
 *
 * TR1: No source, no number.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { createHash } from "crypto";
import { resolve, dirname } from "path";

const PROJECT_ROOT = resolve(__dirname, "../../../..");
const VAULT_PATH = resolve(PROJECT_ROOT, "data", "reports", "report_vault.jsonl");

export interface ReportVaultEntry {
  report_index: number;
  report_hash: string;         // SHA256 of PDF file
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

function stableStringify(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of keys) sorted[k] = obj[k];
  return JSON.stringify(sorted);
}

export function appendReportToVault(entry: {
  report_hash: string;
  dataset_eve_id: string;
  root_hash: string;
  zone: string;
  period_start: string;
  period_end: string;
  query_command: string;
}): ReportVaultEntry {
  // Ensure directory exists
  const dir = dirname(VAULT_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Read existing chain
  let prevHash: string | null = null;
  let nextIndex = 1;

  if (existsSync(VAULT_PATH)) {
    const content = readFileSync(VAULT_PATH, "utf-8").trim();
    if (content) {
      const lines = content.split("\n").filter(Boolean);
      if (lines.length > 0) {
        const last: ReportVaultEntry = JSON.parse(lines[lines.length - 1]);
        prevHash = last.chain_hash;
        nextIndex = last.report_index + 1;
      }
    }
  }

  const createdAt = new Date().toISOString();

  // Event payload for hashing (without chain fields)
  const eventPayload: Record<string, unknown> = {
    report_index: nextIndex,
    report_hash: entry.report_hash,
    dataset_eve_id: entry.dataset_eve_id,
    root_hash: entry.root_hash,
    zone: entry.zone,
    period_start: entry.period_start,
    period_end: entry.period_end,
    query_command: entry.query_command,
    created_at_utc: createdAt,
    prev_hash: prevHash,
  };

  const eventHash = createHash("sha256")
    .update(stableStringify(eventPayload))
    .digest("hex");

  const chainHash = createHash("sha256")
    .update((prevHash ?? "") + eventHash)
    .digest("hex");

  const record: ReportVaultEntry = {
    report_index: nextIndex,
    report_hash: entry.report_hash,
    dataset_eve_id: entry.dataset_eve_id,
    root_hash: entry.root_hash,
    zone: entry.zone,
    period_start: entry.period_start,
    period_end: entry.period_end,
    query_command: entry.query_command,
    created_at_utc: createdAt,
    prev_hash: prevHash,
    event_hash: eventHash,
    chain_hash: chainHash,
  };

  appendFileSync(VAULT_PATH, JSON.stringify(record) + "\n", "utf-8");

  return record;
}

/**
 * Find report vault entry by PDF hash.
 */
export function findReportByHash(pdfHash: string): ReportVaultEntry | null {
  if (!existsSync(VAULT_PATH)) return null;
  try {
    const lines = readFileSync(VAULT_PATH, "utf-8").trim().split("\n").filter(Boolean);
    for (const line of lines) {
      const entry: ReportVaultEntry = JSON.parse(line);
      if (entry.report_hash === pdfHash) return entry;
    }
  } catch { /* */ }
  return null;
}

/**
 * List all report vault entries.
 */
export function listReports(): ReportVaultEntry[] {
  if (!existsSync(VAULT_PATH)) return [];
  try {
    return readFileSync(VAULT_PATH, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch { return []; }
}
