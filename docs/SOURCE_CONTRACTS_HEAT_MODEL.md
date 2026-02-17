# SOURCE_CONTRACTS_HEAT_MODEL.md
# Status: LOCKED
# Version: 0.1 (draft)
# Date: 2026-02-15

## Purpose
Lock primary data sources for the heat model before any ingest begins.
Three decisions must be made and documented here before code runs.

---

## DECISION 1: Primary HDD Source

**Status:** ⬜ NOT LOCKED

**Candidates:**
| Source | Coverage | Resolution | Access | Notes |
|--------|----------|------------|--------|-------|
| ERA5 (Copernicus CDS) | Global | Grid → country aggregation needed | API (free, CDS account) | Gold standard, but requires processing |
| EEA HDD Indicator | EU27 | Country-level | Download (CSV/JSON) | Pre-aggregated, but check update freq |
| Eurostat (nrg_chdd_a) | EU27 | Country/NUTS2 | REST API | Annual HDD, may lag 1-2 years |

**Requirements:**
- Must cover all 27 EU member states
- Must support custom base temperatures (18/19/20°C) OR provide standard 15.5°C/18°C base
- Must be deterministic (same query → same result)
- Must be citable with a stable URL

**Locked choice:** Eurostat nrg_chdd_a
**Endpoint/URL:** https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/nrg_chdd_a
**Base temperature available:** ~15.5°C (standard Eurostat). Scaling to 18/19/20°C via documented formula.
**Field mapping:**
- Country: geo (ISO 2-letter)
- HDD value: OBS_VALUE
- Year/period: TIME_PERIOD
- Unit: Degree-days (base ~15.5°C)

**v2 upgrade path:** ERA5 via Copernicus CDS for custom base temperatures.

**Fallback if setpoint not supported:**
- If source only provides HDD(15.5°C), document linear scaling formula with evidence
- Formula: HDD(T_base) ≈ HDD(15.5) * (T_base - T_avg) / (15.5 - T_avg)
- This is an approximation and must be flagged in UI as "Estimated"

---

## DECISION 2: Building Typology / U-values

**Status:** ⬜ NOT LOCKED

**Candidates:**
| Source | Coverage | Data type | Access | Notes |
|--------|----------|-----------|--------|-------|
| TABULA/EPISCOPE | ~20 EU countries | U-values by building type/age | Web (webtool.building-typology.eu) | Reference standard, may need scraping |
| National BBR/regulations | Per country | Regulatory U-value limits | Official authority pages | Most accurate for "code minimum" |
| EU_BASELINE fallback | All EU | Assumed typical values | Internal | Clearly flagged as assumption |

**Requirements:**
- U-values for: wall, roof, floor, windows (W/m²K)
- Per country minimum
- Evidence URL per country
- Version/year of regulation

**Locked choice:** Nationella regler (handcurated per pilot country) + EU_BASELINE fallback
**Primary source:** Official national building authority per country (BBR, GEG, RE2020, CTE, WT)
**Secondary source:** TABULA/EPISCOPE for supplementary U-values where national regs lack detail
**Fallback policy:**
- If country has national regulation → use official values with evidence URL
- If national reg unavailable but TABULA has data → use TABULA, flag source
- If neither → use EU_BASELINE profile, flag as "Estimated (no country data)"

**Per-country status (fill in during step_1):**
| Country | Source | U_wall | U_roof | U_floor | U_window | Evidence URL | Status |
|---------|--------|--------|--------|---------|----------|--------------|--------|
| SE | Boverket BBR | | | | | | ⬜ |
| DE | EnEV/GEG | | | | | | ⬜ |
| FR | RT/RE 2020 | | | | | | ⬜ |
| ES | CTE DB-HE | | | | | | ⬜ |
| PL | WT 2021 | | | | | | ⬜ |

---

## DECISION 3: CAPEX Basis (Extra Insulation Cost)

**Status:** ⬜ NOT LOCKED

**Candidates:**
| Source | Coverage | Data type | Notes |
|--------|----------|-----------|-------|
| Boverket kostnadskatalog | SE only | SEK/m² per insulation type | Official |
| National construction cost indexes | Per country | Varies | Need research per country |
| Assumption range | All | Low/med/high EUR/m² | Explicitly flagged |

**Requirements:**
- EUR/m² (or local currency + conversion) for additional insulation
- Broken down by: wall, roof, floor, windows
- Must state whether it's "evidence" or "assumption"

**Locked choice:** Assumption range (low/med/high) per building element, tydligt flaggat i UI.

**V1 CAPEX schema (per building element, EUR/m² element area):**

| Element | Low | Medium | High | Unit | Basis |
|---------|-----|--------|------|------|-------|
| Wall insulation (extra) | 25 | 45 | 70 | EUR/m² wall | Published renovation studies 2022-2024 |
| Roof insulation (extra) | 15 | 30 | 50 | EUR/m² roof | Published renovation studies 2022-2024 |
| Floor insulation (extra) | 20 | 40 | 65 | EUR/m² floor | Published renovation studies 2022-2024 |
| Window upgrade (ΔU) | 80 | 150 | 250 | EUR/m² window | Published renovation studies 2022-2024 |

**assumption_flag:** true (ALL values in v1)
**UI must show:** "⚠ Assumption range (v1). Not country-specific."

**Upgrade path:**
- v2: Replace with Boverket (SE) + BMWK (DE) evidence-backed values
- v3: Country-specific from national construction cost databases
- Each upgrade replaces assumption_flag=true → false per element per country

**Payback display policy:**
- Always show as range: "Payback: 8–18 years"
- Always show sensitivity: breakeven price
- Never show single-point payback without range
- UI badge: "⚠ Assumption v1" clickable to methodology

---

## Rate Limit / Access Policy

| Source | Rate limit | Auth | Notes |
|--------|-----------|------|-------|
| Copernicus CDS | Queue-based | API key | Register at cds.climate.copernicus.eu |
| Eurostat | No published limit | None | Polite delay 500ms |
| EEA | No published limit | None | Download files |

---

## Null Handling

- Missing HDD for a country → exclude from derived, show "Data not available"
- Missing U-values → use EU_BASELINE, flag "Estimated"
- Missing CAPEX → show payback as range with "Assumed cost" label
- Never silently fill in data. Every fallback must be visible in UI.

---

## Signing

When all three decisions are locked, update status to LOCKED and commit.

| Decision | Locked by | Date | Choice |
|----------|-----------|------|--------|
| HDD Source | Joakim | 2026-02-15 | Eurostat nrg_chdd_a + scaling formula |
| Typology Source | Joakim | 2026-02-15 | National regs (5 pilot) + EU_BASELINE fallback |
| CAPEX Basis | Joakim | 2026-02-15 | Assumption range (low/med/high) per element, flagged |
