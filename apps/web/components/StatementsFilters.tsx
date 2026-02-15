"use client";

/**
 * StatementsFilters — speaker dropdown + date range + search.
 * Gate C: speaker list loaded from /api/registry/speakers.
 */

import { useState, useEffect } from "react";

interface Speaker {
  speaker_id: string;
  display_name: string;
}

interface StatementsFiltersProps {
  speaker: string;
  onSpeakerChange: (id: string) => void;
  from: string;
  onFromChange: (d: string) => void;
  to: string;
  onToChange: (d: string) => void;
  search: string;
  onSearchChange: (q: string) => void;
}

export function StatementsFilters({
  speaker, onSpeakerChange,
  from, onFromChange,
  to, onToChange,
  search, onSearchChange,
}: StatementsFiltersProps) {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);

  useEffect(() => {
    fetch("/api/registry/speakers")
      .then(r => r.json())
      .then(data => setSpeakers(data.speakers ?? []))
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
        <option value="">All speakers</option>
        {speakers.map(s => (
          <option key={s.speaker_id} value={s.speaker_id}>{s.display_name}</option>
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
