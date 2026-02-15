import Link from "next/link";

export default function HomePage() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">ELEKTO EU</h1>
        <p className="page-subtitle">
          Open, neutral, evidence-driven EU energy transparency. No opinions. Only data + method.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <Link href="/spot" style={{ textDecoration: "none" }}>
          <div className="card" style={{ cursor: "pointer" }}>
            <div className="card-header">
              <span className="card-title">⚡ Spot Prices</span>
              <span className="status-pill live">live</span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              ENTSO-E day-ahead prices across EU bidding zones. Compare SE1–SE4 and beyond.
            </p>
          </div>
        </Link>

        <Link href="/witness" style={{ textDecoration: "none" }}>
          <div className="card" style={{ cursor: "pointer" }}>
            <div className="card-header">
              <span className="card-title">🔍 Witness Mode</span>
              <span className="status-pill seed">seed v1</span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              Trace energy decisions through Riksdagen. No interpretation — evidence only.
            </p>
          </div>
        </Link>

        <Link href="/opinion" style={{ textDecoration: "none" }}>
          <div className="card" style={{ cursor: "pointer" }}>
            <div className="card-header">
              <span className="card-title">🗳 Opinion</span>
              <span className="status-pill scaffold">scaffold</span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              Evidence-linked polls on energy topics. Voting requires Email verification (Phase C).
            </p>
          </div>
        </Link>

        <Link href="/methodology" style={{ textDecoration: "none" }}>
          <div className="card" style={{ cursor: "pointer" }}>
            <div className="card-header">
              <span className="card-title">📐 Methodology</span>
              <span className="status-pill live">live</span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              Formulas, assumptions, data sources. Everything is auditable.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
