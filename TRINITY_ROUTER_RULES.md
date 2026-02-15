# TRINITY_ROUTER_RULES (ELEKTO_EU)

Syfte: Förhindra att LLM:er oavsiktligt påverkar data/beräkningar. Säkerställa determinism, reproducerbarhet och EVEverified "witness-mode"-disciplin.

## Grundprinciper

- **No source, no number**: Inga siffror utan evidens och spårbar källa.
- **Witness mode = NO interpretation**: Inga slutsatser, inget blame, inga politiska budskap.
- **Separation of concerns**: UI/copy får inte innehålla logik eller konstanter som påverkar resultat.

## Rollfördelning (hard rules)

### 1) CodeFactory (deterministisk kärna)

**MÅSTE** hantera allt som påverkar:
- ingestion (fetch, parse, normalisering)
- canonical/derived format
- beräkningar (heat model, COP/SCOP, currency conversion)
- schema, validering, tests (golden/snapshot)
- manifest/hash integration (python scripts, filordning, root_hash)

**FÅR**:
- skapa små, deterministiska patchar
- lägga till tester samtidigt som kod
- refaktorera om det förbättrar determinism (utan beteendeförändring utan godkända tester)

**FÅR INTE**:
- lägga in ogrundade default-värden som påverkar output utan evidensrecord
- ändra UI/copy utanför tekniska behov

### 2) Claude API (UI/UX + text, aldrig data)

**FÅR** endast arbeta i:
- `apps/web/**`
- `docs/**`

**FÅR**:
- skapa React-komponenter (paneler, tabeller, heatmaps)
- skriva metodtexter, hjälptexter, UI-copy
- föreslå interaktionsmönster

**FÅR INTE**:
- skapa/ändra ingestion, compute, schema eller manifestscripts
- hårdkoda zonkoder, skatter, priser, COP, eller andra domändata
- lägga in "exempelsiffror" i UI (inte ens placeholders som ser riktiga ut)
- ändra "business logic" som påverkar beräkningar eller filtrering

**UI-regel:** Allt som visas i UI ska komma från API/canonical store, och varje datapunkt ska kunna länkas till `evidence_id`/manifest/root_hash.

### 3) Qwen (lokal) – scaffolding/boilerplate

**FÅR**:
- skapa filstruktur, tomma route-skelett, exports, indexfiler
- lägga upp standardkod som inte påverkar siffror (t.ex. tom handler, wiring)

**FÅR INTE**:
- implementera beräkningslogik
- lägga in domänkonstanter (EIC-koder, skattesatser, COP-tabeller)

## "Gates" (tekniska grindar)

### Gate A: Scope enforcement
- Claude: endast `apps/web/**` + `docs/**`
- CodeFactory: `packages/**`, `scripts/**`, `schemas/**`
- Qwen: endast scaffolding (nya filer/route-skelett), utan logik

### Gate B: Golden tests för compute
Allt som räknar måste ha:
- deterministiska input fixtures
- golden output
- test som failar vid ändrat resultat

### Gate C: No constants in UI
- zonkoder, landlistor, skatter, avgifter, COP-profiler etc. ska läsas från canonical registry.
- UI får aldrig definiera egna "ground truth".

### Gate D: Manifest discipline
Varje ingest-run ska producera:
- `manifest.json`
- `files.sha256`
- `root_hash.txt`
och dessa ska vara reproducerbara givet samma input.

## PR/merge policy (minsta)
- Endast människa godkänner merge till `main`.
- Alla changes som påverkar beräkningar kräver gröna tests + uppdaterad methodology-version.
