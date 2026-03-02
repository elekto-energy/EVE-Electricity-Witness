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
          Verifiera en EVE-rapport mot den kryptografiska kedjan.
          Dra och släpp valfri PDF — hashen beräknas lokalt i din webbläsare, bara SHA-256 skickas till servern.
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
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
          Hela dokumentet är verifierbart
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          Ändras en enda bokstav, siffra eller pixel i rapporten blir det kryptografiska
          fingeravtrycket (SHA-256) helt annorlunda — och verifieringen misslyckas.
          Det går inte att ändra innehållet utan att det syns.
          Samma teknik används i bankernas säkerhetssystem och digitala signaturer.
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
          Så fungerar det steg för steg
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 16 }}>
          1. Din webbläsare beräknar ett kryptografiskt fingeravtryck (SHA-256) av PDF-filen — själva filen skickas aldrig till servern.<br/>
          2. Fingeravtrycket matchas mot EVE:s rapport-valv, en append-only kedja där varje rapport länkas till föregående.<br/>
          3. Kedjans integritet verifieras — om en enda post har ändrats bryts hela kedjan.<br/>
          4. Dataset-valvet (X-Vault) korsrefereras för att bekräfta att underliggande ENTSO-E-data är intakt.<br/>
          5. Resultatet visar full spårbarhet: zon, period, datakälla, och ett kommando för att återskapa rapporten från rådata.
        </div>

        <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
            Varför detta är viktigt
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
            Elpriser påverkar miljoner hushåll och företag. Trots det finns det idag inget oberoende system
            som gör det möjligt att verifiera de siffror som cirkulerar i media, politik och debatt.
            EVE Electricity Witness fyller det tomrummet.
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
            Varje rapport som genereras av EVE är deterministisk — samma fråga ger alltid samma svar.
            Rapporten hashas kryptografiskt och förseglas i en kedja som inte kan ändras i efterhand.
            Om någon modifierar en enda byte i PDF:en misslyckas verifieringen.
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
            Det innebär att en journalist, myndighet, forskare eller privatperson kan ta emot en EVE-rapport,
            dra och släppa den här, och omedelbart veta: är denna rapport äkta? Har datan ändrats?
            Kan jag reproducera resultatet själv?
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.8 }}>
            Svaret är alltid ja. Varje rapport innehåller ett reproduktionskommando.
            Vem som helst med tillgång till öppna data från ENTSO-E, EEA och ECB kan
            köra samma beräkning och få exakt samma resultat — siffra för siffra.
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: 12, marginTop: 12 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.6, fontStyle: "italic" }}>
            EVE Electricity Witness är ett fristående verifieringssystem utvecklat av Organiq Sweden AB.
            Det är inte anslutet till eller godkänt av någon systemoperatör, tillsynsmyndighet eller annan myndighet.
            All data härstammar från publika källor: ENTSO-E Transparency Platform, EEA och ECB.
          </div>
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
