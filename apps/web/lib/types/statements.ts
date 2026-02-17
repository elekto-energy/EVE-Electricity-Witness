import type { EvidenceMetadata } from "./spot";

/** StatementEvent DTO for API responses */
export interface StatementEventDTO {
  statement_id: string;
  speaker_id: string;
  speaker_name: string;
  speaker_role_at_time: string | null;
  source_type: string;
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
    status: string;
  };
}

/** Response: /api/witness/statements */
export interface StatementsResponse {
  items: StatementEventDTO[];
  page: { next_cursor?: string };
  evidence: EvidenceMetadata;
}

/** Observed speaker (aggregated from statements) */
export interface ObservedSpeakerDTO {
  speaker_id: string;
  display_name: string;
  party: string | null;
  count: number;
  verified: boolean;
  registry_match: {
    speaker_registry_version: string;
    matched_on: "speaker_id" | "alias" | "none";
  };
}

/** Response: /api/witness/statements/speakers */
export interface ObservedSpeakersResponse {
  observed: ObservedSpeakerDTO[];
  evidence: {
    statements: EvidenceMetadata;
    registry: EvidenceMetadata;
  };
}

/** Speaker for registry */
export interface SpeakerDTO {
  speaker_id: string;
  display_name: string;
  aliases: string[];
  external_refs: Record<string, string | null>;
}

/** Response: /api/registry/speakers */
export interface SpeakersRegistryResponse {
  speakers: SpeakerDTO[];
  evidence: EvidenceMetadata;
}

/** Source for registry */
export interface SourceDTO {
  source_id: string;
  publisher: string;
  type: string;
  feed_urls: string[];
  ingest_allowed: boolean;
  display_policy: string;
}

/** Response: /api/registry/sources */
export interface SourcesRegistryResponse {
  sources: SourceDTO[];
  evidence: EvidenceMetadata;
}
