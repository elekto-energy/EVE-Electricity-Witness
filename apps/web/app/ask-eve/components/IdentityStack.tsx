"use client";

import { useState } from "react";

interface IdentityStackProps {
  result: any;
  pdfResult: any;
}

function Layer({
  number, title, subtitle, items, color,
}: {
  number: number; title: string; subtitle: string;
  items: { label: string; value: string | null | undefined }[];
  color: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderLeft: `2px solid ${color}`, paddingLeft: 14, paddingTop: 6, paddingBottom: 6 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
          background: "none", border: "none", cursor: "pointer", padding: 0,
        }}
      >
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", width: 20 }}>L{number}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>— {subtitle}</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 6, marginLeft: 28 }}>
          {items.map((item) => (
            <div key={item.label} style={{ display: "flex", gap: 10, fontSize: 10, padding: "2px 0" }}>
              <span style={{ color: "var(--text-muted)", width: 120, flexShrink: 0 }}>{item.label}</span>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.value ?? "N/A"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function IdentityStack({ result, pdfResult }: IdentityStackProps) {
  return (
    <div className="card" style={{ padding: 20, marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Identity Stack</span>
        <span style={{
          fontSize: 9, padding: "2px 6px", borderRadius: 4, fontFamily: "var(--font-mono)",
          background: "rgba(168, 85, 247, 0.1)", border: "1px solid rgba(168, 85, 247, 0.3)",
          color: "#a855f7",
        }}>4-layer</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Layer
          number={1} title="Data" subtitle="dataset identity" color="#10b981"
          items={[
            { label: "dataset_eve_id", value: result.dataset_eve_id },
            { label: "root_hash", value: result.vault?.root_hash },
            { label: "methodology", value: result.methodology_version },
            { label: "emission_scope", value: result.emission_scope },
            { label: "registry_hash", value: result.registry_hash },
          ]}
        />

        <Layer
          number={2} title="Query" subtitle="computation identity" color="#3b82f6"
          items={[
            { label: "query_hash", value: pdfResult?.query_hash ?? "(generate PDF)" },
            { label: "zone", value: result.zone },
            { label: "period", value: `${result.period.from} → ${result.period.to}` },
            { label: "rows", value: String(result.rows_count) },
          ]}
        />

        <Layer
          number={3} title="Document" subtitle="presentation identity" color="#f59e0b"
          items={[
            { label: "pdf_hash", value: pdfResult?.pdf_hash ?? "(generate PDF)" },
            { label: "language", value: pdfResult?.language ?? "—" },
            { label: "template", value: pdfResult?.template_version ?? "—" },
            { label: "report_index", value: pdfResult?.report_index ? String(pdfResult.report_index) : "—" },
          ]}
        />

        <Layer
          number={4} title="Vault" subtitle="chain integrity" color="#a855f7"
          items={[
            { label: "vault_index", value: result.vault?.event_index ? String(result.vault.event_index) : "N/A" },
            { label: "chain_hash", value: result.vault?.chain_hash },
            { label: "report_chain", value: pdfResult?.chain_hash ?? "—" },
          ]}
        />
      </div>

      <div style={{ marginTop: 10, fontSize: 9, color: "var(--text-muted)" }}>
        Language affects document hash but not dataset identity or computational results.
      </div>
    </div>
  );
}
