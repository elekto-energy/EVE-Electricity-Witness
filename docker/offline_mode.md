# EVE Sovereign Mode — Offline Installation Guide

EVE Sovereign Mode runs the complete verification system without internet access.

---

## Editions

| Edition | Data | Image Size | Use Case |
|---------|------|-----------|----------|
| Light | Mounted externally | ~200 MB | Myndigheter, drift, egen storage |
| Full | Baked into container | ~2+ GB | Demo, akademi, journalister, arkivering |

---

## Light Edition

### Build

```sh
cd docker
docker-compose build
```

### Run

```sh
docker-compose up -d
```

Data must be mounted at `/app/data`. The compose file maps `../data` by default.

### Verify

```sh
curl http://localhost:3000/api/audit/dataset/EVE-TSV2-SE3-20260217-TS_V2_EEA_2023_DIRECT
```

---

## Full Edition

### Build

```sh
cd docker
docker-compose -f docker-compose.full.yml build
```

### Run

```sh
docker-compose -f docker-compose.full.yml up -d
```

No external data required. Everything is inside the container.

---

## Rebuild Verification (inside container)

```sh
docker exec -it eve_v2_sovereign sh

# Install tsx for CLI tools
npx tsx packages/evidence/src/build_timeseries_v2.ts --zones SE3 --skip-vault
```

Compare root_hash with audit endpoint response.

---

## Golden Tests (inside container)

```sh
docker exec -it eve_v2_sovereign sh
npx tsx packages/evidence/src/golden/golden_test_v2.ts
```

Expected: 9/9 pass.

---

## What Sovereign Mode Provides

- Audit endpoint: GET /api/audit/dataset/{id}
- Deterministic rebuild capability
- WORM vault with chain integrity
- Method registry (SHA256 locked)
- 14 Golden Zones, 2020–present
- 24-field canonical schema
- Golden test suite

---

## What Sovereign Mode Does NOT Do

- No external API calls
- No data ingestion
- No lifecycle emissions
- No marginal emissions
- No speculative modeling
- No AI in calculation layer

All data must already exist in canonical directories.

---

## Security

- Container runs as non-root user (eve:1001)
- Data mounted read-only in Light Edition
- No network egress required
- No secrets or API keys inside container
