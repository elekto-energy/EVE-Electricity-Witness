/**
 * EvidenceBadge — shows cryptographic proof metadata for any data-bearing UI element.
 *
 * TR3: Every chart/list item links to evidence record IDs.
 * TR8: Every claim must be a clickable evidence link.
 *
 * Renders manifest_id + truncated root_hash with green/amber coloring.
 */

interface EvidenceBadgeProps {
  manifestId?: string;
  rootHash?: string;
  stale?: boolean;
}

export function EvidenceBadge({ manifestId, rootHash, stale = false }: EvidenceBadgeProps) {
  if (!manifestId && !rootHash) {
    return (
      <span className="evidence-badge stale">
        <span className="evidence-badge-dot" />
        no evidence
      </span>
    );
  }

  const hashShort = rootHash ? rootHash.slice(0, 12) + "…" : "—";

  return (
    <span className={`evidence-badge ${stale ? "stale" : ""}`} title={`root_hash: ${rootHash ?? "unknown"}`}>
      <span className="evidence-badge-dot" />
      {manifestId && <span>{manifestId}</span>}
      {manifestId && rootHash && <span style={{ color: "var(--text-muted)" }}>|</span>}
      {rootHash && <span>{hashShort}</span>}
    </span>
  );
}
