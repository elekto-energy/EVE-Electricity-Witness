/**
 * /witness/se/energy — Witness Mode: Sweden Energy Decisions
 *
 * Lists decision chains / documents from canonical store.
 * Each item shows an Evidence Card.
 *
 * TR3: Every list item links to evidence record IDs.
 * TR7: Witness mode = NO interpretation (trace only).
 * TR8: Every claim must be a clickable evidence link.
 *
 * STUB: Reads from canonical JSON on disk. No external network calls.
 */

// TODO: Replace with actual canonical store reader when Next.js is initialized
// For now, this is a structural stub showing the contract.

export default function WitnessSeEnergyPage() {
  // In production: read from data/canonical/witness/riksdagen/{latest_run_id}/nodes.json
  // No external fetch. No interpretation.

  return (
    <main>
      <h1>Witness Mode: Sweden Energy Decisions</h1>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        No interpretation. No opinions. Evidence trace only.
      </p>

      {/* Evidence Card template */}
      <section>
        <h2>Documents</h2>
        <p>
          This page will list Riksdagen documents related to energy policy,
          each with an Evidence Card showing:
        </p>
        <ul>
          <li><code>evidence_id</code></li>
          <li>Source: Riksdagen Open Data</li>
          <li>Source URI (clickable link to data.riksdagen.se)</li>
          <li><code>retrieved_at_utc</code></li>
          <li><code>root_hash</code> reference</li>
        </ul>
        <p>
          <strong>Status:</strong> Stub. Run ingest pipeline first, then connect to canonical store.
        </p>
      </section>

      {/* Taxonomy filter (stub) */}
      <section>
        <h2>Filter by Energy Taxonomy</h2>
        <ul>
          <li>ENERGY.NUCLEAR</li>
          <li>ENERGY.TAXES_FEES</li>
          <li>ENERGY.GRID_TRANSMISSION</li>
          <li>ENERGY.MARKET_DESIGN</li>
          <li>ENERGY.BUILDING_ENERGY_RULES</li>
          <li>ENERGY.EU_IMPLEMENTATION</li>
        </ul>
      </section>
    </main>
  );
}
