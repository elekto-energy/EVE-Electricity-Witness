# EVE Witness Verification Standard v1.1

## Purpose
Ensure all events in `/canonical/witness/` are:
- Legally verifiable OR physically verifiable
- Deterministic
- Reproducible
- Free from narrative interpretation

## Verification Types

### Type A: Legal Decision (verification_type: "legal")
Juridiskt verkställt beslut with effective date.

**Required primary sources (at least ONE):**
- SFS-nummer (Svensk författningssamling)
- Riksdagsbeslut (votering or betänkande)
- Regeringsbeslut with diarienummer
- Förordning with effective date
- EU-förordning or directive in force
- Court decision

### Type B: System Event (verification_type: "system_event")
Physically executed system change with verifiable date.

**Required primary sources (at least ONE):**
- SSM (Strålsäkerhetsmyndigheten) operational status
- SVK (Svenska kraftnät) system data
- IAEA PRIS database
- Operator official closure/startup report

**Examples:** Reactor shutdowns, capacity changes, grid connections.

## NOT Allowed in /canonical/witness/
- Pressmeddelanden (unless backing a Type A/B event)
- Lagrådsremiss (not yet law)
- SOU/Utredning (investigation, not decision)
- Färdplan/Roadmap
- Ansökan/Application
- Budgetförslag before riksdag vote
- Interview quotes
- Riksrevisionen criticism (analysis, not decision)
- Media reporting
- Political agreements (Tidöavtalet, Energiöverenskommelsen etc.)

These belong in:
- `/canonical/process/` — ongoing process events
- `/analysis/` — interpretations
- `/research/` — raw material

## Required Object Schema

```json
{
  "id": "string",
  "date": "YYYY-MM-DD",
  "category": "string",
  "government": "string",
  "direction": "string",
  "title": "string",
  "description": "max 3 neutral sentences",
  "source": "string",
  "verification_status": "verified",
  "verification_type": "legal | system_event",
  "legal_basis": {
    "type": "SFS | Riksdagsbeslut | Förordning | EU | Dom | Operational shutdown",
    "reference": "ex: SFS 2017:402",
    "url": "optional, official source",
    "effective_date": "YYYY-MM-DD"
  },
  "verification": {
    "primary_source_checked": true,
    "checked_by": "manual",
    "last_checked": "YYYY-MM-DD"
  }
}
```

If any required field is missing → event MUST NOT render.

## Language Policy (Witness Mode)

**Allowed:** Amounts, dates, MW, TWh, legal formulations, SFS references.

**NOT allowed:** "Controversial", "criticized", "debated", "caused", motive interpretation, political charge, quotes.

## Time Rule
Events may only be added when:
- Formally decided
- Effective date exists
- SFS or decision is published

No future dates.

## Rendering Rule
Frontend SHALL:
- Only read events with `verification_status === "verified"`
- Only read events with `verification.primary_source_checked === true`
- Ignore all others
- Display source reference as clickable link when URL available
- Show verification_type badge (⚖️ Legal / 🔧 System Event)

## Dataset Meta
```json
"_meta": {
  "verification_standard": "EVE_WITNESS_V1.1",
  "total_events": number,
  "fully_verified": number,
  "legal_events": number,
  "system_events": number
}
```

## Data Separation
```
/canonical/witness/        ← Only verified decisions + system events
/canonical/process/        ← Ongoing process (lagrådsremiss, ansökan, etc.)
/analysis/                 ← Interpretations
/research/                 ← Raw material
```

## Golden Principle
Better 38 events at 100% verified than 49 half-verified.

## Version History
- v1.0 (2026-02-16): Initial — legal decisions only
- v1.1 (2026-02-16): Added Type B (system_event) for verifiable physical events
