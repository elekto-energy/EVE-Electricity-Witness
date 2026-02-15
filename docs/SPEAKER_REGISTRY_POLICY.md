# Speaker Registry Policy

**Status:** Normative  
**Version:** 1.0  
**Date:** 2026-02-15  
**Scope:** All ELEKTO EU Witness Mode statements  

## A1. Primary Key

- `speaker_id` MUST be based on Riksdagen `intressent_id`.
- Format: `se-riksdagen:<intressent_id>`
- Example: `se-riksdagen:0744993950910` (Anders Ygeman)
- `intressent_id` is a numeric string, 9–13 digits, as documented by [Wikidata P1214](https://www.wikidata.org/wiki/Property:P1214).
- Property stability: **never changes** (per Wikidata documentation).
- MUST NOT use Wikidata QID, slug, or any other identifier as primary key.

## A2. External References

External identifiers are stored in `external_refs` for cross-referencing only:

| Field | Usage |
|-------|-------|
| `riksdagen_guid` | UUID from riksdagen.se URL slug. Informational only. |
| `wikidata` | Wikidata QID (e.g. `Q3375050`). Reference only. |
| `gov_profile_url` | Regeringen.se profile URL if person is/was minister. |
| `x_handle` | X/Twitter handle. For future social ingest. |

External references MUST NOT be used as `speaker_id`.

## A3. Deterministic Speaker Mapping

When ingesting statements from Riksdagen API:

1. If the source provides `intressent_id` → direct mapping to `se-riksdagen:<id>`.
2. If `intressent_id` is absent → attempt deterministic alias match:
   - Normalize name (lowercase, strip diacritics, trim whitespace).
   - Exact match against `aliases[]` in speaker registry.
   - Log the matching rule + version used.
3. If match is ambiguous or no match found → set `speaker_id = null` and mark record `"speaker_resolved": false`.
   - Do NOT guess. Unresolved records are surfaced in UI with "Unresolved speaker" badge.

## A4. Registry Versioning

- Each registry version (`speakers_v1.json`, `sources_v1.json`) is immutable once manifested.
- Changes require a new version file (e.g. `speakers_v2.json`) with new manifest.
- Every version has:
  - `manifest_id`
  - `root_hash`
  - `files_sha256_path`
- Ad-hoc edits without new manifest are forbidden.

## A5. Pending Speakers

- `data/canonical/registries/speakers_pending_v1.json` holds speakers whose `intressent_id` has not been verified.
- Pending speakers MUST NOT be used in ingest mapping.
- Once verified, move entry to `speakers_v<N+1>.json` and re-manifest.

## A6. Provenance

The `primary_source` field in each speaker record documents where the identity was verified:

```json
{
  "primary_source": {
    "type": "riksdagen_open_data",
    "intressent_id": "0744993950910",
    "verified_at": "2026-02-15",
    "verified_via": "https://data.riksdagen.se/personlista/?iid=0744993950910&utformat=html"
  }
}
```

This ensures every speaker in the registry is traceable to an authoritative source.
