# EVE Electricity Witness

**Deterministic evidence layer for Nordic and European power markets.**

EVE transforms public energy data into cryptographically sealed, independently verifiable hourly datasets. It computes and seals — it does not model, predict, or recommend.

---

## What EVE Does

EVE ingests data from public sources (ENTSO-E Transparency Platform, Open-Meteo ERA5, EEA emission factors), applies a locked methodology, and produces hourly timeseries with generation mix, cross-border flows, and CO₂ intensity. Every dataset is SHA-256 hashed and sealed in an append-only WORM vault.

The computational layer contains no probabilistic components.

## Dataset Scope (v2.0.0-locked)

| Property | Value |
|----------|-------|
| Zones | 14: SE1–4, NO1–2, FI, DE_LU, PL, EE, LV, LT, FR, NL |
| Period | 2020-01 → present |
| Resolution | Hourly (PT60M) |
| Records | 756,336 rows across 1,036 files |
| Schema | 24 fields per row (locked) |
| Methodology | TS_V2_EEA_2023_DIRECT |
| Emissions | Direct combustion only (Scope 1) |

## Integrity

| Mechanism | Implementation |
|-----------|---------------|
| Determinism | Same input → identical root_hash (verified) |
| WORM Vault | Append-only SHA-256 chain, no retroactive mutation |
| Method Lock | Registry hash anchors methodology; changes require version bump |
| Golden Tests | 9/9 automated tests: schema, CO₂ bounds, flow symmetry, field count |
| Audit API | `GET /api/audit/dataset/{id}` returns provenance chain |
| Report Vault | Evidence PDFs sealed in separate append-only chain |
| Rebuild | Any party can rebuild from public sources and verify hash match |

## Ask-EVE Evidence Engine (v1.0.0)

Query locked datasets and generate verifiable PDF evidence reports.

```sh
# Query
npx tsx packages/evidence/src/ask-eve/query_v2.ts --zone SE3 --from 2024-01-01 --to 2024-01-31

# Generate PDF (sealed in report vault)
npx tsx packages/evidence/src/ask-eve/generate_pdf.ts --zone SE3 --from 2024-01-01 --to 2024-01-31 --output report.pdf

# Verify PDF offline
npx tsx packages/evidence/src/ask-eve/verify_report.ts report.pdf

# Run E2E test
npx tsx packages/evidence/src/ask-eve/e2e_test.ts

# Run golden tests
npx tsx packages/evidence/src/golden/golden_test_v2.ts
```

## Verification Chain

```
PDF → SHA256 → report_vault → dataset_eve_id → dataset_vault → canonical NDJSON → rebuild
```

Every output traces to public source data via deterministic pipeline.

## Sovereign Mode

Runs fully offline in Docker container. No internet access required.

```sh
# Light edition (data mounted externally)
docker-compose -f docker/docker-compose.yml up -d

# Full edition (all data embedded)
docker-compose -f docker/docker-compose.full.yml up -d
```

See [docker/offline_mode.md](docker/offline_mode.md).

## Repository Structure

```
apps/web/                   Next.js application (standalone)
  app/api/audit/            Audit endpoints (dataset + report verification)
  app/api/ask-eve/          Query endpoint
packages/evidence/src/      Evidence pipeline
  ask-eve/                  Query engine, PDF generator, report vault, verify CLI
  golden/                   Golden test suite (9 tests)
  build_timeseries_v2.ts    Canonical dataset builder
  ingest_*.ts               Data ingestion scripts
packages/xvault-ts/         WORM vault implementation
config/                     Method registry lock
data/canonical/             Generated datasets (gitignored)
data/xvault/                Dataset vault chain
data/reports/               Report vault chain
docs/                       Methodology, release notes, challenge guide
docker/                     Sovereign Mode Dockerfiles
```

## Explicit Non-Claims

EVE provides a reproducible computational reference, not regulatory guidance.

No marginal emissions. No lifecycle analysis. No demand attribution. No forecasting. No policy recommendations. No normative claims.

## Trinity Rules

- **TR1**: No source, no number
- **TR2**: All ingests produce manifest + SHA256 + root_hash
- **TR4**: Model changes bump methodology version
- **TR6**: Code merges — never invents

## Tags

| Tag | Description |
|-----|-------------|
| `v2.0.0-locked` | Timeseries V2: 14 zones, 756K rows, 24-field schema, golden tests 9/9 |
| `ask-eve-v1.0.0` | Evidence Engine: query + PDF + report vault + E2E 8/8 |

## Documentation

- [METHOD_REGISTRY_V2.md](docs/METHOD_REGISTRY_V2.md) — Locked methodology specification
- [CHALLENGE_EVE.md](docs/CHALLENGE_EVE.md) — Independent verification guide
- [V2_RELEASE_NOTES.md](docs/V2_RELEASE_NOTES.md) — V2 release notes
- [ASK_EVE_V1_RELEASE_NOTES.md](docs/ASK_EVE_V1_RELEASE_NOTES.md) — Ask-EVE release notes
- [EVE_Technical_Summary_SVK.pdf](docs/EVE_Technical_Summary_SVK.pdf) — Technical summary (1 page)

## License

MIT — See [LICENSE](LICENSE)

---

*Developed by [Organiq Sweden AB](https://organiq.se)*

*"AI may propose and challenge — never decide."*
