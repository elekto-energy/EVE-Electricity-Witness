# EVE Timeseries V2 — Release Notes

**Version:** v2.0.0-locked  
**Tag date:** 2026-02-17  
**Status:** Locked  

---

## Scope

### Geographic: 14 Golden Zones

| Region | Zones |
|--------|-------|
| Sweden | SE1, SE2, SE3, SE4 |
| Norway | NO1 (Oslo), NO2 (Kristiansand) |
| Finland | FI |
| Germany | DE_LU |
| Poland | PL |
| Baltics | EE, LV, LT |
| EU Core | FR, NL |

Any zone addition requires V3.

### Temporal

- Core period: 2020-01-01 → present
- Historical extension: 2019 (separately sealed, transitional_reporting quality flag)

---

## Methodology

- **Version:** TS_V2_EEA_2023_DIRECT
- **Emission scope:** direct_combustion_only
- **Registry hash:** 83CCEEBC71A265CB7B7482AA29BB9A4DF966460DEABEBA5809F59C3ADF320628
- **Registry file:** docs/METHOD_REGISTRY_V2.md

---

## Data Sources

| Dataset | Source | Resolution |
|---------|--------|------------|
| Day-ahead prices (A44) | ENTSO-E Transparency Platform | PT60M |
| Generation per type (A75) | ENTSO-E Transparency Platform | PT15M → PT60M |
| Physical flows (A11) | ENTSO-E Transparency Platform | PT60M |
| Weather | Open-Meteo ERA5 Archive | Hourly |
| Emission factors | EEA 2023 | Static |

---

## Schema

Each canonical row contains exactly **24 fields**:

ts, zone, spot, temp, wind_speed, solar_rad, hdd, nuclear_mw, hydro_mw, wind_onshore_mw, wind_offshore_mw, solar_mw, gas_mw, coal_mw, lignite_mw, oil_mw, other_mw, total_gen_mw, net_import_mw, production_co2_g_kwh, consumption_co2_g_kwh, emission_scope, resolution_source, dataset_eve_id

No field addition or removal without version bump to V3.

---

## Build Statistics

- **Total rows:** 756,336
- **Total files:** 1,036
- **Zones:** 14/14
- **Period:** 2020-01 → 2026-02
- **Vault entries:** 14 sealed (indices 27–40)

---

## Golden Test Suite

9/9 tests pass:

1. ✅ Zone Coverage: 14/14
2. ✅ CO₂ Bounds: production [0, 1200], consumption [0, 1500]
3. ✅ PT15M Leakage: none
4. ✅ Flow Symmetry: all interconnected zones have net_import data
5. ✅ Field Count: 24 per row
6. ✅ Methodology Lock: TS_V2_EEA_2023_DIRECT
7. ✅ Config Immutability: 14 zones, 2020-01-01 start
8. ✅ Vault Chain Integrity: append-only, chain verified
9. ✅ Registry Lock: SHA256 anchored

---

## Integrity

- Deterministic rebuild verified: same input → identical root_hash
- WORM vault: append-only, SHA-256 chain, duplicate rejection
- Audit endpoint: GET /api/audit/dataset/{id}
- Challenge guide: docs/CHALLENGE_EVE.md

---

## Known Limitations

- Import CO₂ uses EU average factor (242 gCO₂/kWh)
- No marginal emissions modeling
- No lifecycle emissions (Scope 2/3)
- No demand-side attribution
- NO2↔SE3 and NO2↔SE4: no ENTSO-E flow data (NO2 connects to DK1, not directly to SE)
- No real-time balancing market integration

---

## What Requires V3

- New zone additions
- Emission factor updates
- Schema field additions or removals
- Aggregation rule changes
- Scope changes (marginal, lifecycle)
- Import CO₂ zonal attribution

---

## Verification

```
npx tsx packages/evidence/src/golden/golden_test_v2.ts
npx tsx packages/evidence/src/build_timeseries_v2.ts --zones SE1,SE2,SE3,SE4,NO1,NO2,FI,DE_LU,PL,EE,LV,LT,FR,NL --skip-vault
GET /api/audit/dataset/{dataset_eve_id}
```

---

## Definition of Done

V2 is locked when all of the following are true:

- [x] 14/14 Golden Zones built and sealed
- [x] 24-field schema enforced per row
- [x] Golden test suite 9/9 pass
- [x] Method registry hashed and anchored
- [x] WORM vault chain verified
- [x] Audit endpoint returns root_hash_match: true
- [x] Deterministic rebuild produces identical root_hash
- [x] CHALLENGE_EVE.md published
- [x] Git tag v2.0.0-locked applied
