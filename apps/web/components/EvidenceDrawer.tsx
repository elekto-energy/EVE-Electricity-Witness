"use client";

/**
 * EvidenceDrawer — side panel showing full evidence metadata.
 * Appears when user clicks "Evidence ▸" on a statement card.
 */

interface EvidenceDrawerProps {
  open: boolean;
  onClose: () => void;
  statement: {
    statement_id: string;
    speaker_name: string;
    original_url: string;
    source_type: string;
    evidence_ref: {
      manifest_id: string;
      root_hash: string;
      files_sha256_path: string;
      record_ids: string[];
    };
    extraction: {
      method: string;
      version: string;
      fetched_at_utc: string;
    };
    compliance: {
      requires_recheck: boolean;
      status: string;
    };
  } | null;
}

export function EvidenceDrawer({ open, onClose, statement }: EvidenceDrawerProps) {
  if (!open || !statement) return null;

  const s = statement;

  return (
    <div style={{
      position: "fixed",
      top: 0,
      right: 0,
      width: "400px",
      height: "100vh",
      background: "var(--bg-primary)",
      borderLeft: "1px solid var(--border-color)",
      zIndex: 1000,
      overflowY: "auto",
      padding: "20px",
      boxShadow: "-4px 0 20px rgba(0,0,0,0.3)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Evidence Details</span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "1.2rem", cursor: "pointer" }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <Field label="Statement ID" value={s.statement_id} mono />
        <Field label="Speaker" value={s.speaker_name} />
        <Field label="Source Type" value={s.source_type} />
        <Field label="Original URL">
          <a href={s.original_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.82rem", wordBreak: "break-all" }}>
            {s.original_url}
          </a>
        </Field>

        <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "12px" }}>
          <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--accent-green)" }}>Evidence Chain</span>
        </div>

        <Field label="Manifest ID" value={s.evidence_ref.manifest_id} mono />
        <Field label="Root Hash" value={s.evidence_ref.root_hash} mono />
        <Field label="Files SHA256" value={s.evidence_ref.files_sha256_path} mono />
        {s.evidence_ref.record_ids.length > 0 && (
          <Field label="Record IDs" value={s.evidence_ref.record_ids.join(", ")} mono />
        )}

        <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "12px" }}>
          <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)" }}>Extraction</span>
        </div>

        <Field label="Method" value={s.extraction.method} mono />
        <Field label="Version" value={s.extraction.version} mono />
        <Field label="Fetched At" value={s.extraction.fetched_at_utc} mono />

        <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "12px" }}>
          <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)" }}>Compliance</span>
        </div>

        <Field label="Status" value={s.compliance.status} />
        <Field label="Recheck Required" value={s.compliance.requires_recheck ? "Yes" : "No"} />
      </div>
    </div>
  );
}

function Field({ label, value, mono, children }: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>
        {label}
      </div>
      {children ?? (
        <div style={{
          fontSize: "0.84rem",
          fontFamily: mono ? "var(--font-mono)" : "inherit",
          color: "var(--text-primary)",
          wordBreak: "break-all",
        }}>
          {value ?? "—"}
        </div>
      )}
    </div>
  );
}
