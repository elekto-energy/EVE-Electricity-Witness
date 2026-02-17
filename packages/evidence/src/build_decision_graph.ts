/**
 * Build Decision Graph: merge doc nodes + vote nodes + generate edges.
 *
 * Usage:
 *   npx tsx packages/evidence/src/build_decision_graph.ts \
 *     --run_id decision_graph_v1 \
 *     --docs_run decisions_docs_v1 \
 *     --votes_run decisions_votes_v1
 *
 * Produces:
 *   data/canonical/decisions/<run_id>/decision_graph.json
 *   manifests/decisions/<run_id>_canonical.*
 *
 * CODEFACTORY scope. Deterministic edge generation.
 */

import { resolve } from "path";
import { mkdirSync, writeFileSync, readFileSync, existsSync, execSync } from "fs";
import { createHash } from "crypto";

const PROJECT_ROOT = resolve(__dirname, "../../..");

function parseArgs(): { run_id: string; docs_run: string; votes_run: string } {
  const args = process.argv.slice(2);
  const map: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    map[key] = args[i + 1];
  }
  if (!map.run_id || !map.docs_run || !map.votes_run) {
    console.error("Usage: --run_id <id> --docs_run <id> --votes_run <id>");
    process.exit(1);
  }
  return { run_id: map.run_id, docs_run: map.docs_run, votes_run: map.votes_run };
}

interface Edge {
  edge_id: string;
  from_node_id: string;
  to_node_id: string;
  edge_type: "references" | "leads_to" | "implements";
  evidence: string; // how the edge was derived
}

function stableEdgeId(from: string, type: string, to: string): string {
  return createHash("sha256").update(`${from}|${type}|${to}`).digest("hex").slice(0, 16);
}

async function main() {
  const opts = parseArgs();
  const canonDir = resolve(PROJECT_ROOT, "data", "canonical", "decisions", opts.run_id);
  const manifestDir = resolve(PROJECT_ROOT, "manifests", "decisions");
  mkdirSync(canonDir, { recursive: true });
  mkdirSync(manifestDir, { recursive: true });

  // Load doc nodes
  const docsPath = resolve(PROJECT_ROOT, "data", "canonical", "decisions", opts.docs_run, "decision_nodes.json");
  const docNodes = JSON.parse(readFileSync(docsPath, "utf-8"));

  // Load vote nodes
  const votesPath = resolve(PROJECT_ROOT, "data", "canonical", "decisions", opts.votes_run, "vote_nodes.json");
  const voteNodes = JSON.parse(readFileSync(votesPath, "utf-8"));

  console.log(`\n=== Build Decision Graph: ${opts.run_id} ===`);
  console.log(`Doc nodes: ${docNodes.length} (${docNodes.filter((n: any) => n.node_type === "prop").length} prop, ${docNodes.filter((n: any) => n.node_type === "bet").length} bet)`);
  console.log(`Vote nodes: ${voteNodes.length}`);

  // Build lookup indexes
  const nodeById = new Map<string, any>();
  const betByDokId = new Map<string, any>();  // dok_id → bet node
  const betByRmBet = new Map<string, any>();  // "rm|beteckning" → bet node

  for (const n of docNodes) {
    nodeById.set(n.node_id, n);
    if (n.node_type === "bet") {
      betByDokId.set(n.dok_id, n);
      betByRmBet.set(`${n.riksmote}|${n.number}`, n);
    }
  }
  for (const n of voteNodes) {
    nodeById.set(n.node_id, n);
  }

  // Generate edges
  const edges: Edge[] = [];

  // 1. prop → bet (via relations.bet_dok_id parsed from statusrad)
  let propBetCount = 0;
  for (const prop of docNodes.filter((n: any) => n.node_type === "prop")) {
    if (prop.relations?.bet_dok_id) {
      const bet = betByDokId.get(prop.relations.bet_dok_id);
      if (bet) {
        edges.push({
          edge_id: stableEdgeId(prop.node_id, "references", bet.node_id),
          from_node_id: prop.node_id,
          to_node_id: bet.node_id,
          edge_type: "references",
          evidence: `prop.statusrad → bet_dok_id=${prop.relations.bet_dok_id}`,
        });
        propBetCount++;
      }
    }
  }
  console.log(`Edges prop→bet (statusrad): ${propBetCount}`);

  // 2. bet → vote (via dok_id match or rm+beteckning)
  let betVoteCount = 0;
  for (const vote of voteNodes) {
    // Try dok_id match first
    let bet = betByDokId.get(vote.bet_dok_id);
    // Fallback: rm + beteckning
    if (!bet) {
      bet = betByRmBet.get(`${vote.riksmote}|${vote.beteckning}`);
    }
    if (bet) {
      edges.push({
        edge_id: stableEdgeId(bet.node_id, "leads_to", vote.node_id),
        from_node_id: bet.node_id,
        to_node_id: vote.node_id,
        edge_type: "leads_to",
        evidence: `bet.dok_id=${bet.dok_id} → vote.bet_dok_id=${vote.bet_dok_id}`,
      });
      betVoteCount++;
    }
  }
  console.log(`Edges bet→vote: ${betVoteCount}`);

  // 3. prop → prop (same riksmöte budget chain — UO20 ↔ UO21 etc)
  // Lightweight: only connect prop nodes with same rm and related UO
  // Skip for v1 — these are implicit via bet

  // Deduplicate edges
  const seenEdges = new Set<string>();
  const dedupedEdges = edges.filter(e => {
    if (seenEdges.has(e.edge_id)) return false;
    seenEdges.add(e.edge_id);
    return true;
  });
  console.log(`Total edges (deduped): ${dedupedEdges.length}`);

  // Resolve evidence root_hashes from manifests
  const docsManifestPath = resolve(manifestDir, `${opts.docs_run}_canonical.root_hash.txt`);
  const votesManifestPath = resolve(manifestDir, `${opts.votes_run}_canonical.root_hash.txt`);
  const docsRootHash = existsSync(docsManifestPath) ? readFileSync(docsManifestPath, "utf-8").trim() : "pending";
  const votesRootHash = existsSync(votesManifestPath) ? readFileSync(votesManifestPath, "utf-8").trim() : "pending";

  // Patch evidence_ref on all nodes
  for (const n of docNodes) {
    if (n.evidence_ref) {
      n.evidence_ref.root_hash = docsRootHash;
      n.evidence_ref.files_sha256_path = `manifests/decisions/${opts.docs_run}_canonical.files_sha256.json`;
    }
  }
  for (const n of voteNodes) {
    if (n.evidence_ref) {
      n.evidence_ref.root_hash = votesRootHash;
      n.evidence_ref.files_sha256_path = `manifests/decisions/${opts.votes_run}_canonical.files_sha256.json`;
    }
  }

  // Build graph
  const graph = {
    _meta: {
      run_id: opts.run_id,
      docs_run: opts.docs_run,
      votes_run: opts.votes_run,
      built_at_utc: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
      topic_rules_version: "energy_v1",
    },
    nodes: [...docNodes, ...voteNodes],
    edges: dedupedEdges,
    stats: {
      total_nodes: docNodes.length + voteNodes.length,
      prop_nodes: docNodes.filter((n: any) => n.node_type === "prop").length,
      bet_nodes: docNodes.filter((n: any) => n.node_type === "bet").length,
      vote_nodes: voteNodes.length,
      total_edges: dedupedEdges.length,
      prop_bet_edges: propBetCount,
      bet_vote_edges: betVoteCount,
    },
  };

  // Save
  writeFileSync(resolve(canonDir, "decision_graph.json"), JSON.stringify(graph, null, 2), "utf-8");
  console.log(`\nGraph saved: data/canonical/decisions/${opts.run_id}/decision_graph.json`);

  // Manifest
  try {
    execSync(
      `python scripts\\hash_tree.py --input_dir "${canonDir}" --out_dir "${manifestDir}" --run_id ${opts.run_id}_canonical`,
      { cwd: PROJECT_ROOT, stdio: "inherit" }
    );
  } catch (e) { console.error("Warning: manifest failed"); }

  // Summary
  console.log(`\n=== Decision Graph Summary ===`);
  console.log(`Nodes: ${graph.stats.total_nodes} (${graph.stats.prop_nodes} prop + ${graph.stats.bet_nodes} bet + ${graph.stats.vote_nodes} vote)`);
  console.log(`Edges: ${graph.stats.total_edges} (${graph.stats.prop_bet_edges} prop→bet + ${graph.stats.bet_vote_edges} bet→vote)`);
  console.log("Done.");
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
