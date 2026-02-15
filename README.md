# ELEKTO EU — Energy Transparency Platform

**What does it cost to keep a home at 18°C, 19°C, or 20°C in every EU country?**

ELEKTO EU is an open, neutral, and technically defensible tool that answers this question using official data sources — climate (HDD), day-ahead spot prices (ENTSO-E), grid fees, taxes, and VAT (Eurostat).

## Principles

- **Neutrality** — No political claims, no value judgments
- **Transparency** — Methods, assumptions, data sources, and calculations are visible
- **Determinism** — Same input → same output; datasets are versioned and hashed
- **No source, no number** — Every displayed value traces to an evidence record

## Architecture

```
data/raw/          ← Raw ingested files (ENTSO-E XML, Eurostat CSV)
data/canonical/    ← Normalized JSON (one schema per source)
data/derived/      ← Computed datasets (heat demand, costs)
manifests/         ← SHA-256 hashes + root hash per ingest run
packages/schemas/  ← JSON Schema definitions
packages/evidence/ ← Ingest pipeline
packages/compute/  ← Heat engine (UA, Q_heat, COP/SCOP, TCO)
apps/web/          ← Next.js frontend
docs/              ← Methodology, assumptions, data sources
```

## Evidence Pipeline

Every data ingest follows: **RAW → CANONICAL → DERIVED → PUBLISHED**

Each step produces:
- `manifest.json` — dataset ID, time range, fetch timestamp
- `files.sha256` — per-file checksums
- `root_hash` — single hash over entire run

## Data Sources

| Source | Data | Update Frequency |
|--------|------|-----------------|
| ENTSO-E Transparency Platform | Day-ahead spot prices | Hourly (15 min cache) |
| Eurostat | Electricity price components | Semi-annual |
| Eurostat | Heating Degree Days (HDD) | Annual |
| SMHI | Swedish temperature data | 15-60 min |
| Copernicus/ECMWF | EU temperature data | 15-60 min |

## V1 Scope

- EU heatmap: monthly cost to maintain 18/19/20°C
- Country view: spot price, climate, cost breakdown, heat demand
- Rankings: most expensive, coldest, highest tax share
- Heating system comparison: direct electric vs air-air vs air-water vs ground source
- Assumption Inspector: full transparency on all parameters

## Development

```bash
# Prerequisites: Node.js 20+, Python 3.11+, pnpm
pnpm install
pnpm dev        # Start web app
pnpm test       # Run tests
pnpm verify     # Verify evidence chain (manifests + hashes)
```

## Built with EVE

This project uses the [EVE (Evidence & Verification Engine)](https://eveverified.com) pipeline:
- **CodeFactory** — Deterministic code generation from templates
- **Trinity Bridge** — Intelligent routing (Qwen for boilerplate, Claude API for complex tasks)
- **Evidence Layer** — Cryptographic verification of all data

**"AI may propose and challenge — never decide."**

## License

MIT — See [LICENSE](LICENSE)

## Disclaimer

This is an information tool, not financial or energy advice. All calculations are based on modeled assumptions. See [docs/methodology.md](docs/methodology.md) for details.

---

*Developed by [Organiq Sweden AB](https://organiq.se)*
