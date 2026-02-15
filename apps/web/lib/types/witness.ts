import type { EvidenceMetadata } from "./spot";

/** Witness topic */
export interface WitnessTopic {
  id: string;
  title: string;
  title_en: string;
  tag: string;
  summary_neutral: string;
  chain_ids: string[];
  source_count: number;
}

/** Witness chain step — single document in a legislative chain */
export interface WitnessChainStep {
  position: number;
  doc_type: string;
  doc_id: string;
  title: string;
  date: string;
  body: string;
  uri: string;
  description_neutral: string;
}

/** Witness chain — full legislative trace */
export interface WitnessChain {
  id: string;
  topic_id: string;
  title: string;
  title_en: string;
  steps: WitnessChainStep[];
}

/** Response: /api/witness/topics */
export interface WitnessTopicsResponse {
  topics: WitnessTopic[];
  evidence: EvidenceMetadata;
}

/** Response: /api/witness/topic/:id */
export interface WitnessTopicDetailResponse {
  topic: WitnessTopic;
  chains: WitnessChain[];
  evidence: EvidenceMetadata;
}

/** Response: /api/witness/chain/:id */
export interface WitnessChainDetailResponse {
  chain: WitnessChain;
  evidence: EvidenceMetadata;
}
