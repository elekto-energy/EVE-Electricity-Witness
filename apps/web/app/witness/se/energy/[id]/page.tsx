/**
 * /witness/se/energy/[id] — Decision Chain Detail View
 *
 * Shows nodes and edges for one decision chain + Evidence Card per node.
 *
 * TR3: Every node links to evidence record IDs.
 * TR7: No interpretation. Metadata display only.
 * TR8: Every claim is a clickable evidence link.
 *
 * STUB: Structure only. Connect to canonical store when Next.js is live.
 */

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WitnessDetailPage({ params }: PageProps) {
  const { id } = await params;

  // In production: load from data/canonical/witness/riksdagen/{run_id}/nodes.json
  // Filter by doc_id matching `id` param.

  return (
    <main>
      <h1>Decision Chain: {id}</h1>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        Witness mode — no interpretation. Evidence trace only.
      </p>

      {/* Node detail (stub) */}
      <section>
        <h2>Document Metadata</h2>
        <table>
          <tbody>
            <tr><td>doc_id</td><td><code>{id}</code></td></tr>
            <tr><td>evidence_id</td><td><code>evr:riksdagen:...</code></td></tr>
            <tr><td>source</td><td><a href={`https://data.riksdagen.se/dokument/${id}`}>Riksdagen Open Data</a></td></tr>
            <tr><td>tags</td><td>(from canonical store)</td></tr>
            <tr><td>root_hash</td><td>(from manifest)</td></tr>
          </tbody>
        </table>
      </section>

      {/* Related edges (stub) */}
      <section>
        <h2>Related Documents</h2>
        <p>Edges (references, amends, responds_to) will be shown here when edge data is available.</p>
      </section>

      {/* Proof Pack link */}
      <section>
        <a href={`/witness/se/energy/export?doc_id=${id}`}>
          Download Proof Pack (ZIP)
        </a>
      </section>
    </main>
  );
}
