/**
 * GET /api/audit/dataset/:id
 *
 * Audit endpoint for EVE Timeseries V2 datasets.
 *
 * Purpose: Allow external parties to verify any sealed dataset by:
 *   1. Querying dataset_eve_id
 *   2. Receiving: methodology, root_hash, manifest, sources, vault chain
 *   3. Rebuilding locally with deterministic pipeline
 *   4. Confirming identical root_hash
 *
 * No AI. No interpretation. Pure verifiability.
 *
 * Data sources:
 *   - Manifest: data/canonical/timeseries_v2/{zone}/manifest_{id}.json
 *   - Vault: data/xvault/elekto_v2_worm.jsonl
 *   - Method registry: config/method_registry.lock.json
 */

import { NextResponse } from "next/server";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, join } from "path";

// ─── Project root resolution ─────────────────────────────────────────────────

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\web") || cwd.endsWith("apps/web")) {
    return resolve(cwd, "../..");
  }
  return cwd;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ManifestFile {
  dataset_eve_id: string;
  methodology_version: string;
  emission_scope: string;
  zone: string;
  period_start: string;
  period_end: string;
  build_timestamp_utc: string;
  root_hash: string;
  total_rows: number;
  total_files: number;
  source_refs: string[];
  files: Array<{ file: string; sha256: string }>;
}

interface VaultRecord {
  event_index: number;
  prev_hash: string | null;
  event_hash: string;
  chain_hash: string;
  timestamp_utc: string;
  event: {
    dataset_eve_id: string;
    root_hash: string;
    methodology_version: string;
    emission_scope: string;
    zone: string;
    period_start: string;
    period_end: string;
    source_refs: string[];
    supersedes?: string;
  };
}

interface MethodRegistryLock {
  methodology_version: string;
  registry_hash: string;
  locked_at: string;
}

// ─── Manifest finder ─────────────────────────────────────────────────────────

/**
 * Find manifest by dataset_eve_id.
 * Manifests live in: data/canonical/timeseries_v2/{zone}/manifest_{id}.json
 * We parse the zone from the ID to find the right directory.
 */
function findManifest(root: string, datasetId: string): ManifestFile | null {
  // Parse zone from ID: EVE-TSV2-{ZONE}-{DATE}-{METHOD}
  const match = datasetId.match(/^EVE-TSV2-([A-Z0-9_]+)-/);
  if (!match) return null;

  const zone = match[1];
  const tsDir = join(root, "data", "canonical", "timeseries_v2", zone);

  if (!existsSync(tsDir)) return null;

  // Search for manifest file matching this dataset_eve_id
  try {
    const files = readdirSync(tsDir).filter(f => f.startsWith("manifest_") && f.endsWith(".json"));
    for (const f of files) {
      const filePath = join(tsDir, f);
      try {
        const manifest: ManifestFile = JSON.parse(readFileSync(filePath, "utf-8"));
        if (manifest.dataset_eve_id === datasetId) return manifest;
      } catch { /* skip malformed */ }
    }
  } catch { /* dir read error */ }

  return null;
}

// ─── Vault lookup ────────────────────────────────────────────────────────────

function findVaultRecord(root: string, datasetId: string): VaultRecord | null {
  const vaultPath = join(root, "data", "xvault", "elekto_v2_worm.jsonl");
  if (!existsSync(vaultPath)) return null;

  try {
    const content = readFileSync(vaultPath, "utf-8").trim();
    if (!content) return null;

    const records: VaultRecord[] = content.split("\n").filter(Boolean).map(line => JSON.parse(line));

    // Find the latest record for this dataset_eve_id.
    // Check both exact match and superseding entries (_R1, _R2, etc.)
    // Also check records that supersede this ID.
    const exact = records.filter(r => r.event.dataset_eve_id === datasetId);
    const superseding = records.filter(r => r.event.supersedes === datasetId);
    const all = [...exact, ...superseding];
    return all.length > 0 ? all[all.length - 1] : null;
  } catch { return null; }
}

// ─── Method registry lock ────────────────────────────────────────────────────

function loadRegistryLock(root: string): MethodRegistryLock | null {
  const lockPath = join(root, "config", "method_registry.lock.json");
  if (!existsSync(lockPath)) return null;
  try {
    return JSON.parse(readFileSync(lockPath, "utf-8"));
  } catch { return null; }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: datasetId } = await params;
  const root = getProjectRoot();

  // Find manifest
  const manifest = findManifest(root, datasetId);

  if (!manifest) {
    return NextResponse.json(
      {
        error: "Dataset not found",
        dataset_eve_id: datasetId,
        hint: "Check dataset_eve_id format: EVE-TSV2-{ZONE}-{YYYYMMDD}-{METHODOLOGY}",
      },
      { status: 404 },
    );
  }

  // Find vault record
  const vaultRecord = findVaultRecord(root, datasetId);

  // Load method registry lock
  const registryLock = loadRegistryLock(root);

  // Build response
  const response: Record<string, unknown> = {
    // Identity
    dataset_eve_id: manifest.dataset_eve_id,
    zone: manifest.zone,

    // Methodology
    methodology_version: manifest.methodology_version,
    emission_scope: manifest.emission_scope,
    registry_hash: registryLock?.registry_hash ?? null,

    // Period
    period_start: manifest.period_start,
    period_end: manifest.period_end,
    build_timestamp_utc: manifest.build_timestamp_utc,

    // Integrity
    root_hash: manifest.root_hash,
    total_rows: manifest.total_rows,
    total_files: manifest.total_files,

    // Sources
    source_refs: manifest.source_refs,

    // Vault chain (if sealed)
    vault: vaultRecord
      ? {
          event_index: vaultRecord.event_index,
          event_hash: vaultRecord.event_hash,
          chain_hash: vaultRecord.chain_hash,
          prev_hash: vaultRecord.prev_hash,
          sealed_at: vaultRecord.timestamp_utc,
          root_hash_match: vaultRecord.event.root_hash === manifest.root_hash,
          supersedes: vaultRecord.event.supersedes ?? null,
        }
      : null,

    // File-level hashes
    files: manifest.files,

    // Verification instructions
    verify: {
      rebuild_command: `npx tsx packages/evidence/src/build_timeseries_v2.ts --zones ${manifest.zone} --skip-vault`,
      expected_root_hash: manifest.root_hash,
      method_registry: "docs/METHOD_REGISTRY_V2.md",
      vault_path: "data/xvault/elekto_v2_worm.jsonl",
    },
  };

  return NextResponse.json(response);
}
