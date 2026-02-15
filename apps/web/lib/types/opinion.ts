import type { EvidenceMetadata } from "./spot";

export interface PollOption {
  id: string;
  label: string;
  label_en: string;
}

export interface Poll {
  id: string;
  title: string;
  title_en: string;
  witness_topic_id: string;
  witness_chain_id: string;
  options: PollOption[];
  status: "disabled" | "active" | "closed";
  requires: string;
  created: string;
}

/** Response: /api/opinion/polls */
export interface OpinionPollsResponse {
  polls: Poll[];
  evidence: EvidenceMetadata;
}

/** Response: /api/opinion/poll/:id */
export interface OpinionPollDetailResponse {
  poll: Poll;
  evidence: EvidenceMetadata;
}
