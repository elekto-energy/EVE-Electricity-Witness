# Evidence Package

The evidence layer is the core data integrity layer of ELEKTO EU.

## Pipeline

```
RAW → CANONICAL → DERIVED → PUBLISHED
```

Every stage transition produces:
- SHA-256 checksums per file
- An IngestManifest linking source → output
- A root_hash covering the entire run

## Rule: No source, no number (TR1)

No value is displayed in the UI without a traceable path to:
1. An official data source (ENTSO-E, Eurostat, SMHI, Copernicus)
2. A versioned ingest manifest
3. A computation trail (EvidenceRecord)

## Scripts

- `scripts/hash_tree.py` — Compute file hashes and root hash
- `scripts/make_manifest.py` — Generate IngestManifest for a completed ingest

## Schemas

- `packages/schemas/EvidenceRecord.schema.json` — Links displayed values to source data
- `packages/schemas/IngestManifest.schema.json` — Documents each data ingest run
