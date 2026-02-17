# SOURCE_CONTRACTS_BUILDING_RULES.md
# Status: TEMPLATE — fill per country during step_1
# Version: 0.1 (draft)
# Date: 2026-02-15

## Purpose
Document the authoritative source for building energy regulations per country.
Each entry must have: authority name, regulation name, URL, version/year, and key values.

---

## Template per country

```
## [COUNTRY_CODE] — [Country Name]

**Authority:** [Name of building authority]
**Regulation:** [Name and code, e.g. "BBR 29 (BFS 2024:XX)"]
**URL:** [Official URL to regulation text or summary]
**Version/Year:** [When this version took effect]
**Climate zones:** [If applicable, list zones]

### Residential U-value limits (new construction)

| Element | U-value (W/m²K) | Climate zone | Source section |
|---------|-----------------|--------------|----------------|
| Wall | | | |
| Roof | | | |
| Floor | | | |
| Windows | | | |

### Primary energy requirement
- Value: ___ kWh/m²/year (Atemp)
- System boundary: [What's included]
- Weighting factors: [If applicable]

### Notes
- [Any caveats, recent changes, pending updates]

### Verification
- Fetched: [date]
- Verified by: [human/name]
- Status: ⬜ DRAFT | ✅ VERIFIED
```

---

## SE — Sweden

**Authority:** Boverket
**Regulation:** BBR (Boverkets byggregler), latest: BFS 2024:xx
**URL:** https://www.boverket.se/sv/byggande/bygga-nytt/energi/
**Version/Year:** 2024
**Climate zones:** I (north), II, III, IV (south)

### Residential U-value limits (new construction)

| Element | U-value (W/m²K) | Climate zone | Source section |
|---------|-----------------|--------------|----------------|
| Wall | | I-IV (varies) | BBR 9:4 |
| Roof | | I-IV | BBR 9:4 |
| Floor | | I-IV | BBR 9:4 |
| Windows | | I-IV | BBR 9:4 |

### Primary energy requirement
- Value: varies by climate zone (75-130 kWh/m²/year range)
- System boundary: Primärenergi (PE)
- Weighting factors: elfaktor 1.6, fjärrvärme 0.7, etc.

### Verification
- Fetched: pending
- Status: ⬜ DRAFT

---

## DE — Germany
**Authority:** BMWK / DIBt
**Regulation:** GEG (Gebäudeenergiegesetz) 2024
**URL:** https://www.gesetze-im-internet.de/geg/
**Status:** ⬜ DRAFT

---

## FR — France
**Authority:** Ministry of Ecological Transition
**Regulation:** RE 2020
**URL:** https://www.ecologie.gouv.fr/reglementation-environnementale-re2020
**Status:** ⬜ DRAFT

---

## ES — Spain
**Authority:** Ministerio de Transportes
**Regulation:** CTE DB-HE
**URL:** https://www.codigotecnico.org/
**Status:** ⬜ DRAFT

---

## PL — Poland
**Authority:** Ministry of Development
**Regulation:** Warunki Techniczne (WT) 2021
**URL:** https://isap.sejm.gov.pl/
**Status:** ⬜ DRAFT
