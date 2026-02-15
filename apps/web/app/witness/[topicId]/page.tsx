"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { WitnessChainView } from "@/components/WitnessChainView";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { ProofPackButton } from "@/components/ProofPackButton";
import Link from "next/link";

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
  chains: Array<{
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
  }>;
  evidence: { manifest_id: string; root_hash: string };
}

export default function WitnessTopicPage() {
  const params = useParams();
  const topicId = params.topicId as string;
  const [detail, setDetail] = useState<TopicDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/witness/topic/${topicId}`)
      .then(r => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setDetail)
      .catch(() => setError("Topic not found"));
  }, [topicId]);

  if (error) {
    return (
      <div>
        <Link href="/witness" style={{ fontSize: "0.85rem" }}>← Back to topics</Link>
        <div className="card" style={{ marginTop: "16px", borderColor: "var(--accent-red)" }}>
          <p style={{ color: "var(--accent-red)" }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!detail) {
    return <div className="card"><p style={{ color: "var(--text-muted)" }}>Loading…</p></div>;
  }

  return (
    <div>
      <Link href="/witness" style={{ fontSize: "0.85rem" }}>← Back to topics</Link>

      <div className="page-header" style={{ marginTop: "12px" }}>
        <h1 className="page-title">🔍 {detail.topic.title}</h1>
        <p className="page-subtitle">{detail.topic.title_en}</p>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Topic Summary</span>
          <EvidenceBadge manifestId={detail.evidence.manifest_id} rootHash={detail.evidence.root_hash} />
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
          {detail.topic.summary_neutral}
        </p>
        <div style={{ marginTop: "8px", fontSize: "0.78rem", color: "var(--text-muted)" }}>
          {detail.topic.chain_ids.length} chain(s) · {detail.topic.source_count} sources · tag: {detail.topic.tag}
        </div>
      </div>

      {detail.chains.map(chain => (
        <div key={chain.id} className="card">
          <div className="card-header">
            <span className="card-title">{chain.title}</span>
            <ProofPackButton chainId={chain.id} disabled />
          </div>
          <WitnessChainView chain={chain} />
        </div>
      ))}
    </div>
  );
}
