/**
 * Golden test: Statements canonical reader + filtering + pagination.
 *
 * Uses in-memory test data (no disk dependency for unit test).
 * Integration test of readCanonical logic.
 */

import { filterStatements, paginate } from "../readCanonical";
import type { StatementEventDTO } from "@/lib/types/statements";

const MOCK_STATEMENTS: StatementEventDTO[] = [
  {
    statement_id: "stmt_rd_0001",
    speaker_id: "anders_ygeman",
    speaker_name: "Anders Ygeman",
    speaker_role_at_time: "S",
    source_type: "primary_parliament",
    title: "Energipolitik",
    published_at_utc: "2025-02-10T00:00:00Z",
    original_url: "https://data.riksdagen.se/dokument/H910123",
    excerpt: "Herr talman! Jag vill tala om energipolitiken.",
    topic_tags: [],
    language: "sv",
    evidence_ref: {
      manifest_id: "test_canonical",
      root_hash: "abc123",
      files_sha256_path: "/test",
      record_ids: ["H910123", "1"],
    },
    compliance: { requires_recheck: false, status: "active" },
  },
  {
    statement_id: "stmt_rd_0002",
    speaker_id: "ebba_busch",
    speaker_name: "Ebba Busch",
    speaker_role_at_time: "KD",
    source_type: "primary_parliament",
    title: "Kärnkraft",
    published_at_utc: "2025-02-12T00:00:00Z",
    original_url: "https://data.riksdagen.se/dokument/H910124",
    excerpt: "Vi behöver mer kärnkraft i Sverige.",
    topic_tags: [],
    language: "sv",
    evidence_ref: {
      manifest_id: "test_canonical",
      root_hash: "abc123",
      files_sha256_path: "/test",
      record_ids: ["H910124", "1"],
    },
    compliance: { requires_recheck: false, status: "active" },
  },
  {
    statement_id: "stmt_rd_0003",
    speaker_id: "anders_ygeman",
    speaker_name: "Anders Ygeman",
    speaker_role_at_time: "S",
    source_type: "primary_parliament",
    title: "Migrationspolitik",
    published_at_utc: "2025-02-14T00:00:00Z",
    original_url: "https://data.riksdagen.se/dokument/H910125",
    excerpt: "Vi måste ha en human migrationspolitik.",
    topic_tags: [],
    language: "sv",
    evidence_ref: {
      manifest_id: "test_canonical",
      root_hash: "abc123",
      files_sha256_path: "/test",
      record_ids: ["H910125", "2"],
    },
    compliance: { requires_recheck: false, status: "active" },
  },
];

describe("Statements filtering", () => {
  test("filter by speaker", () => {
    const result = filterStatements(MOCK_STATEMENTS, { speaker: "anders_ygeman" });
    expect(result.length).toBe(2);
    expect(result.every(s => s.speaker_id === "anders_ygeman")).toBe(true);
  });

  test("filter by date range", () => {
    const result = filterStatements(MOCK_STATEMENTS, { from: "2025-02-11", to: "2025-02-13" });
    expect(result.length).toBe(1);
    expect(result[0].statement_id).toBe("stmt_rd_0002");
  });

  test("filter by search query", () => {
    const result = filterStatements(MOCK_STATEMENTS, { q: "kärnkraft" });
    expect(result.length).toBe(1);
    expect(result[0].speaker_name).toBe("Ebba Busch");
  });

  test("combined filters", () => {
    const result = filterStatements(MOCK_STATEMENTS, { speaker: "anders_ygeman", q: "energi" });
    expect(result.length).toBe(1);
    expect(result[0].title).toBe("Energipolitik");
  });

  test("empty result for non-matching filter", () => {
    const result = filterStatements(MOCK_STATEMENTS, { speaker: "nonexistent" });
    expect(result.length).toBe(0);
  });
});

describe("Statements pagination", () => {
  // Items sorted desc by date: 0003 (Feb 14), 0002 (Feb 12), 0001 (Feb 10)
  const sorted = [...MOCK_STATEMENTS].sort((a, b) =>
    b.published_at_utc.localeCompare(a.published_at_utc) ||
    a.statement_id.localeCompare(b.statement_id)
  );

  test("first page", () => {
    const { page, next_cursor } = paginate(sorted, undefined, 2);
    expect(page.length).toBe(2);
    expect(page[0].statement_id).toBe("stmt_rd_0003");
    expect(page[1].statement_id).toBe("stmt_rd_0002");
    expect(next_cursor).toBeDefined();
  });

  test("second page via cursor", () => {
    const first = paginate(sorted, undefined, 2);
    const { page, next_cursor } = paginate(sorted, first.next_cursor, 2);
    expect(page.length).toBe(1);
    expect(page[0].statement_id).toBe("stmt_rd_0001");
    expect(next_cursor).toBeUndefined();
  });

  test("full page returns no cursor", () => {
    const { page, next_cursor } = paginate(sorted, undefined, 10);
    expect(page.length).toBe(3);
    expect(next_cursor).toBeUndefined();
  });
});
