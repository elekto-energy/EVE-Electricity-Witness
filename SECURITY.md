# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in ELEKTO EU, please report it
responsibly by emailing **joakim@organiq.se**.

Do NOT open a public GitHub issue for security vulnerabilities.

## Scope

ELEKTO EU is an information tool that displays publicly available data.
It does not handle:

- User authentication or personal data
- Financial transactions
- Private energy consumption data

Security concerns primarily relate to:

- **Data integrity** — Ensuring displayed data matches official sources
- **Evidence chain** — Verifying manifests and hashes are not tampered with
- **Supply chain** — Dependencies and build pipeline integrity

## Evidence Verification

All data in ELEKTO EU is verifiable:

1. Every ingest run produces a `manifest.json` with SHA-256 checksums
2. A `root_hash` covers the entire dataset
3. Users can independently verify any number by tracing it to the source

If you find a discrepancy between displayed data and the official source,
please report it as a data integrity issue.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |
