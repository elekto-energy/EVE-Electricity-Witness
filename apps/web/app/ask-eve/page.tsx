"use client";

import { useState } from "react";
import QueryPanel from "./components/QueryPanel";
import ResultPanel from "./components/ResultPanel";
import EvidencePanel from "./components/EvidencePanel";
import IdentityStack from "./components/IdentityStack";

export default function AskEvePage() {
  const [result, setResult] = useState<any>(null);
  const [pdfResult, setPdfResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryParams, setQueryParams] = useState<any>(null);

  async function handleQuery(params: { zone: string; start: string; end: string; lang: string }) {
    setLoading(true); setError(null); setPdfResult(null); setQueryParams(params);
    try {
      const res = await fetch("/api/ask-eve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Query failed");
      setResult(data.result);
    } catch (e: any) { setError(e.message); setResult(null); }
    finally { setLoading(false); }
  }

  async function handleGeneratePdf() {
    if (!queryParams || !result) return;
    setPdfLoading(true);
    try {
      const res = await fetch("/api/ask-eve/pdf", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queryParams),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "PDF failed"); }
      const meta = {
        pdf_hash: res.headers.get("X-EVE-PDF-Hash") ?? "",
        query_hash: res.headers.get("X-EVE-Query-Hash") ?? "",
        language: res.headers.get("X-EVE-Language") ?? "",
        template_version: res.headers.get("X-EVE-Template-Version") ?? "",
        report_index: parseInt(res.headers.get("X-EVE-Report-Index") ?? "0"),
        chain_hash: res.headers.get("X-EVE-Chain-Hash") ?? "",
      };
      setPdfResult(meta);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `evidence_${queryParams.zone}_${queryParams.start}_${queryParams.end}_${queryParams.lang}.pdf`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e: any) { setError(e.message); }
    finally { setPdfLoading(false); }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0, lineHeight: 1.3 }}>
          Ask-EVE Evidence Panel
        </h1>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          Deterministic query engine for locked V2 datasets
        </p>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {[
            { label: "V2 Locked", color: "#10b981" },
            { label: "WORM Sealed", color: "#3b82f6" },
            { label: "Deterministic", color: "#f59e0b" },
          ].map(b => (
            <span key={b.label} style={{
              fontSize: 9, padding: "2px 6px", borderRadius: 4, fontFamily: "var(--font-mono)",
              background: `${b.color}15`, border: `1px solid ${b.color}40`, color: b.color,
            }}>{b.label}</span>
          ))}
        </div>
      </div>

      <QueryPanel onSubmit={handleQuery} loading={loading} />

      {error && (
        <div className="card" style={{
          marginTop: 12, padding: 12,
          borderColor: "rgba(239, 68, 68, 0.3)", background: "rgba(239, 68, 68, 0.05)",
        }}>
          <span style={{ fontSize: 12, color: "#ef4444", fontFamily: "var(--font-mono)" }}>{error}</span>
        </div>
      )}

      {result && (
        <>
          <ResultPanel result={result} />
          <EvidencePanel result={result} pdfResult={pdfResult} />

          {/* PDF Action */}
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={handleGeneratePdf} disabled={pdfLoading} style={{
              padding: "10px 20px", borderRadius: 6, border: "none", cursor: pdfLoading ? "not-allowed" : "pointer",
              background: pdfLoading ? "var(--bg-card)" : "#2563eb",
              color: pdfLoading ? "var(--text-muted)" : "#fff",
              fontSize: 13, fontWeight: 700, transition: "background 0.15s",
            }}>
              {pdfLoading ? "Generating..." : pdfResult ? "Regenerate PDF" : "Generate Evidence PDF"}
            </button>
            {pdfResult && (
              <span style={{ fontSize: 10, color: "#10b981", fontFamily: "var(--font-mono)" }}>
                ✅ Sealed — report #{pdfResult.report_index}
              </span>
            )}
          </div>

          <IdentityStack result={result} pdfResult={pdfResult} />

          {/* Legal positioning */}
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border-color)" }}>
            <p style={{ fontSize: 9, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 6 }}>
              EVE Electricity Witness is a deterministic evidence engine built on publicly available regulatory data sources
              (ENTSO-E Transparency Platform, EEA emission factors, ERA5 reanalysis). All reports are reproducible and
              cryptographically verifiable. This system is independently built and is not an official publication from
              Svenska kraftnät, Energimyndigheten, or any other authority.
            </p>
            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", lineHeight: 1.5 }}>
              This platform is designed so that authorities, journalists and independent experts can verify, challenge
              and reproduce all results. Methodology: TS_V2_EEA_2023_DIRECT · Scope 1 only.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
