/**
 * X-Vault TypeScript WORM Module
 *
 * Append-only Write Once Read Many log with SHA-256 hash chain.
 * Semantically identical to EVE11 Python worm_module.py.
 *
 * Rules:
 *   - Append only. No update. No delete.
 *   - Duplicate dataset_eve_id → reject (throw).
 *   - Hash chain: each record links to previous via SHA-256.
 *   - Deterministic: same event → same event_hash.
 *   - Verifiable: any tampering breaks the chain.
 *
 * Storage: JSONL (one JSON object per line).
 *
 * Patent: Organiq Sweden AB — witness-mode AI architecture.
 *
 * TR1: No source, no number.
 * TR6: Code seals — never invents.
 */

import { existsSync, mkdirSync, readFileSync, appendFileSync } from "fs";
import { dirname, resolve } from "path";
import { createHash } from "crypto";
import type { VaultEventPayload, WormRecord, ParsedDatasetEveId } from "./types";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default vault JSONL path (relative to project root) */
const DEFAULT_VAULT_PATH = resolve(
  __dirname, "../../..", "data", "xvault", "elekto_v2_worm.jsonl"
);

/** V2 methodology version — immutable for V2 lifecycle */
export const METHODOLOGY_VERSION = "TS_V2_EEA_2023_DIRECT" as const;

/** Emission scope — immutable for V2 lifecycle */
export const EMISSION_SCOPE = "direct_combustion_only" as const;

// ─── Crypto ──────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Deterministic JSON serialization.
 * Recursively sorts all object keys. Array order preserved (correct for ordered data).
 * Critical: Without this, JSON.stringify key order depends on insertion order,
 * which can vary between Node versions, V8 optimizations, and deserialization paths.
 */
export function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(item => stableStringify(item)).join(",") + "]";
  }
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sorted.map(key => {
    return JSON.stringify(key) + ":" + stableStringify((obj as Record<string, unknown>)[key]);
  });
  return "{" + pairs.join(",") + "}";
}

// ─── Dataset EVE ID ──────────────────────────────────────────────────────────

/**
 * Generate a dataset EVE ID.
 *
 * Format: EVE-TSV2-{ZONE}-{YYYYMMDD}-{METHOD_VERSION}
 * Example: EVE-TSV2-SE3-20250213-TS_V2_EEA_2023_DIRECT
 *
 * Deterministic: same zone + date + method → same ID.
 */
export function generateDatasetEveId(
  zone: string,
  buildDate: Date,
  methodologyVersion: string = METHODOLOGY_VERSION,
): string {
  const y = buildDate.getUTCFullYear().toString();
  const m = (buildDate.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = buildDate.getUTCDate().toString().padStart(2, "0");
  return `EVE-TSV2-${zone}-${y}${m}${d}-${methodologyVersion}`;
}

/**
 * Parse a dataset EVE ID into components.
 * Returns null if format is invalid.
 */
export function parseDatasetEveId(id: string): ParsedDatasetEveId | null {
  // EVE-TSV2-SE3-20250213-TS_V2_EEA_2023_DIRECT
  const match = id.match(/^(EVE-TSV2)-([A-Z0-9_]+)-(\d{8})-(.+)$/);
  if (!match) return null;
  return {
    prefix: match[1] as "EVE-TSV2",
    zone: match[2],
    date: match[3],
    methodology_version: match[4],
    raw: id,
  };
}

// ─── WORM Operations ─────────────────────────────────────────────────────────

/**
 * Ensure vault directory exists.
 */
function ensureVaultDir(vaultPath: string): void {
  const dir = dirname(vaultPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read all records from the vault JSONL file.
 * Returns empty array if file doesn't exist.
 */
export function readVault(vaultPath: string = DEFAULT_VAULT_PATH): WormRecord[] {
  if (!existsSync(vaultPath)) return [];
  const content = readFileSync(vaultPath, "utf8").trim();
  if (!content) return [];
  return content.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

/**
 * Check if a dataset_eve_id already exists in the vault.
 */
export function datasetExists(
  datasetEveId: string,
  vaultPath: string = DEFAULT_VAULT_PATH,
): boolean {
  const records = readVault(vaultPath);
  return records.some((r) => r.event.dataset_eve_id === datasetEveId);
}

/**
 * Publish a dataset event to the vault.
 *
 * Rules:
 *   1. Duplicate dataset_eve_id → throw Error (append-only, no overwrite)
 *   2. event_hash = SHA-256(stableStringify(event))  [recursive key-sorted]
 *   3. chain_hash = SHA-256((prev_hash ?? "") + event_hash)
 *   4. Record appended to JSONL file
 *
 * @returns The sealed WormRecord
 * @throws Error if dataset_eve_id already exists
 */
export function publishToVault(
  event: VaultEventPayload,
  vaultPath: string = DEFAULT_VAULT_PATH,
): WormRecord {
  ensureVaultDir(vaultPath);

  const vault = readVault(vaultPath);

  // ─── RULE: Reject duplicate dataset_eve_id ───
  const existing = vault.find((r) => r.event.dataset_eve_id === event.dataset_eve_id);
  if (existing) {
    throw new Error(
      `X-Vault: Duplicate dataset_eve_id rejected: "${event.dataset_eve_id}" ` +
      `(already sealed at index ${existing.event_index}, chain_hash ${existing.chain_hash.slice(0, 16)}...)`
    );
  }

  // ─── Build chain link ───
  const prev = vault.length > 0 ? vault[vault.length - 1] : null;
  const prev_hash = prev ? prev.chain_hash : null;

  // Deterministic: recursive key-sorted serialization
  const eventJson = stableStringify(event);
  const event_hash = sha256(eventJson);
  const chain_hash = sha256((prev_hash ?? "") + event_hash);

  const record: WormRecord = {
    event_index: vault.length + 1,
    prev_hash,
    event_hash,
    chain_hash,
    timestamp_utc: new Date().toISOString(),
    event,
  };

  // ─── Append (WORM: write once) ───
  appendFileSync(vaultPath, JSON.stringify(record) + "\n", "utf8");

  return record;
}

/**
 * Get the latest chain_hash from the vault.
 * Returns null if vault is empty.
 */
export function getLatestChainHash(
  vaultPath: string = DEFAULT_VAULT_PATH,
): string | null {
  const vault = readVault(vaultPath);
  if (vault.length === 0) return null;
  return vault[vault.length - 1].chain_hash;
}
