# Report Template Changelog

Template version is embedded in every generated PDF and sealed in the report vault.
Changes to template text affect `pdf_hash` but never `dataset_eve_id`, `root_hash`, or `query_hash`.

---

## 1.2 — 2026-02-17

**Added:** Deterministic ECB FX conversion layer.

- SV reports now show spot prices in kr/kWh (converted from EUR/MWh)
- EN reports remain in EUR/MWh (unchanged)
- FX rate locked to ECB monthly average for report period start month
- FX data file: `packages/evidence/src/fx/ecb_eur_sek_monthly.json`
- FX file hash (SHA256) stored in report vault per entry
- Conversion formula: `(EUR/MWh × ecb_rate) ÷ 1000 = kr/kWh`
- Verification block includes `fx_rate` and `fx_file_hash`
- Report vault schema extended: `fx_rate`, `fx_period`, `fx_source`, `fx_file_hash`

**Impact:**
- `pdf_hash`: Changes for SV reports (new price format + FX metadata)
- `pdf_hash`: Changes for EN reports (FX metadata in verification block)
- `query_hash`: Unchanged (computation layer)
- `dataset_eve_id`: Unchanged (data layer)
- `root_hash`: Unchanged (data layer)

**Source:** ECB Data Portal API `EXR.M.SEK.EUR.SP00.A` (2020-01 to 2026-01)

**Architectural rule:** FX is presentation-layer only. If FX data file changes → detectable via `fx_file_hash` divergence in vault.

---

## 1.1 — 2026-02-17

**Changed:** Disclaimer text in EN and SV locale files.

Before (1.0):
> EVE does not claim normative truth. EVE provides a reproducible computational reference.
> Document language affects PDF hash but not dataset identity or computational results.

After (1.1):
> EVE Electricity Witness is built on publicly available regulatory data sources (ENTSO-E, EEA, ERA5).
> This system is independently built and is not an official publication from any transmission system
> operator or regulatory authority. This platform is designed so that authorities, journalists and
> independent experts can verify, challenge and reproduce all results.

**Impact:**
- `pdf_hash`: Changes for all new reports (expected — document layer)
- `query_hash`: Unchanged (computation layer)
- `dataset_eve_id`: Unchanged (data layer)
- `root_hash`: Unchanged (data layer)

**Reason:** Legal positioning — explicit independence statement and invitation to verify.

---

## 1.0 — 2026-02-17

Initial template. EN and SV locale files.
