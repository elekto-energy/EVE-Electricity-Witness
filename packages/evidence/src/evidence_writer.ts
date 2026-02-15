/**
 * Evidence Writer — Bridge between TypeScript ingest and Python hash pipeline.
 *
 * Writes EvidenceRecord JSON and calls hash_tree.py / make_manifest.py
 * for cryptographic verification.
 *
 * TR2: All ingests produce manifest + SHA256 + root_hash.
 */

import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, join } from "path";

const PROJECT_ROOT = resolve(__dirname, "../../..");
const HASH_TREE_SCRIPT = join(PROJECT_ROOT, "scripts", "hash_tree.py");

export interface EvidenceWriterInput {
  run_id: string;
  source: {
    name: string;
    publisher: string;
    dataset_id: string;
    uri: string;
  };
  license: string;
  raw_dir: string;
  canonical_dir: string;
  manifest_dir: string;
}

export interface EvidenceWriterResult {
  evidence_id: string;
  manifest_path: string;
  root_hash_path: string;
}

/**
 * Write an EvidenceRecord and generate manifest + hashes.
 */
export function writeEvidence(input: EvidenceWriterInput): EvidenceWriterResult {
  const { run_id, source, license, raw_dir, canonical_dir, manifest_dir } = input;

  // Ensure dirs exist
  mkdirSync(manifest_dir, { recursive: true });

  // Generate manifest + hashes for raw via Python
  console.log(`[evidence] hashing raw: ${raw_dir}`);
  execSync(
    `python "${HASH_TREE_SCRIPT}" --run_id "${run_id}_raw" --input_dir "${raw_dir}" --out_dir "${manifest_dir}"`,
    { stdio: "inherit" }
  );

  // Generate manifest + hashes for canonical via Python
  console.log(`[evidence] hashing canonical: ${canonical_dir}`);
  execSync(
    `python "${HASH_TREE_SCRIPT}" --run_id "${run_id}_canonical" --input_dir "${canonical_dir}" --out_dir "${manifest_dir}"`,
    { stdio: "inherit" }
  );

  // Read root hashes
  const rawRootHash = require("fs").readFileSync(
    join(manifest_dir, `${run_id}_raw.root_hash.txt`), "utf-8"
  ).trim();
  const canonicalRootHash = require("fs").readFileSync(
    join(manifest_dir, `${run_id}_canonical.root_hash.txt`), "utf-8"
  ).trim();

  // Build EvidenceRecord (Phase 0 schema)
  const evidenceRecord = {
    evidence_id: `evr:${source.name.toLowerCase().replace(/\s+/g, "_")}:${source.dataset_id}:${run_id}:${canonicalRootHash.slice(0, 12)}`,
    source: {
      name: source.name,
      publisher: source.publisher,
      dataset_id: source.dataset_id,
      uri: source.uri,
    },
    retrieved_at_utc: new Date().toISOString(),
    license,
    raw_artifacts: [], // populated by hash_tree output
    canonical_artifacts: [],
    transforms: [
      {
        name: "ingest_riksdagen_energy",
        version: "0.1.0",
        description: "Fetch Riksdagen metadata, apply energy taxonomy tags, write canonical nodes",
      },
    ],
    hashes: {
      files_sha256: join(manifest_dir, `${run_id}_canonical.files.sha256`),
      root_hash_sha256: canonicalRootHash,
    },
  };

  const evidencePath = join(manifest_dir, `${run_id}.evidence.json`);
  writeFileSync(evidencePath, JSON.stringify(evidenceRecord, null, 2), "utf-8");
  console.log(`[evidence] wrote: ${evidencePath}`);

  return {
    evidence_id: evidenceRecord.evidence_id,
    manifest_path: join(manifest_dir, `${run_id}_canonical.manifest.json`),
    root_hash_path: join(manifest_dir, `${run_id}_canonical.root_hash.txt`),
  };
}
