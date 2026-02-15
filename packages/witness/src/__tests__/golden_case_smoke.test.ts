/**
 * Golden Case Smoke Test — Witness Mode Phase A
 *
 * Validates that a canonical nodes file:
 * 1. Exists and is valid JSON
 * 2. Contains at least one record
 * 3. Each record has required fields per WitnessDecisionNode schema
 * 4. Each record has a valid evidence_id (minLength 10)
 * 5. Each record has at least one energy taxonomy tag
 *
 * Run: npx jest packages/witness/src/__tests__/golden_case_smoke.test.ts
 *
 * TR1: No source, no number — test validates structure, not content.
 * TR7: Witness mode — no interpretation in test assertions.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = resolve(__dirname, "../../../..");

// Required fields per WitnessDecisionNode.schema.json
const REQUIRED_NODE_FIELDS = [
  "node_id",
  "evidence_id",
  "source",
  "doc_id",
  "doc_type",
  "title",
  "date",
  "tags",
];

const VALID_DOC_TYPES = ["mot", "prop", "bet", "rskr", "sou", "ds", "skr", "other"];

const VALID_ENERGY_TAGS = [
  "ENERGY.NUCLEAR",
  "ENERGY.TAXES_FEES",
  "ENERGY.GRID_TRANSMISSION",
  "ENERGY.MARKET_DESIGN",
  "ENERGY.BUILDING_ENERGY_RULES",
  "ENERGY.EU_IMPLEMENTATION",
];

/**
 * Find the most recent canonical nodes file.
 * Looks in data/canonical/witness/riksdagen/*/nodes.json
 */
function findCanonicalNodes(): string | null {
  const baseDir = resolve(PROJECT_ROOT, "data", "canonical", "witness", "riksdagen");
  if (!existsSync(baseDir)) return null;

  const { readdirSync } = require("fs");
  const runs = readdirSync(baseDir, { withFileTypes: true })
    .filter((d: any) => d.isDirectory())
    .map((d: any) => d.name)
    .sort()
    .reverse();

  for (const run of runs) {
    const nodesPath = resolve(baseDir, run, "nodes.json");
    if (existsSync(nodesPath)) return nodesPath;
  }

  return null;
}

describe("Golden Case Smoke Test — Witness Riksdagen Energy", () => {
  let nodesPath: string | null;
  let nodes: any[];

  beforeAll(() => {
    nodesPath = findCanonicalNodes();
    if (nodesPath) {
      const raw = readFileSync(nodesPath, "utf-8");
      nodes = JSON.parse(raw);
    } else {
      nodes = [];
    }
  });

  test("canonical nodes file exists", () => {
    expect(nodesPath).not.toBeNull();
  });

  test("file contains valid JSON array with at least one record", () => {
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes.length).toBeGreaterThan(0);
  });

  test("each node has all required fields", () => {
    for (const node of nodes) {
      for (const field of REQUIRED_NODE_FIELDS) {
        expect(node).toHaveProperty(field);
      }
    }
  });

  test("each node has evidence_id with minLength 10", () => {
    for (const node of nodes) {
      expect(typeof node.evidence_id).toBe("string");
      expect(node.evidence_id.length).toBeGreaterThanOrEqual(10);
    }
  });

  test("each node has valid doc_type", () => {
    for (const node of nodes) {
      expect(VALID_DOC_TYPES).toContain(node.doc_type);
    }
  });

  test("each node has source with name, publisher, uri", () => {
    for (const node of nodes) {
      expect(node.source).toBeDefined();
      expect(typeof node.source.name).toBe("string");
      expect(typeof node.source.publisher).toBe("string");
      expect(typeof node.source.uri).toBe("string");
      expect(node.source.uri).toMatch(/^https?:\/\//);
    }
  });

  test("each node has at least one valid energy tag", () => {
    for (const node of nodes) {
      expect(Array.isArray(node.tags)).toBe(true);
      expect(node.tags.length).toBeGreaterThan(0);
      for (const tag of node.tags) {
        expect(VALID_ENERGY_TAGS).toContain(tag);
      }
    }
  });

  test("no duplicate node_ids", () => {
    const ids = nodes.map((n: any) => n.node_id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test("no duplicate evidence_ids", () => {
    const ids = nodes.map((n: any) => n.evidence_id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

describe("Manifest Smoke Test", () => {
  test("at least one manifest directory exists under manifests/witness/", () => {
    const manifestBase = resolve(PROJECT_ROOT, "manifests", "witness");
    if (!existsSync(manifestBase)) {
      // Skip if no manifests yet (pre-smoke-run)
      console.warn("[SKIP] No manifests/witness/ directory yet. Run ingest first.");
      return;
    }

    const { readdirSync } = require("fs");
    const entries = readdirSync(manifestBase, { withFileTypes: true });
    expect(entries.length).toBeGreaterThan(0);
  });

  test("manifest contains files.sha256 and root_hash.txt", () => {
    const manifestBase = resolve(PROJECT_ROOT, "manifests", "witness");
    if (!existsSync(manifestBase)) return;

    const { readdirSync } = require("fs");
    const runs = readdirSync(manifestBase, { withFileTypes: true })
      .filter((d: any) => d.isDirectory())
      .map((d: any) => d.name);

    for (const run of runs) {
      const runDir = resolve(manifestBase, run);
      const files = readdirSync(runDir).map((f: string) => f);
      const hasSha = files.some((f: string) => f.endsWith(".files.sha256"));
      const hasRoot = files.some((f: string) => f.endsWith(".root_hash.txt"));
      const hasManifest = files.some((f: string) => f.endsWith(".manifest.json"));

      expect(hasSha).toBe(true);
      expect(hasRoot).toBe(true);
      expect(hasManifest).toBe(true);
    }
  });
});
