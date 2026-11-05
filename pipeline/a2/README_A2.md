# ELMONITOR A2 - automated, verifiable data chain

Owner decision: OWNER-GO 2026-11-03 "Elmonitor A2, lokal implementation" - build and test locally, offline.
Not approved: push, cloud resources, secrets, paid external runs, production or DNS changes. ei-backend-01 untouched.
v1/v2/v3 spike files are not modified; A2 imports spike/a_local_ingest/lib_v3.ts (verified in Spike A v3) and the
unchanged ENTSO-E clients in packages/evidence/src/.

Owner decision 2026-11-05: OWNER-GO option 1 "automatic updates" with the owner's Vercel Blob store (Stockholm);
same day, owner choice 1: run the update on Vercel (Cron + route), no keys on GitHub. DNS, ei-backend-01 and
deploy.yml stay untouched.

## What one run does

1. Load the last published version from the store and verify it (current.json -> manifest -> every object sha256).
   A version that fails verification stops the run (exit 2); nothing is built on unverified state.
2. Plan per series (13 price zones, 28 directed flow series):
   - every day from HISTORY_START (2026-02-01) to today (flows) / tomorrow (prices) that is not COMPLETE;
   - COMPLETE days of the last 14 days are re-fetched only as a revision check;
   - older COMPLETE days are not fetched again.
3. Acquire per request group (max 31 days) with the existing clients; FETCH_ERROR retried twice; every group is
   checkpointed in the work dir, so an interrupted run resumes with `--resume <run_id>` without refetching.
4. Interpret with the v3 rules: A03 expansion, DE_LU sequence 1 (no fallback), DK1/DK2 tolerance 1e-4 with the
   unlabeled series selected, exact equality elsewhere, flows running day IN_PROGRESS, hourly A5 from selected values.
5. Merge into the register (A3): new and improved days are taken; a COMPLETE day is never degraded (the refused
   result is kept visible as last_error REGRESSION_REFUSED); a changed COMPLETE day is REVISED with old/new hashes;
   a failed request keeps previous values and marks every planned day with last_error.
6. Build deterministic files and publish (see Publication). Unchanged content -> NO_CHANGE (no new version).

## Store layout (content-addressed; only current.json is mutable)

| Key | Content | Mutable |
|---|---|---|
| objects/<sha256>.json | data and coverage files, addressed by their sha256 | no |
| raw/<sha256>.xml | raw ENTSO-E response bodies that produced a published change | no |
| versions/<version_id>/MANIFEST.json | logical path -> object sha256/bytes, content hash, instrument hashes, previous version | no |
| runs/<run_id>.json | run report: plan, attempts, source errors, merges, revisions, refused regressions, publish result | no |
| current.json | pointer: version id, manifest key + sha256, content hash | yes (only key) |

Logical files in a version: `data/<prices|flows>/<series>/<YYYY-MM>.json` (per day: status, selected values,
hourly, missing_starts_utc), `coverage/<dataset>/<series>/<YYYY-MM>.json` (A3 register entries),
`coverage/summary.json` (per series: status counts, every not-complete day with missing count, unverified
selections, open errors, revisions), `meta.json` (scope, rules, status meanings).

A3 register entry: dataset, series, day, status, resolution, expected/present/missing intervals, duplicates within
tolerance, conflicts, selection {rule, decision_ref, verified}, source {provider, document type, request window,
raw_sha256, raw_bytes, fetched_at_utc, run_id}, values_sha256, last_changed_utc, revisions[], last_error.

Gaps: missing intervals are listed in `missing_starts_utc` and counted; no value is published for them, no hour is
derived from fewer than four quarters, nothing is interpolated. Coverage status and selection verification are
separate fields (DE_LU after 2026-11-03 is COMPLETE with selection.verified=false).

## Publication (previous valid version stays live on failure)

1. upload missing immutable objects and raw evidence; 2. read every object back and verify sha256;
3. upload the immutable manifest, read back, verify; 4. re-read current.json and require it still points to the
version this run started from (else CHECK_POINTER failure, nothing overwritten); 5. replace current.json;
6. read it back; on mismatch restore the previous pointer. Readers follow current.json and verify every hash.
Immutable paths can be cached forever; only current.json needs a short cache lifetime.

## Run (PowerShell, repo root)

```powershell
Set-Location D:\EVE11\Projects\013_elekto_eu
npx tsx pipeline/a2/test/test_a2.ts
npx tsx pipeline/a2/run_a2.ts --store local:D:\EVE11\Projects\013_elekto_eu\pipeline\a2\local_store --dry-run
npx tsx pipeline/a2/run_a2.ts --store local:D:\EVE11\Projects\013_elekto_eu\pipeline\a2\local_store
```

Exit codes: 0 PUBLISHED / NO_CHANGE / DRY_RUN_OK; 3 PUBLISHED_WITH_SOURCE_ERRORS (visible in register and run
report); 1 PUBLISH_FAILED (previous version live); 4 INTERRUPTED (resume with `--resume <run_id>`); 2 setup error.

Stores: `local:<dir>` and `blob:<prefix>` (Vercel Blob, OWNER-GO 2026-11-05 option 1).

## Vercel Blob store (blob:<prefix>)

- `ELMONITOR_BLOB_ACCESS` = `public` or `private`, exactly as the store was created; required, no default.
  Every write checks the returned URL host against it, so a mismatch fails hard.
- `BLOB_READ_WRITE_TOKEN` is read by `@vercel/blob` (pinned 2.8.2); it is never logged.
- Append-only: every blob is written once (`allowOverwrite: false`, no random suffix). The mutable key
  `current.json` is stored as an immutable log `_log/current.json/<YYYYMMDDTHHMMSSmmmZ>.json`; get() returns the
  newest entry found through the list API. Reason: @vercel/blob 2.8.2 reads a public store through the CDN
  (`useCache: false` only applies to private stores), so an overwritten pointer could be read back stale. The log also
  keeps every pointer state. Restoring a previous pointer appends it again.
- Tests: `pipeline/a2/test/test_blob_store.ts` (fake SDK with the measured 2.8.2 semantics, full A2 run on Blob
  compared with the local-dir run, site publisher).

## Site snapshot (export_preview.ts + publish_site.ts)

`export_preview.ts --store <local:|blob:> --out <file> --as-of now --eur-sek <ECB file>` writes the site snapshot
from the verified current version; `--as-of now` sets "today" to the local date of the export (default unchanged:
the local date of the version's published_at_utc). `publish_site.ts --store blob:elmonitor/site --snapshot <file>
--fx-raw <ECB file>` stores `snapshots/<sha256>.json`, the raw ECB response as `evidence/ecb/<sha256>.json`, and
appends the pointer `ELMONITOR_SITE_POINTER_v1`. The site (apps/web/lib/preview/load.ts) reads the newest pointer,
verifies sha256 and size, and falls back to the bundled snapshot on any failure.

## Scheduled update on Vercel (owner choice 2026-11-05: no keys on GitHub)

`apps/web/vercel.json` runs `GET /api/cron/a2` at these UTC times (Vercel cron is UTC only; Sweden is UTC+1 in
winter, UTC+2 in summer):
- 12:17 and 13:17: tomorrow's day-ahead prices (published around 13:00 Swedish time = 12 UTC winter / 11 UTC summer);
  the second run catches a late publication.
- 06:17, 09:17, 16:17, 19:17: physical flows during the day.
- 22:07 and 23:07: just after local midnight in summer (22:07) and in winter (23:07), so the site switches to the new day.
The route
(`apps/web/app/api/cron/a2/route.ts`, region arn1, maxDuration 800 s) calls `pipeline/a2/job.ts`:
A2 into `blob:elmonitor/a2` newest days first with a 540 s acquisition budget (groups not started are deferred to the
next run and listed as `plan.deferred_groups/deferred_days`), ECB raw response, export with "today" = export date,
publish to `blob:elmonitor/site`, then revalidate `/`, `/omraden`, `/data`.
Vercel project variables: `CRON_SECRET` (fail closed: 401 without it), `ENTSOE_TOKEN`, `ELMONITOR_BLOB_ACCESS`;
Blob credentials come from the connected store (OIDC + BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN, resolved by the SDK).
Instrument hashes are measured at build time by `apps/web/next.config.js` (sources are not in the function bundle).
Store I/O runs 16 calls in flight (`version.ts` IO_CONCURRENCY); BlobAdapter answers `exists` from one listing.

Measured on D: (2026-11-03): full backfill 369 groups in about 36.5 min, an ordinary run 81 groups in about 5 min,
so the first backfill completes over several scheduled runs; today's data comes first.

`.github/workflows/elmonitor_a2_data.yml` is manual offline tests only: no secrets, no store, no data run.

## a2.1 - values hash method and source-body check (OWNER-DECISION 2026-11-03, option 1)

Basis: docs/plan/ELMONITOR_A2_LOCAL_RUN_v1.md (deviations 1 and 2 of the local runs).

- `values_sha256` now uses `A2_VALUES_SHA256_V2_EXCL_ORIGIN`: resolution, `[start_utc, value]`, hourly and
  missing starts. The R/E origin marker (explicit point / A03 repeat) stays in the stored values as provenance but
  is excluded from the hash, because it depends on where the request window starts. Every register entry, revision
  record, manifest and `meta.json` names its method; hashes of different methods are never compared.
- Loading an a2.0 (V1) state migrates it in memory: hashes are recomputed from the stored data (`last_changed_utc`
  unchanged), legacy revision records are marked V1, and a revision detected by the run that built the loaded
  version is re-checked against the previous version's data. If only the origin marker differed it is kept with
  `classification: ORIGIN_ONLY_NOT_A_SOURCE_REVISION` and is not counted. The migration report is written to the
  run report and the new manifest. Earlier versions are not touched (content-addressed, immutable).
- A response that is not an ENTSO-E publication document (e.g. the gateway's JSON
  `uu-gateway-router/connectTimeout`) is a source error `SOURCE_INVALID_BODY`: retried with the same bounded
  delays, never checkpointed as a publication.
- A register entry without data (MISSING after a fetch error) is merged as the previous state, so new data on such
  a day is `IMPROVED`, not `NEW`.
