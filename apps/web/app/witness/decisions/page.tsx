"use client";

import { useState, useEffect, useCallback } from "react";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { EnergyPulsePanel } from "@/components/panels/EnergyPulsePanel";

interface DecisionNode {
  node_id: string;
  node_type: "prop" | "bet" | "vote" | "sfs_ref";
  title: string;
  published_at_utc: string;
  riksmote?: string;
  number?: string;
  responsible_organ?: string;
  dok_id?: string;
  source_url_html?: string;
  topic_tags?: string[];
  topic_matches?: { rule_id: string; matched_value: string; confidence: string }[];
  result?: { party: string; ja: number; nej: number; avstar: number }[];
  total?: { ja: number; nej: number; avstar: number };
  evidence_ref?: { manifest_id: string; root_hash: string };
}

interface ApiResponse {
  items: DecisionNode[];
  page: { next_cursor?: string };
  evidence: { manifest_id: string; root_hash: string };
  stats: { total_nodes: number; prop_nodes: number; bet_nodes: number; vote_nodes: number; total_edges: number };
}

const TYPE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  prop: { label: "PROP", color: "var(--accent-blue)", bg: "rgba(59, 130, 246, 0.1)" },
  bet: { label: "BET", color: "#a78bfa", bg: "rgba(167, 139, 250, 0.1)" },
  vote: { label: "VOTE", color: "var(--accent-green)", bg: "rgba(16, 185, 129, 0.1)" },
  sfs_ref: { label: "SFS", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)" },
};

export default function DecisionsPage() {
  const [nodeType, setNodeType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const [items, setItems] = useState<DecisionNode[]>([]);
  const [evidence, setEvidence] = useState<{ manifest_id: string; root_hash: string } | null>(null);
  const [stats, setStats] = useState<ApiResponse["stats"] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const fetchDecisions = useCallback(async (cursor?: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("topic", "energy");
    if (nodeType) params.set("type", nodeType);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (search) params.set("q", search);
    if (cursor) params.set("cursor", cursor);

    try {
      const res = await fetch(`/api/witness/decisions?${params.toString()}`);
      const data: ApiResponse = await res.json();
      if (cursor) {
        setItems(prev => [...prev, ...data.items]);
      } else {
        setItems(data.items);
      }
      setNextCursor(data.page.next_cursor);
      setEvidence(data.evidence);
      setStats(data.stats);
    } catch { /* ignore */ }
    setLoading(false);
  }, [nodeType, from, to, search]);

  useEffect(() => {
    const timer = setTimeout(() => fetchDecisions(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchDecisions]);

  const inputStyle: React.CSSProperties = {
    padding: "6px 10px", fontSize: "0.85rem", fontFamily: "var(--font-mono)",
    background: "var(--bg-card)", color: "var(--text-primary)",
    border: "1px solid var(--border-color)", borderRadius: "4px",
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">⚖️ Beslut</h1>
        <p className="page-subtitle">
          Riksdagsbeslut om el: produktion, skatter, nätavgifter, import/export, elmarknad. Propositioner → Utskottsbetänkanden → Voteringar.
        </p>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="stats-bar" style={{ display: "flex", gap: "16px", marginBottom: "12px", fontSize: "0.82rem", color: "var(--text-muted)" }}>
          <span>{stats.prop_nodes} propositions</span>
          <span>{stats.bet_nodes} committee reports</span>
          <span>{stats.vote_nodes} votes</span>
          <span>{stats.total_edges} edges</span>
        </div>
      )}

      {/* 2-column: feed + right rail */}
      <div className="layout-with-aside" style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>

      {/* Feed column */}
      <div style={{ flex: 1, minWidth: 0 }}>

      {/* Filters */}
      <div className="card">
        <div className="filter-row" style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <select value={nodeType} onChange={e => setNodeType(e.target.value)} style={inputStyle}>
            <option value="">All types</option>
            <option value="prop">Propositions</option>
            <option value="bet">Committee Reports</option>
            <option value="vote">Votes</option>
          </select>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
          <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
          <input type="text" placeholder="Sök titel/dok_id…" value={search}
            onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, minWidth: "180px" }} />
        </div>
        {/* Quick topic filters */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
          {["el", "elnät", "elmarknad", "kärnkraft", "vindkraft", "solenergi", "nätavgift", "elcertifikat", "kraftvärme"].map(term => (
            <button key={term} onClick={() => setSearch(prev => prev === term ? "" : term)}
              style={{
                padding: "2px 8px", borderRadius: "4px", fontSize: "0.72rem", fontWeight: 500, cursor: "pointer",
                background: search === term ? "rgba(59,130,246,0.15)" : "transparent",
                color: search === term ? "var(--accent-blue)" : "var(--text-muted)",
                border: `1px solid ${search === term ? "rgba(59,130,246,0.4)" : "var(--border-color)"}`,
                transition: "all .15s",
              }}>{term}</button>
          ))}
          {evidence && <EvidenceBadge manifestId={evidence.manifest_id} rootHash={evidence.root_hash} />}
        </div>
      </div>

      {/* Count */}
      {!loading && (
        <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: "12px" }}>
          {items.length} decision{items.length !== 1 ? "s" : ""} shown
          {nextCursor && " (more available)"}
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="card"><p style={{ color: "var(--text-muted)" }}>Loading decisions…</p></div>
      )}

      {/* Decision cards */}
      {items.map(node => {
        const badge = TYPE_BADGE[node.node_type] ?? TYPE_BADGE.prop;
        const displayDate = node.published_at_utc.slice(0, 10);
        const sourceUrl = node.source_url_html
          ? (node.source_url_html.startsWith("//") ? `https:${node.source_url_html}` : node.source_url_html)
          : null;

        return (
          <div key={node.node_id} className="card" style={{ marginBottom: "8px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
              <span style={{
                padding: "2px 8px", borderRadius: "4px", fontSize: "0.72rem", fontWeight: 600,
                background: badge.bg, color: badge.color, border: `1px solid ${badge.color}30`,
              }}>{badge.label}</span>
              {node.riksmote && (
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {node.riksmote}:{node.number}
                </span>
              )}
              {node.responsible_organ && (
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  {node.responsible_organ}
                </span>
              )}
              <span style={{ color: "var(--text-muted)", fontSize: "0.78rem", fontFamily: "var(--font-mono)", marginLeft: "auto" }}>
                {displayDate}
              </span>
            </div>

            {/* Title */}
            <div style={{ fontSize: "0.88rem", fontWeight: 500, marginBottom: "4px" }}>
              <a href={`/witness/decisions/${encodeURIComponent(node.node_id)}`}>
                {node.title}
              </a>
            </div>

            {/* Vote result bar (for vote nodes) */}
            {node.node_type === "vote" && node.total && (
              <div style={{ display: "flex", gap: "12px", fontSize: "0.78rem", margin: "6px 0" }}>
                <span style={{ color: "var(--accent-green)" }}>✓ Ja: {node.total.ja}</span>
                <span style={{ color: "var(--accent-red)" }}>✗ Nej: {node.total.nej}</span>
                <span style={{ color: "var(--text-muted)" }}>○ Avstår: {node.total.avstar}</span>
              </div>
            )}

            {/* Topic tags */}
            {node.topic_tags && node.topic_tags.length > 0 && (
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "4px" }}>
                {node.topic_tags.map(tag => (
                  <span key={tag} style={{
                    padding: "1px 5px", borderRadius: "3px", fontSize: "0.68rem",
                    background: "rgba(245, 158, 11, 0.1)", color: "#f59e0b",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                  }}>{tag}</span>
                ))}
              </div>
            )}

            {/* Footer */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
              {sourceUrl && (
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "0.78rem", color: "var(--accent-blue)" }}>Källa →</a>
              )}
              {node.evidence_ref && (
                <EvidenceBadge manifestId={node.evidence_ref.manifest_id} rootHash={node.evidence_ref.root_hash} />
              )}
            </div>
          </div>
        );
      })}

      {/* Load more */}
      {nextCursor && !loading && (
        <button onClick={() => fetchDecisions(nextCursor)} style={{
          display: "block", margin: "16px auto", padding: "8px 20px",
          background: "var(--bg-card)", color: "var(--accent-blue)",
          border: "1px solid var(--border-color)", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem",
        }}>Load more</button>
      )}

      </div>{/* end feed column */}

      {/* Right rail */}
      <aside className="layout-aside" style={{ width: "280px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ position: "sticky", top: "16px" }}>
          <EnergyPulsePanel />
        </div>
      </aside>

      </div>{/* end 2-column flex */}
    </div>
  );
}
