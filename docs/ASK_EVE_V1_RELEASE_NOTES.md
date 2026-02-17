# Ask-EVE Evidence Engine V1 — Release Notes

**Version:** v1.0.0  
**Tag date:** 2026-02-17  
**Status:** Locked  
**Depends on:** EVE Timeseries V2 (v2.0.0-locked)

---

## Purpose

Ask-EVE transforms structured queries into cryptographically verifiable evidence reports. It reads locked V2 datasets, computes deterministic statistics, generates PDF reports, and seals each report in an append-only vault chain.

Ask-EVE is not analytics. It is a reproducible computational reference.

---

## Architecture

```
Query (strict parameters or LLM-translated)
  ↓
Validation (zone, date, metrics against V2 lock)
  ↓
Deterministic NDJSON scan + aggregation
  ↓
PDF generation (pdfkit, 100% TypeScript)
  ↓
SHA256 of PDF → report vault seal
  ↓
Verifiable: PDF hash → report_vault → dataset_vault → canonical → rebuild
```

LLM role (future): translation only. Never computation. Never data access.

---

## Components

| File | Function |
|------|----------|
| `ask-eve/query_v2.ts` | Deterministic query engine + statistics + provenance |
| `ask-eve/query_schema.ts` | Strict validation against V2 locked constraints |
| `ask-eve/generate_pdf.ts` | PDF generation + SHA256 + report vault seal |
| `ask-eve/report_vault.ts` | Append-only chain for generated reports |
| `ask-eve/e2e_test.ts` | Full chain verification (8/8 tests) |
| `api/ask-eve/route.ts` | POST endpoint for queries |
| `api/audit/report/[hash]/route.ts` | GET endpoint for PDF verification |

---

## Query Output

Each query returns 24+ fields including:

- Statistical summaries (mean, min, max, median)
- Generation mix averages (10 fuel types)
- Net import statistics
- Temperature and HDD
- Full provenance: dataset_eve_id, root_hash, registry_hash, vault chain_hash
- Reproducible query command

---

## PDF Evidence Report

Each PDF includes:

- Summary statistics table
- Generation mix table
- Methodology block (version, scope, source references)
- Cryptographic verification block (dataset_eve_id, root_hash, registry_hash, vault chain_hash, rebuild command)
- Disclaimer: deterministic snapshot, not normative claim

---

## Report Vault

Separate from dataset vault. Each PDF report is:

- SHA256-hashed after generation
- Appended to `data/reports/report_vault.jsonl`
- Chained (prev_hash → event_hash → chain_hash)
- Verifiable via `GET /api/audit/report/{pdf_hash}`

---

## E2E Test Results

8/8 pass:

1. ✅ Query Engine: returns valid result
2. ✅ Query Engine: deterministic (identical re-run)
3. ✅ Vault Reference: dataset has vault entry with root_hash
4. ✅ Query Schema: rejects invalid zone
5. ✅ Query Schema: rejects future-only range
6. ✅ PDF Generation: creates file + seals in report vault
7. ✅ Report Vault: lookup by PDF hash returns correct entry
8. ✅ Full Chain: PDF → report_vault → dataset_vault → canonical

---

## Verification

```sh
# Query
npx tsx packages/evidence/src/ask-eve/query_v2.ts --zone SE3 --from 2024-01-01 --to 2024-01-31

# PDF + seal
npx tsx packages/evidence/src/ask-eve/generate_pdf.ts --zone SE3 --from 2024-01-01 --to 2024-01-31 --output report.pdf

# E2E
npx tsx packages/evidence/src/ask-eve/e2e_test.ts

# Verify PDF (compute hash, then lookup)
# PowerShell: Get-FileHash report.pdf -Algorithm SHA256
# Then: GET /api/audit/report/{hash}
```

---

## What Ask-EVE Does NOT Do

- No AI in computation layer
- No interpretation or opinion
- No data modification
- No external API calls during query
- No marginal or lifecycle emissions
- No speculative modeling

---

## What Requires V2

- LLM-to-strict-query translation layer
- Batch report generation
- Cross-zone comparison reports
- Time-series chart embedding in PDF
- Report vault chain verification CLI

---

## Definition of Done

Ask-EVE V1 is locked when all of the following are true:

- [x] Query engine returns deterministic results
- [x] Strict schema validates against V2 lock
- [x] PDF generated with pdfkit (100% TypeScript)
- [x] PDF SHA256 sealed in report vault
- [x] Report vault is append-only with chain integrity
- [x] Verify endpoint returns correct provenance
- [x] E2E test 8/8 pass
- [x] No AI in computation path
- [x] Git tag ask-eve-v1.0.0 applied
