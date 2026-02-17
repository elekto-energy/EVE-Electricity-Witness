# Ask-EVE Panel — UX Architecture Specification

**Version:** 1.0  
**Status:** Proposed  
**Depends on:** Ask-EVE Evidence Engine v1.0.0, EVE Timeseries V2 (v2.0.0-locked)

---

## Principle

Ask-EVE is not a chatbot. It is a verification instrument.

The panel signals: determinism, transparency, traceability.

---

## Two Modes

### Public Mode (default, no auth)

For: citizens, students, journalists, energy debate.

Shows:
- Query builder (zone, date, language)
- Result summary (statistics, generation mix)
- Evidence metadata (dataset_eve_id, root_hash, registry_hash, rebuild command)
- PDF generation + download
- PDF verification (upload or paste hash)

Does NOT show:
- Full vault chain internals
- Raw NDJSON preview
- Method registry diff
- Re-seal history

### Authority Mode (authenticated)

For: Svenska Kraftnät, Energimyndigheten, Ei, EU experts, investigative journalists.

Shows everything in Public Mode plus:
- Vault chain explorer (expandable, full chain)
- Query hash layer visualization
- Identity stack (3-layer crypto diagram)
- Method registry viewer + diff
- Raw NDJSON preview (first N rows)
- Interconnection registry
- Config immutability status
- Re-seal history log

---

## Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  Ask-EVE Evidence Panel           [Authority Toggle] │
├─────────────────────────────────────────────────────┤
│  QUERY                                              │
│  Zone: [SE3 ▼]  From: [____]  To: [____]          │
│  Language: [EN / SV]                                │
│  [ Generate Evidence Report ]                       │
├─────────────────────────────────────────────────────┤
│  RESULT                                             │
│  ┌──────────┬──────────┬──────────┐                │
│  │ Spot     │ CO₂ Prod │ CO₂ Cons │                │
│  │ 71.20    │ 34.40    │ 86.30    │                │
│  └──────────┴──────────┴──────────┘                │
│  Net Import: 2,689 MW  |  HDD: 16,080              │
│  Rows: 744  |  Hours: 744                           │
│                                                     │
│  Generation Mix                                     │
│  Nuclear: 4,132 | Hydro: 1,348 | Wind: 1,667 ...  │
├─────────────────────────────────────────────────────┤
│  EVIDENCE                                           │
│  dataset_eve_id:  EVE-TSV2-SE3-...                 │
│  methodology:     TS_V2_EEA_2023_DIRECT            │
│  registry_hash:   83CCEEBC...                      │
│  root_hash:       a09d3f05...                      │
│  query_hash:      1ddc1977...                      │
│  vault_index:     29                                │
│                                                     │
│  [ Download PDF ]  [ Verify PDF ]                   │
│                                                     │
│  Rebuild: npx tsx ... --zone SE3 --from ...         │
├─────────────────────────────────────────────────────┤
│  IDENTITY STACK (collapsible)                       │
│  ▸ Layer 1 — Data (dataset_eve_id + root_hash)     │
│  ▸ Layer 2 — Query (query_hash)                    │
│  ▸ Layer 3 — Document (pdf_hash + language)        │
└─────────────────────────────────────────────────────┘
```

---

## RBAC Model

| Role | Query | PDF | Verify | Vault Explorer | Registry | Raw NDJSON | Config |
|------|-------|-----|--------|----------------|----------|------------|--------|
| PUBLIC | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| AUTHORITY | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ + re-seal |

Auth does NOT affect: data, hash, determinism, reproducibility.
Auth only affects: metadata visibility depth.

---

## Component Tree

```
app/ask-eve/page.tsx
  <AskEvePage>
    <QueryPanel />
    <ResultPanel result={queryResult} />
    <EvidencePanel result={queryResult} pdfResult={pdfResult} />
    <IdentityStack result={queryResult} pdfResult={pdfResult} />
    {isAuthority && <VaultExplorer />}
    {isAuthority && <RegistryViewer />}
```

---

## Security Rules

1. Auth NEVER affects computation
2. All endpoints return identical data regardless of role
3. Authority mode only reveals additional metadata views
4. No client-side data filtering (server returns same payload)
5. PDF generation available to all roles
6. Verification available to all roles

---

## Visual Design Principles

- Dark background (infrastructure aesthetic, not SaaS)
- Monospace for hashes and technical identifiers
- Badges: 🔒 V2 Locked, 🧾 WORM Sealed, 🧮 Deterministic
- No emoji in data output
- No AI personality
- No marketing language
- Clear methodology attribution
- Rebuild command always visible

---

## Legal Positioning

Ask-EVE is a deterministic evidence engine.
It produces reproducible reports based on public regulatory sources.
It makes no autonomous decisions.
It presents computable results.

This is relevant for:
- AI Act compliance (transparency, traceability, no black-box)
- Liability delimitation (EVE is reference, not guidance)
- Public trust (anyone can verify)
