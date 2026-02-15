# Witness Mode — ELEKTO EU

## Definition

Witness Mode is a strict evidence-tracing architecture where the system
**observes and records** — but **never interprets, recommends, or concludes**.

## Core Principles

1. **Zero interpretation** — No political commentary, blame, or conclusions
2. **Metadata only** — Document titles, dates, types, committee assignments, taxonomy tags
3. **Evidence cards** — Every displayed item shows: evidence_id, source, URI, retrieved_at, root_hash
4. **Clickable provenance** — Every claim links to the original source document
5. **Proof Pack** — Any chain can be exported as a ZIP with raw + canonical + manifest + hashes

## What Witness Mode IS

- A trace of **what documents exist** in official sources
- A deterministic **taxonomy classifier** (keyword-based, rule-based — not LLM)
- A **hash-verified evidence chain** from source to display
- An **audit trail** showing exactly when data was fetched and how it was transformed

## What Witness Mode IS NOT

- An opinion engine
- A policy scoring system
- A "who is right" tool
- A recommendation system
- An AI that "understands" legislation

## Architecture

```
Riksdagen API → RAW JSON → Canonical Nodes → Evidence Cards → UI
                   ↓              ↓
              manifest.json   manifest.json
              files.sha256    files.sha256
              root_hash.txt   root_hash.txt
```

## Evidence Card Structure

Every displayed item must show:

| Field | Source |
|-------|--------|
| evidence_id | Generated: `evr:{source}:{dataset_id}:{run_id}:{sha256_12}` |
| Source name | From canonical node `source.name` |
| Source URI | Clickable link to `source.uri` |
| Retrieved at | From evidence record `retrieved_at_utc` |
| Root hash | From manifest `root_hash.txt` |

## Taxonomy Tags

Applied deterministically via keyword matching (no LLM):

- `ENERGY.NUCLEAR`
- `ENERGY.TAXES_FEES`
- `ENERGY.GRID_TRANSMISSION`
- `ENERGY.MARKET_DESIGN`
- `ENERGY.BUILDING_ENERGY_RULES`
- `ENERGY.EU_IMPLEMENTATION`

## Proof Pack Export

A Proof Pack is a ZIP file containing everything needed to independently verify
a claim made on the platform:

```
proof_pack_{run_id}.zip
├── raw/           ← Original API responses
├── canonical/     ← Normalized nodes (schema-validated)
├── manifest.json  ← Ingest metadata
├── files.sha256   ← Per-file checksums
└── root_hash.txt  ← Single verification hash
```

## Patent Alignment

Witness Mode implements requirements from the EVE patent application (PRV 2026-01-13):
- Krav 17: Dual-instance separation (interpreter + synthesizer)
- Krav 18: Evidence-bound responses only
- Krav 19: Cryptographic sealing of evidence chain
- Krav 20: Human approval gate

## Trinity Rules (Witness-specific)

- TR7: Witness mode = NO interpretation (trace only)
- TR8: Every claim must be a clickable evidence link
- TR9: Proof Pack export must include raw + canonical + manifest + hashes
