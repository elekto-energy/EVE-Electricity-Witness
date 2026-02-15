# Assumptions — ELEKTO EU v1.0.0

Every computed value in ELEKTO EU depends on explicit assumptions.
This document lists all assumptions used in V1. The Assumption Inspector
in the UI displays the relevant subset for any given view.

## Building Profile

| Parameter | Default | Unit | Source |
|-----------|---------|------|--------|
| Floor area | 150 | m² | EU average residential |
| Floors | 2 | — | Assumed |
| Ceiling height | 2.5 | m | Standard |
| Window-to-wall ratio | 15 | % | EPBD typical |

## U-Values (per country, example: Sweden)

| Element | U-value | Unit | Source |
|---------|---------|------|--------|
| Wall | 0.18 | W/(m²·K) | BBR (Boverket) |
| Roof | 0.13 | W/(m²·K) | BBR |
| Floor | 0.15 | W/(m²·K) | BBR |
| Window | 1.2 | W/(m²·K) | BBR |

Full profiles per country are stored in `data/canonical/building_profiles/`.

## Climate

| Parameter | Value | Source |
|-----------|-------|--------|
| HDD base temperature | 18°C | Eurostat definition |
| Temperature adjustment | Linear scaling | See methodology §3 |

## Heating Systems

| Parameter | Value | Source |
|-----------|-------|--------|
| Direct electric COP | 1.0 | Physics (resistive heating) |
| Air-air SCOP range | 2.2–4.0 | EN 14825 typical range |
| Air-water SCOP range | 2.0–3.5 | EN 14825 typical range |
| Ground source SCOP range | 3.5–4.2 | EN 14825 typical range |
| Uncertainty band | ±15% | Displayed in UI |

## Economic

| Parameter | Value | Source |
|-----------|-------|--------|
| Analysis period | 20 years | Industry standard |
| Discount rate | 0% (undiscounted) | V1 simplification |
| Installation cost reference | Sweden | Scaled per country |
| Cost index source | Eurostat construction | Updated annually |

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | 2026-02-15 | Initial assumptions |
