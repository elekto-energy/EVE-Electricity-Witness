# Data Sources — ELEKTO EU v1.0.0

## Active Sources (V1)

### ENTSO-E Transparency Platform
- **Data:** Day-ahead electricity prices per bidding zone
- **URL:** https://transparency.entsoe.eu/
- **API:** ENTSO-E Restful API (requires security token)
- **Update frequency:** Hourly (cache: 15 min)
- **License:** ENTSO-E Open Data
- **Format:** XML → canonical JSON
- **Coverage:** All EU bidding zones

### Eurostat — Electricity Price Components
- **Data:** Energy, network, taxes, VAT breakdown for households
- **URL:** https://ec.europa.eu/eurostat/databrowser/
- **Dataset ID:** `nrg_pc_204`
- **Update frequency:** Semi-annual (cache: 24h)
- **License:** Eurostat Copyright / CC BY 4.0
- **Format:** TSV/SDMX → canonical JSON
- **Coverage:** EU-27

### Eurostat — Heating Degree Days (HDD)
- **Data:** HDD per country (and later NUTS2)
- **URL:** https://ec.europa.eu/eurostat/databrowser/
- **Dataset ID:** `nrg_chdd_a` (annual), `nrg_chdd_m` (monthly)
- **Update frequency:** Annual (new year data typically Q2)
- **License:** Eurostat Copyright / CC BY 4.0
- **Format:** TSV/SDMX → canonical JSON
- **Coverage:** EU-27

### SMHI Open Data
- **Data:** Swedish temperature observations
- **URL:** https://opendata.smhi.se/
- **API:** SMHI Open Data API
- **Update frequency:** 15–60 min (cache: 15 min)
- **License:** CC BY 4.0
- **Format:** JSON → canonical JSON
- **Coverage:** Sweden

### Copernicus Climate Change Service
- **Data:** EU-wide temperature data (harmonized)
- **URL:** https://climate.copernicus.eu/
- **API:** CDS API
- **Update frequency:** 15–60 min for reanalysis
- **License:** Copernicus Open Access
- **Format:** NetCDF/GRIB → canonical JSON
- **Coverage:** EU-27

### Building Profiles (curated)
- **Data:** U-values, building geometry, area per country
- **Source:** National building codes, EPBD cost-optimal studies
- **Update frequency:** Versioned, manually curated
- **License:** MIT (ELEKTO EU project)
- **Format:** JSON (schema-validated)
- **Coverage:** V1 start: SE, DE, FR, ES, PL, IT

## Ingest Verification

Every source ingest produces:
1. `manifest.json` — dataset ID, fetch timestamp, parameters
2. `files.sha256` — per-file checksums
3. `root_hash.txt` — single hash over all files

Verify any ingest:
```bash
python scripts/hash_tree.py data/canonical/<source>/<period>/
# Compare root_hash.txt with manifest
```

## Planned Sources (post-V1)

| Source | Data | Target |
|--------|------|--------|
| Nordpool | Spot prices (alternative) | V1.1 |
| National grid operators | Real-time fee schedules | V2 |
| ERA5 (ECMWF) | Hourly temperature reanalysis | V1.1 |

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | 2026-02-15 | Initial data sources |
