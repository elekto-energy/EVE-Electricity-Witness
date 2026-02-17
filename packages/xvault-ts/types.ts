/**
 * X-Vault TypeScript Types
 *
 * WORM (Write Once Read Many) event types for ELEKTO V2.
 * Compatible with EVE11 Python X-Vault semantics.
 *
 * Patent: Organiq Sweden AB — witness-mode AI architecture.
 */

// ─── Vault Event Payload ─────────────────────────────────────────────────────

/**
 * Event published to X-Vault after a successful dataset build.
 * Every field is deterministic — same input produces same payload.
 */
export interface VaultEventPayload {
  /** Dataset identity. Format: EVE-TSV2-{ZONE}-{YYYYMMDD}-{METHOD_VERSION} */
  dataset_eve_id: string;

  /** SHA-256 of all file hashes in the dataset */
  root_hash: string;

  /** Path to files.sha256 manifest */
  files_sha256_path: string;

  /** Methodology version. Immutable per V2. */
  methodology_version: string;

  /** Emission scope label */
  emission_scope: string;

  /** Zone code (e.g., "SE3") */
  zone: string;

  /** ISO date string: dataset period start */
  period_start: string;

  /** ISO date string: dataset period end */
  period_end: string;

  /** Data source references */
  source_refs: string[];

  /** If this entry supersedes a previous one (re-seal after data correction) */
  supersedes?: string;
}

// ─── WORM Record ─────────────────────────────────────────────────────────────

/**
 * Single record in the append-only WORM log.
 * Each record is cryptographically chained to the previous one.
 *
 * Hash chain:
 *   event_hash  = SHA-256(JSON.stringify(event))
 *   chain_hash  = SHA-256(prev_hash + event_hash)
 *
 * First record: prev_hash = null, chain_hash = SHA-256("" + event_hash)
 */
export interface WormRecord {
  /** 1-based index in the WORM log */
  event_index: number;

  /** chain_hash of the previous record, or null for the first record */
  prev_hash: string | null;

  /** SHA-256 of JSON.stringify(event) */
  event_hash: string;

  /** SHA-256(prev_hash + event_hash) — the chain link */
  chain_hash: string;

  /** ISO 8601 UTC timestamp of when the record was appended */
  timestamp_utc: string;

  /** The sealed event payload */
  event: VaultEventPayload;
}

// ─── Verification Result ─────────────────────────────────────────────────────

export interface VaultVerifyResult {
  valid: boolean;
  total_records: number;
  first_event_index: number | null;
  last_event_index: number | null;
  last_chain_hash: string | null;
  error?: string;
  error_at_index?: number;
}

// ─── Dataset EVE ID ──────────────────────────────────────────────────────────

/**
 * Parsed components of a dataset EVE ID.
 */
export interface ParsedDatasetEveId {
  prefix: "EVE-TSV2";
  zone: string;
  date: string;           // YYYYMMDD
  methodology_version: string;
  raw: string;
}
