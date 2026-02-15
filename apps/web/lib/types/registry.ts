import type { EvidenceMetadata } from "./spot";

export interface ZoneInfo {
  code: string;
  name: string;
  country: string;
  eic: string;
}

/** Response: /api/registry/zones */
export interface ZoneRegistryResponse {
  zones: ZoneInfo[];
  evidence: EvidenceMetadata;
}
