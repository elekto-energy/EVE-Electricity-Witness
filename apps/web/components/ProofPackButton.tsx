/**
 * ProofPackButton — triggers download of a Proof Pack ZIP.
 *
 * TR9: Proof Pack export must include raw + canonical + manifest + hashes.
 *
 * Phase B: stub — shows button, calls callback or navigates to export URL.
 * Phase C: wired to actual ZIP generation endpoint.
 */

interface ProofPackButtonProps {
  runId?: string;
  chainId?: string;
  disabled?: boolean;
  onClick?: () => void;
}

export function ProofPackButton({ runId, chainId, disabled = false, onClick }: ProofPackButtonProps) {
  const href = runId
    ? `/api/witness/chain/${chainId ?? runId}?proof=1`
    : undefined;

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (href && !disabled) {
      window.open(href, "_blank");
    }
  };

  return (
    <button
      className="proof-pack-btn"
      disabled={disabled}
      onClick={handleClick}
      title={disabled ? "Proof Pack not available yet" : "Download Proof Pack (ZIP)"}
    >
      📦 Proof Pack
      {disabled && <span className="status-pill disabled" style={{ marginLeft: "4px" }}>Phase C</span>}
    </button>
  );
}
