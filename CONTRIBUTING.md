# Contributing to ELEKTO EU

## Principles

All contributions must respect:

1. **Neutrality** — No political claims or value judgments in code, docs, or UI
2. **Determinism** — Same input must produce same output
3. **Evidence-first** — No displayed number without a traceable data source
4. **Transparency** — All assumptions must be documented and visible to users

## How to Contribute

### Reporting Issues

- Use GitHub Issues
- Include: what you expected, what happened, data source version if applicable

### Code Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Ensure all tests pass: `pnpm test`
5. Ensure evidence verification passes: `pnpm verify`
6. Submit a Pull Request

### Data Contributions

Adding or updating data sources requires:

- Official source URL and license
- Ingest script that produces canonical JSON
- Manifest with SHA-256 checksums
- Golden test case (known input → expected output)
- Update to `docs/data_sources.md`

### Methodology Changes

Any change to calculation models requires:

- Version bump in `docs/methodology.md`
- Explanation of what changed and why
- Updated golden tests
- Review by a maintainer

## Code Style

- TypeScript for web app and packages
- Python for ingest scripts and evidence tools
- All code linted before commit
- No magic numbers — all constants in config with source reference

## Review Process

- All PRs require at least one maintainer review
- Data-affecting changes require evidence verification
- **Only humans approve merges to main** (TR5)
