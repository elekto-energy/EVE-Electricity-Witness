"use client";

import { useState } from "react";

interface IdentityStackProps {
  result: any;
  pdfResult: any;
}

function Layer({
  number,
  title,
  subtitle,
  items,
  color,
}: {
  number: number;
  title: string;
  subtitle: string;
  items: { label: string; value: string | null | undefined }[];
  color: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`border-l-2 ${color} pl-4 py-2`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left"
      >
        <span className="text-xs text-slate-500 font-mono">L{number}</span>
        <span className="text-sm font-semibold text-slate-200">{title}</span>
        <span className="text-xs text-slate-500">— {subtitle}</span>
        <span className="ml-auto text-xs text-slate-600">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-2 ml-6 space-y-1">
          {items.map((item) => (
            <div key={item.label} className="flex gap-2 text-xs">
              <span className="text-slate-500 w-32 shrink-0">{item.label}</span>
              <span className="font-mono text-slate-400 truncate">{item.value ?? "N/A"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function IdentityStack({ result, pdfResult }: IdentityStackProps) {
  return (
    <div className="mt-4 bg-slate-900 border border-slate-800 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
        Identity Stack
      </h2>

      <div className="space-y-1">
        <Layer
          number={1}
          title="Data"
          subtitle="dataset identity"
          color="border-emerald-500"
          items={[
            { label: "dataset_eve_id", value: result.dataset_eve_id },
            { label: "root_hash", value: result.vault?.root_hash },
            { label: "methodology", value: result.methodology_version },
            { label: "emission_scope", value: result.emission_scope },
            { label: "registry_hash", value: result.registry_hash },
          ]}
        />

        <Layer
          number={2}
          title="Query"
          subtitle="computation identity"
          color="border-blue-500"
          items={[
            { label: "query_hash", value: pdfResult?.query_hash ?? "(generate PDF to see)" },
            { label: "zone", value: result.zone },
            { label: "period", value: `${result.period.from} → ${result.period.to}` },
            { label: "rows", value: String(result.rows_count) },
          ]}
        />

        <Layer
          number={3}
          title="Document"
          subtitle="presentation identity"
          color="border-amber-500"
          items={[
            { label: "pdf_hash", value: pdfResult?.pdf_hash ?? "(generate PDF to see)" },
            { label: "language", value: pdfResult?.language ?? "—" },
            { label: "template", value: pdfResult?.template_version ?? "—" },
            { label: "report_index", value: pdfResult?.report_index ? String(pdfResult.report_index) : "—" },
            { label: "chain_hash", value: pdfResult?.chain_hash ?? "—" },
          ]}
        />

        <Layer
          number={4}
          title="Vault"
          subtitle="chain integrity"
          color="border-purple-500"
          items={[
            { label: "vault_index", value: result.vault?.event_index ? String(result.vault.event_index) : "N/A" },
            { label: "chain_hash", value: result.vault?.chain_hash },
            { label: "report_chain", value: pdfResult?.chain_hash ?? "—" },
          ]}
        />
      </div>

      <div className="mt-4 text-[10px] text-slate-600">
        Language affects document hash but not dataset identity or computational results.
      </div>
    </div>
  );
}
