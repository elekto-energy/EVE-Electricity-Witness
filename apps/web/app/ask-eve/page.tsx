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
  const [error, setError] = useState<string | null>(null);

  async function handleQuery(params: {
    zone: string;
    start: string;
    end: string;
    lang: string;
  }) {
    setLoading(true);
    setError(null);
    setPdfResult(null);

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
            <IdentityStack result={result} pdfResult={pdfResult} />
          </>
        )}
      </div>
    </div>
  );
}
