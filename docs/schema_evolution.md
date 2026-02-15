# Schema Evolution — ELEKTO EU

## Phase 0 (current): Minimal — prove the pipeline

**Active schemas:**
- `EvidenceRecord.schema.json` — flat, artifact-oriented, `evidence_id` as free string
- `IngestManifest.schema.json` — `run_id` + file paths to SHA256/root_hash outputs

**Goal:** Prove RAW → CANONICAL → MANIFEST → HASH → ROOT_HASH chain works.
No domain modeling. No computation trail. Just cryptographic evidence that data entered the system.

**Rule:** Phase 0 schemas must not forbid future extension (no `additionalProperties: false`).

## Phase 1 (target): Rich — model the domain

**Future schemas (preserved in `packages/schemas/_future/`):**
- `EvidenceRecord.v2.schema.json` — adds:
  - `record_id` with regex pattern `ER-YYYYMMDD-hex`
  - `country`, `bidding_zone`, `period` (start/end/granularity)
  - `computation` object (method enum, formula, inputs with source refs)
  - `assumptions[]` array (key, value, unit, source)
  - `dataset_version` with semver pattern
  - `additionalProperties: false` for strict validation

- `IngestManifest.v2.schema.json` — adds:
  - `manifest_id` with regex pattern `IM-source-date-hex`
  - `source` object (name enum, url, license, dataset_id, api_endpoint)
  - `ingest` object (fetched_at, script, script_version, parameters, duration_ms)
  - `files[]` array with per-file hash + size + stage (raw/canonical/derived)
  - `record_count`
  - `additionalProperties: false`

## Migration: Phase 0 → Phase 1

When first real ENTSO-E ingest is verified and working:

1. Write `scripts/upgrade_manifest_v1_to_v2.py`:
   - Read Phase 0 manifest
   - Map `run_id` → `manifest_id` (generate pattern)
   - Map `files_sha256_path` → parse into `files[]` array
   - Add `source` object from source registry
   - Validate against v2 schema
   - Write upgraded manifest

2. Write `scripts/upgrade_evidence_v1_to_v2.py`:
   - Map `evidence_id` → `record_id` (generate pattern)
   - Map `raw_artifacts` + `canonical_artifacts` → inline refs
   - Add `computation`, `assumptions`, `period` from context
   - Validate against v2 schema

3. Run upgraders on all existing manifests
4. Switch active schemas to v2
5. Update README + docs

**Trigger:** First successful `pnpm verify` with real ENTSO-E data.

## Version History

| Version | Date | Schema | Notes |
|---------|------|--------|-------|
| Phase 0 | 2026-02-15 | Minimal | Pipeline proof |
| Phase 1 | TBD | Rich (v2) | After first verified ingest |
