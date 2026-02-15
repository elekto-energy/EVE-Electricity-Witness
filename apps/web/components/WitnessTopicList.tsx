"use client";

/**
 * WitnessTopicList — topic cards fetched from /api/witness/topics.
 * TR7: No interpretation. Only structured data + links.
 * Gate C: No hardcoded domain data.
 */

import { useState, useEffect } from "react";

interface Topic {
  id: string;
  title: string;
  title_en: string;
  tag: string;
  summary_neutral: string;
  chain_ids: string[];
  source_count: number;
}

interface WitnessTopicListProps {
  onSelect: (topicId: string) => void;
}

const TAG_COLORS: Record<string, string> = {
  "ENERGY.NUCLEAR": "#8b5cf6",
  "ENERGY.TAXES_FEES": "#f59e0b",
  "ENERGY.BUILDING_ENERGY_RULES": "#06b6d4",
  "ENERGY.GRID_TRANSMISSION": "#10b981",
  "ENERGY.MARKET_DESIGN": "#3b82f6",
  "ENERGY.EU_IMPLEMENTATION": "#ec4899",
};

export function WitnessTopicList({ onSelect }: WitnessTopicListProps) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = filter
      ? `/api/witness/topics?q=${encodeURIComponent(filter)}`
      : "/api/witness/topics";
    fetch(url)
      .then(r => r.json())
      .then(data => {
        setTopics(data.topics ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filter]);

  return (
    <div>
      {/* Search */}
      <input
        type="text"
        placeholder="Search topics…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 14px",
          fontSize: "0.88rem",
          background: "var(--bg-card)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-color)",
          borderRadius: "6px",
          marginBottom: "16px",
        }}
      />

      {loading && <p style={{ color: "var(--text-muted)" }}>Loading topics…</p>}

      {!loading && topics.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>No topics found.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {topics.map(topic => (
          <div
            key={topic.id}
            className="card"
            onClick={() => onSelect(topic.id)}
            style={{ cursor: "pointer", marginBottom: 0 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <span style={{
                padding: "2px 8px",
                borderRadius: "4px",
                fontSize: "0.72rem",
                fontFamily: "var(--font-mono)",
                background: `${TAG_COLORS[topic.tag] ?? "#6b7280"}22`,
                color: TAG_COLORS[topic.tag] ?? "var(--text-muted)",
                border: `1px solid ${TAG_COLORS[topic.tag] ?? "#6b7280"}44`,
              }}>
                {topic.tag}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                {topic.chain_ids.length} chain(s) · {topic.source_count} sources
              </span>
            </div>
            <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "4px" }}>
              {topic.title}
            </div>
            <div style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>
              {topic.title_en}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
