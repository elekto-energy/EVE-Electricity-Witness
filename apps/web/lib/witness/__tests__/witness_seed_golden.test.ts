/**
 * Golden test: Witness seed data integrity.
 * Verifies structure, completeness, and TR7 compliance of seed dataset.
 *
 * Gate B: If seed data changes, this test fails.
 */

import { loadTopics, loadChains, getTopicById, getChainsForTopic } from "../readWitnessSeed";

describe("Witness seed golden tests", () => {
  test("seed has exactly 3 topics", () => {
    const topics = loadTopics();
    expect(topics.length).toBe(3);
  });

  test("all required topic IDs exist", () => {
    const ids = loadTopics().map(t => t.id);
    expect(ids).toContain("nuclear_policy");
    expect(ids).toContain("electricity_taxes_fees");
    expect(ids).toContain("building_energy_requirements");
  });

  test("each topic has at least 1 chain with 3+ steps", () => {
    const topics = loadTopics();
    for (const topic of topics) {
      const chains = getChainsForTopic(topic.id);
      expect(chains.length).toBeGreaterThanOrEqual(1);
      for (const chain of chains) {
        expect(chain.steps.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test("all chain steps have required fields", () => {
    const chains = loadChains();
    for (const chain of chains) {
      for (const step of chain.steps) {
        expect(step.position).toBeDefined();
        expect(step.doc_type).toBeTruthy();
        expect(step.doc_id).toBeTruthy();
        expect(step.title).toBeTruthy();
        expect(step.uri).toBeTruthy();
        expect(step.description_neutral).toBeTruthy();
        // TR8: Every source must be a clickable link
        expect(step.uri).toMatch(/^https?:\/\//);
      }
    }
  });

  test("no interpretation in description_neutral (TR7 check)", () => {
    const chains = loadChains();
    const FORBIDDEN_WORDS = [
      "should", "must", "better", "worse", "good policy", "bad policy",
      "recommend", "opinion", "believe", "unfortunately", "clearly",
    ];

    for (const chain of chains) {
      for (const step of chain.steps) {
        const lower = step.description_neutral.toLowerCase();
        for (const word of FORBIDDEN_WORDS) {
          expect(lower).not.toContain(word);
        }
      }
    }
  });

  test("chain_ids in topics match actual chains", () => {
    const topics = loadTopics();
    const chains = loadChains();
    const chainIds = new Set(chains.map(c => c.id));

    for (const topic of topics) {
      for (const cid of topic.chain_ids) {
        expect(chainIds.has(cid)).toBe(true);
      }
    }
  });

  test("nuclear_policy topic has correct structure", () => {
    const topic = getTopicById("nuclear_policy");
    expect(topic).toBeDefined();
    expect(topic!.tag).toBe("ENERGY.NUCLEAR");
    expect(topic!.chain_ids).toContain("nuclear_chain_01");
    expect(topic!.source_count).toBe(4);
  });
});
