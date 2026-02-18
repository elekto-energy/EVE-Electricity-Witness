"use client";

import { useState, useEffect, useCallback } from "react";
import { StatementsFilters } from "@/components/StatementsFilters";
import { StatementCard } from "@/components/StatementCard";
import { EvidenceDrawer } from "@/components/EvidenceDrawer";
import { EvidenceBadge } from "@/components/EvidenceBadge";

interface StatementDTO {
  statement_id: string;
  speaker_id: string;
  speaker_name: string;
  speaker_role_at_time: string | null;
  source_type: string;
  title: string | null;
  published_at_utc: string;
  original_url: string;
  excerpt: string;
  topic_tags: string[];
  language: string;
  evidence_ref: {
    manifest_id: string;
    root_hash: string;
    files_sha256_path: string;
    record_ids: string[];
  };
  compliance: { requires_recheck: boolean; status: string };
  extraction: { method: string; version: string; fetched_at_utc: string };
}

interface ApiResponse {
  items: StatementDTO[];
  page: { next_cursor?: string };
  evidence: { manifest_id: string; root_hash: string };
}

export default function StatementsPage() {
  const [speaker, setSpeaker] = useState("");
  const [source, setSource] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const [items, setItems] = useState<StatementDTO[]>([]);
  const [evidence, setEvidence] = useState<{ manifest_id: string; root_hash: string } | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Evidence drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerStatement, setDrawerStatement] = useState<StatementDTO | null>(null);

  const fetchStatements = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (speaker) params.set("speaker", speaker);
    if (source) params.set("source", source);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (search) params.set("q", search);
    if (cursor) params.set("cursor", cursor);

    try {
      const res = await fetch(`/api/witness/statements?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? "Failed to fetch");
        return;
      }
      const data: ApiResponse = await res.json();

      if (cursor) {
        setItems(prev => [...prev, ...data.items]);
      } else {
        setItems(data.items);
      }
      setNextCursor(data.page.next_cursor);
      setEvidence(data.evidence);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [speaker, source, from, to, search]);

  // Fetch on filter change (debounced for search)
  useEffect(() => {
    const timer = setTimeout(() => fetchStatements(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchStatements]);

  const handleEvidenceClick = (statementId: string) => {
    const stmt = items.find(s => s.statement_id === statementId);
    if (stmt) {
      setDrawerStatement(stmt);
      setDrawerOpen(true);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">⚡ Energy Statements</h1>
        <p className="page-subtitle">
          Political statements on energy and electricity from verified sources. Evidence-traced, no interpretation.
        </p>
      </div>

      {/* Filters */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <StatementsFilters
            speaker={speaker} onSpeakerChange={setSpeaker}
            source={source} onSourceChange={setSource}
            from={from} onFromChange={setFrom}
            to={to} onToChange={setTo}
            search={search} onSearchChange={setSearch}
          />
          {evidence && (
            <EvidenceBadge manifestId={evidence.manifest_id} rootHash={evidence.root_hash} />
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card" style={{ borderColor: "var(--accent-red)" }}>
          <p style={{ color: "var(--accent-red)", fontSize: "0.85rem" }}>{error}</p>
        </div>
      )}

      {/* Results count */}
      {!loading && !error && (
        <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: "12px" }}>
          {items.length} statement{items.length !== 1 ? "s" : ""} shown
          {nextCursor && " (more available)"}
        </div>
      )}

      {/* Loading */}
      {loading && items.length === 0 && (
        <div className="card"><p style={{ color: "var(--text-muted)" }}>Loading statements…</p></div>
      )}

      {/* Empty state */}
      {!loading && !error && items.length === 0 && (
        <div className="card">
          <p style={{ color: "var(--text-muted)" }}>
            No statements found. Run Riksdagen ingest first:
          </p>
          <pre style={{
            background: "var(--bg-card-hover)",
            padding: "10px",
            borderRadius: "4px",
            fontSize: "0.78rem",
            fontFamily: "var(--font-mono)",
            color: "var(--text-secondary)",
            marginTop: "8px",
            overflowX: "auto",
          }}>
{`npx tsx packages/evidence/src/ingest_riksdagen_anf.ts \\
  --run_id riksdagen_anf_20260215 \\
  --from 2025-02-01 --to 2025-02-15`}
          </pre>
        </div>
      )}

      {/* Timeline */}
      {items.map(stmt => (
        <StatementCard
          key={stmt.statement_id}
          statement={stmt}
          onEvidenceClick={handleEvidenceClick}
        />
      ))}

      {/* Load more */}
      {nextCursor && !loading && (
        <button
          onClick={() => fetchStatements(nextCursor)}
          style={{
            display: "block",
            margin: "16px auto",
            padding: "8px 20px",
            background: "var(--bg-card)",
            color: "var(--accent-blue)",
            border: "1px solid var(--border-color)",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          Load more
        </button>
      )}

      {/* Evidence Drawer */}
      <EvidenceDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        statement={drawerStatement}
      />
    </div>
  );
}
