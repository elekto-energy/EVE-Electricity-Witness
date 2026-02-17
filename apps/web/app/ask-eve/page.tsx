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
  const [lang, setLang] = useState("en");
  const [fx, setFx] = useState<{ fx_rate: number; fx_period: string; fx_source: string; fx_file_hash: string } | null>(null);

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
      setFx(data.fx ?? null);
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

  const isSv = lang === "sv";

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0, lineHeight: 1.3 }}>
          Ask-EVE Evidence Panel
        </h1>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          {isSv
            ? "Deterministisk fr\u00e5gemotor f\u00f6r l\u00e5sta V2-datasets"
            : "Deterministic query engine for locked V2 datasets"
          }
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

      {/* Query */}
      <QueryPanel onSubmit={handleQuery} loading={loading} onLangChange={setLang} />

      {/* ═══ POSITIONING — always visible ═══ */}
      <div className="card" style={{ marginTop: 16, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>
          {isSv ? "Vad denna panel g\u00f6r" : "What This Panel Does"}
        </div>

        <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 10px" }}>
          {isSv
            ? "Denna panel genererar deterministiska evidensrapporter baserade p\u00e5 den l\u00e5sta EVE Timeseries V2-dataseten. Systemet g\u00f6r inga prognoser, simuleringar eller policyrekommendationer. Det ber\u00e4knar reproducerbara statistikv\u00e4rden fr\u00e5n \u00f6ppna regulatoriska datak\u00e4llor:"
            : "This panel generates deterministic evidence reports based on the locked EVE Timeseries V2 dataset. It does not forecast, simulate, or provide policy recommendations. It computes reproducible statistics from publicly available regulatory data sources:"
          }
        </p>

        <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.8, marginBottom: 12, paddingLeft: 12 }}>
          • ENTSO-E Transparency Platform<br/>
          • EEA 2023 {isSv ? "emissionsfaktorer" : "emission factors"}<br/>
          • ERA5 {isSv ? "v\u00e4derdata" : "weather reanalysis"}
        </div>

        <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 10px" }}>
          {isSv ? "Varje rapport \u00e4r:" : "Every report is:"}
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {[
            { en: "Deterministic", sv: "Deterministisk", color: "#10b981" },
            { en: "Cryptographically hashed", sv: "Kryptografiskt hashad", color: "#3b82f6" },
            { en: "Linked to sealed dataset", sv: "L\u00e4nkad till f\u00f6rseglad dataset", color: "#a855f7" },
            { en: "Fully reproducible", sv: "Fullt reproducerbar", color: "#f59e0b" },
          ].map(b => (
            <span key={b.en} style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 4, fontFamily: "var(--font-mono)",
              background: `${b.color}12`, border: `1px solid ${b.color}35`, color: b.color,
            }}>
              {isSv ? b.sv : b.en}
            </span>
          ))}
        </div>

        <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
            {isSv ? "Om oberoende" : "On Independence"}
          </div>
          <p style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
            {isSv
              ? "EVE Electricity Witness \u00e4r ett frist\u00e5ende verifieringssystem. Det \u00e4r inte anslutet till eller godk\u00e4nt av n\u00e5gon systemoperat\u00f6r, tillsynsmyndighet eller annan myndighet. Plattformen \u00e4r utformad s\u00e5 att myndigheter, journalister och oberoende experter kan verifiera, ifr\u00e5gas\u00e4tta och reproducera alla resultat."
              : "EVE Electricity Witness is an independent verification system. It is not affiliated with or endorsed by any transmission system operator, regulator, or authority. This platform is designed so that authorities, journalists and independent experts can verify, challenge and reproduce all results."
            }
          </p>
        </div>

        <div style={{ marginTop: 12, fontSize: 9, color: "rgba(255,255,255,0.2)", fontFamily: "var(--font-mono)" }}>
          TS_V2_EEA_2023_DIRECT · Scope 1 · Direct combustion only
        </div>
      </div>

      {/* ═══ ERROR ═══ */}
      {error && (
        <div className="card" style={{
          marginTop: 12, padding: 12,
          borderColor: "rgba(239, 68, 68, 0.3)", background: "rgba(239, 68, 68, 0.05)",
        }}>
          <span style={{ fontSize: 12, color: "#ef4444", fontFamily: "var(--font-mono)" }}>{error}</span>
        </div>
      )}

      {/* ═══ RESULTS (conditional) ═══ */}
      {result && (
        <>
          <ResultPanel result={result} lang={lang} fx={fx} />
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
        </>
      )}
    </div>
  );
}
