# Report Template Changelog

Template version is embedded in every generated PDF and sealed in the report vault.
Changes to template text affect `pdf_hash` but never `dataset_eve_id`, `root_hash`, or `query_hash`.

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
