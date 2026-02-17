# ELEKTO.eu — RUNBOOK

> Operational runbook for the ELEKTO.eu witness platform.
> All commands assume PowerShell on Windows. Project root: `D:\EVE11\Projects\013_elekto_eu`

---

## 1. Project Overview

ELEKTO.eu is an EVE witness-mode platform for Swedish electricity market transparency.
It presents ENTSO-E spot prices, weather correlations, congestion revenues, price structure,
and Riksdag statements — without interpretation.

**Principle:** AI may propose and challenge — never decide. Korrelation ≠ orsak.

**Stack:** Next.js 15 · React 19 · TypeScript · Canonical JSON data store · Evidence manifests

---

## 2. Quick Start

```powershell
cd D:\EVE11\Projects\013_elekto_eu

# Install dependencies (if needed)
npm install

# Start dev server
npm run dev --prefix apps/web
# → http://localhost:5174
```

---

## 3. Pages & Routes

| Route | Description | Key Components |
|-------|-------------|----------------|
| `/spot` | Live spot prices (day) + historical spot & weather | `SpotChart`, `SpotTable`, `SpotHistoryPanel` |
| `/witness` | Topic overview (energipolitik) | `WitnessTopicList` |
| `/witness/price-structure` | Prisstruktur, flaskhals, producentresultat | `PriceCompositionPanel`, `SpotHistoryPanel`, `CongestionRevenuePanel`, `ProducerFinancialsPanel` |
| `/witness/statements` | Riksdagen anföranden | `StatementCard`, `StatementsFilters` |
| `/witness/decisions` | Decision graph | `WitnessChainView` |
| `/opinion` | Opinion layer (ej witness) | — |
| `/methodology` | Metodbeskrivning | — |

---

## 4. API Endpoints

### 4.1 Spot Prices

| Endpoint | Params | Source |
|----------|--------|--------|
| `GET /api/spot/day` | `zone=SE3&date=2026-02-14` | ENTSO-E canonical |
| `GET /api/spot/compare` | `zones=SE1,SE2,SE3,SE4&date=2026-02-14` | ENTSO-E canonical |

### 4.2 Witness APIs

| Endpoint | Params | Source |
|----------|--------|--------|
| `GET /api/witness/price-structure` | — | `spot_annual` + `congestion_revenue` + `weather_annual` |
| `GET /api/witness/weather-correlation` | `zone=SE3&res=month&from=2016-01-01&to=2025-12-31` | ENTSO-E + ERA5 |
| `GET /api/witness/statements` | — | Riksdagen canonical |
| `GET /api/witness/decisions` | — | Decision graph canonical |
| `GET /api/witness/pulse` | — | EnergyPulsePanel data |
| `GET /api/witness/topics` | — | Topic list |
| `GET /api/witness/topic` | `id=...` | Single topic |
| `GET /api/witness/chain` | — | Witness chain |
| `GET /api/registry/zones` | — | SE1-SE4 zone metadata |

### 4.3 Weather Correlation Parameters

| Param | Values | Default |
|-------|--------|---------|
| `zone` | `SE1` / `SE2` / `SE3` / `SE4` | required |
| `res` | `day` / `week` / `month` / `year` | required |
| `from` | `YYYY-MM-DD` | `2016-01-01` |
| `to` | `YYYY-MM-DD` | `2025-12-31` |

Spot conversion: `EUR/MWh × 11.49 / 1000 × 100 = öre/kWh` (fixed rate).

---

## 5. Data Ingest Scripts

All scripts in `packages/evidence/src/`. Run from project root.

### 5.1 ENTSO-E Day-Ahead (single day)

```powershell
npx tsx packages/evidence/src/ingest_entsoe_dayahead.ts
```

Fetches today's/tomorrow's day-ahead prices for SE1-SE4.
Output: `data/canonical/entsoe/entsoe_dayahead_SE_YYYYMMDD/day_ahead_prices.json`

### 5.2 ENTSO-E Bulk (historical, 2016–2026)

```powershell
npx tsx packages/evidence/src/ingest_entsoe_bulk.ts
```

Fetches all months 2016-01 → current. Already ingested: **122 months, 15,284+ records**.
Output: `data/canonical/entsoe/entsoe_dayahead_SE_YYYYMM/day_ahead_prices.json`
Format: Hourly EUR/MWh per zone.

### 5.3 Weather (Open-Meteo ERA5)

```powershell
npx tsx packages/evidence/src/ingest_openmeteo_weather.ts
```

Fetches 2016-01-01 → 2025-12-31 daily weather for 4 representative points.
Runtime: ~10 seconds (4 API calls).

**Coordinates:**

| Zone | City | Lat | Lon |
|------|------|-----|-----|
| SE1 | Luleå | 65.58 | 22.15 |
| SE2 | Sundsvall | 62.39 | 17.31 |
| SE3 | Stockholm | 59.33 | 18.07 |
| SE4 | Malmö | 55.60 | 13.00 |

**Variables fetched:**
- `temperature_2m_mean` → °C
- `shortwave_radiation_sum` → MJ/m² → kWh/m² (÷3.6)
- `sunshine_duration` → seconds → hours (÷3600)
- `wind_speed_10m_max` → km/h → m/s (÷3.6)

**Output:**

| File | Content |
|------|---------|
| `data/canonical/weather/weather_SE{1-4}_daily.json` | Compact daily: `{d,t,s,sh,w}` |
| `data/canonical/weather/weather_SE{1-4}_monthly.json` | Monthly + annual aggregates |
| `data/canonical/weather/weather_annual_combined.json` | All zones combined |

### 5.4 Riksdagen Statements

```powershell
npx tsx packages/evidence/src/ingest_riksdagen_anf.ts
npx tsx packages/evidence/src/ingest_riksdagen_docs.ts
```

### 5.5 Decision Graph

```powershell
npx tsx packages/evidence/src/build_decision_graph.ts
```

---

## 6. Canonical Data Layout

```
data/canonical/
├── entsoe/                     # ENTSO-E day-ahead prices
│   ├── entsoe_dayahead_SE_YYYYMM/    # Monthly (bulk)
│   │   └── day_ahead_prices.json
│   └── entsoe_dayahead_SE_YYYYMMDD/   # Daily
│       └── day_ahead_prices.json
├── weather/                    # Open-Meteo ERA5
│   ├── weather_SE{1-4}_daily.json
│   ├── weather_SE{1-4}_monthly.json
│   └── weather_annual_combined.json
├── congestion/                 # Ei congestion revenue
│   └── congestion_revenue_v1.json
├── prices/                     # Price breakdown
│   └── price_breakdown_v1.json
├── statements/                 # Riksdagen
├── decisions/                  # Decision graph
├── opinion/                    # Opinion layer
├── registries/                 # Zone registry etc
├── linking/                    # Statement-decision links
├── smhi/                       # (legacy, abandoned)
└── witness/                    # Witness chain
```

---

## 7. UI Components

### 7.1 SpotHistoryPanel (`components/price/SpotHistoryPanel.tsx`)

Integrated panel on `/spot` and `/witness/price-structure`.

**Controls:**
- Zone selector: SE1 / SE2 / SE3 / SE4
- Resolution: År / Månad / Vecka / Dag
- Date range: from/to (hidden in year view)
- Totalkostnad checkbox (year view only)

**Views:**
- **År:** Bar chart (spot per zone) + temp annotation + total cost table
- **Månad/Vecka/Dag:** Fetches `/api/witness/weather-correlation`, shows dual-axis SVG chart (spot + temp), Pearson r(spot,temp), data table with inline bars

**Data sources per view:**

| Resolution | Spot source | Weather source |
|------------|-------------|----------------|
| År | `spot_annual` (Nord Pool) | `weather_annual_combined.json` |
| Månad/Vecka/Dag | ENTSO-E bulk (EUR/MWh → öre/kWh) | ERA5 daily |

**Pearson r(spot,temp):** Negative = colder → higher price. Displayed with "Korrelation ≠ orsak."

### 7.2 CongestionRevenuePanel

Congestion revenue vs usage bar chart (2017–2025*). Ackumulerat saldo vs planerade investeringar.
Sources: Ei annual reports, Svenska kraftnät, Second Opinion.

### 7.3 PriceCompositionPanel

Elräkningens uppdelning: spot, nät, skatt, moms.

### 7.4 ProducerFinancialsPanel

Placeholder for Fas C: Vattenfall/Fortum PDF ingest.

---

## 8. Evidence & Manifests

```powershell
# Generate evidence manifests
python scripts\hash_tree.py --input_dir data\canonical\weather --out_dir manifests\weather --run_id weather_era5_v1
python scripts\hash_tree.py --input_dir data\canonical\entsoe --out_dir manifests\entsoe --run_id entsoe_bulk_v1
```

Each manifest contains SHA-256 hashes of all canonical files. Root hash seals the dataset.

---

## 9. Unit Conversions Reference

| Conversion | Formula |
|-----------|---------|
| EUR/MWh → öre/kWh | `× 11.49 / 1000 × 100` (fixed SEK/EUR) |
| MJ/m² → kWh/m² | `÷ 3.6` |
| km/h → m/s | `÷ 3.6` |
| seconds → hours | `÷ 3600` |

---

## 10. Witness-Mode Rules

1. **No interpretation.** Panel shows data, user draws conclusions.
2. **Korrelation ≠ orsak.** Explicit disclaimer on all correlation views.
3. **No source, no number.** Every figure has a traceable source.
4. **Taxonomy separation.** Retail ≠ Generation ≠ Systemoperatör. Never mix revenue streams.
5. **No motive claims.** Never "staten tjänar på…" — only "statliga intäkter som korrelerar med prisnivå."
6. **Observation section lists what is NOT shown** (vattenkraft, gas, politik, transmission).

---

## 11. Task Spec

Active task: `tasks/TASK_PRICE_STRUCTURE_PROFIT_BAROMETER_V1.yaml`

**Phases:**

| Phase | Status | Description |
|-------|--------|-------------|
| A: Price Breakdown | ✅ | PriceCompositionPanel + SpotHistoryPanel + weather |
| B: Congestion Revenue | ✅ | CongestionRevenuePanel (Ei data) |
| C: Producer Financials | ⏳ | PDF ingest Vattenfall/Fortum annual reports |

---

## 12. Pending Work

| Item | Priority | Description |
|------|----------|-------------|
| Fas C: Producer Financials | P1 | PDF ingest Vattenfall/Fortum → canonical |
| Evidence manifests weather | P2 | Run `hash_tree.py` for weather data |
| Decision detail page | P2 | UI with linked statements panel |
| Heat model step_1 | P3 | Eurostat HDD ingest for pilot countries |
| SeatNav P0 bug | P0 | ESPN data not indexed in unified search |

---

## 13. Troubleshooting

### Dev server won't start

```powershell
cd D:\EVE11\Projects\013_elekto_eu
npm run dev --prefix apps/web
```

Do NOT use `cd apps/web && npm run dev` — PowerShell doesn't support `&&`.

### Weather correlation returns empty

1. Verify weather data exists: `dir data\canonical\weather\`
2. Verify ENTSO-E bulk data exists: `dir data\canonical\entsoe\ | Measure-Object`
3. Re-run ingest: `npx tsx packages/evidence/src/ingest_openmeteo_weather.ts`

### ENTSO-E data missing for a month

```powershell
# Check specific month
dir data\canonical\entsoe\entsoe_dayahead_SE_202301\

# Re-run bulk ingest (idempotent, skips existing)
npx tsx packages/evidence/src/ingest_entsoe_bulk.ts
```

### Port already in use

Next.js runs on port 5174. Kill existing process:

```powershell
netstat -ano | findstr :5174
taskkill /PID <pid> /F
```
