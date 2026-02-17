/**
 * Decision Graph canonical reader.
 * Reads from data/canonical/decisions/<run_id>/decision_graph.json
 *
 * CODEFACTORY scope.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import type { EvidenceMetadata } from "@/lib/types/spot";

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\web") || cwd.endsWith("apps/web")) {
    return resolve(cwd, "../..");
  }
  return cwd;
}

const PROJECT_ROOT = getProjectRoot();

export interface DecisionNodeDTO {
  node_id: string;
  node_type: "prop" | "bet" | "vote" | "sfs_ref";
  title: string;
  published_at_utc: string;
  riksmote?: string;
  number?: string;
  responsible_organ?: string;
  dok_id?: string;
  votering_id?: string;
  beteckning?: string;
  punkt?: string;
  bet_dok_id?: string;
  source_url_html?: string;
  source_url_pdf?: string | null;
  excerpt?: string;
  topic_tags?: string[];
  topic_rules_version?: string;
  topic_matches?: any[];
  result?: any[];       // vote party results
  total?: any;          // vote totals
  evidence_ref?: {
    manifest_id: string;
    root_hash: string;
    files_sha256_path?: string;
  };
}

export interface DecisionEdgeDTO {
  edge_id: string;
  from_node_id: string;
  to_node_id: string;
  edge_type: "references" | "leads_to" | "implements";
  evidence: string;
}

interface DecisionGraph {
  _meta: any;
  nodes: DecisionNodeDTO[];
  edges: DecisionEdgeDTO[];
  stats: any;
}

let _cachedGraph: DecisionGraph | null = null;

/** Load the decision graph (cached in memory) */
export function loadDecisionGraph(): DecisionGraph {
  if (_cachedGraph) return _cachedGraph;

  // Find latest graph run
  const graphPath = resolve(PROJECT_ROOT, "data", "canonical", "decisions", "decision_graph_v1", "decision_graph.json");
  if (!existsSync(graphPath)) {
    return { _meta: {}, nodes: [], edges: [], stats: {} };
  }

  _cachedGraph = JSON.parse(readFileSync(graphPath, "utf-8"));
  return _cachedGraph!;
}

/** Load graph evidence metadata */
export function loadGraphEvidence(): EvidenceMetadata {
  const manifestDir = resolve(PROJECT_ROOT, "manifests", "decisions");
  const rootHashPath = join(manifestDir, "decision_graph_v1_canonical.root_hash.txt");
  const rootHash = existsSync(rootHashPath) ? readFileSync(rootHashPath, "utf-8").trim() : "pending";

  return {
    manifest_id: "decision_graph_v1_canonical",
    root_hash: rootHash,
    files_sha256_path: join(manifestDir, "decision_graph_v1_canonical.files_sha256.json"),
  };
}

/** Filter decision nodes */
export function filterDecisionNodes(
  nodes: DecisionNodeDTO[],
  filters: {
    nodeType?: string;
    from?: string;
    to?: string;
    q?: string;
    topic?: string;
  }
): DecisionNodeDTO[] {
  let result = nodes;

  if (filters.nodeType) {
    result = result.filter(n => n.node_type === filters.nodeType);
  }

  if (filters.from) {
    const fromDate = filters.from + "T00:00:00Z";
    result = result.filter(n => n.published_at_utc >= fromDate);
  }

  if (filters.to) {
    const toDate = filters.to + "T23:59:59Z";
    result = result.filter(n => n.published_at_utc <= toDate);
  }

  if (filters.q) {
    const q = filters.q.toLowerCase();
    result = result.filter(n =>
      n.title.toLowerCase().includes(q) ||
      (n.dok_id?.toLowerCase().includes(q) ?? false) ||
      (n.beteckning?.toLowerCase().includes(q) ?? false)
    );
  }

  if (filters.topic) {
    result = result.filter(n =>
      n.topic_tags?.some(t => t.startsWith(filters.topic!.toUpperCase())) ?? false
    );
  }

  return result;
}

/** Get a single node + its edges */
export function getDecisionNodeWithEdges(nodeId: string): {
  node: DecisionNodeDTO | null;
  edges_out: DecisionEdgeDTO[];
  edges_in: DecisionEdgeDTO[];
  neighbors: DecisionNodeDTO[];
} {
  const graph = loadDecisionGraph();
  const node = graph.nodes.find(n => n.node_id === nodeId) ?? null;

  if (!node) {
    return { node: null, edges_out: [], edges_in: [], neighbors: [] };
  }

  const edges_out = graph.edges.filter(e => e.from_node_id === nodeId);
  const edges_in = graph.edges.filter(e => e.to_node_id === nodeId);

  const neighborIds = new Set<string>();
  for (const e of edges_out) neighborIds.add(e.to_node_id);
  for (const e of edges_in) neighborIds.add(e.from_node_id);

  const neighbors = graph.nodes.filter(n => neighborIds.has(n.node_id));

  return { node, edges_out, edges_in, neighbors };
}

/** Paginate nodes */
export function paginateNodes(
  nodes: DecisionNodeDTO[],
  cursor?: string,
  pageSize: number = 20
): { page: DecisionNodeDTO[]; next_cursor?: string } {
  let startIdx = 0;

  if (cursor) {
    const [cursorDate, cursorId] = cursor.split("|");
    startIdx = nodes.findIndex(n =>
      n.published_at_utc < cursorDate ||
      (n.published_at_utc === cursorDate && n.node_id > cursorId)
    );
    if (startIdx === -1) startIdx = nodes.length;
  }

  const page = nodes.slice(startIdx, startIdx + pageSize);
  const hasMore = startIdx + pageSize < nodes.length;

  const next_cursor = hasMore && page.length > 0
    ? `${page[page.length - 1].published_at_utc}|${page[page.length - 1].node_id}`
    : undefined;

  return { page, next_cursor };
}
