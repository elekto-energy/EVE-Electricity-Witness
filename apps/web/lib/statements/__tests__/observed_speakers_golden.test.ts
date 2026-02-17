/**
 * Golden test: Observed speakers aggregation.
 *
 * Slice 1B: aggregateObservedSpeakers logic.
 * Tests grouping, party extraction, verified flag, deterministic sort.
 */

import { aggregateObservedSpeakers } from "../readCanonical";
import type { StatementEventDTO } from "@/lib/types/statements";

// Mock loadSpeakersRegistry — we need to mock the file reads
jest.mock("fs", () => {
  const actual = jest.requireActual("fs");
  return {
    ...actual,
    readFileSync: (path: string, encoding?: string) => {
      if (path.includes("speakers_v1.json")) {
        return JSON.stringify({
          speakers: [
            {
              speaker_id: "se-riksdagen:0744993950910",
              display_name: "Anders Ygeman",
              aliases: ["anders ygeman"],
              external_refs: {},
            },
            {
              speaker_id: "se-riksdagen:0512510717328",
              display_name: "Ebba Busch",
              aliases: ["ebba busch"],
              external_refs: {},
            },
          ],
        });
      }
      if (path.includes("root_hash.txt")) {
        return "test_root_hash_abc123";
      }
      return actual.readFileSync(path, encoding);
    },
    existsSync: (path: string) => {
      if (path.includes("speakers_v1.json")) return true;
      if (path.includes("root_hash.txt")) return true;
      return actual.existsSync(path);
    },
  };
});

const makeStmt = (
  id: string,
  speakerId: string,
  speakerName: string,
  role: string | null,
  sourceType: string = "primary_parliament"
): StatementEventDTO => ({
  statement_id: id,
  speaker_id: speakerId,
  speaker_name: speakerName,
  speaker_role_at_time: role,
  source_type: sourceType,
  title: "Test",
  published_at_utc: "2025-02-10T00:00:00Z",
  original_url: "https://example.com",
  excerpt: "Test excerpt",
  topic_tags: [],
  language: "sv",
  evidence_ref: {
    manifest_id: "test",
    root_hash: "abc",
    files_sha256_path: "/test",
    record_ids: ["1"],
  },
  compliance: { requires_recheck: false, status: "active" },
  extraction: { method: "test", version: "1.0.0", fetched_at_utc: "2025-02-10T00:00:00Z" },
});

const FIXTURE: StatementEventDTO[] = [
  // Verified speaker: Ebba Busch (2 statements)
  makeStmt("s1", "se-riksdagen:0512510717328", "Ebba Busch", "Energi- och näringsminister (KD)", "primary_government"),
  makeStmt("s2", "se-riksdagen:0512510717328", "Ebba Busch", "Energi- och näringsminister (KD)", "primary_government"),
  // Verified speaker: Anders Ygeman (1 statement)
  makeStmt("s3", "se-riksdagen:0744993950910", "Anders Ygeman (S)", "S", "primary_parliament"),
  // Observed (unverified) speaker (3 statements)
  makeStmt("s4", "se-riksdagen:9999999999999", "Mirja Räihä (S)", "S", "primary_parliament"),
  makeStmt("s5", "se-riksdagen:9999999999999", "Mirja Räihä (S)", "S", "primary_parliament"),
  makeStmt("s6", "se-riksdagen:9999999999999", "Mirja Räihä (S)", "S", "primary_parliament"),
];

describe("aggregateObservedSpeakers", () => {
  test("returns correct count of speakers", () => {
    const result = aggregateObservedSpeakers(FIXTURE);
    expect(result).toHaveLength(3);
  });

  test("sorts by display_name sv-SE ascending", () => {
    const result = aggregateObservedSpeakers(FIXTURE);
    const names = result.map(s => s.display_name);
    expect(names).toEqual(["Anders Ygeman", "Ebba Busch", "Mirja Räihä (S)"]);
  });

  test("counts statements per speaker", () => {
    const result = aggregateObservedSpeakers(FIXTURE);
    const counts = Object.fromEntries(result.map(s => [s.display_name, s.count]));
    expect(counts["Ebba Busch"]).toBe(2);
    expect(counts["Anders Ygeman"]).toBe(1);
    expect(counts["Mirja Räihä (S)"]).toBe(3);
  });

  test("verified flag correct for registry speakers", () => {
    const result = aggregateObservedSpeakers(FIXTURE);
    const verified = Object.fromEntries(result.map(s => [s.display_name, s.verified]));
    expect(verified["Ebba Busch"]).toBe(true);
    expect(verified["Anders Ygeman"]).toBe(true);
    expect(verified["Mirja Räihä (S)"]).toBe(false);
  });

  test("matched_on is speaker_id for registry matches", () => {
    const result = aggregateObservedSpeakers(FIXTURE);
    const ebba = result.find(s => s.display_name === "Ebba Busch")!;
    expect(ebba.registry_match.matched_on).toBe("speaker_id");
    expect(ebba.registry_match.speaker_registry_version).toBe("speakers_v1");
  });

  test("matched_on is none for unverified speakers", () => {
    const result = aggregateObservedSpeakers(FIXTURE);
    const mirja = result.find(s => s.display_name === "Mirja Räihä (S)")!;
    expect(mirja.registry_match.matched_on).toBe("none");
  });

  test("extracts party from role/name", () => {
    const result = aggregateObservedSpeakers(FIXTURE);
    const parties = Object.fromEntries(result.map(s => [s.display_name, s.party]));
    expect(parties["Ebba Busch"]).toBe("KD");
    expect(parties["Mirja Räihä (S)"]).toBe("S");
  });

  test("empty input returns empty array", () => {
    const result = aggregateObservedSpeakers([]);
    expect(result).toEqual([]);
  });
});
