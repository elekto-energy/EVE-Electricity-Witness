"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface NewsItem {
  id: string;
  date: string;
  source: string;
  source_url: string | null;
  category: string;
  title: string;
  summary: string;
  platform_link: string | null;
  platform_context: string | null;
}

interface NewsData {
  items: NewsItem[];
  categories: string[];
  total: number;
}

const CATEGORY_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  flaskhalsar: { label: "Flaskhalsar", icon: "🔴", color: "rgba(239,68,68,0.3)" },
  elpris: { label: "Elpris", icon: "💰", color: "rgba(245,158,11,0.3)" },
  nätreglering: { label: "Nätreglering", icon: "📋", color: "rgba(59,130,246,0.3)" },
  produktion: { label: "Produktion", icon: "⚡", color: "rgba(16,185,129,0.3)" },
  klimat: { label: "Klimat", icon: "🌍", color: "rgba(34,197,94,0.3)" },
  systemtjänster: { label: "Systemtjänster", icon: "⚙️", color: "rgba(168,85,247,0.3)" },
  effektavgifter: { label: "Effektavgifter", icon: "📊", color: "rgba(236,72,153,0.3)" },
  smarta_elnät: { label: "Smarta elnät", icon: "🔌", color: "rgba(6,182,212,0.3)" },
};

const SOURCE_COLORS: Record<string, string> = {
  "Ei": "#3b82f6",
  "Energimyndigheten": "#10b981",
  "SVK": "#f59e0b",
  "Second Opinion": "#8b5cf6",
  "ELEKTO EU (plattformsanalys)": "#ec4899",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });
}

function daysAgo(dateStr: string): string {
  const now = new Date("2026-02-16");
  const d = new Date(dateStr);
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "idag";
  if (diff === 1) return "igår";
  if (diff < 7) return `${diff} dagar sedan`;
  if (diff < 30) return `${Math.floor(diff / 7)} veckor sedan`;
  return `${Math.floor(diff / 30)} månader sedan`;
}

export default function NyheterPage() {
  const [data, setData] = useState<NewsData | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("alla");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = selectedCategory === "alla"
      ? "/api/news"
      : `/api/news?category=${selectedCategory}`;

    setLoading(true);
    fetch(url)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedCategory]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📰 Nyheter</h1>
        <p className="page-subtitle">
          Kuraterade myndighetsnyheter kopplade till plattformens energidata.
          Varje nyhet sammanfattas i egna ord med källänk.
        </p>
      </div>

      {/* Witness mode notice */}
      <div style={{
        padding: "12px 16px",
        background: "rgba(59,130,246,0.08)",
        border: "1px solid rgba(59,130,246,0.25)",
        borderRadius: 6,
        marginBottom: 20,
        fontSize: "0.82rem",
        color: "var(--text-secondary)",
        display: "flex",
        gap: 8,
      }}>
        <span>🔍</span>
        <span>
          <strong>Nyheten + siffrorna:</strong> Vi sammanfattar myndighetsnyheter och kopplar dem till
          plattformens data. Läs nyheten, se siffrorna, dra din egen slutsats.
        </span>
      </div>

      {/* Category filter */}
      <div style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        marginBottom: 20,
      }}>
        <button
          onClick={() => setSelectedCategory("alla")}
          style={{
            padding: "6px 14px",
            fontSize: "0.78rem",
            background: selectedCategory === "alla" ? "rgba(59,130,246,0.2)" : "var(--bg-card)",
            border: `1px solid ${selectedCategory === "alla" ? "rgba(59,130,246,0.5)" : "var(--border-color)"}`,
            borderRadius: 20,
            color: selectedCategory === "alla" ? "var(--accent-blue)" : "var(--text-muted)",
            cursor: "pointer",
            fontWeight: selectedCategory === "alla" ? 600 : 400,
          }}
        >
          Alla
        </button>
        {data?.categories.map((cat) => {
          const meta = CATEGORY_LABELS[cat] || { label: cat, icon: "📌", color: "var(--border-color)" };
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: "6px 14px",
                fontSize: "0.78rem",
                background: isActive ? `${meta.color}` : "var(--bg-card)",
                border: `1px solid ${isActive ? meta.color : "var(--border-color)"}`,
                borderRadius: 20,
                color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                cursor: "pointer",
                fontWeight: isActive ? 600 : 400,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span>{meta.icon}</span> {meta.label}
            </button>
          );
        })}
      </div>

      {/* Items count */}
      {data && (
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 12 }}>
          {data.total} {data.total === 1 ? "nyhet" : "nyheter"}
          {selectedCategory !== "alla" && ` i kategorin "${CATEGORY_LABELS[selectedCategory]?.label || selectedCategory}"`}
        </div>
      )}

      {loading && <div className="card"><p style={{ color: "var(--text-muted)" }}>Laddar nyheter…</p></div>}

      {/* News items */}
      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.items.map((item) => {
            const catMeta = CATEGORY_LABELS[item.category] || { label: item.category, icon: "📌", color: "var(--border-color)" };
            const srcColor = SOURCE_COLORS[item.source] || "var(--text-muted)";

            return (
              <div key={item.id} className="card" style={{ marginBottom: 0 }}>
                {/* Top row: date + source + category */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.72rem",
                    color: "var(--text-muted)",
                  }}>
                    {formatDate(item.date)}
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>·</span>
                  <span style={{
                    fontSize: "0.72rem",
                    color: "var(--text-muted)",
                  }}>
                    {daysAgo(item.date)}
                  </span>
                  <span style={{
                    padding: "2px 8px",
                    fontSize: "0.7rem",
                    borderRadius: 10,
                    background: `${srcColor}22`,
                    border: `1px solid ${srcColor}44`,
                    color: srcColor,
                    fontWeight: 500,
                  }}>
                    {item.source}
                  </span>
                  <span style={{
                    padding: "2px 8px",
                    fontSize: "0.7rem",
                    borderRadius: 10,
                    background: catMeta.color,
                    color: "var(--text-primary)",
                    fontWeight: 500,
                  }}>
                    {catMeta.icon} {catMeta.label}
                  </span>
                </div>

                {/* Title */}
                <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: 6, lineHeight: 1.3 }}>
                  {item.title}
                </div>

                {/* Summary */}
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 10 }}>
                  {item.summary}
                </div>

                {/* Action row */}
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  {/* Source link */}
                  {item.source_url && (
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noopener"
                      style={{
                        fontSize: "0.78rem",
                        color: "#93c5fd",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      🔗 Läs hos {item.source}
                    </a>
                  )}

                  {/* Platform link */}
                  {item.platform_link && (
                    <Link
                      href={item.platform_link}
                      style={{
                        fontSize: "0.78rem",
                        color: "var(--accent-green)",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      📊 Se data på plattformen
                    </Link>
                  )}
                </div>

                {/* Platform context */}
                {item.platform_context && (
                  <div style={{
                    marginTop: 8,
                    padding: "8px 12px",
                    background: "rgba(16,185,129,0.06)",
                    border: "1px solid rgba(16,185,129,0.2)",
                    borderRadius: 4,
                    fontSize: "0.75rem",
                    color: "var(--accent-green)",
                  }}>
                    💡 {item.platform_context}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sources footer */}
      <div style={{
        marginTop: 24,
        padding: "12px 16px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-color)",
        borderRadius: 6,
        fontSize: "0.75rem",
        color: "var(--text-muted)",
      }}>
        <strong>Källor:</strong> Nyheter kurateras manuellt från{" "}
        <a href="https://ei.se/om-oss/nyheter" target="_blank" rel="noopener" style={{ color: "#93c5fd" }}>Ei</a>,{" "}
        <a href="https://www.energimyndigheten.se/en/news/" target="_blank" rel="noopener" style={{ color: "#93c5fd" }}>Energimyndigheten</a>,{" "}
        <a href="https://www.svk.se" target="_blank" rel="noopener" style={{ color: "#93c5fd" }}>Svenska kraftnät</a> och{" "}
        <a href="https://second-opinion.se" target="_blank" rel="noopener" style={{ color: "#93c5fd" }}>Second Opinion</a>.
        Sammanfattningar i egna ord. Alltid källänk.
      </div>

      {/* RSS subscribe */}
      <div style={{
        marginTop: 12,
        padding: "10px 16px",
        background: "rgba(245,158,11,0.06)",
        border: "1px solid rgba(245,158,11,0.2)",
        borderRadius: 6,
        fontSize: "0.78rem",
        color: "var(--text-secondary)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <span style={{ fontSize: "1.1rem" }}>📡</span>
        <span>
          Prenumerera:{" "}
          <a href="/api/news/rss" style={{ color: "#f59e0b", fontWeight: 600 }}>
            RSS-feed
          </a>
          {" "}— Fungerar i alla RSS-läsare (Feedly, Inoreader, etc).
        </span>
      </div>
    </div>
  );
}
