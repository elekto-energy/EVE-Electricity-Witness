/**
 * Statements canonical data reader.
 * Reads from data/canonical/statements/riksdagen/<run_id>/statements.json
 * Deterministic filtering + pagination.
 *
 * CODEFACTORY scope.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import type { StatementEventDTO } from "@/lib/types/statements";
import type { EvidenceMetadata } from "@/lib/types/spot";

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\web") || cwd.endsWith("apps/web")) {
    return resolve(cwd, "../..");
  }
  return cwd;
}

const PROJECT_ROOT = getProjectRoot();

/** Find all run_ids that have statements */
function findStatementRuns(): string[] {
  const base = resolve(PROJECT_ROOT, "data", "canonical", "statements", "riksdagen");
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()
    .reverse(); // newest first
}

/** Load all statements across all runs (merging) */
export function loadAllStatements(): StatementEventDTO[] {
  const runs = findStatementRuns();
  const all: StatementEventDTO[] = [];

  for (const runId of runs) {
    const path = resolve(PROJECT_ROOT, "data", "canonical", "statements", "riksdagen", runId, "statements.json");
    if (!existsSync(path)) continue;
    const items = JSON.parse(readFileSync(path, "utf-8")) as StatementEventDTO[];
    all.push(...items);
  }

  // Deduplicate by statement_id (latest run wins)
  const seen = new Set<string>();
  const deduped: StatementEventDTO[] = [];
  for (const item of all) {
    if (!seen.has(item.statement_id)) {
      seen.add(item.statement_id);
      deduped.push(item);
    }
  }

  // Sort by published_at_utc desc, then statement_id
  deduped.sort((a, b) => {
    const dateCompare = b.published_at_utc.localeCompare(a.published_at_utc);
    if (dateCompare !== 0) return dateCompare;
    return a.statement_id.localeCompare(b.statement_id);
  });

  return deduped;
}

/** Filter statements */
export function filterStatements(
  items: StatementEventDTO[],
  filters: {
    from?: string;
    to?: string;
    speaker?: string;
    q?: string;
    source?: string;
  }
): StatementEventDTO[] {
  let result = items;

  if (filters.from) {
    const fromDate = filters.from + "T00:00:00Z";
    result = result.filter(s => s.published_at_utc >= fromDate);
  }

  if (filters.to) {
    const toDate = filters.to + "T23:59:59Z";
    result = result.filter(s => s.published_at_utc <= toDate);
  }

  if (filters.speaker) {
    result = result.filter(s => s.speaker_id === filters.speaker);
  }

  if (filters.source) {
    result = result.filter(s => s.source_type === filters.source);
  }

  if (filters.q) {
    const q = filters.q.toLowerCase();
    result = result.filter(s =>
      s.excerpt.toLowerCase().includes(q) ||
      (s.title?.toLowerCase().includes(q) ?? false) ||
      s.speaker_name.toLowerCase().includes(q)
    );
  }

  return result;
}

/** Paginate with cursor (cursor = published_at_utc:statement_id) */
export function paginate(
  items: StatementEventDTO[],
  cursor?: string,
  pageSize: number = 20,
): { page: StatementEventDTO[]; next_cursor?: string } {
  let startIdx = 0;

  if (cursor) {
    const [cursorDate, cursorId] = cursor.split("|");
    startIdx = items.findIndex(s =>
      s.published_at_utc < cursorDate ||
      (s.published_at_utc === cursorDate && s.statement_id > cursorId)
    );
    if (startIdx === -1) startIdx = items.length;
  }

  const page = items.slice(startIdx, startIdx + pageSize);
  const hasMore = startIdx + pageSize < items.length;

  const next_cursor = hasMore && page.length > 0
    ? `${page[page.length - 1].published_at_utc}|${page[page.length - 1].statement_id}`
    : undefined;

  return { page, next_cursor };
}

/** Load evidence metadata for statements */
export function loadStatementsEvidence(): EvidenceMetadata {
  const runs = findStatementRuns();
  if (runs.length === 0) {
    return { manifest_id: "none", root_hash: "none", files_sha256_path: "none" };
  }

  const latestRun = runs[0];
  const manifestDir = resolve(PROJECT_ROOT, "manifests", "riksdagen");
  const rootHashPath = join(manifestDir, `${latestRun}_canonical.root_hash.txt`);

  const rootHash = existsSync(rootHashPath)
    ? readFileSync(rootHashPath, "utf-8").trim()
    : "pending";

  return {
    manifest_id: `${latestRun}_canonical`,
    root_hash: rootHash,
    files_sha256_path: join(manifestDir, `${latestRun}_canonical.files.sha256`),
  };
}

/** Load speakers registry */
export function loadSpeakersRegistry() {
  const path = resolve(PROJECT_ROOT, "data", "canonical", "registries", "speakers_v1.json");
  if (!existsSync(path)) return { speakers: [], evidence: { manifest_id: "none", root_hash: "none", files_sha256_path: "none" } as EvidenceMetadata };
  const data = JSON.parse(readFileSync(path, "utf-8"));

  const manifestDir = resolve(PROJECT_ROOT, "manifests", "registries");
  const rootHashPath = join(manifestDir, "registries_v1_canonical.root_hash.txt");
  const rootHash = existsSync(rootHashPath) ? readFileSync(rootHashPath, "utf-8").trim() : "pending";

  return {
    speakers: data.speakers ?? [],
    evidence: { manifest_id: "registries_v1_canonical", root_hash: rootHash, files_sha256_path: join(manifestDir, "registries_v1_canonical.files.sha256") } as EvidenceMetadata,
  };
}

/** Load sources registry */
export function loadSourcesRegistry() {
  const path = resolve(PROJECT_ROOT, "data", "canonical", "registries", "sources_v1.json");
  if (!existsSync(path)) return { sources: [], evidence: { manifest_id: "none", root_hash: "none", files_sha256_path: "none" } as EvidenceMetadata };
  const data = JSON.parse(readFileSync(path, "utf-8"));

  const manifestDir = resolve(PROJECT_ROOT, "manifests", "registries");
  const rootHashPath = join(manifestDir, "registries_v1_canonical.root_hash.txt");
  const rootHash = existsSync(rootHashPath) ? readFileSync(rootHashPath, "utf-8").trim() : "pending";

  return {
    sources: data.sources ?? [],
    evidence: { manifest_id: "registries_v1_canonical", root_hash: rootHash, files_sha256_path: join(manifestDir, "registries_v1_canonical.files.sha256") } as EvidenceMetadata,
  };
}
