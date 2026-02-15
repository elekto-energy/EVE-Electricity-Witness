/**
 * Golden test: Riksdagen anförande → StatementEvent mapping.
 *
 * Verifies deterministic mapping, speaker matching, and ID generation.
 */

import { mapAnforandenToStatements } from "../riksdagen_anf_map";
import type { RiksdagenAnforandeRaw } from "../riksdagen_anf_client";

const MOCK_RAW: RiksdagenAnforandeRaw[] = [
  {
    dok_id: "H910123",
    dok_rm: "2024/25",
    dok_nummer: "123",
    dok_datum: "2025-02-10",
    avsnittsrubrik: "Energipolitik",
    kammaraktivitet: "debatt",
    anforande_nummer: "1",
    talare: "Anders Ygeman",
    parti: "S",
    intressent_id: "0744993950910",
    rel_dok_id: "",
    replik: "N",
    anforandetext: "<p>Herr talman! Jag vill tala om <b>energipolitiken</b>.</p>",
    systemdatum: "2025-02-10T14:00:00",
  },
  {
    dok_id: "H910124",
    dok_rm: "2024/25",
    dok_nummer: "124",
    dok_datum: "2025-02-12",
    avsnittsrubrik: "Kärnkraft",
    kammaraktivitet: "debatt",
    anforande_nummer: "1",
    talare: "Unknown Person",
    parti: "M",
    intressent_id: "9999999999999",
    rel_dok_id: "",
    replik: "N",
    anforandetext: "Vi behöver mer kärnkraft.",
    systemdatum: "2025-02-12T10:00:00",
  },
];

const MOCK_SPEAKERS = [
  {
    speaker_id: "anders_ygeman",
    display_name: "Anders Ygeman",
    aliases: ["Ygeman"],
    external_refs: { riksdagen_person_id: "0744993950910" },
  },
];

const EVIDENCE_REF = {
  manifest_id: "test_run_canonical",
  root_hash: "abc123",
  files_sha256_path: "/test/files.sha256",
};

describe("Riksdagen anförande mapping", () => {
  const results = mapAnforandenToStatements(
    MOCK_RAW,
    MOCK_SPEAKERS,
    EVIDENCE_REF,
    "2026-02-15T12:00:00Z",
  );

  test("produces correct number of statements", () => {
    expect(results.length).toBe(2);
  });

  test("statement_id is deterministic", () => {
    const first = results[0].statement_id;
    // Re-run mapping
    const rerun = mapAnforandenToStatements(MOCK_RAW, MOCK_SPEAKERS, EVIDENCE_REF, "2026-02-15T12:00:00Z");
    expect(rerun[0].statement_id).toBe(first);
  });

  test("speaker matched by intressent_id", () => {
    expect(results[0].speaker_id).toBe("anders_ygeman");
    expect(results[0].speaker_name).toBe("Anders Ygeman");
  });

  test("unregistered speaker gets fallback ID", () => {
    expect(results[1].speaker_id).toContain("unregistered_");
    expect(results[1].speaker_name).toBe("Unknown Person");
  });

  test("HTML stripped from excerpt", () => {
    expect(results[0].excerpt).not.toContain("<p>");
    expect(results[0].excerpt).not.toContain("<b>");
    expect(results[0].excerpt).toContain("energipolitiken");
  });

  test("source_type is primary_parliament", () => {
    expect(results.every(r => r.source_type === "primary_parliament")).toBe(true);
  });

  test("evidence_ref is propagated", () => {
    expect(results[0].evidence_ref.manifest_id).toBe("test_run_canonical");
    expect(results[0].evidence_ref.root_hash).toBe("abc123");
  });

  test("original_url contains dok_id", () => {
    expect(results[0].original_url).toContain("H910123");
  });

  test("compliance status is active", () => {
    expect(results.every(r => r.compliance.status === "active")).toBe(true);
  });
});
