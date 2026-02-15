"use client";

/**
 * WitnessChainView — renders a legislative chain as a vertical timeline.
 * TR7: No interpretation — only structured fields + source links.
 * TR8: Every claim = clickable evidence link.
 */

interface ChainStep {
  position: number;
  doc_type: string;
  doc_id: string;
  title: string;
  date: string;
  body: string;
  uri: string;
  description_neutral: string;
}

interface Chain {
  id: string;
  topic_id: string;
  title: string;
  title_en: string;
  steps: ChainStep[];
}

interface WitnessChainViewProps {
  chain: Chain;
}

const DOC_TYPE_ICONS: Record<string, string> = {
  "Proposition": "📜",
  "Betänkande": "📋",
  "SFS": "⚖️",
  "Riksdagsbeslut": "🏛",
  "EU-direktiv": "🇪🇺",
  "EU-direktiv (recast)": "🇪🇺",
  "Myndighetsföreskrift": "🔧",
};

export function WitnessChainView({ chain }: WitnessChainViewProps) {
  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontWeight: 700, fontSize: "1rem" }}>{chain.title}</div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{chain.title_en}</div>
      </div>

      {/* Timeline */}
      <div style={{ position: "relative", paddingLeft: "32px" }}>
        {/* Vertical line */}
        <div style={{
          position: "absolute",
          left: "11px",
          top: "4px",
          bottom: "4px",
          width: "2px",
          background: "var(--border-color)",
        }} />

        {chain.steps.map((step, i) => (
          <div key={step.doc_id} style={{ position: "relative", marginBottom: "20px" }}>
            {/* Dot on timeline */}
            <div style={{
              position: "absolute",
              left: "-27px",
              top: "4px",
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              background: i === chain.steps.length - 1 ? "var(--accent-blue)" : "var(--bg-card)",
              border: "2px solid var(--accent-blue)",
            }} />

            {/* Step card */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <span style={{ fontSize: "1rem" }}>
                  {DOC_TYPE_ICONS[step.doc_type] ?? "📄"}
                </span>
                <span style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontSize: "0.72rem",
                  fontFamily: "var(--font-mono)",
                  background: "rgba(59, 130, 246, 0.1)",
                  color: "var(--accent-blue)",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                }}>
                  {step.doc_type}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.78rem", fontFamily: "var(--font-mono)" }}>
                  {step.date}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginLeft: "auto" }}>
                  {step.body}
                </span>
              </div>

              <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "4px" }}>
                <a href={step.uri} target="_blank" rel="noopener noreferrer" title={`Source: ${step.doc_id}`}>
                  {step.title}
                </a>
              </div>

              <div style={{ color: "var(--text-secondary)", fontSize: "0.82rem", marginBottom: "6px" }}>
                {step.description_neutral}
              </div>

              <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                {step.doc_id}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
