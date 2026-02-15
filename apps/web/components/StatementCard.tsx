"use client";

/**
 * StatementCard — single statement in timeline.
 * TR7: No interpretation. Structured fields + source link + EvidenceBadge.
 * TR8: Every source = clickable link.
 */

import { EvidenceBadge } from "@/components/EvidenceBadge";

interface StatementCardProps {
  statement: {
    statement_id: string;
    speaker_name: string;
    speaker_role_at_time: string | null;
    source_type: string;
    title: string | null;
    published_at_utc: string;
    original_url: string;
    excerpt: string;
    evidence_ref: { manifest_id: string; root_hash: string };
    compliance: { status: string };
  };
  onEvidenceClick?: (statementId: string) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  primary_parliament: "Riksdagen",
  primary_government: "Regeringen",
  primary_agency: "Myndighet",
  media_index: "Media",
  social_x: "X",
};

const EXCERPT_DISPLAY_LEN = 400;

export function StatementCard({ statement: s, onEvidenceClick }: StatementCardProps) {
  const isRemoved = s.compliance.status !== "active";
  const displayDate = s.published_at_utc.slice(0, 10);
  const truncated = s.excerpt.length > EXCERPT_DISPLAY_LEN;
  const displayExcerpt = truncated ? s.excerpt.slice(0, EXCERPT_DISPLAY_LEN) + "…" : s.excerpt;

  return (
    <div className="card" style={{
      marginBottom: "8px",
      opacity: isRemoved ? 0.5 : 1,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{s.speaker_name}</span>
        {s.speaker_role_at_time && (
          <span style={{
            padding: "1px 6px",
            borderRadius: "4px",
            fontSize: "0.72rem",
            background: "rgba(59, 130, 246, 0.1)",
            color: "var(--accent-blue)",
            border: "1px solid rgba(59, 130, 246, 0.3)",
          }}>
            {s.speaker_role_at_time}
          </span>
        )}
        <span style={{
          padding: "1px 6px",
          borderRadius: "4px",
          fontSize: "0.72rem",
          background: "rgba(16, 185, 129, 0.1)",
          color: "var(--accent-green)",
          border: "1px solid rgba(16, 185, 129, 0.3)",
        }}>
          {SOURCE_LABELS[s.source_type] ?? s.source_type}
        </span>
        <span style={{ color: "var(--text-muted)", fontSize: "0.78rem", fontFamily: "var(--font-mono)", marginLeft: "auto" }}>
          {displayDate}
        </span>
      </div>

      {/* Title */}
      {s.title && (
        <div style={{ fontSize: "0.88rem", fontWeight: 500, marginBottom: "6px" }}>
          <a href={s.original_url} target="_blank" rel="noopener noreferrer">
            {s.title}
          </a>
        </div>
      )}

      {/* Excerpt */}
      {isRemoved ? (
        <div style={{
          padding: "8px 12px",
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: "4px",
          color: "var(--accent-red)",
          fontSize: "0.82rem",
        }}>
          Content {s.compliance.status} — source tombstone preserved.
        </div>
      ) : (
        <div style={{ color: "var(--text-secondary)", fontSize: "0.84rem", lineHeight: 1.5 }}>
          {displayExcerpt}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
        <a
          href={s.original_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: "0.78rem", color: "var(--accent-blue)" }}
        >
          Källa →
        </a>
        <EvidenceBadge
          manifestId={s.evidence_ref.manifest_id}
          rootHash={s.evidence_ref.root_hash}
        />
        {onEvidenceClick && (
          <button
            onClick={() => onEvidenceClick(s.statement_id)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              fontSize: "0.72rem",
              cursor: "pointer",
              padding: 0,
              marginLeft: "auto",
            }}
          >
            Evidence ▸
          </button>
        )}
      </div>
    </div>
  );
}
