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

  async function handleQuery(params: {
    zone: string;
    start: string;
    end: string;
    lang: string;
  }) {
    setLoading(true);
    setError(null);
    setPdfResult(null);
    setQueryParams(params);

    try {
      const res = await fetch("/api/ask-eve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Query failed");

      setResult(data.result);
    } catch (e: any) {
      setError(e.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleGeneratePdf() {
    if (!queryParams || !result) return;
    setPdfLoading(true);

    try {
      const res = await fetch("/api/ask-eve/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queryParams),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "PDF generation failed");
      }

      // Extract metadata from headers
      const meta = {
        pdf_hash: res.headers.get("X-EVE-PDF-Hash") ?? "",
        query_hash: res.headers.get("X-EVE-Query-Hash") ?? "",
        language: res.headers.get("X-EVE-Language") ?? "",
        template_version: res.headers.get("X-EVE-Template-Version") ?? "",
        report_index: parseInt(res.headers.get("X-EVE-Report-Index") ?? "0"),
        chain_hash: res.headers.get("X-EVE-Chain-Hash") ?? "",
      };
      setPdfResult(meta);

      // Download PDF
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `evidence_${queryParams.zone}_${queryParams.start}_${queryParams.end}_${queryParams.lang}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

    } catch (e: any) {
      setError(e.message);
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">
            Ask-EVE Evidence Panel
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Deterministic query engine for locked V2 datasets
          </p>
          <div className="flex gap-2 mt-3">
            <span className="text-xs px-2 py-0.5 bg-emerald-900/50 text-emerald-300 rounded font-mono">
              V2 Locked
            </span>
            <span className="text-xs px-2 py-0.5 bg-blue-900/50 text-blue-300 rounded font-mono">
              WORM Sealed
            </span>
            <span className="text-xs px-2 py-0.5 bg-amber-900/50 text-amber-300 rounded font-mono">
              Deterministic
            </span>
          </div>
        </div>

        {/* Query */}
        <QueryPanel onSubmit={handleQuery} loading={loading} />

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm font-mono">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <>
            <ResultPanel result={result} />
            <EvidencePanel result={result} pdfResult={pdfResult} />

            {/* PDF Actions */}
            <div className="mt-4 flex gap-3">
              <button
                onClick={handleGeneratePdf}
                disabled={pdfLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded transition-colors"
              >
                {pdfLoading ? "Generating..." : pdfResult ? "Regenerate PDF" : "Generate Evidence PDF"}
              </button>

              {pdfResult && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono">
                  <span>✅ Sealed — report_index: {pdfResult.report_index}</span>
                </div>
              )}
            </div>

            <IdentityStack result={result} pdfResult={pdfResult} />

            {/* Methodology footer */}
            <div className="mt-6 pt-4 border-t border-slate-800">
              <p className="text-[10px] text-slate-600">
                EVE is a deterministic evidence engine. It produces reproducible reports based on public regulatory sources.
                It makes no autonomous decisions. It presents computable results. Language affects document hash but not
                dataset identity or computational results.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
