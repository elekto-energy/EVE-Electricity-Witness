export default function MethodologyPage() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📐 Methodology</h1>
        <p className="page-subtitle">
          How we compute, what we assume, and where the data comes from. Everything is auditable.
        </p>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: "12px" }}>Core Formulas</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Formula</th>
              <th>Description</th>
              <th>Unit</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>UA = &Sigma;(U&#8342; &times; A&#8342;)</td>
              <td>Building heat loss coefficient</td>
              <td>W/K</td>
            </tr>
            <tr>
              <td>Q = UA &times; HDD &times; 24 / 1000</td>
              <td>Annual heating demand</td>
              <td>kWh/yr</td>
            </tr>
            <tr>
              <td>E = Q / COP</td>
              <td>Electrical energy for heating</td>
              <td>kWh/yr</td>
            </tr>
            <tr>
              <td>Cost = E &times; Price &times; (1+VAT)</td>
              <td>Annual heating cost</td>
              <td>EUR/yr</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: "12px" }}>Documentation</div>
        <ul style={{ color: "var(--text-secondary)", fontSize: "0.85rem", lineHeight: "1.8", paddingLeft: "20px" }}>
          <li>methodology.md — formulas, temperature adjustment, COP profiles</li>
          <li>assumptions.md — building profiles, U-values, SCOP ranges</li>
          <li>data_sources.md — ENTSO-E, Eurostat, SMHI, Copernicus</li>
          <li>witness_mode.md — zero-interpretation evidence tracing</li>
          <li>schema_evolution.md — Phase 0 → Phase 1 migration plan</li>
        </ul>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: "12px" }}>Trinity Rules</div>
        <table className="data-table">
          <thead>
            <tr><th>Rule</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td>TR1</td><td>No source, no number</td></tr>
            <tr><td>TR2</td><td>All ingests produce manifest + SHA256 + root_hash</td></tr>
            <tr><td>TR3</td><td>Every chart links to evidence record IDs</td></tr>
            <tr><td>TR4</td><td>Model changes bump methodology version</td></tr>
            <tr><td>TR5</td><td>Only human approves merge to main</td></tr>
            <tr><td>TR6</td><td>Claude generates code — NEVER data values</td></tr>
            <tr><td>TR7</td><td>Witness mode = NO interpretation</td></tr>
            <tr><td>TR8</td><td>Every claim must be a clickable evidence link</td></tr>
            <tr><td>TR9</td><td>Proof Pack = raw + canonical + manifest + hashes</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
