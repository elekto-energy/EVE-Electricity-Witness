/**
 * X-Vault Verification Module
 *
 * Verifies integrity of the WORM hash chain.
 * Any tampering (modified event, reordered records, deleted records)
 * will break the chain and be detected.
 *
 * Verification checks:
 *   1. event_hash matches SHA-256 of event payload
 *   2. chain_hash matches SHA-256(prev_hash + event_hash)
 *   3. prev_hash of record N matches chain_hash of record N-1
 *   4. event_index is sequential (1, 2, 3, ...)
 *   5. No duplicate dataset_eve_id values
 *
 * Patent: Organiq Sweden AB — witness-mode AI architecture.
 */

import { existsSync, readFileSync } from "fs";
import { createHash } from "crypto";
import type { WormRecord, VaultVerifyResult } from "./types";
import { stableStringify } from "./worm";

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Verify the complete integrity of a vault JSONL file.
 *
 * @returns VaultVerifyResult with valid=true if chain is intact
 */
export function verifyVault(vaultPath: string): VaultVerifyResult {
  // Empty or non-existent vault is valid (nothing to verify)
  if (!existsSync(vaultPath)) {
    return {
      valid: true,
      total_records: 0,
      first_event_index: null,
      last_event_index: null,
      last_chain_hash: null,
    };
  }

  const content = readFileSync(vaultPath, "utf8").trim();
  if (!content) {
    return {
      valid: true,
      total_records: 0,
      first_event_index: null,
      last_event_index: null,
      last_chain_hash: null,
    };
  }

  const lines = content.split("\n").filter(Boolean);
  let records: WormRecord[];
  try {
    records = lines.map((line, i) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Invalid JSON at line ${i + 1}`);
      }
    });
  } catch (err: any) {
    return {
      valid: false,
      total_records: lines.length,
      first_event_index: null,
      last_event_index: null,
      last_chain_hash: null,
      error: err.message,
    };
  }

  // Track seen dataset_eve_ids for duplicate detection
  const seenIds = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const r = records[i];

    // ─── Check 1: Sequential event_index ───
    if (r.event_index !== i + 1) {
      return {
        valid: false,
        total_records: records.length,
        first_event_index: records[0]?.event_index ?? null,
        last_event_index: records[records.length - 1]?.event_index ?? null,
        last_chain_hash: null,
        error: `event_index mismatch: expected ${i + 1}, got ${r.event_index}`,
        error_at_index: i + 1,
      };
    }

    // ─── Check 2: Duplicate dataset_eve_id ───
    if (seenIds.has(r.event.dataset_eve_id)) {
      return {
        valid: false,
        total_records: records.length,
        first_event_index: records[0].event_index,
        last_event_index: records[records.length - 1].event_index,
        last_chain_hash: null,
        error: `Duplicate dataset_eve_id: ${r.event.dataset_eve_id}`,
        error_at_index: i + 1,
      };
    }
    seenIds.add(r.event.dataset_eve_id);

    // ─── Check 3: event_hash integrity ───
    const eventJson = stableStringify(r.event);
    const expectedEventHash = sha256(eventJson);
    if (r.event_hash !== expectedEventHash) {
      return {
        valid: false,
        total_records: records.length,
        first_event_index: records[0].event_index,
        last_event_index: records[records.length - 1].event_index,
        last_chain_hash: null,
        error: `event_hash mismatch at index ${i + 1}: computed ${expectedEventHash.slice(0, 16)}... != stored ${r.event_hash.slice(0, 16)}...`,
        error_at_index: i + 1,
      };
    }

    // ─── Check 4: chain_hash integrity ───
    const expectedChainHash = sha256((r.prev_hash ?? "") + r.event_hash);
    if (r.chain_hash !== expectedChainHash) {
      return {
        valid: false,
        total_records: records.length,
        first_event_index: records[0].event_index,
        last_event_index: records[records.length - 1].event_index,
        last_chain_hash: null,
        error: `chain_hash mismatch at index ${i + 1}`,
        error_at_index: i + 1,
      };
    }

    // ─── Check 5: prev_hash links to previous record ───
    if (i === 0) {
      if (r.prev_hash !== null) {
        return {
          valid: false,
          total_records: records.length,
          first_event_index: records[0].event_index,
          last_event_index: records[records.length - 1].event_index,
          last_chain_hash: null,
          error: `First record must have prev_hash=null, got ${r.prev_hash?.slice(0, 16)}...`,
          error_at_index: 1,
        };
      }
    } else {
      if (r.prev_hash !== records[i - 1].chain_hash) {
        return {
          valid: false,
          total_records: records.length,
          first_event_index: records[0].event_index,
          last_event_index: records[records.length - 1].event_index,
          last_chain_hash: null,
          error: `prev_hash at index ${i + 1} does not match chain_hash of index ${i}`,
          error_at_index: i + 1,
        };
      }
    }
  }

  // All checks passed
  return {
    valid: true,
    total_records: records.length,
    first_event_index: records[0].event_index,
    last_event_index: records[records.length - 1].event_index,
    last_chain_hash: records[records.length - 1].chain_hash,
  };
}

/**
 * Find a specific dataset in the vault by its EVE ID.
 * Returns the WormRecord or null if not found.
 */
export function findDataset(
  datasetEveId: string,
  vaultPath: string,
): WormRecord | null {
  if (!existsSync(vaultPath)) return null;
  const content = readFileSync(vaultPath, "utf8").trim();
  if (!content) return null;
  const lines = content.split("\n").filter(Boolean);
  for (const line of lines) {
    const record: WormRecord = JSON.parse(line);
    if (record.event.dataset_eve_id === datasetEveId) return record;
  }
  return null;
}
