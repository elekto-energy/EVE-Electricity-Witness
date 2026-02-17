# LINK_RULES_V1.md
# Deterministic linking rules: Statements ↔ Decisions
# Version: 1.0
# Date: 2026-02-15
# Status: LOCKED

## Purpose
Define transparent, deterministic rules for connecting statements (anföranden)
to decision nodes (prop/bet/vote/sfs_ref). No ML, no embeddings, no fuzzy matching.

## Rule Precedence (highest → lowest)
1. **explicit_id_reference** — statement metadata contains dok_id directly
2. **dok_id_match** — statement text contains dok_id pattern (e.g. "2024/25:150")
3. **bet_id_match** — statement text contains betänkande reference (e.g. "NU20")
4. **sfs_number_match** — statement text contains SFS pattern (e.g. "SFS 2010:900")
5. **keyword_topic_cooccur** — statement matches ≥2 topic keywords from decision title

## Rule Definitions

### R1: explicit_id_reference
- **Input:** statement.rel_dok_id or statement.debate_dok_id
- **Match:** exact equality with decision_node.dok_id
- **Confidence:** HIGH
- **Example:** statement has rel_dok_id="HC03150" → links to se-riksdagen:prop:HC03150

### R2: dok_id_match
- **Input:** statement.anforande_text
- **Pattern:** `/\b(H[A-Z]\d{5})\b/g` (Riksdagen dok_id format)
- **Also:** `/\b(\d{4}\/\d{2}:\d+)\b/g` (e.g. "2024/25:150")
- **Match:** extracted ID exists in decision graph nodes
- **Confidence:** HIGH
- **Max matches per statement:** 5 (prevent runaway on long texts)

### R3: bet_id_match
- **Input:** statement.anforande_text
- **Pattern:** `/\b(NU|MJU|CU|FiU|TU|KrU|SfU|JuU|UbU|AU|SoU|UU|KU|FöU|SkU)\d+\b/g`
- **Match:** extracted beteckning matches decision_node.number where node_type=bet
- **Also checks:** riksmöte context if available in surrounding text
- **Confidence:** MEDIUM (committee abbreviation alone could be ambiguous)

### R4: sfs_number_match
- **Input:** statement.anforande_text
- **Pattern:** `/SFS\s*(\d{4}:\d+)/gi`
- **Match:** extracted SFS number matches sfs_ref node in graph (if exists)
- **Confidence:** MEDIUM
- **Note:** v1 graph has no sfs_ref nodes yet → this rule will produce 0 links in v1

### R5: keyword_topic_cooccur
- **Input:** statement.anforande_text + decision_node.title
- **Requires:** ≥2 significant words (≥5 chars) from decision title appear in statement text
- **Excludes common words:** och, för, med, som, att, den, det, har, kan, ska, till, från, inom
- **Confidence:** LOW
- **Max links per statement via this rule:** 3 (prevent over-linking)

## Output Per Link
```json
{
  "link_id": "sha256(statement_id|decision_node_id|rule_id).slice(0,16)",
  "statement_id": "...",
  "decision_node_id": "...",
  "matched_by": {
    "rule_id": "dok_id_match",
    "rule_type": "pattern",
    "matched_text": "HC03150",
    "matched_span": [1234, 1241]
  },
  "confidence_mode": "deterministic"
}
```

## Deduplication
- If multiple rules match the same (statement_id, decision_node_id) pair:
  → keep only the highest-precedence rule
- link_id is stable across reruns (deterministic hash)

## Evidence
- Links output references both input manifests (statements + decision_graph)
- Root hash of links.json is manifested separately
