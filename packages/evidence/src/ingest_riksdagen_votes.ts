/**
 * Ingest: Riksdagen Voteringar → VoteNodes (scoped to energy betänkanden)
 *
 * Usage:
 *   npx tsx packages/evidence/src/ingest_riksdagen_votes.ts \
 *     --run_id decisions_votes_v1 \
 *     --docs_run decisions_docs_v1
 *
 * Reads bet-noder from docs_run canonical, fetches voteringar for each,
 * produces aggregated vote nodes.
 *
 * CODEFACTORY scope. Deterministic.
 */

import { resolve } from "path";
import { mkdirSync, writeFileSync, readFileSync, existsSync, execSync } from "fs";
import {
  fetchVoteringar,
  aggregateVotes,
  type RiksdagenVoteringRaw,
  type VoteAggregation,
} from "./riksdagen_votes_client";
import type { DecisionNode } from "./riksdagen_docs_map";

const PROJECT_ROOT = resolve(__dirname, "../../..");

function parseArgs(): { run_id: string; docs_run: string } {
  const args = process.argv.slice(2);
  const map: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    map[key] = args[i + 1];
  }
  if (!map.run_id || !map.docs_run) {
    console.error("Usage: --run_id <id> --docs_run <docs_run_id>");
    process.exit(1);
  }
  return { run_id: map.run_id, docs_run: map.docs_run };
}

interface VoteNode {
  node_id: string;
  node_type: "vote";
  title: string;
  published_at_utc: string;
  riksmote: string;
  votering_id: string;
  beteckning: string;
  punkt: string;
  bet_dok_id: string;
  avser: string;
  result: VoteAggregation["parties"];
  total: VoteAggregation["total"];
  evidence_ref: {
    manifest_id: string;
    root_hash: string;
    files_sha256_path: string;
  };
}

async function main() {
  const opts = parseArgs();
  const rawDir = resolve(PROJECT_ROOT, "data", "raw", "decisions", opts.run_id);
  const canonDir = resolve(PROJECT_ROOT, "data", "canonical", "decisions", opts.run_id);
  const manifestDir = resolve(PROJECT_ROOT, "manifests", "decisions");

  mkdirSync(rawDir, { recursive: true });
  mkdirSync(canonDir, { recursive: true });
  mkdirSync(manifestDir, { recursive: true });

  // Load bet-noder from docs canonical
  const docsPath = resolve(PROJECT_ROOT, "data", "canonical", "decisions", opts.docs_run, "decision_nodes.json");
  if (!existsSync(docsPath)) {
    console.error(`Docs canonical not found: ${docsPath}`);
    process.exit(1);
  }
  const allNodes: DecisionNode[] = JSON.parse(readFileSync(docsPath, "utf-8"));
  const betNodes = allNodes.filter(n => n.node_type === "bet");

  console.log(`\n=== Riksdagen Votes Ingest: ${opts.run_id} ===`);
  console.log(`Bet nodes from ${opts.docs_run}: ${betNodes.length}`);

  // Group bets by riksmöte + beteckning
  const betLookups: { rm: string; bet: string; dok_id: string }[] = [];
  for (const n of betNodes) {
    betLookups.push({ rm: n.riksmote, bet: n.number, dok_id: n.dok_id });
  }

  // Deduplicate by rm+bet
  const seen = new Set<string>();
  const uniqueBets = betLookups.filter(b => {
    const key = `${b.rm}|${b.bet}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Unique bet lookups: ${uniqueBets.length}`);

  // Fetch voteringar per bet
  const allRawVotes: RiksdagenVoteringRaw[] = [];
  let fetchedCount = 0;
  let errorCount = 0;

  for (const { rm, bet, dok_id } of uniqueBets) {
    try {
      const votes = await fetchVoteringar({ rm, bet, sz: 500 });
      if (votes.length > 0) {
        allRawVotes.push(...votes);
        fetchedCount++;
        console.log(`  ${rm} ${bet}: ${votes.length} individual votes`);
      } else {
        console.log(`  ${rm} ${bet}: no votes found`);
      }
    } catch (e: any) {
      console.error(`  ${rm} ${bet}: ERROR ${e.message}`);
      errorCount++;
    }
    // Rate limit
    await new Promise(r => setTimeout(r, 600));
  }

  console.log(`\nFetched votes for ${fetchedCount}/${uniqueBets.length} betänkanden (${errorCount} errors)`);
  console.log(`Total individual vote records: ${allRawVotes.length}`);

  // Save raw
  writeFileSync(resolve(rawDir, "votes_raw.json"), JSON.stringify(allRawVotes, null, 2), "utf-8");

  // Aggregate
  const aggregations = aggregateVotes(allRawVotes);
  console.log(`Aggregated vote points: ${aggregations.length}`);

  // Map to VoteNodes
  const manifestId = `${opts.run_id}_canonical`;
  const voteNodes: VoteNode[] = aggregations.map(agg => ({
    node_id: `se-riksdagen:vote:${agg.votering_id}:${agg.punkt}`,
    node_type: "vote" as const,
    title: `Votering: ${agg.beteckning} punkt ${agg.punkt} (${agg.avser})`,
    published_at_utc: "unknown", // voteringar har inget eget datum i listan
    riksmote: agg.rm,
    votering_id: agg.votering_id,
    beteckning: agg.beteckning,
    punkt: agg.punkt,
    bet_dok_id: agg.dok_id,
    avser: agg.avser,
    result: agg.parties,
    total: agg.total,
    evidence_ref: {
      manifest_id: manifestId,
      root_hash: "pending",
      files_sha256_path: "pending",
    },
  }));

  // Save canonical
  writeFileSync(resolve(canonDir, "vote_nodes.json"), JSON.stringify(voteNodes, null, 2), "utf-8");
  console.log(`\nVote nodes saved: ${voteNodes.length}`);

  // Manifest
  try {
    execSync(
      `python scripts\\hash_tree.py --input_dir "${rawDir}" --out_dir "${manifestDir}" --run_id ${opts.run_id}_raw`,
      { cwd: PROJECT_ROOT, stdio: "inherit" }
    );
  } catch (e) { console.error("Warning: manifest failed for raw"); }

  try {
    execSync(
      `python scripts\\hash_tree.py --input_dir "${canonDir}" --out_dir "${manifestDir}" --run_id ${manifestId}`,
      { cwd: PROJECT_ROOT, stdio: "inherit" }
    );
  } catch (e) { console.error("Warning: manifest failed for canonical"); }

  // Summary
  console.log(`\n=== Summary ===`);
  console.log(`Vote nodes: ${voteNodes.length}`);
  console.log(`Unique votering_id: ${new Set(voteNodes.map(v => v.votering_id)).size}`);
  console.log(`Betänkanden with votes: ${fetchedCount}`);
  if (errorCount > 0) console.log(`⚠️  Errors: ${errorCount}`);
  console.log("Done.");
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
