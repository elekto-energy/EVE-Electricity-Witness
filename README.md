# ELEKTO EU (EVEverified) — EU Energy Transparency Platform

Open, neutral, evidence-driven tool that models **necessary heating only** (18/19/20°C) across EU countries.
No opinions. No personal attacks. No "policy scoring". Only data + method.

## Trinity Rules (non-negotiable)
- TR1: **No source, no number**
- TR2: All ingests produce **manifest + SHA256 + root_hash**
- TR3: Every chart links to **evidence record IDs**
- TR4: Model changes bump **methodology version**
- TR5: Only human approves merge to `main`
- TR6: Claude can generate code — **never data values**

## Repo structure
- `apps/web` — Next.js UI (read-only presentation)
- `packages/evidence` — ingest + evidence pipeline
- `packages/schemas` — JSON Schemas (Phase 0: minimal; Phase 1+: `_future/`)
- `packages/compute` — heat/COP/ROI engine
- `data/raw|canonical|derived` — datasets
- `manifests` — evidence manifests + checksums
- `docs` — methodology, assumptions, data sources

## Quickstart (Phase 0 verification)

1. Place any small test file in `data/raw/`:
   ```
   echo "test data" > data\raw\test.txt
   ```

2. Run the evidence pipeline:
   ```
   python scripts\make_manifest.py --run_id test_run --input_dir data\raw --out_dir manifests
   ```

3. Verify output in `manifests/`:
   - `test_run.files.sha256` — per-file checksums
   - `test_run.root_hash.txt` — single root hash
   - `test_run.manifest.json` — ingest manifest

4. Re-run with same input → **same root hash** (determinism proof).

## Built with EVE

- **CodeFactory** — deterministic code generation
- **Trinity Bridge** — Qwen for boilerplate, Claude API for complex tasks
- **Evidence Layer** — cryptographic verification of all data

*"AI may propose and challenge — never decide."*

## License

MIT — See [LICENSE](LICENSE)

## Disclaimer

Information tool, not financial or energy advice. See [docs/methodology.md](docs/methodology.md).

---

*Developed by [Organiq Sweden AB](https://organiq.se)*
