"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { EvidenceBadge } from "@/components/EvidenceBadge";

interface PollOption {
  id: string;
  label: string;
  label_en: string;
}

interface Poll {
  id: string;
  title: string;
  title_en: string;
  witness_topic_id: string;
  witness_chain_id: string;
  options: PollOption[];
  status: string;
  requires: string;
}

interface PollsData {
  polls: Poll[];
  evidence: { manifest_id: string; root_hash: string };
}

const ANALYSES = [
  {
    slug: "capacity-layers",
    icon: "⚡",
    title: "Flaskhalslösningar — Central till Lokal",
    subtitle: "Tre nivåer med realistiska beräkningar. V2H, batterier, mikronät — vad ger de faktiskt?",
    status: "live",
  },
  {
    slug: "bottleneck-solutions",
    icon: "🔧",
    title: "Strategisk energiplacering per energislag",
    subtitle: "Detaljerade strategier: vind, sol, mikrovattenkraft, lagring i SE3/SE4.",
    status: "live",
  },
];

const WITNESS_LINKS = [
  {
    href: "/witness/energy-decisions",
    icon: "⚖️",
    title: "Svensk energipolitik — beslut för beslut",
  },
  {
    href: "/witness/ringhals-cost",
    icon: "⚛️",
    title: "Ringhals 1 & 2 — Vad sa de? Vad hände?",
  },
];

export default function OpinionPage() {
  const [data, setData] = useState<PollsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/opinion/polls")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">🗳 Opinion</h1>
        <p className="page-subtitle">
          Evidensbaserade analyser och polls om energi. Varje sida är grundad i verifierbara data.
        </p>
      </div>

      {/* === ANALYSES === */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}>
          <span className="status-pill live">live</span>
          <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>Analyser</span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
            Witness-mode: fakta utan värdering
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ANALYSES.map(a => (
            <Link key={a.slug} href={`/opinion/${a.slug}`} style={{ textDecoration: "none" }}>
              <div className="card" style={{
                cursor: "pointer",
                marginBottom: 0,
                display: "flex",
                alignItems: "center",
                gap: 14,
                transition: "border-color 0.15s",
              }}>
                <span style={{ fontSize: "1.5rem" }}>{a.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{a.title}</div>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>{a.subtitle}</div>
                </div>
                <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* === WITNESS LINKS === */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 8 }}>
          Se även: Verifierade faktatidslinjer under <Link href="/witness" style={{ color: "#93c5fd" }}>🔍 Witness</Link>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {WITNESS_LINKS.map(w => (
            <Link key={w.href} href={w.href} style={{ textDecoration: "none" }}>
              <div style={{
                padding: "8px 14px", borderRadius: 6,
                background: "rgba(59,130,246,0.04)",
                border: "1px solid rgba(59,130,246,0.15)",
                display: "flex", alignItems: "center", gap: 10,
                fontSize: "0.85rem",
              }}>
                <span>{w.icon}</span>
                <span style={{ color: "#93c5fd" }}>{w.title}</span>
                <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: "0.75rem" }}>🔍 witness</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* === DIVIDER === */}
      <div style={{
        height: 1,
        background: "var(--border-color)",
        margin: "24px 0",
      }} />

      {/* === POLLS === */}
      <div>
        {/* Voting disabled banner */}
        <div style={{
          padding: "12px 16px",
          background: "rgba(245, 158, 11, 0.1)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          borderRadius: "6px",
          color: "var(--accent-amber)",
          fontSize: "0.85rem",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}>
          <span>⚠️</span>
          Omröstning avstängd — kräver e-postverifiering (Fas C).
          Polls visas som strukturell förhandsgranskning.
        </div>

        {loading && <div className="card"><p style={{ color: "var(--text-muted)" }}>Laddar polls…</p></div>}

        {data && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <span className="status-pill scaffold">scaffold</span>
              <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>Polls</span>
              <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                {data.polls.length} polls · seed v1
              </span>
              {data.evidence && (
                <EvidenceBadge manifestId={data.evidence.manifest_id} rootHash={data.evidence.root_hash} />
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {data.polls.map(poll => (
                <Link key={poll.id} href={`/opinion/${poll.id}`} style={{ textDecoration: "none" }}>
                  <div className="card" style={{ cursor: "pointer", marginBottom: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <span className="status-pill disabled">{poll.status}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
                        kräver: {poll.requires}
                      </span>
                    </div>

                    <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "4px" }}>
                      {poll.title}
                    </div>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.82rem", marginBottom: "8px" }}>
                      {poll.title_en}
                    </div>

                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {poll.options.map(opt => (
                        <span key={opt.id} style={{
                          padding: "4px 10px",
                          fontSize: "0.78rem",
                          background: "var(--bg-card-hover)",
                          border: "1px solid var(--border-color)",
                          borderRadius: "4px",
                          color: "var(--text-muted)",
                        }}>
                          {opt.label}
                        </span>
                      ))}
                    </div>

                    <div style={{ marginTop: "8px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Länkad till witness topic:{" "}
                      <span style={{ fontFamily: "var(--font-mono)" }}>{poll.witness_topic_id}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
