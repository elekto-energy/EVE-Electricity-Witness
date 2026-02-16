"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { WitnessTopicList } from "@/components/WitnessTopicList";
import { WitnessChainView } from "@/components/WitnessChainView";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { ProofPackButton } from "@/components/ProofPackButton";

interface Chain {
  id: string;
  topic_id: string;
  title: string;
  title_en: string;
  steps: Array<{
    position: number;
    doc_type: string;
    doc_id: string;
    title: string;
    date: string;
    body: string;
    uri: string;
    description_neutral: string;
  }>;
}

interface TopicDetail {
  topic: {
    id: string;
    title: string;
    title_en: string;
    tag: string;
    summary_neutral: string;
    chain_ids: string[];
    source_count: number;
  };
  chains: Chain[];
  evidence: { manifest_id: string; root_hash: string };
}

export default function WitnessPage() {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [detail, setDetail] = useState<TopicDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!selectedTopic) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    fetch(`/api/witness/topic/${selectedTopic}`)
      .then(r => r.json())
      .then(data => {
        setDetail(data);
        setLoadingDetail(false);
      })
      .catch(() => setLoadingDetail(false));
  }, [selectedTopic]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">🔍 Witness Mode</h1>
        <p className="page-subtitle">
          Verifierbara fakta och beslutstidslinjer. Ingen tolkning — bara data och källor.
        </p>
      </div>

      {/* === WITNESS TIMELINES === */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
        }}>
          <span className="status-pill live">live</span>
          <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>Faktatidslinjer</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { href: "/witness/energy-decisions", icon: "⚖️", title: "Svensk energipolitik — beslut för beslut", sub: "38 verifierade beslut: skatter, lagar, nedläggningar, stöd, EU. 1951–2026. EVE Witness Standard v1.1." },
            { href: "/witness/ringhals-cost", icon: "⚛️", title: "Ringhals 1 & 2 — Vad sa de? Vad hände?", sub: "Politiska uttalanden vs verifierade utfall. 2014–2024." },
            { href: "/witness/price-structure", icon: "💰", title: "Flaskhalsintäkter — vart går pengarna?", sub: "SVK:s intäkter från elprisområden. Siffror och källor." },
          ].map(item => (
            <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
              <div className="card" style={{ cursor: "pointer", marginBottom: 0, display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: "1.5rem" }}>{item.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{item.title}</div>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>{item.sub}</div>
                </div>
                <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div style={{ height: 1, background: "var(--border-color)", margin: "20px 0" }} />

      {/* If a topic is selected, show detail */}
      {selectedTopic && detail && !loadingDetail ? (
        <div>
          {/* Back button */}
          <button
            onClick={() => setSelectedTopic(null)}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent-blue)",
              cursor: "pointer",
              fontSize: "0.85rem",
              marginBottom: "16px",
              padding: 0,
            }}
          >
            ← Back to topics
          </button>

          {/* Topic header */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">{detail.topic.title}</span>
              <EvidenceBadge manifestId={detail.evidence.manifest_id} rootHash={detail.evidence.root_hash} />
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "8px" }}>
              {detail.topic.title_en}
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
              {detail.topic.summary_neutral}
            </p>
          </div>

          {/* Chains */}
          {detail.chains.map(chain => (
            <div key={chain.id} className="card">
              <div className="card-header">
                <span className="card-title">Chain: {chain.id}</span>
                <ProofPackButton chainId={chain.id} disabled />
              </div>
              <WitnessChainView chain={chain} />
            </div>
          ))}
        </div>
      ) : selectedTopic && loadingDetail ? (
        <div className="card">
          <p style={{ color: "var(--text-muted)" }}>Loading topic detail…</p>
        </div>
      ) : (
        /* Topic list */
        <div>
          <div className="card" style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span className="status-pill seed">seed v1</span>
              <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                Deterministic seed dataset — 3 topics, 3 chains, 12 sources.
              </span>
              <span style={{ marginLeft: "auto" }}>
                <Link href="/witness/se/energy" style={{ fontSize: "0.82rem" }}>
                  Phase A legacy →
                </Link>
              </span>
            </div>
          </div>
          <WitnessTopicList onSelect={setSelectedTopic} />
        </div>
      )}
    </div>
  );
}
