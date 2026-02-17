/**
 * Ingest: Riksdagen Propositioner + Betänkanden → DecisionNodes (energy scope)
 *
 * Usage:
 *   npx tsx packages/evidence/src/ingest_riksdagen_docs.ts \
 *     --run_id decisions_docs_v1 \
 *     --doktyp prop,bet \
 *     --from 2022-01-01 --to 2026-02-15
 *
 * Produces:
 *   data/raw/decisions/<run_id>/docs_raw.json
 *   data/canonical/decisions/<run_id>/decision_nodes.json
 *   manifests/decisions/<run_id>_raw.*
 *   manifests/decisions/<run_id>_canonical.*
 *
 * CODEFACTORY scope. Deterministic mapping + energy topic tagging.
 */

import { resolve } from "path";
import { mkdirSync, writeFileSync, execSync } from "fs";
import { fetchAllDokument, type RiksdagenDokumentRaw } from "./riksdagen_docs_client";
import { mapDokumentToDecisionNodes } from "./riksdagen_docs_map";

const PROJECT_ROOT = resolve(__dirname, "../../..");

function parseArgs(): {
  run_id: string;
  doktyp: string[];
  from?: string;
  to?: string;
} {
  const args = process.argv.slice(2);
  const map: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    map[key] = args[i + 1];
  }

  if (!map.run_id) {
    console.error("Usage: --run_id <id> --doktyp prop,bet [--from YYYY-MM-DD] [--to YYYY-MM-DD]");
    process.exit(1);
  }

  return {
    run_id: map.run_id,
    doktyp: (map.doktyp ?? "prop,bet").split(","),
    from: map.from,
    to: map.to,
  };
}

// Energy search terms (multiple queries, deduplicate)
const ENERGY_SEARCH_QUERIES = [
  "energi kärnkraft",
  "elnät elmarknad elpris",
  "vindkraft solenergi",
  "stamnät effektreserv elberedskap",
  "elcertifikat utsläppshandel",
  "vätgas fossilfri energiomställning",
];

async function main() {
  const opts = parseArgs();
  const rawDir = resolve(PROJECT_ROOT, "data", "raw", "decisions", opts.run_id);
  const canonDir = resolve(PROJECT_ROOT, "data", "canonical", "decisions", opts.run_id);
  const manifestDir = resolve(PROJECT_ROOT, "manifests", "decisions");

  mkdirSync(rawDir, { recursive: true });
  mkdirSync(canonDir, { recursive: true });
  mkdirSync(manifestDir, { recursive: true });

  console.log(`\n=== Riksdagen Docs Ingest: ${opts.run_id} ===`);
  console.log(`Types: ${opts.doktyp.join(", ")}`);
  console.log(`Period: ${opts.from ?? "any"} → ${opts.to ?? "any"}`);

  // Fetch docs for each type × search query
  const allRaw: RiksdagenDokumentRaw[] = [];
  const seenDokIds = new Set<string>();

  for (const doktyp of opts.doktyp) {
    for (const sok of ENERGY_SEARCH_QUERIES) {
      console.log(`\n--- Fetching ${doktyp} with sok="${sok}" ---`);
      try {
        const docs = await fetchAllDokument({
          doktyp,
          sok,
          from: opts.from,
          tom: opts.to,
          sz: 50,
        }, 20);

        let newCount = 0;
        for (const doc of docs) {
          if (!seenDokIds.has(doc.dok_id)) {
            seenDokIds.add(doc.dok_id);
            allRaw.push(doc);
            newCount++;
          }
        }
        console.log(`  → ${docs.length} fetched, ${newCount} new (${seenDokIds.size} total unique)`);
      } catch (e: any) {
        console.error(`  ERROR: ${e.message}`);
      }

      // Extra delay between search queries
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n=== Total unique docs: ${allRaw.length} ===`);

  // Save raw
  writeFileSync(
    resolve(rawDir, "docs_raw.json"),
    JSON.stringify(allRaw, null, 2),
    "utf-8"
  );
  console.log(`Raw saved: data/raw/decisions/${opts.run_id}/docs_raw.json`);

  // Map to DecisionNodes (energy-filtered)
  const canonicalManifestId = `${opts.run_id}_canonical`;
  const nodes = mapDokumentToDecisionNodes(allRaw, canonicalManifestId, true);

  console.log(`\n=== Energy-tagged nodes: ${nodes.length} (from ${allRaw.length} raw) ===`);

  // Save canonical
  writeFileSync(
    resolve(canonDir, "decision_nodes.json"),
    JSON.stringify(nodes, null, 2),
    "utf-8"
  );
  console.log(`Canonical saved: data/canonical/decisions/${opts.run_id}/decision_nodes.json`);

  // Manifest raw
  try {
    execSync(
      `python scripts/hash_tree.py --input_dir "${rawDir}" --out_dir "${manifestDir}" --run_id ${opts.run_id}_raw`,
      { cwd: PROJECT_ROOT, stdio: "inherit" }
    );
  } catch (e) {
    console.error("Warning: hash_tree.py failed for raw manifest");
  }

  // Manifest canonical
  try {
    execSync(
      `python scripts/hash_tree.py --input_dir "${canonDir}" --out_dir "${manifestDir}" --run_id ${canonicalManifestId}`,
      { cwd: PROJECT_ROOT, stdio: "inherit" }
    );
  } catch (e) {
    console.error("Warning: hash_tree.py failed for canonical manifest");
  }

  // Summary
  const typeCounts: Record<string, number> = {};
  for (const n of nodes) {
    typeCounts[n.node_type] = (typeCounts[n.node_type] ?? 0) + 1;
  }
  console.log(`\n=== Summary ===`);
  console.log(`Total nodes: ${nodes.length}`);
  for (const [type, count] of Object.entries(typeCounts)) {
    console.log(`  ${type}: ${count}`);
  }

  const weakCount = nodes.filter(n =>
    n.topic_matches.length === 1 && n.topic_matches[0].rule_id === "search_term_match"
  ).length;
  if (weakCount > 0) {
    console.log(`  ⚠️  ${weakCount} nodes are ENERGY.WEAK (search-only match)`);
  }

  console.log(`\nDone.`);
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
