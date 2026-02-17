/**
 * Statements canonical data reader.
 * Reads from data/canonical/statements/riksdagen/<run_id>/statements.json
 * Deterministic filtering + pagination.
 *
 * CODEFACTORY scope.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import type { StatementEventDTO, ObservedSpeakerDTO } from "@/lib/types/statements";
import type { EvidenceMetadata } from "@/lib/types/spot";

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\web") || cwd.endsWith("apps/web")) {
    return resolve(cwd, "../..");
  }
  return cwd;
}

const PROJECT_ROOT = getProjectRoot();

/** Source directories to scan for statements */
const STATEMENT_SOURCES = ["riksdagen", "gov", "media", "x"];

/** Find all run_ids that have statements across all sources */
function findStatementRuns(): { source: string; runId: string }[] {
  const results: { source: string; runId: string }[] = [];
  for (const source of STATEMENT_SOURCES) {
    const base = resolve(PROJECT_ROOT, "data", "canonical", "statements", source);
    if (!existsSync(base)) continue;
    const dirs = readdirSync(base, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort()
      .reverse();
    for (const runId of dirs) {
      results.push({ source, runId });
    }
  }
  return results;
}

/** Load all statements across all sources and runs (merging) */
export function loadAllStatements(): StatementEventDTO[] {
  const runs = findStatementRuns();
  const all: StatementEventDTO[] = [];

  for (const { source, runId } of runs) {
    const path = resolve(PROJECT_ROOT, "data", "canonical", "statements", source, runId, "statements.json");
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

/** Manifest path map: source → manifest subdirectory */
const MANIFEST_DIRS: Record<string, string> = {
  riksdagen: "riksdagen",
  gov: "statements/gov",
  media: "statements/media",
  x: "statements/x",
};

/** Load evidence metadata for statements (multi-source) */
export function loadStatementsEvidence(): EvidenceMetadata {
  const runs = findStatementRuns();
  if (runs.length === 0) {
    return { manifest_id: "none", root_hash: "none", files_sha256_path: "none" };
  }

  // Collect all root hashes from all sources
  const hashes: string[] = [];
  const manifestIds: string[] = [];

  for (const { source, runId } of runs) {
    const subdir = MANIFEST_DIRS[source] ?? `statements/${source}`;
    const manifestDir = resolve(PROJECT_ROOT, "manifests", subdir);
    const rootHashPath = join(manifestDir, `${runId}_canonical.root_hash.txt`);
    if (existsSync(rootHashPath)) {
      hashes.push(readFileSync(rootHashPath, "utf-8").trim());
      manifestIds.push(`${runId}_canonical`);
    }
  }

  if (hashes.length === 0) {
    return { manifest_id: "none", root_hash: "pending", files_sha256_path: "none" };
  }

  // Use first (latest) as primary, but show count
  return {
    manifest_id: manifestIds.length === 1 ? manifestIds[0] : `${manifestIds.length} manifests`,
    root_hash: hashes[0],
    files_sha256_path: "multi-source",
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

/** Aggregate observed speakers from filtered statements + match against registry */
export function aggregateObservedSpeakers(
  statements: StatementEventDTO[]
): ObservedSpeakerDTO[] {
  const registry = loadSpeakersRegistry();

  // Build registry lookup maps
  const registryById = new Map<string, { display_name: string }>();
  const registryByAlias = new Map<string, string>(); // normalized alias → speaker_id

  for (const s of registry.speakers) {
    registryById.set(s.speaker_id, { display_name: s.display_name });
    if (s.aliases) {
      for (const alias of s.aliases) {
        const norm = alias.trim().replace(/\s+/g, " ").toLowerCase();
        // Only set if no collision
        if (registryByAlias.has(norm)) {
          registryByAlias.set(norm, "__ambiguous__");
        } else {
          registryByAlias.set(norm, s.speaker_id);
        }
      }
    }
  }

  // Group statements by speaker_id
  const groups = new Map<string, {
    names: Map<string, number>;
    parties: Map<string, number>;
    count: number;
  }>();

  for (const stmt of statements) {
    let group = groups.get(stmt.speaker_id);
    if (!group) {
      group = { names: new Map(), parties: new Map(), count: 0 };
      groups.set(stmt.speaker_id, group);
    }
    group.count++;
    group.names.set(stmt.speaker_name, (group.names.get(stmt.speaker_name) ?? 0) + 1);

    // Extract party from speaker_role_at_time e.g. "Energi- och näringsminister (KD)" or speaker_name "Anders Ygeman (S)"
    const partyMatch = (stmt.speaker_role_at_time ?? stmt.speaker_name).match(/\(([A-ZÖÅÄa-zöåä]+)\)/);
    if (partyMatch) {
      const party = partyMatch[1].toUpperCase();
      group.parties.set(party, (group.parties.get(party) ?? 0) + 1);
    }
  }

  // Build observed list
  const observed: ObservedSpeakerDTO[] = [];

  for (const [speakerId, group] of groups) {
    // Most frequent name
    let bestName = "";
    let bestNameCount = 0;
    for (const [name, count] of group.names) {
      if (count > bestNameCount) {
        bestName = name;
        bestNameCount = count;
      }
    }

    // Registry display_name overrides
    const regEntry = registryById.get(speakerId);
    const displayName = regEntry?.display_name ?? bestName;

    // Most frequent party
    let bestParty: string | null = null;
    let bestPartyCount = 0;
    for (const [party, count] of group.parties) {
      if (count > bestPartyCount) {
        bestParty = party;
        bestPartyCount = count;
      }
    }

    // Verified check
    let verified = false;
    let matchedOn: "speaker_id" | "alias" | "none" = "none";

    if (registryById.has(speakerId)) {
      verified = true;
      matchedOn = "speaker_id";
    } else {
      // Try alias match
      const normName = bestName.trim().replace(/\s+/g, " ").toLowerCase();
      const aliasMatch = registryByAlias.get(normName);
      if (aliasMatch && aliasMatch !== "__ambiguous__") {
        verified = true;
        matchedOn = "alias";
      }
    }

    observed.push({
      speaker_id: speakerId,
      display_name: displayName,
      party: bestParty,
      count: group.count,
      verified,
      registry_match: {
        speaker_registry_version: "speakers_v1",
        matched_on: matchedOn,
      },
    });
  }

  // Sort: display_name asc (sv-SE), tie-break speaker_id asc
  observed.sort((a, b) => {
    const nameCompare = a.display_name.localeCompare(b.display_name, "sv-SE");
    if (nameCompare !== 0) return nameCompare;
    return a.speaker_id.localeCompare(b.speaker_id);
  });

  return observed;
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
