/**
 * Ingest: Riksdagen Anföranden → StatementEvents
 *
 * Usage:
 *   npx tsx packages/evidence/src/ingest_riksdagen_anf.ts \
 *     --run_id riksdagen_anf_20260215 \
 *     --from 2025-02-01 --to 2025-02-15
 *
 * Optionally:
 *   --iid <intressent_id>   Filter by speaker
 *   --rm <riksmöte>         Filter by riksmöte (e.g. 2024/25)
 *
 * Produces:
 *   data/raw/riksdagen/<run_id>/anforanden_raw.json
 *   data/canonical/statements/riksdagen/<run_id>/statements.json
 *   manifests/riksdagen/<run_id>_raw.*
 *   manifests/riksdagen/<run_id>_canonical.*
 *
 * CODEFACTORY scope. Deterministic mapping.
 */

import { resolve } from "path";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { fetchAllAnforanden } from "./riksdagen_anf_client";
import { mapAnforandenToStatements } from "./riksdagen_anf_map";
import { writeEvidence } from "./evidence_writer";

const PROJECT_ROOT = resolve(__dirname, "../../..");

// Parse CLI args
function parseArgs(): {
  run_id: string;
  from?: string;
  to?: string;
  iid?: string;
  rm?: string;
} {
  const args = process.argv.slice(2);
  const map: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    map[key] = args[i + 1];
  }

  if (!map.run_id) {
    console.error("Usage: --run_id <id> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--iid <person_id>] [--rm <riksmöte>]");
    process.exit(1);
  }

  return {
    run_id: map.run_id,
    from: map.from,
    to: map.to,
    iid: map.iid,
    rm: map.rm,
  };
}

async function main() {
  const opts = parseArgs();
  const now = new Date().toISOString();

  console.log(`\n=== Riksdagen Anföranden Ingest ===`);
  console.log(`run_id: ${opts.run_id}`);
  console.log(`from: ${opts.from ?? "any"}`);
  console.log(`to: ${opts.to ?? "any"}`);

  // Dirs
  const rawDir = resolve(PROJECT_ROOT, "data", "raw", "riksdagen", opts.run_id);
  const canonicalDir = resolve(PROJECT_ROOT, "data", "canonical", "statements", "riksdagen", opts.run_id);
  const manifestDir = resolve(PROJECT_ROOT, "manifests", "riksdagen");

  mkdirSync(rawDir, { recursive: true });
  mkdirSync(canonicalDir, { recursive: true });
  mkdirSync(manifestDir, { recursive: true });

  // 1. Fetch
  console.log(`\n[1/4] Fetching anföranden from Riksdagen API...`);
  const rawItems = await fetchAllAnforanden({
    from: opts.from,
    to: opts.to,
    iid: opts.iid,
    rm: opts.rm,
    sz: 100,
  });
  console.log(`  → ${rawItems.length} anföranden fetched`);

  // 2. Write raw
  const rawPath = resolve(rawDir, "anforanden_raw.json");
  writeFileSync(rawPath, JSON.stringify(rawItems, null, 2), "utf-8");
  console.log(`[2/4] Raw saved: ${rawPath}`);

  // 3. Map to StatementEvents
  console.log(`\n[3/4] Mapping to StatementEvents...`);

  // Load speaker registry
  const speakersPath = resolve(PROJECT_ROOT, "data", "canonical", "registries", "speakers_v1.json");
  const speakersData = JSON.parse(readFileSync(speakersPath, "utf-8"));
  const speakers = speakersData.speakers ?? [];

  // Placeholder evidence_ref (will be updated after hashing)
  const statements = mapAnforandenToStatements(
    rawItems,
    speakers,
    { manifest_id: `${opts.run_id}_canonical`, root_hash: "pending", files_sha256_path: "pending" },
    now,
  );

  console.log(`  → ${statements.length} StatementEvents mapped`);
  console.log(`  → ${new Set(statements.map(s => s.speaker_id)).size} unique speakers`);

  // Write canonical
  const canonicalPath = resolve(canonicalDir, "statements.json");
  writeFileSync(canonicalPath, JSON.stringify(statements, null, 2), "utf-8");
  console.log(`  → Canonical saved: ${canonicalPath}`);

  // 4. Generate evidence (manifests + hashes)
  console.log(`\n[4/4] Generating evidence...`);
  const evidenceResult = writeEvidence({
    run_id: opts.run_id,
    source: {
      name: "Riksdagen Anföranden",
      publisher: "Sveriges Riksdag",
      dataset_id: "anforandelista",
      uri: "https://data.riksdagen.se/anforandelista/",
    },
    license: "CC0 / Riksdagen Open Data",
    raw_dir: rawDir,
    canonical_dir: canonicalDir,
    manifest_dir: manifestDir,
  });

  // Update statements with actual evidence ref
  const rootHash = readFileSync(
    resolve(manifestDir, `${opts.run_id}_canonical.root_hash.txt`), "utf-8"
  ).trim();
  const filesHashPath = resolve(manifestDir, `${opts.run_id}_canonical.files.sha256`);

  for (const stmt of statements) {
    stmt.evidence_ref.root_hash = rootHash;
    stmt.evidence_ref.files_sha256_path = filesHashPath;
  }

  // Re-write canonical with actual hashes
  writeFileSync(canonicalPath, JSON.stringify(statements, null, 2), "utf-8");

  // Re-hash canonical (since we updated the file)
  const { execSync } = require("child_process");
  execSync(
    `python "${resolve(PROJECT_ROOT, "scripts", "hash_tree.py")}" --run_id "${opts.run_id}_canonical" --input_dir "${canonicalDir}" --out_dir "${manifestDir}"`,
    { stdio: "inherit" }
  );

  const finalRootHash = readFileSync(
    resolve(manifestDir, `${opts.run_id}_canonical.root_hash.txt`), "utf-8"
  ).trim();

  console.log(`\n=== DONE ===`);
  console.log(`Statements: ${statements.length}`);
  console.log(`Evidence ID: ${evidenceResult.evidence_id}`);
  console.log(`Root hash: ${finalRootHash}`);
  console.log(`Manifest: ${manifestDir}`);
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
