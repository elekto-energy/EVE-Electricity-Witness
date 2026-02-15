"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
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

interface PollData {
  poll: Poll;
  evidence: { manifest_id: string; root_hash: string };
}

export default function PollDetailPage() {
  const params = useParams();
  const pollId = params.pollId as string;
  const [data, setData] = useState<PollData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/opinion/poll/${pollId}`)
      .then(r => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setData)
      .catch(() => setError("Poll not found"));
  }, [pollId]);

  if (error) {
    return (
      <div>
        <Link href="/opinion" style={{ fontSize: "0.85rem" }}>← Back to polls</Link>
        <div className="card" style={{ marginTop: "16px", borderColor: "var(--accent-red)" }}>
          <p style={{ color: "var(--accent-red)" }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="card"><p style={{ color: "var(--text-muted)" }}>Loading…</p></div>;
  }

  const { poll, evidence } = data;

  return (
    <div>
      <Link href="/opinion" style={{ fontSize: "0.85rem" }}>← Back to polls</Link>

      <div className="page-header" style={{ marginTop: "12px" }}>
        <h1 className="page-title">🗳 {poll.title}</h1>
        <p className="page-subtitle">{poll.title_en}</p>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Poll Details</span>
          <EvidenceBadge manifestId={evidence.manifest_id} rootHash={evidence.root_hash} />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "12px" }}>
            Status: <span className="status-pill disabled">{poll.status}</span>
            {" · "}Requires: {poll.requires}
          </div>

          {/* Options (disabled) */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {poll.options.map(opt => (
              <div key={opt.id} style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 16px",
                background: "var(--bg-card-hover)",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                opacity: 0.6,
                cursor: "not-allowed",
              }}>
                <div style={{
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  border: "2px solid var(--border-color)",
                }} />
                <div>
                  <span style={{ fontWeight: 500 }}>{opt.label}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginLeft: "8px" }}>
                    {opt.label_en}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Disabled notice */}
          <div style={{
            marginTop: "16px",
            padding: "10px 14px",
            background: "rgba(245, 158, 11, 0.1)",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            borderRadius: "6px",
            color: "var(--accent-amber)",
            fontSize: "0.82rem",
          }}>
            ⚠️ Voting disabled — requires Email verification (Phase C).
          </div>
        </div>

        {/* Linked witness */}
        <div style={{
          padding: "12px 16px",
          background: "rgba(59, 130, 246, 0.05)",
          border: "1px solid rgba(59, 130, 246, 0.2)",
          borderRadius: "6px",
        }}>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "4px" }}>
            Linked Witness Evidence
          </div>
          <div style={{ display: "flex", gap: "16px", fontSize: "0.85rem" }}>
            <Link href={`/witness/${poll.witness_topic_id}`}>
              🔍 Topic: {poll.witness_topic_id}
            </Link>
            <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
              chain: {poll.witness_chain_id}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
