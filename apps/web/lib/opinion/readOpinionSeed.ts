/**
 * Opinion seed data reader.
 * CODEFACTORY scope.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import type { Poll } from "@/lib/types/opinion";
import type { EvidenceMetadata } from "@/lib/types/spot";

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\web") || cwd.endsWith("apps/web")) {
    return resolve(cwd, "../..");
  }
  return cwd;
}

const PROJECT_ROOT = getProjectRoot();
const SEED_DIR = resolve(PROJECT_ROOT, "data", "canonical", "opinion", "seed_v1");

export function loadPolls(): Poll[] {
  const path = join(SEED_DIR, "polls.json");
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  return raw.polls ?? [];
}

export function getPollById(id: string): Poll | undefined {
  return loadPolls().find(p => p.id === id);
}

export function loadOpinionEvidence(): EvidenceMetadata {
  // Opinion seed doesn't have its own manifest yet — use dataset reference
  return {
    manifest_id: "opinion_seed_v1",
    root_hash: "pending_hash",
    files_sha256_path: "data/canonical/opinion/seed_v1/polls.json",
  };
}
