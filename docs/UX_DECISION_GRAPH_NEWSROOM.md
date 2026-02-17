# UX_DECISION_GRAPH_NEWSROOM.md — Witness Decisions (Newsroom + Panels)

## Mål
Göra energifrågan begriplig utan pajkastning genom att:
1) visa ett litet, exakt **Decision Graph** (få noder, hög signal)
2) koppla **uttalanden** till rätt beslut (tjafs → faktiska kedjor)
3) alltid ha "No source, no number" + EvidenceDrawer

Ton: neutral. Witness = ingen tolkning.

---

## Layoutprincip: "Nyhetstidning + Terminal"
Sidan ska kännas som:
- vänster: index + navigering (som tidning)
- mitten: huvudkedja (som terminal/flow)
- höger: panels (facts, statements, proof)

### Global UI
- Topbar: sök, datumintervall, topic=Energy (default), export
- Sidebar: Decisions / Statements / Spot / Opinion (opinion låst tills Phase D)
- EvidenceBadge: synlig på alla views

---

## Route: /witness/decisions  (Index)
### Syfte
Visa "få beslut" och låta användaren snabbt hitta rätt kedja.

### Components
**A) Decision Feed (mittkolumn)**
- Lista med cards (prop/bet/vote)
- Visar: titel, datum, typ-badge, topic-tags, "källor" (ikon)
- Sort: nyast först (default), växla "relevance" senare

**B) Filters (topp/side)**
- Topic: Energy (default, v1 only)
- Type: Prop | Bet | Vote | SFS-ref
- Date range
- Search: title/dok_id
- Committee (om data finns) som optional

**C) "Signal Panel" (höger)**
- "Most referenced decisions (last 30d)" (från links index)
- "Newest votes" (vote nodes)
- "Evidence" (manifest_id + root_hash för graph build)

**Evidence requirement**
- Index view visar EvidenceBadge för datasetet (decision_graph build)
- Varje decision card har "source link" (dok_id/vote id)

---

## Route: /witness/decisions/[id]  (Detail)
### Syfte
Visa en beslutskedja som en story:
"Det här beslutet → ledde till → detta".

### 3-kolumn layout

### 1) Left column — "Context Navigator"
- Breadcrumb: Energy → Decisions → [id]
- Mini-list: "Related nodes" (neighbors)
- Snabblänkar:
  - Open in Riksdagen (source_url)
  - Export Proof Pack

### 2) Center column — "Decision Chain Timeline"
Visas som en vertikal timeline (eller horisontell, men timeline känns mer newsroom).

**Node card layout (för varje node i kedjan)**
- Header: Typ-badge (PROP/BET/VOTE/SFS) + datum
- Titel + dok_id/votering_id
- Käll-länk
- EvidenceBadge (för noden)
- Expand: "fields" (rm, utskott, rel_dok_id)

**Edges**
- Edge label: references / leads_to / implements
- Klickbar "Why this link?" → visar evidence_ref + mapping rule (v1)

**Chain logic**
- Default chain: show incoming + outgoing edges up to depth=2
- "Expand depth" toggle (max 4) med varning för att det blir stort

### 3) Right column — Panels
**Panel A: Linked Statements**
- Titel: "Who talked about this decision?"
- Listar statements kopplade via LINK_STATEMENTS_TO_DECISIONS
- Visar: speaker + party badge + datum + source badge
- Visar: matched_by (rule_id + matched token)
- Click: öppna statement i drawer / gå till /witness/statements?filters=…

**Panel B: Facts Context (optional)**
- (Phase B3/C) Mini spot context:
  - om noden har datumintervall: visa spotpris/SE3 + spread den veckan
- V1: kan vara "coming soon" men reservera plats

**Panel C: Proof / Evidence**
- Decision node evidence (manifest/root_hash)
- Links evidence (manifest/root_hash)
- Export: "Proof Pack" (zip senare, men knapp finns)

---

## Interactions (det ska kännas snabbt)
- Hover på node → highlight connected edges + neighbors
- Klick på edge → "why link" drawer
- Klick på EvidenceBadge → drawer med:
  - source_url
  - manifest_id + root_hash
  - files.sha256 path
  - methodology version

---

## Content rules (EVEverified)
- Witness copy är neutral. Inga "skyldiga", inga "roffar".
- "Bör/tycker" hör hemma i Opinion (Phase D).
- Statements är quote-safe; inga omskrivningar.
- Varje siffra/kedja har EvidenceBadge.

---

## SEO & delbarhet
- /witness/decisions/[id] ska ha stabil titel + canonical
- "Share" kopierar URL + en proof-friendly summary:
  - "Decision: <title> | Type: BET | Date: … | Proof: <root_hash>"

---

## Definition of Done (UX)
- Index fungerar som tidningsfeed med filters
- Detail visar chain + linked statements panel
- Evidence drawer fungerar på node + links
- Inga opinions-ord i witness UI
- Allt är klickbart till källor
