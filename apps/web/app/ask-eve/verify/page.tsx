"use client";

import { useState, useCallback } from "react";

interface VerifyResult {
  verified: boolean;
  chain_valid?: boolean;
  chain_errors?: string[];
  dataset_verified?: boolean;
  reason?: string;
  report?: {
    report_index: number;
    zone: string;
    period_start: string;
    period_end: string;
    language: string;
    template_version: string;
    created_at_utc: string;
    query_hash: string;
    chain_hash: string;
    dataset_eve_id: string;
    root_hash: string;
    query_command: string;
  };
  vault_entries_total?: number;
}

async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function VerifyPage() {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const verify = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setFileName(file.name);

    try {
      const hash = await hashFile(file);
      setFileHash(hash);

      const res = await fetch("/api/ask-eve/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") verify(file);
    else setError("Only PDF files are accepted.");
  }, [verify]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) verify(file);
  }, [verify]);

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Verifiera EVE-rapport
        </h1>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          Ladda upp en PDF-rapport för att verifiera dess äkthet mot EVE:s kryptografiska kedja.
          Filen lämnar aldrig din webbläsare — bara SHA-256-hashen skickas.
        </p>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {[
            { label: "Offline Hash", color: "#10b981" },
            { label: "Chain Verified", color: "#3b82f6" },
            { label: "Zero Upload", color: "#a855f7" },
          ].map(b => (
            <span key={b.label} style={{
              fontSize: 9, padding: "2px 6px", borderRadius: 4, fontFamily: "var(--font-mono)",
              background: `${b.color}15`, border: `1px solid ${b.color}40`, color: b.color,
            }}>{b.label}</span>
          ))}
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? "#3b82f6" : "var(--border-color)"}`,
          borderRadius: 12,
          padding: "40px 20px",
          textAlign: "center",
          background: dragOver ? "rgba(59, 130, 246, 0.05)" : "var(--bg-card)",
          transition: "all 0.15s",
          cursor: "pointer",
        }}
        onClick={() => document.getElementById("pdf-input")?.click()}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
          {loading ? "Verifierar..." : "Dra och släpp PDF här"}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          eller klicka för att välja fil
        </div>
        <input
          id="pdf-input"
          type="file"
          accept=".pdf"
          onChange={handleFileInput}
          style={{ display: "none" }}
        />
      </div>

      {/* File info */}
      {fileName && fileHash && (
        <div style={{
          marginTop: 12, padding: "10px 12px",
          background: "var(--bg-primary)", border: "1px solid var(--border-color)", borderRadius: 6,
        }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>
            📄 {fileName}
          </div>
          <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
            SHA-256: {fileHash}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          marginTop: 12, padding: 12,
          background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 6,
        }}>
          <span style={{ fontSize: 12, color: "#ef4444", fontFamily: "var(--font-mono)" }}>❌ {error}</span>
        </div>
      )}

      {/* Result: Verified */}
      {result?.verified && result.report && (
        <div style={{
          marginTop: 16, padding: 20,
          background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 24 }}>🔒</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#10b981" }}>VERIFIERAD</span>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            <Badge label="Rapport hittad" ok />
            <Badge label={result.chain_valid ? "Kedja intakt" : "Kedja bruten"} ok={result.chain_valid ?? false} />
            <Badge label={result.dataset_verified ? "Dataset verifierat" : "Dataset ej hittat"} ok={result.dataset_verified ?? false} />
          </div>

          <div style={{
            background: "var(--bg-primary)", border: "1px solid var(--border-color)", borderRadius: 6,
            padding: 12, fontFamily: "var(--font-mono)", fontSize: 10, lineHeight: 2,
            color: "var(--text-secondary)",
          }}>
            <Row label="Rapport #" value={String(result.report.report_index)} />
            <Row label="Zon" value={result.report.zone} />
            <Row label="Period" value={`${result.report.period_start} → ${result.report.period_end}`} />
            <Row label="Språk" value={result.report.language.toUpperCase()} />
            <Row label="Skapad" value={result.report.created_at_utc} />
            <Row label="Template" value={result.report.template_version} />
            <div style={{ borderTop: "1px solid var(--border-color)", margin: "6px 0" }} />
            <Row label="query_hash" value={result.report.query_hash.slice(0, 24) + "…"} />
            <Row label="chain_hash" value={result.report.chain_hash.slice(0, 24) + "…"} />
            <Row label="dataset_eve_id" value={result.report.dataset_eve_id} />
            <Row label="root_hash" value={result.report.root_hash.slice(0, 24) + "…"} />
            <div style={{ borderTop: "1px solid var(--border-color)", margin: "6px 0" }} />
            <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>
              Reproduktionskommando:
            </div>
            <div style={{
              fontSize: 9, padding: "6px 8px", marginTop: 4,
              background: "var(--bg-card)", borderRadius: 4, wordBreak: "break-all",
            }}>
              {result.report.query_command}
            </div>
          </div>

          {result.chain_errors && result.chain_errors.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {result.chain_errors.map((e, i) => (
                <div key={i} style={{ fontSize: 10, color: "#f59e0b", fontFamily: "var(--font-mono)" }}>⚠ {e}</div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 12, fontFamily: "var(--font-mono)" }}>
            Vault: {result.vault_entries_total} rapporter i kedjan
          </div>
        </div>
      )}

      {/* Result: Not verified */}
      {result && !result.verified && (
        <div style={{
          marginTop: 16, padding: 20,
          background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 24 }}>❌</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#ef4444" }}>EJ VERIFIERAD</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
            {result.reason}
          </p>
          <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>
            Möjliga orsaker: PDF:en har modifierats efter generering, genererades inte av EVE,
            eller rapport-valvet är från en annan build.
          </p>
          {result.vault_entries_total !== undefined && (
            <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 8, fontFamily: "var(--font-mono)" }}>
              Vault: {result.vault_entries_total} rapporter kontrollerade
            </div>
          )}
        </div>
      )}

      {/* How it works */}
      <div className="card" style={{ marginTop: 24, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
          Hur verifieringen fungerar
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          1. Din webbläsare beräknar SHA-256 av PDF-filen lokalt — filen lämnar aldrig din dator.<br/>
          2. Hashen skickas till EVE:s server och matchas mot rapport-valvet (report_vault.jsonl).<br/>
          3. Om en matchning hittas verifieras den kryptografiska kedjan: prev_hash → event_hash → chain_hash.<br/>
          4. Dataset-valvet (X-Vault) korsrefereras för att bekräfta att underliggande data är intakt.<br/>
          5. Resultatet visar full provenance: zon, period, dataset-ID, och reproduktionskommando.
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Badge({ label, ok }: { label: string; ok: boolean }) {
  const color = ok ? "#10b981" : "#ef4444";
  return (
    <span style={{
      fontSize: 10, padding: "3px 8px", borderRadius: 4, fontFamily: "var(--font-mono)",
      background: `${color}12`, border: `1px solid ${color}35`, color,
    }}>
      {ok ? "✅" : "❌"} {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ color: "var(--text-muted)", minWidth: 130 }}>{label}:</span>
      <span style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}
