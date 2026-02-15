/**
 * Ingest Riksdagen Energy Documents
 *
 * Fetches document metadata from Riksdagen Open Data API,
 * applies deterministic energy taxonomy tags,
 * writes raw + canonical files to evidence pipeline layout,
 * then calls Python hash_tree.py for manifest + hashes.
 *
 * Usage:
 *   npx tsx packages/witness/src/ingest_riksdagen_energy.ts \
 *     --run_id witness_riksdagen_energy_SMOKE \
 *     --keywords "kärnkraft,energiskatt,BBR" \
 *     --max 25
 *
 * TR1: No source, no number.
 * TR2: All ingests produce manifest + SHA256 + root_hash.
 * TR7: Witness mode — metadata only.
 */

import { searchRiksdagen, type RiksdagenDocument } from "./riksdagen_client";
import { tagDocument } from "./tag_rules_energy";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";

// --- CLI args ---
function parseArgs(): { run_id: string; keywords: string[]; max: number; doktyp: string } {
  const args = process.argv.slice(2);
  let run_id = "";
  let keywords: string[] = [];
  let max = 25;
  let doktyp = "mot";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--run_id" && args[i + 1]) run_id = args[++i];
    if (args[i] === "--keywords" && args[i + 1]) keywords = args[++i].split(",");
    if (args[i] === "--max" && args[i + 1]) max = parseInt(args[++i], 10);
    if (args[i] === "--doktyp" && args[i + 1]) doktyp = args[++i];
  }

  if (!run_id) throw new Error("--run_id required");
  if (keywords.length === 0) throw new Error("--keywords required (comma-separated)");

  return { run_id, keywords, max, doktyp };
}

// --- Evidence ID generator ---
function makeEvidenceId(source: string, datasetId: string, runId: string, content: string): string {
  const hash12 = createHash("sha256").update(content).digest("hex").slice(0, 12);
  return `evr:${source}:${datasetId}:${runId}:${hash12}`;
}

// --- Canonical node builder ---
interface CanonicalNode {
  node_id: string;
  evidence_id: string;
  source: { name: string; publisher: string; uri: string };
  doc_id: string;
  doc_type: string;
  subtype: string;
  title: string;
  date: string;
  rm: string;
  organ: string;
  authors: string[];
  tags: string[];
  status: string;
}

function toCanonicalNode(doc: RiksdagenDocument, runId: string): CanonicalNode {
  const evidenceId = makeEvidenceId(
    "riksdagen",
    "riksdagen_open_data",
    runId,
    doc.dok_id
  );

  // Extract authors from undertitel (e.g., "av Elisabeth Thand Ringqvist m.fl. (C)")
  const authors: string[] = [];
  if (doc.undertitel) {
    const match = doc.undertitel.match(/^av\s+(.+?)(?:\s+\(.*\))?$/);
    if (match) authors.push(match[1].replace(" m.fl.", "").trim());
  }

  const tags = tagDocument(doc.titel, doc.undertitel);

  return {
    node_id: `node:riksdagen:${doc.dok_id}`,
    evidence_id: evidenceId,
    source: {
      name: "Riksdagen Open Data",
      publisher: "Riksdagen",
      uri: `https://data.riksdagen.se/dokument/${doc.dok_id}`,
    },
    doc_id: doc.dok_id,
    doc_type: doc.doktyp,
    subtype: doc.subtyp,
    title: doc.titel,
    date: doc.datum,
    rm: doc.rm,
    organ: doc.organ,
    authors,
    tags,
    status: doc.status,
  };
}

// --- Main ---
async function main() {
  const { run_id, keywords, max, doktyp } = parseArgs();
  const projectRoot = resolve(__dirname, "../../..");

  const rawDir = join(projectRoot, "data", "raw", "witness", "riksdagen", run_id);
  const canonicalDir = join(projectRoot, "data", "canonical", "witness", "riksdagen", run_id);
  const manifestDir = join(projectRoot, "manifests", "witness");

  mkdirSync(rawDir, { recursive: true });
  mkdirSync(canonicalDir, { recursive: true });
  mkdirSync(manifestDir, { recursive: true });

  console.log(`[ingest] run_id: ${run_id}`);
  console.log(`[ingest] keywords: ${keywords.join(", ")}`);
  console.log(`[ingest] max: ${max}, doktyp: ${doktyp}`);

  // Fetch from each keyword
  const allDocs: RiksdagenDocument[] = [];
  const seen = new Set<string>();

  for (const kw of keywords) {
    console.log(`[ingest] searching: "${kw}"...`);
    const result = await searchRiksdagen({ sok: kw, doktyp, a: max });
    console.log(`[ingest]   → ${result.total_hits} total hits, fetched ${result.documents.length}`);

    for (const doc of result.documents) {
      if (!seen.has(doc.dok_id)) {
        seen.add(doc.dok_id);
        allDocs.push(doc);
      }
    }
  }

  console.log(`[ingest] total unique documents: ${allDocs.length}`);

  // Write raw (exact API response per keyword)
  for (const kw of keywords) {
    const result = await searchRiksdagen({ sok: kw, doktyp, a: max });
    const rawPath = join(rawDir, `${kw.replace(/\s+/g, "_")}.json`);
    writeFileSync(rawPath, JSON.stringify(result, null, 2), "utf-8");
  }

  // Write canonical nodes
  const canonicalNodes = allDocs.map((doc) => toCanonicalNode(doc, run_id));
  const canonicalPath = join(canonicalDir, "nodes.json");
  writeFileSync(canonicalPath, JSON.stringify(canonicalNodes, null, 2), "utf-8");
  console.log(`[ingest] wrote ${canonicalNodes.length} canonical nodes`);

  // Tag summary
  const tagCounts: Record<string, number> = {};
  for (const node of canonicalNodes) {
    for (const tag of node.tags) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }
  console.log("[ingest] tag distribution:", tagCounts);

  // Call Python hash_tree.py for manifest + hashes (hybrid bridge)
  const hashTreeScript = join(projectRoot, "scripts", "hash_tree.py");
  // Hash raw files
  const rawManifestDir = join(manifestDir, run_id);
  mkdirSync(rawManifestDir, { recursive: true });

  const cmd = `python "${hashTreeScript}" --run_id "${run_id}" --input_dir "${rawDir}" --out_dir "${rawManifestDir}"`;
  console.log(`[ingest] running: ${cmd}`);
  execSync(cmd, { stdio: "inherit" });

  // Also hash canonical
  const canonicalRunId = `${run_id}_canonical`;
  const cmd2 = `python "${hashTreeScript}" --run_id "${canonicalRunId}" --input_dir "${canonicalDir}" --out_dir "${rawManifestDir}"`;
  console.log(`[ingest] running: ${cmd2}`);
  execSync(cmd2, { stdio: "inherit" });

  console.log("[ingest] ✅ done");
  console.log(`[ingest] raw:       ${rawDir}`);
  console.log(`[ingest] canonical: ${canonicalDir}`);
  console.log(`[ingest] manifests: ${rawManifestDir}`);
}

main().catch((err) => {
  console.error("[ingest] FATAL:", err);
  process.exit(1);
});
