/**
 * GET /api/witness/pulse
 *
 * Returns energy policy "pulse" — activity metrics from canonical data.
 * No interpretation. Just counts and averages.
 *
 * CODEFACTORY scope.
 */

import { NextResponse } from "next/server";
import { loadDecisionGraph, loadGraphEvidence } from "@/lib/decisions/readDecisionGraph";
import { loadAllStatements, loadStatementsEvidence } from "@/lib/statements/readCanonical";

export async function GET() {
  const now = new Date();
  const d90ago = new Date(now); d90ago.setDate(d90ago.getDate() - 90);
  const d30ago = new Date(now); d30ago.setDate(d30ago.getDate() - 30);
  const d90str = d90ago.toISOString();
  const d30str = d30ago.toISOString();

  // --- Decisions ---
  const graph = loadDecisionGraph();
  const docNodes = graph.nodes.filter(n => n.node_type === "prop" || n.node_type === "bet");
  const voteNodes = graph.nodes.filter(n => n.node_type === "vote");

  // Recent decisions (last 90d) — based on published_at_utc
  const recentDocs = docNodes.filter(n => n.published_at_utc >= d90str);
  // Vote nodes don't have reliable dates, count bet→vote edges for recent bets instead
  const recentBetIds = new Set(recentDocs.filter(n => n.node_type === "bet").map(n => n.node_id));
  const recentVoteEdges = graph.edges.filter(e =>
    e.edge_type === "leads_to" && recentBetIds.has(e.from_node_id)
  );

  const decisionsLast90 = recentDocs.length + recentVoteEdges.length;

  // Baseline: total nodes / (span in 90d periods)
  const allDates = docNodes.map(n => new Date(n.published_at_utc).getTime()).filter(t => !isNaN(t));
  let baseline90d = 30; // default
  if (allDates.length > 1) {
    const spanDays = (Math.max(...allDates) - Math.min(...allDates)) / (1000 * 60 * 60 * 24);
    const periods = Math.max(1, spanDays / 90);
    baseline90d = Math.round(graph.nodes.length / periods);
  }

  // Recent type counts
  const recentProp = recentDocs.filter(n => n.node_type === "prop").length;
  const recentBet = recentDocs.filter(n => n.node_type === "bet").length;

  // --- Statements ---
  let statementsLast30 = 0;
  let statementsBaseline30 = 10; // default
  let perWeekAvg = 0;

  try {
    const statements = loadAllStatements();
    const recentStatements = statements.filter(s => s.delivered_at_utc >= d30str);
    statementsLast30 = recentStatements.length;

    // Baseline
    const stmtDates = statements.map(s => new Date(s.delivered_at_utc).getTime()).filter(t => !isNaN(t));
    if (stmtDates.length > 1) {
      const spanDays = (Math.max(...stmtDates) - Math.min(...stmtDates)) / (1000 * 60 * 60 * 24);
      const periods30 = Math.max(1, spanDays / 30);
      statementsBaseline30 = Math.round(statements.length / periods30);
    }

    // Per week avg (last 30d)
    perWeekAvg = statementsLast30 / (30 / 7);
  } catch { /* statements may not exist */ }

  // --- Spot (placeholder — requires multi-day data) ---
  // For v1 we return null if we don't have 7d data
  // TODO: when multi-day spot ingest exists, compute from canonical
  const spot = {
    se3_avg_7d: null as number | null,
    se_spread_avg_7d: null as number | null,
    se3_range_7d: null as { min: number; max: number } | null,
  };

  // --- Evidence ---
  const graphEvidence = loadGraphEvidence();

  return NextResponse.json({
    decisions: {
      last_90d: decisionsLast90,
      baseline_90d: baseline90d,
      recent_types: {
        prop: recentProp,
        bet: recentBet,
        vote: recentVoteEdges.length,
      },
    },
    statements: {
      last_30d: statementsLast30,
      baseline_30d: statementsBaseline30,
      per_week_avg: perWeekAvg,
    },
    spot,
    evidence: {
      manifest_id: graphEvidence.manifest_id,
      root_hash: graphEvidence.root_hash,
    },
  });
}
