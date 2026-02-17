# TOPIC_RULES_ENERGY_V1.md
# Deterministic topic classification for energy-related decisions
# Version: 1.0 — 2026-02-15
# Status: LOCKED

## Purpose
Classify Riksdagen documents (prop/bet) as energy-related using
transparent, deterministic rules. No LLM classification. No fuzzy matching.

## Rule priority (highest first)
1. **committee_match** — Document belongs to energy-relevant committee
2. **utgiftsomrade_match** — Budget area 21 (Energi) or 20 (Klimat, miljö och natur)
3. **title_keyword_match** — Title contains energy keyword (strict list)
4. **search_term_match** — Found via Riksdagen sok= energy terms

## Rule 1: committee_match
Match if `organ` or `beteckning` prefix indicates energy-relevant committee.

| Committee code | Name | Confidence |
|---------------|------|------------|
| NU | Näringsutskottet | high |
| MJU | Miljö- och jordbruksutskottet | medium (energy+climate overlap) |
| FiU | Finansutskottet | low (only if UO21/UO20) |

Rule: If `beteckning` starts with `NU` → tag `ENERGY.COMMITTEE_MATCH`.
If `beteckning` starts with `MJU` → tag `ENERGY.COMMITTEE_MATCH` only if title also matches keyword.

## Rule 2: utgiftsomrade_match
Match if document title or dok_id references Utgiftsområde 21 (Energi) or 20 (Klimat).

Pattern: `/[Uu]tgiftsområde\s+(21|20)/` or `/UO\s*(21|20)/` in title or summary.

## Rule 3: title_keyword_match
Match if document title contains any of these keywords (case-insensitive):

### Primary (high confidence)
```
energi, kärnkraft, kärnkraftverk, kärnavfall,
elnät, elnätsavgift, elmarknad, elhandel, elpris, elförsörjning,
kraftvärme, fjärrvärme, vindkraft, vindkraftverk, solenergi, solcell,
elcertifikat, utsläppshandel, utsläppsrätt,
stamnät, transmissionsnät, effektreserv,
elberedskap, elsäkerhet, ellag,
energiskatt, effektskatt, koldioxidskatt,
flaskhalsintäkt, elområde, prisområde,
strålsäkerhet, uranbrytning, slutförvar,
vätgas, vätgasstrategi, elektrobränsle,
energieffektivisering, energiomställning,
fossilfri, fossilfritt
```

### Extended (medium confidence — require secondary signal)
```
klimatmål, klimatpolitisk, klimatramverk,
nettonoll, koldioxid,
biodrivmedel, bioenergi, biomassa,
reduktionsplikt
```

Extended keywords match ONLY if:
- Committee is NU or MJU, OR
- Another primary keyword also matches

## Rule 4: search_term_match
Documents found via Riksdagen `sok=` parameter with energy search terms
are tagged `ENERGY.SEARCH_MATCH`. Lower confidence than rules 1-3.

Search terms used in ingest:
```
energi kärnkraft elnät elmarknad kraftvärme vindkraft solenergi
elcertifikat stamnät effektreserv elberedskap
```

## Output format
Each tagged document gets:
```json
{
  "node_id": "se-riksdagen:prop:HC03205",
  "topic_tags": ["ENERGY.COMMITTEE_MATCH", "ENERGY.TITLE_KEYWORD:kärnkraft"],
  "topic_rules_version": "energy_v1",
  "matched_rules": [
    { "rule_id": "committee_match", "matched_value": "NU", "confidence": "high" },
    { "rule_id": "title_keyword_match", "matched_value": "kärnkraft", "confidence": "high" }
  ]
}
```

## Exclusion rules
- Documents tagged ONLY by `search_term_match` with no other rule → marked `ENERGY.WEAK` (included but flagged)
- Documents with `organ` = defense/justice/social committees and NO energy keywords → excluded

## Versioning
- Rule changes require new version (energy_v2, etc.)
- Old version preserved; re-tagging creates new canonical output
- Rule version embedded in every tagged node

## Transparency
- All rules visible at `/api/registry/decisions/topics`
- UI shows "matched by: [rule]" on every tagged node
