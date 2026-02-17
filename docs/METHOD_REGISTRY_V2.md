# EVE Method Registry — Timeseries V2

Version: TS_V2_EEA_2023_DIRECT  
Status: Locked  
Effective from: 2020-01-01  
Scope: 14 Golden Zones  
Registry Hash: 83CCEEBC71A265CB7B7482AA29BB9A4DF966460DEABEBA5809F59C3ADF320628  
Registry Hash Note: SHA256 computed on file with placeholder text "(to be generated and sealed)"

---

# 1. Purpose

This document defines the exact computational methodology used in
EVE Timeseries V2.

The purpose of this registry is:

- To ensure methodological transparency
- To prevent implicit mutation of historical calculations
- To enable deterministic rebuild and verification
- To support audit and AI Act alignment

EVE does not claim normative truth.

EVE provides a reproducible computational reference implementation.

---

# 2. Scope Definition

## 2.1 Geographic Scope (Golden Zones)

- SE1
- SE2
- SE3
- SE4
- NO1
- NO2
- FI
- DE_LU
- PL
- EE
- LV
- LT
- FR
- NL

## 2.2 Time Scope

Primary (V2 Core): 2020-01-01 → Present  
Historical Extension: 2019 (separately sealed)

---

# 3. Data Sources

## 3.1 Day-Ahead Prices (A44)
Source: ENTSO-E Transparency Platform  
Resolution: Hourly (PT60M canonical)

## 3.2 Generation per Type (A75)
Source: ENTSO-E Transparency Platform  
Resolution: PT15M aggregated to PT60M

## 3.3 Physical Flows (A11)
Source: ENTSO-E Transparency Platform  
Resolution: PT60M

## 3.4 Weather Data
Source: Open-Meteo ERA5 Archive  
Variables:
- Temperature (°C)
- Wind speed (m/s)
- Solar radiation (W/m²)

---

# 4. Canonical Data Model (V2Row)

Each row contains exactly 24 fields:

ts  
zone  
spot  
temp  
wind_speed  
solar_rad  
hdd  
nuclear_mw  
hydro_mw  
wind_onshore_mw  
wind_offshore_mw  
solar_mw  
gas_mw  
coal_mw  
lignite_mw  
oil_mw  
other_mw  
total_gen_mw  
net_import_mw  
production_co2_g_kwh  
consumption_co2_g_kwh  
emission_scope  
resolution_source  
dataset_eve_id  

No additional fields permitted without version bump.

---

# 5. Aggregation Rules

## 5.1 Temporal Aggregation

If source resolution = PT15M:

PT60M value = arithmetic mean of 4 consecutive PT15M values.

No weighted adjustment applied.

---

# 6. CO₂ Methodology

## 6.1 Methodology Version

TS_V2_EEA_2023_DIRECT

## 6.2 Emission Scope

direct_combustion_only

Lifecycle emissions excluded.  
Marginal emissions excluded.  
Scope 3 excluded.

## 6.3 Emission Factors

Source: European Environment Agency (EEA), 2023 dataset.

Applied per fuel type:

- Gas
- Coal
- Lignite
- Oil

Zero emissions assigned to:

- Nuclear
- Hydro
- Wind
- Solar

## 6.4 Production CO₂

production_co2_g_kwh =
Σ(fuel_mw × emission_factor) / total_gen_mw

## 6.5 Consumption CO₂

consumption_co2_g_kwh =
production_co2_g_kwh + import_adjustment

Import adjustment (V2 default):
242 gCO2/kWh (EU average)

No zonal import attribution in V2.

---

# 7. Heating Degree Days (HDD)

HDD_18 = max(0, 18 - temperature_c)

Calculated hourly.

No seasonal normalization applied.

---

# 8. Interconnection Rules

Only physically existing interconnectors are modeled.

No speculative flow modeling.

Net import =
imports − exports

Flow symmetry validated during build.

---

# 9. Determinism Guarantees

- Same raw input → identical dataset_eve_id
- Same input → identical root_hash
- Append-only vault
- No retroactive mutation allowed

---

# 10. Data Quality Handling

No interpolation applied.

Missing data:
- Logged
- Documented in manifest
- Not implicitly corrected

Historical extension (2019) marked as:
data_quality_level: transitional_reporting

---

# 11. Known Limitations

- Import CO₂ uses EU average factor
- No marginal emissions modeling
- No lifecycle emissions modeling
- No demand-side emissions attribution
- No real-time balancing market integration

---

# 12. Governance Principles

- No silent methodological changes
- Version bump required for:
  - Emission factor updates
  - Scope updates
  - Field additions
  - Aggregation rule changes
- All changes must be documented and sealed

---

# 13. AI Act Alignment

EVE V2:

- Does not use opaque AI models in calculation layer
- Uses deterministic computation
- Provides full reproducibility
- Supports audit and human oversight
- Separates method registry from application layer

---

# 14. Change Log

TS_V2_EEA_2023_DIRECT — Initial locked release
