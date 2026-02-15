/**
 * Riksdagen Anföranden → StatementEvent mapper.
 *
 * Deterministic mapping. No LLM. No interpretation (TR7).
 * Speaker matching uses SpeakerRegistry intressent_id → speaker_id.
 *
 * CODEFACTORY scope.
 */

import { createHash } from "crypto";
import type { RiksdagenAnforandeRaw } from "./riksdagen_anf_client";

/** StatementEvent as defined by schema */
export interface StatementEvent {
  statement_id: string;
  speaker_id: string;
  speaker_name: string;
  speaker_role_at_time: string | null;
  source_type: "primary_parliament";
  title: string | null;
  published_at_utc: string;
  original_url: string;
  excerpt: string;
  topic_tags: string[];
  language: string;
  evidence_ref: {
    manifest_id: string;
    root_hash: string;
    files_sha256_path: string;
    record_ids: string[];
  };
  compliance: {
    requires_recheck: boolean;
    status: "active";
  };
  extraction: {
    method: string;
    version: string;
    fetched_at_utc: string;
  };
}

/** Minimal SpeakerRegistry entry for matching */
interface SpeakerEntry {
  speaker_id: string;       // Format: se-riksdagen:<intressent_id>
  display_name: string;
  aliases: string[];
  primary_source: {
    intressent_id: string;  // Riksdagen numeric ID
  };
}

const EXCERPT_MAX_LEN = 2000;
const EXTRACTION_METHOD = "riksdagen_anforandelista_json";
const EXTRACTION_VERSION = "1.0.0";

/**
 * Strip HTML tags and decode entities for clean text excerpt.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generate deterministic statement_id from source fields.
 * Input: dok_id + anforande_nummer → SHA256 truncated.
 */
function makeStatementId(raw: RiksdagenAnforandeRaw): string {
  const input = `riksdagen:${raw.dok_id}:${raw.anforande_nummer}`;
  const hash = createHash("sha256").update(input, "utf-8").digest("hex");
  return `stmt_rd_${hash.slice(0, 16)}`;
}

/**
 * Match speaker via intressent_id from registry.
 * Falls back to name-based matching using aliases.
 */
function matchSpeaker(
  raw: RiksdagenAnforandeRaw,
  speakers: SpeakerEntry[]
): { speaker_id: string; display_name: string } {
  // 1. Try intressent_id match (A2 rule 1: direct mapping)
  if (raw.intressent_id) {
    // Match via primary_source.intressent_id
    const byId = speakers.find(
      s => s.primary_source.intressent_id === raw.intressent_id
    );
    if (byId) return { speaker_id: byId.speaker_id, display_name: byId.display_name };

    // Also try speaker_id pattern: se-riksdagen:<intressent_id>
    const expectedId = `se-riksdagen:${raw.intressent_id}`;
    const bySpkId = speakers.find(s => s.speaker_id === expectedId);
    if (bySpkId) return { speaker_id: bySpkId.speaker_id, display_name: bySpkId.display_name };
  }

  // 2. Try name match
  const name = raw.talare?.trim();
  if (name) {
    const byName = speakers.find(
      s => s.display_name === name || s.aliases.includes(name)
    );
    if (byName) return { speaker_id: byName.speaker_id, display_name: byName.display_name };
  }

  // 3. Fallback: use intressent_id if available, else mark unresolved (A2 rule 3)
  if (raw.intressent_id) {
    // Speaker not in registry but has intressent_id — use canonical format
    return {
      speaker_id: `se-riksdagen:${raw.intressent_id}`,
      display_name: raw.talare || "Unknown",
    };
  }

  // No intressent_id and no name match — truly unresolved
  return { speaker_id: "unresolved", display_name: raw.talare || "Unknown" };
}

/**
 * Build URL to the specific anförande on riksdagen.se.
 */
function buildAnforandeUrl(raw: RiksdagenAnforandeRaw): string {
  // Pattern: https://www.riksdagen.se/sv/dokument-och-lagar/dokument/protokoll/<dok_id>/
  // Anförande-specific link includes #anf_<nummer>
  if (raw.dok_id) {
    return `https://data.riksdagen.se/dokument/${raw.dok_id}`;
  }
  return "https://data.riksdagen.se/anforandelista/";
}

/**
 * Map a batch of raw anföranden to StatementEvents.
 * Deterministic: same input → same output.
 */
export function mapAnforandenToStatements(
  rawItems: RiksdagenAnforandeRaw[],
  speakers: SpeakerEntry[],
  evidenceRef: {
    manifest_id: string;
    root_hash: string;
    files_sha256_path: string;
  },
  fetchedAtUtc: string,
): StatementEvent[] {
  return rawItems.map(raw => {
    const { speaker_id, display_name } = matchSpeaker(raw, speakers);

    // Clean excerpt
    const fullText = stripHtml(raw.anforandetext || "");
    const excerpt = fullText.length > EXCERPT_MAX_LEN
      ? fullText.slice(0, EXCERPT_MAX_LEN) + "…"
      : fullText;

    const stmt: StatementEvent = {
      statement_id: makeStatementId(raw),
      speaker_id,
      speaker_name: display_name,
      speaker_role_at_time: raw.parti ? `${raw.parti}` : null,
      source_type: "primary_parliament",
      title: raw.avsnittsrubrik || null,
      published_at_utc: `${raw.dok_datum}T00:00:00Z`,
      original_url: buildAnforandeUrl(raw),
      excerpt,
      topic_tags: [], // Slice 1: no auto-tagging
      language: "sv",
      evidence_ref: {
        ...evidenceRef,
        record_ids: [raw.dok_id, raw.anforande_nummer].filter(Boolean),
      },
      compliance: {
        requires_recheck: false,
        status: "active",
      },
      extraction: {
        method: EXTRACTION_METHOD,
        version: EXTRACTION_VERSION,
        fetched_at_utc: fetchedAtUtc,
      },
    };

    return stmt;
  });
}
