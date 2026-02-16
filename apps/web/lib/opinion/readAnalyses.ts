/**
 * Analysis data reader for opinion analyses.
 * Reads from data/canonical/opinion/analyses/
 */

import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\web") || cwd.endsWith("apps/web")) {
    return resolve(cwd, "../..");
  }
  return cwd;
}

const PROJECT_ROOT = getProjectRoot();
const ANALYSES_DIR = resolve(PROJECT_ROOT, "data", "canonical", "opinion", "analyses");

export function loadAnalysis(filename: string): any | null {
  const path = join(ANALYSES_DIR, filename);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function loadRinghalsTimeline() {
  return loadAnalysis("ringhals_timeline_v1.json");
}

export function loadBottleneckSolutions() {
  return loadAnalysis("bottleneck_solutions_v1.json");
}

export function loadCapacityLayers() {
  return loadAnalysis("capacity_layers_v1.json");
}

// electricity_taxes_timeline moved to /api/witness/energy-decisions
// data: data/canonical/witness/energy_decisions_v2.json
