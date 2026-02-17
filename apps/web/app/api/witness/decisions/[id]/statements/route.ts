/**
 * GET /api/witness/decisions/:id/statements
 *
 * Returns statements linked to a specific decision node.
 * Uses pre-built link index from canonical linking data.
 *
 * CODEFACTORY scope.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve } from "path";

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps/web") || cwd.endsWith("apps\\web")) {
    return resolve(cwd, "../..");
  }
  return cwd;
}

const PROJECT_ROOT = getProjectRoot();

interface Link {
  link_id: string;
  statement_id: string;
  decision_node_id: string;
  matched_by: { rule_id: string; rule_type: string; matched_text?: string };
  confidence_mode: string;
}

interface StatementDTO {
  statement_id: string;
  speaker_name: string;
  speaker_role_at_time: string;
  source_type: string;
  title: string;
  published_at_utc: string;
  original_url: string;
  excerpt: string;
  evidence_ref?: { manifest_id: string; root_hash: string };
}

// Cached data
let _indexByDecision: Record<string, Link[]> | null = null;
let _statementsMap: Map<string, StatementDTO> | null = null;

function loadIndex(): Record<string, Link[]> {
  if (_indexByDecision) return _indexByDecision;
  const p = resolve(PROJECT_ROOT, "data/canonical/linking/link_v1/index_by_decision.json");
  if (!existsSync(p)) return {};
  _indexByDecision = JSON.parse(readFileSync(p, "utf-8"));
  return _indexByDecision!;
}

function loadStatementsMap(): Map<string, StatementDTO> {
  if (_statementsMap) return _statementsMap;
  _statementsMap = new Map();
  const sources = ["riksdagen", "gov"];
  for (const src of sources) {
    const base = resolve(PROJECT_ROOT, "data/canonical/statements", src);
    if (!existsSync(base)) continue;
    for (const dir of readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory())) {
      const file = resolve(base, dir.name, "statements.json");
      if (!existsSync(file)) continue;
      const stmts: StatementDTO[] = JSON.parse(readFileSync(file, "utf-8"));
      for (const s of stmts) _statementsMap!.set(s.statement_id, s);
    }
  }
  return _statementsMap;
}

function loadLinkEvidence(): { manifest_id: string; root_hash: string } {
  const p = resolve(PROJECT_ROOT, "manifests/linking/link_v1_canonical.root_hash.txt");
  const root = existsSync(p) ? readFileSync(p, "utf-8").trim() : "pending";
  return { manifest_id: "link_v1_canonical", root_hash: root };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const decisionId = decodeURIComponent(id);
  const index = loadIndex();
  const links = index[decisionId] ?? [];
  const stmtMap = loadStatementsMap();

  const items = links
    .map(link => {
      const stmt = stmtMap.get(link.statement_id);
      if (!stmt) return null;
      return {
        ...stmt,
        link: {
          link_id: link.link_id,
          matched_by: link.matched_by,
          confidence_mode: link.confidence_mode,
        },
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.published_at_utc.localeCompare(a.published_at_utc));

  return NextResponse.json({
    decision_node_id: decisionId,
    items,
    total: items.length,
    evidence: loadLinkEvidence(),
  });
}
