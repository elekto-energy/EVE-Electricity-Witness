"use client";

/**
 * StatementsFilters — speaker dropdown + source dropdown + date range + search.
 *
 * Slice 1B: Speaker dropdown fetches from /api/witness/statements/speakers
 * GATE_NO_PAGING_DERIVATION: never derive from paginated statements.
 */

import { useState, useEffect } from "react";

interface ObservedSpeaker {
  speaker_id: string;
  display_name: string;
  party: string | null;
  count: number;
  verified: boolean;
}

interface Source {
  source_id: string;
  publisher: string;
  source_type_canonical?: string;
}

interface StatementsFiltersProps {
  speaker: string;
  onSpeakerChange: (id: string) => void;
  source: string;
  onSourceChange: (s: string) => void;
  from: string;
  onFromChange: (d: string) => void;
  to: string;
  onToChange: (d: string) => void;
  search: string;
  onSearchChange: (q: string) => void;
}

export function StatementsFilters({
  speaker, onSpeakerChange,
  source, onSourceChange,
  from, onFromChange,
  to, onToChange,
  search, onSearchChange,
}: StatementsFiltersProps) {
  const [speakers, setSpeakers] = useState<ObservedSpeaker[]>([]);
  const [sources, setSources] = useState<Source[]>([]);

  useEffect(() => {
    // Slice 1B: observed speakers from dedicated endpoint
    fetch("/api/witness/statements/speakers")
      .then(r => r.json())
      .then(data => setSpeakers(data.observed ?? []))
      .catch(() => {});
    fetch("/api/registry/sources")
      .then(r => r.json())
      .then(data => setSources(data.sources ?? []))
      .catch(() => {});
  }, []);

  const inputStyle: React.CSSProperties = {
    padding: "6px 10px",
    fontSize: "0.85rem",
    fontFamily: "var(--font-mono)",
    background: "var(--bg-card)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-color)",
    borderRadius: "4px",
  };

  return (
    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
      {/* Speaker */}
      <select value={speaker} onChange={e => onSpeakerChange(e.target.value)} style={inputStyle}>
        <option value="">All speakers ({speakers.length})</option>
        {speakers.map(s => (
          <option key={s.speaker_id} value={s.speaker_id}>
            {s.verified ? "✅ " : "⚠️ "}{s.display_name}{s.party ? ` (${s.party})` : ""} ({s.count})
          </option>
        ))}
      </select>

      {/* Source */}
      <select value={source} onChange={e => onSourceChange(e.target.value)} style={inputStyle}>
        <option value="">All sources</option>
        {sources.map(s => (
          <option key={s.source_id} value={s.source_type_canonical ?? s.source_id}>{s.publisher}</option>
        ))}
      </select>

      {/* Date range */}
      <input type="date" value={from} onChange={e => onFromChange(e.target.value)} style={inputStyle} />
      <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>to</span>
      <input type="date" value={to} onChange={e => onToChange(e.target.value)} style={inputStyle} />

      {/* Search */}
      <input
        type="text"
        placeholder="Search…"
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        style={{ ...inputStyle, minWidth: "160px" }}
      />
    </div>
  );
}
