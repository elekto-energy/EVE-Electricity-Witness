/**
 * Witness seed data reader.
 * Reads from data/canonical/witness/riksdagen_seed_v1/*.json
 * and manifests/witness/riksdagen_seed_v1.* for evidence metadata.
 *
 * CODEFACTORY scope. No interpretation. TR7.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import type { WitnessTopic, WitnessChain } from "@/lib/types/witness";
import type { EvidenceMetadata } from "@/lib/types/spot";

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\web") || cwd.endsWith("apps/web")) {
    return resolve(cwd, "../..");
  }
  return cwd;
}

const PROJECT_ROOT = getProjectRoot();
const SEED_DIR = resolve(PROJECT_ROOT, "data", "canonical", "witness", "riksdagen_seed_v1");
const MANIFEST_DIR = resolve(PROJECT_ROOT, "manifests", "witness");

export function loadTopics(): WitnessTopic[] {
  const path = join(SEED_DIR, "topics.json");
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  return raw.topics ?? [];
}

export function loadChains(): WitnessChain[] {
  const path = join(SEED_DIR, "chains.json");
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  return raw.chains ?? [];
}

export function loadWitnessEvidence(): EvidenceMetadata {
  const rootHashPath = join(MANIFEST_DIR, "riksdagen_seed_v1.root_hash.txt");
  const rootHash = existsSync(rootHashPath)
    ? readFileSync(rootHashPath, "utf-8").trim()
    : "pending_hash";

  return {
    manifest_id: "riksdagen_seed_v1",
    root_hash: rootHash,
    files_sha256_path: join(MANIFEST_DIR, "riksdagen_seed_v1.files.sha256"),
  };
}

export function getTopicById(id: string): WitnessTopic | undefined {
  return loadTopics().find(t => t.id === id);
}

export function getChainsForTopic(topicId: string): WitnessChain[] {
  return loadChains().filter(c => c.topic_id === topicId);
}

export function getChainById(chainId: string): WitnessChain | undefined {
  return loadChains().find(c => c.id === chainId);
}
