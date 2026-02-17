# Challenge EVE — Independent Verification Guide

EVE is a deterministic reference implementation for electricity system data.

This document explains how to independently verify a dataset.

---

# 1. Identify Dataset

Example:

EVE-TSV2-SE3-20260215-TS_V2_EEA_2023_DIRECT

Fetch metadata:

GET /api/audit/dataset/{dataset_eve_id}

---

# 2. Verify Methodology

Confirm:

- methodology_version
- emission_scope
- registry_hash

Compare registry_hash with:

docs/METHOD_REGISTRY_V2.md

Compute SHA256 locally and confirm match.

---

# 3. Rebuild Dataset

Run:

npx tsx packages/evidence/src/build_timeseries_v2.ts --zones SE3 --skip-vault

Expected result:

root_hash must equal value returned by audit endpoint.

---

# 4. Verify File Integrity

Each monthly NDJSON file includes SHA256 in audit response.

Recalculate file hashes and confirm match.

---

# 5. Verify Vault Integrity

Audit response includes:

- event_index
- event_hash
- chain_hash
- prev_hash

Confirm:

- event_hash = SHA256(stableStringify(event))
- chain_hash = SHA256(prev_hash + event_hash)

Vault is append-only.

No deletion or mutation allowed.

---

# 6. What EVE Does Not Do

- No lifecycle emissions
- No marginal emissions
- No retroactive recalculation
- No AI-based estimation in calculation layer
- No speculative flow modeling

All assumptions are documented in METHOD_REGISTRY_V2.md

---

# 7. Reporting Discrepancies

If mismatch is detected:

Provide:

- dataset_eve_id
- expected_root_hash
- computed_root_hash
- environment details

EVE prioritizes reproducibility and transparency.
