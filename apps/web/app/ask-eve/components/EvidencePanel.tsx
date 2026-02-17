"use client";

interface EvidencePanelProps {
  result: any;
  pdfResult: any;
}

function HashRow({ label, value, mono }: { label: string; value: string | number | null | undefined; mono?: boolean }) {
  const display = value ?? "N/A";
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
      <span style={{
        fontSize: 10, color: "var(--text-secondary)",
        fontFamily: mono !== false ? "var(--font-mono)" : undefined,
        maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {display}
      </span>
    </div>
  );
}

export default function EvidencePanel({ result, pdfResult }: EvidencePanelProps) {
  return (
    <div className="card" style={{ padding: 20, marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Evidence</span>
        <span style={{
          fontSize: 9, padding: "2px 6px", borderRadius: 4, fontFamily: "var(--font-mono)",
          background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.3)",
          color: "#3b82f6",
        }}>cryptographic</span>
      </div>

      <HashRow label="dataset_eve_id" value={result.dataset_eve_id} />
      <HashRow label="methodology" value={result.methodology_version} />
      <HashRow label="emission_scope" value={result.emission_scope} />
      <HashRow label="registry_hash" value={result.registry_hash} />
      <HashRow label="root_hash" value={result.vault?.root_hash} />
      <HashRow label="chain_hash" value={result.vault?.chain_hash} />
      <HashRow label="vault_index" value={result.vault?.event_index} />

      {pdfResult && (
        <>
          <div style={{ margin: "8px 0", borderTop: "1px solid var(--border-color)" }} />
          <HashRow label="pdf_hash" value={pdfResult.pdf_hash} />
          <HashRow label="query_hash" value={pdfResult.query_hash} />
          <HashRow label="language" value={pdfResult.language} />
          <HashRow label="template" value={pdfResult.template_version} />
          <HashRow label="report_index" value={pdfResult.report_index} />
        </>
      )}

      {/* Rebuild command */}
      <div style={{
        marginTop: 12, padding: 10, background: "var(--bg-primary)",
        border: "1px solid var(--border-color)", borderRadius: 6,
      }}>
        <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
          Rebuild Command
        </div>
        <code style={{ fontSize: 10, color: "#22c55e", fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
          {result.query_command}
        </code>
      </div>
    </div>
  );
}
