# SOURCE_CONTRACTS_DECISION_GRAPH.md
# Locked source contracts for Decision Graph v1
# EVEverified: No guessing. Every field verified against live API 2026-02-15.

## Status: LOCKED (v1.0 — 2026-02-15)

---

## 1. Propositioner (prop)

**Endpoint:** `https://data.riksdagen.se/dokumentlista/`

**Parameters (locked):**
| Param | Value | Notes |
|-------|-------|-------|
| `doktyp` | `prop` | Required |
| `rm` | `2024/25`, `2023/24`, etc. | Riksmöte filter. Multiple calls per rm. |
| `sok` | `energi kärnkraft elnät elmarknad` | Free-text search. Space = OR. |
| `utformat` | `json` | Required |
| `sort` | `datum` | Sort by date |
| `sortorder` | `desc` | Newest first |
| `sz` | `50` | Page size (max unknown, 50 safe) |
| `p` | `1`, `2`, ... | Pagination. `@nasta_sida` gives next URL. |
| `from` | `YYYY-MM-DD` | Optional date filter |
| `tom` | `YYYY-MM-DD` | Optional date filter (to) |

**Response path:** `dokumentlista.dokument[]`

**Fields we map (canonical):**
| API field | Canonical field | Notes |
|-----------|----------------|-------|
| `dok_id` | `decision_id` | Primary key. Format: `HC03205` |
| `titel` | `title` | |
| `datum` | `published_at_utc` | `YYYY-MM-DD` |
| `rm` | `riksmote` | Parliamentary session |
| `beteckning` | `number` | Prop number within rm |
| `organ` | `responsible_organ` | Department name |
| `doktyp` | `doc_type` | Always `prop` |
| `summary` | `excerpt` | First ~500 chars of proposition text |
| `dokument_url_html` | `source_url_html` | Full text |
| `filbilaga.fil[0].url` | `source_url_pdf` | PDF link |
| `sokdata.statusrad` | `_raw_statusrad` | Contains bet-link in HTML (parse for rel) |

**Betänkande relation (derived from statusrad HTML):**
Parse `data-dokumentid="HD01FöU4"` from `sokdata.statusrad`.
This links prop → bet deterministically.

**Paging:** `dokumentlista.@nasta_sida` contains next page URL. `@sidor` = total pages. `@traffar` = total hits.

**Rate limit:** Unknown official limit. Policy: 500ms delay between requests, exponential backoff on 429/5xx.

---

## 2. Betänkanden (bet)

**Endpoint:** `https://data.riksdagen.se/dokumentlista/`

**Parameters (locked):**
| Param | Value | Notes |
|-------|-------|-------|
| `doktyp` | `bet` | Required |
| `rm` | `2024/25`, etc. | Riksmöte |
| `sok` | `energi kärnkraft elnät elmarknad` | Free-text |
| `utformat` | `json` | |
| `sort` | `datum` | |
| `sortorder` | `desc` | |
| `sz` | `50` | |

**Response path:** `dokumentlista.dokument[]`

**Fields we map (same structure as prop):**
| API field | Canonical field | Notes |
|-----------|----------------|-------|
| `dok_id` | `decision_id` | Primary key. Format: `HC01NU12` |
| `titel` | `title` | |
| `datum` | `published_at_utc` | |
| `rm` | `riksmote` | |
| `beteckning` | `number` | e.g. `NU12` (utskott + nummer) |
| `organ` | `responsible_organ` | Utskott name |
| `doktyp` | `doc_type` | Always `bet` |
| `summary` | `excerpt` | |
| `dokument_url_html` | `source_url_html` | |

**Bet → Votering link:** `dok_id` from bet matches `dok_id` in votering.
Example: bet `HC01AU10` → votering `dok_id=HC01AU10`

---

## 3. Voteringar

**Endpoint:** `https://data.riksdagen.se/voteringlista/`

**Parameters (locked):**
| Param | Value | Notes |
|-------|-------|-------|
| `rm` | `2024/25` | Required |
| `bet` | `NU12` | Optional: filter by betänkande |
| `utformat` | `json` | |
| `sz` | `500` | One row per ledamot per punkt. Need large page. |

**Response path:** `voteringlista.votering` (single object if sz=1, array if multiple)

**Fields we map (canonical):**
| API field | Canonical field | Notes |
|-----------|----------------|-------|
| `votering_id` | `vote_id` | GUID. Same for all ledamöter on same punkt. |
| `beteckning` | `bet_ref` | Betänkande reference (e.g. `AU10`) |
| `punkt` | `vote_point` | Which point in betänkande |
| `dok_id` | `bet_dok_id` | Links to betänkande dok_id |
| `intressent_id` | `speaker_id` | `se-riksdagen:<intressent_id>` |
| `namn` | `voter_name` | |
| `parti` | `party` | |
| `rost` | `vote` | `Ja` / `Nej` / `Avstår` / `Frånvarande` |
| `avser` | `vote_subject` | `sakfrågan` / `motivreservation` |

**Aggregation rule:** Group by `votering_id` + `punkt` → count Ja/Nej/Avstår per parti.
Store both raw (per ledamot) and aggregated (per parti) views.

**Note:** `sz=1` returns single object (not array). Must handle both.

---

## 4. Personlista (ledamöter)

**Endpoint:** `https://data.riksdagen.se/personlista/`

**Parameters (locked):**
| Param | Value | Notes |
|-------|-------|-------|
| `utformat` | `json` | |
| `sz` | `500` | 349 current ledamöter. One page enough. |

**Response path:** `personlista.person[]`

**Fields we map (speaker registry enrichment):**
| API field | Canonical field | Notes |
|-----------|----------------|-------|
| `intressent_id` | `speaker_id` | `se-riksdagen:<intressent_id>` |
| `tilltalsnamn` | `first_name` | |
| `efternamn` | `last_name` | |
| `parti` | `party` | Current party |
| `valkrets` | `constituency` | |
| `status` | `status` | e.g. `Tjänstgörande riksdagsledamot` |
| `bild_url_192` | `image_url` | |
| `personuppdrag.uppdrag[]` | `roles[]` | Historical roles with from/tom dates |

**Use:** Enrich speaker registry with verified intressent_id mapping.
Full ingest once, then incremental on new riksmöte.

---

## 5. SFS (Svensk författningssamling) — TERMINAL NODE ONLY in v1

**Source:** `https://svenskforfattningssamling.se/` (official, authentic)
**Alternative:** Riksdagen dok&lagar has SFS pages but no clean API.

**v1 scope:** SFS as linked terminal node only.
| Field | Source | Notes |
|-------|--------|-------|
| `sfs_number` | Manual / derived from prop text | e.g. `SFS 2022:1573` |
| `title` | Manual / prop reference | |
| `published_date` | Manual | |
| `url` | `https://svenskforfattningssamling.se/` | Link to official text |

**NOT in v1:** Full SFS text ingest, automated SFS parsing, historical SFS chains.

---

## Paging contract

All `/dokumentlista/` endpoints:
- `@traffar` = total hits
- `@sidor` = total pages
- `@sida` = current page
- `@nasta_sida` = full URL for next page (use directly)

Strategy: Follow `@nasta_sida` until null/empty. Cap at 20 pages per query as safety.

## Rate limit / retry policy

| Rule | Value |
|------|-------|
| Delay between requests | 500ms minimum |
| Retry on 429 | Exponential backoff: 1s, 2s, 4s, 8s. Max 3 retries. |
| Retry on 5xx | Same as 429 |
| Retry on timeout (>10s) | 1 retry after 5s |
| Max concurrent requests | 1 (sequential) |
| Circuit breaker | After 5 consecutive failures: abort run, log error |

## Canonical ID format

| Entity | ID format | Example |
|--------|-----------|---------|
| Proposition | `se-riksdagen:prop:<dok_id>` | `se-riksdagen:prop:HC03205` |
| Betänkande | `se-riksdagen:bet:<dok_id>` | `se-riksdagen:bet:HC01NU12` |
| Votering | `se-riksdagen:vote:<votering_id>` | `se-riksdagen:vote:EDADC2B5-...` |
| Person | `se-riksdagen:<intressent_id>` | `se-riksdagen:0744993950910` |
| SFS | `sfs:<number>` | `sfs:2022:1573` |

## Relationship graph

```
prop ──(statusrad parse)──→ bet
bet  ──(dok_id match)──────→ votering[]
votering ──(intressent_id)─→ person
prop ──(text reference)────→ sfs (terminal)
bet  ──(text reference)────→ sfs (terminal)
```

## Energy topic filter (for Decision Graph v1)

To scope to energy decisions, use `sok` parameter:
```
Primary terms:  energi kärnkraft elnät elmarknad
Extended terms: kraftvärme vindkraft solenergi elcertifikat utsläppshandel
                elberedskap elförsörjning transmissionsnät effektreserv
```

Multiple queries with different term sets, then deduplicate by `dok_id`.

## Verified against live API: 2026-02-15
## Contract version: 1.0
## Next review: Before first Decision Graph ingest
