/**
 * Build deterministic links: Statements ↔ Decisions
 *
 * Usage:
 *   npx tsx packages/evidence/src/build_links_statements_decisions.ts \
 *     --run_id link_v1 \
 *     --decision_graph decision_graph_v1
 *
 * Rules from: data/canonical/linking/link_rules_v1.json
 * Input: raw statements (for rel_dok_id) + canonical statements + decision graph
 * Output: links.json + index_by_decision.json + index_by_statement.json
 *
 * CODEFACTORY scope. No fuzzy, no LLM.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";
import { execSync } from "child_process";

// --- Args ---
const args = process.argv.slice(2);
function getArg(name: string, fallback?: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required arg: --${name}`);
}

const runId = getArg("run_id", "link_v1");
const graphRunId = getArg("decision_graph", "decision_graph_v1");

const PROJECT_ROOT = resolve(__dirname, "../../..");
const GRAPH_PATH = resolve(PROJECT_ROOT, "data/canonical/decisions", graphRunId, "decision_graph.json");
const RULES_PATH = resolve(PROJECT_ROOT, "data/canonical/linking/link_rules_v1.json");
const OUTPUT_DIR = resolve(PROJECT_ROOT, "data/canonical/linking", runId);
const MANIFEST_DIR = resolve(PROJECT_ROOT, "manifests/linking");

// --- Load data ---
console.log(`=== Build Statement↔Decision Links: ${runId} ===`);

// Decision graph
const graph = JSON.parse(readFileSync(GRAPH_PATH, "utf-8"));
const nodeMap = new Map<string, any>();
const dokIdMap = new Map<string, string>(); // dok_id → node_id
const betMap = new Map<string, string>();   // "NU20" → node_id (for bet nodes)

for (const node of graph.nodes) {
  nodeMap.set(node.node_id, node);
  if (node.dok_id) {
    dokIdMap.set(node.dok_id, node.node_id);
  }
  if (node.node_type === "bet" && node.number) {
    // Store both with and without riksmöte prefix
    betMap.set(node.number, node.node_id);
    if (node.riksmote) {
      betMap.set(`${node.riksmote}:${node.number}`, node.node_id);
    }
  }
}
console.log(`Graph: ${graph.nodes.length} nodes, ${dokIdMap.size} dok_id entries, ${betMap.size} bet entries`);

// Rules
const rulesConfig = JSON.parse(readFileSync(RULES_PATH, "utf-8"));
const rules = rulesConfig.rules.sort((a: any, b: any) => a.precedence - b.precedence);

// Statements: load raw (for rel_dok_id) + canonical (for statement_id + text)
function findRawStatements(): any[] {
  const rawBase = resolve(PROJECT_ROOT, "data/raw/riksdagen");
  if (!existsSync(rawBase)) return [];
  const all: any[] = [];
  for (const dir of readdirSync(rawBase, { withFileTypes: true }).filter(d => d.isDirectory())) {
    const file = resolve(rawBase, dir.name, "anforanden_raw.json");
    if (existsSync(file)) {
      all.push(...JSON.parse(readFileSync(file, "utf-8")));
    }
  }
  return all;
}

function findCanonicalStatements(): any[] {
  const sources = ["riksdagen", "gov"];
  const all: any[] = [];
  for (const src of sources) {
    const base = resolve(PROJECT_ROOT, "data/canonical/statements", src);
    if (!existsSync(base)) continue;
    for (const dir of readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory())) {
      const file = resolve(base, dir.name, "statements.json");
      if (existsSync(file)) {
        all.push(...JSON.parse(readFileSync(file, "utf-8")));
      }
    }
  }
  return all;
}

const rawStatements = findRawStatements();
const canonStatements = findCanonicalStatements();
console.log(`Statements: ${canonStatements.length} canonical, ${rawStatements.length} raw`);

// Build raw lookup: (dok_id + anforande_nummer) → raw record
const rawLookup = new Map<string, any>();
for (const r of rawStatements) {
  const key = `${r.dok_id}__${r.anforande_nummer}`;
  rawLookup.set(key, r);
}

// Map canonical statement_id → raw record via evidence_ref.record_ids
const stmtToRaw = new Map<string, any>();
for (const stmt of canonStatements) {
  if (stmt.evidence_ref?.record_ids?.length >= 2) {
    const key = `${stmt.evidence_ref.record_ids[0]}__${stmt.evidence_ref.record_ids[1]}`;
    const raw = rawLookup.get(key);
    if (raw) stmtToRaw.set(stmt.statement_id, raw);
  }
}
console.log(`Mapped ${stmtToRaw.size}/${canonStatements.length} statements to raw records`);

// --- Link Rules Engine ---
interface Link {
  link_id: string;
  statement_id: string;
  decision_node_id: string;
  matched_by: {
    rule_id: string;
    rule_type: string;
    matched_text?: string;
  };
  confidence_mode: "deterministic";
}

function stableHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function makeLink(stmtId: string, nodeId: string, ruleId: string, ruleType: string, matchedText?: string): Link {
  return {
    link_id: stableHash(`${stmtId}|${nodeId}|${ruleId}`),
    statement_id: stmtId,
    decision_node_id: nodeId,
    matched_by: {
      rule_id: ruleId,
      rule_type: ruleType,
      ...(matchedText ? { matched_text: matchedText.slice(0, 80) } : {}),
    },
    confidence_mode: "deterministic",
  };
}

// Collect all links
const allLinks: Link[] = [];
const pairSeen = new Set<string>(); // "stmt|node" dedup

for (const stmt of canonStatements) {
  const raw = stmtToRaw.get(stmt.statement_id);
  const stmtId = stmt.statement_id;

  // R1: explicit_id_reference (from raw metadata)
  if (raw?.rel_dok_id) {
    const nodeId = dokIdMap.get(raw.rel_dok_id);
    if (nodeId) {
      const pairKey = `${stmtId}|${nodeId}`;
      if (!pairSeen.has(pairKey)) {
        pairSeen.add(pairKey);
        allLinks.push(makeLink(stmtId, nodeId, "explicit_id_reference", "metadata", raw.rel_dok_id));
      }
    }
  }

  // For text-based rules, need statement text
  // Canonical statements have 'excerpt' but it's often empty/short
  // Use raw anforandetext if available, fall back to title
  const text = raw?.anforandetext || stmt.excerpt || stmt.title || "";
  if (!text) continue;

  // R2: dok_id_match
  const dokIdPatterns = [/\b(H[A-Z]\d{5})\b/g, /\b(\d{4}\/\d{2}:\d+)\b/g];
  let dokMatches = 0;
  for (const pat of dokIdPatterns) {
    for (const match of text.matchAll(pat)) {
      if (dokMatches >= 5) break;
      const candidate = match[1];
      const nodeId = dokIdMap.get(candidate);
      if (nodeId) {
        const pairKey = `${stmtId}|${nodeId}`;
        if (!pairSeen.has(pairKey)) {
          pairSeen.add(pairKey);
          allLinks.push(makeLink(stmtId, nodeId, "dok_id_match", "pattern", candidate));
          dokMatches++;
        }
      }
    }
  }

  // R3: bet_id_match
  const betPat = /\b(NU|MJU|CU|FiU|TU|KrU|SfU|JuU|UbU|AU|SoU|UU|KU|FöU|SkU)(\d+)\b/g;
  let betMatches = 0;
  for (const match of text.matchAll(betPat)) {
    if (betMatches >= 5) break;
    const betRef = `${match[1]}${match[2]}`;
    const nodeId = betMap.get(betRef);
    if (nodeId) {
      const pairKey = `${stmtId}|${nodeId}`;
      if (!pairSeen.has(pairKey)) {
        pairSeen.add(pairKey);
        allLinks.push(makeLink(stmtId, nodeId, "bet_id_match", "pattern", betRef));
        betMatches++;
      }
    }
  }

  // R4: sfs_number_match (v1: no sfs_ref nodes, skip)

  // R5: keyword_topic_cooccur
  const kwRule = rules.find((r: any) => r.rule_id === "keyword_topic_cooccur");
  if (kwRule) {
    const stopwords = new Set(kwRule.stopwords);
    const textLower = text.toLowerCase();
    const textWords = new Set(
      textLower.split(/\s+/).filter((w: string) => w.length >= kwRule.min_word_length && !stopwords.has(w))
    );

    let kwLinks = 0;
    for (const node of graph.nodes) {
      if (kwLinks >= kwRule.max_links_per_statement) break;
      if (node.node_type === "vote") continue; // votes have no meaningful title
      const titleWords = (node.title || "").toLowerCase()
        .split(/\s+/)
        .filter((w: string) => w.length >= kwRule.min_word_length && !stopwords.has(w));

      const shared = titleWords.filter((w: string) => textWords.has(w));
      if (shared.length >= kwRule.min_shared_words) {
        const pairKey = `${stmtId}|${node.node_id}`;
        if (!pairSeen.has(pairKey)) {
          pairSeen.add(pairKey);
          allLinks.push(makeLink(stmtId, node.node_id, "keyword_topic_cooccur", "keyword", shared.join(", ")));
          kwLinks++;
        }
      }
    }
  }
}

console.log(`\nTotal links: ${allLinks.length}`);

// --- Stats ---
const byRule: Record<string, number> = {};
for (const l of allLinks) {
  byRule[l.matched_by.rule_id] = (byRule[l.matched_by.rule_id] || 0) + 1;
}
for (const [rule, count] of Object.entries(byRule).sort((a, b) => a[1] - b[1])) {
  console.log(`  ${rule}: ${count} links`);
}

// --- Build indexes ---
const indexByDecision: Record<string, Link[]> = {};
const indexByStatement: Record<string, Link[]> = {};
for (const link of allLinks) {
  (indexByDecision[link.decision_node_id] ??= []).push(link);
  (indexByStatement[link.statement_id] ??= []).push(link);
}

const decisionsWithLinks = Object.keys(indexByDecision).length;
const statementsWithLinks = Object.keys(indexByStatement).length;
console.log(`\nDecisions with links: ${decisionsWithLinks}/${graph.nodes.length}`);
console.log(`Statements with links: ${statementsWithLinks}/${canonStatements.length}`);

// --- Write output ---
mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(MANIFEST_DIR, { recursive: true });

writeFileSync(resolve(OUTPUT_DIR, "links.json"), JSON.stringify(allLinks, null, 2));
writeFileSync(resolve(OUTPUT_DIR, "index_by_decision.json"), JSON.stringify(indexByDecision, null, 2));
writeFileSync(resolve(OUTPUT_DIR, "index_by_statement.json"), JSON.stringify(indexByStatement, null, 2));

console.log(`\nSaved: ${OUTPUT_DIR}/links.json (${allLinks.length} links)`);
console.log(`Saved: ${OUTPUT_DIR}/index_by_decision.json (${decisionsWithLinks} entries)`);
console.log(`Saved: ${OUTPUT_DIR}/index_by_statement.json (${statementsWithLinks} entries)`);

// --- Manifest ---
try {
  execSync(
    `python scripts/hash_tree.py --input_dir "${OUTPUT_DIR}" --out_dir "${MANIFEST_DIR}" --run_id ${runId}_canonical`,
    { cwd: PROJECT_ROOT, stdio: "inherit" }
  );
} catch {
  console.warn("Warning: manifest failed");
}

console.log("\n=== Done ===");
