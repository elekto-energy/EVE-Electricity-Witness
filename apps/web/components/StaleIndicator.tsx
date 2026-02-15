/**
 * StaleIndicator — shows how fresh the data is.
 *
 * Green: < 2 hours old
 * Amber: 2–24 hours old
 * Red: > 24 hours old or no timestamp
 */

interface StaleIndicatorProps {
  fetchedAt?: string; // ISO timestamp
  label?: string;
}

export function StaleIndicator({ fetchedAt, label }: StaleIndicatorProps) {
  if (!fetchedAt) {
    return (
      <span className="evidence-badge stale">
        <span className="evidence-badge-dot" />
        {label ?? "no data"}
      </span>
    );
  }

  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);

  let status: "fresh" | "aging" | "stale";
  let ageLabel: string;

  if (ageHours < 2) {
    status = "fresh";
    ageLabel = `${Math.round(ageHours * 60)}m ago`;
  } else if (ageHours < 24) {
    status = "aging";
    ageLabel = `${Math.round(ageHours)}h ago`;
  } else {
    status = "stale";
    const days = Math.round(ageHours / 24);
    ageLabel = `${days}d ago`;
  }

  const className = status === "fresh" ? "evidence-badge" : "evidence-badge stale";

  return (
    <span className={className}>
      <span className="evidence-badge-dot" />
      {label && <span>{label}:</span>}
      <span>{ageLabel}</span>
    </span>
  );
}
