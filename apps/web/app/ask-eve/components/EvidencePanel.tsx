"use client";

interface EvidencePanelProps {
  result: any;
  pdfResult: any;
}

function HashRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  const display = value ?? "N/A";
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-slate-800/50">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-mono text-slate-300 max-w-[340px] truncate">
        {display}
      </span>
    </div>
  );
}

export default function EvidencePanel({ result, pdfResult }: EvidencePanelProps) {
  return (
    <div className="mt-4 bg-slate-900 border border-slate-800 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
        Evidence
      </h2>

      <div className="space-y-0">
        <HashRow label="dataset_eve_id" value={result.dataset_eve_id} />
        <HashRow label="methodology" value={result.methodology_version} />
        <HashRow label="emission_scope" value={result.emission_scope} />
        <HashRow label="registry_hash" value={result.registry_hash} />
        <HashRow label="root_hash" value={result.vault?.root_hash} />
        <HashRow label="chain_hash" value={result.vault?.chain_hash} />
        <HashRow label="vault_index" value={result.vault?.event_index} />

        {pdfResult && (
          <>
            <div className="my-2 border-t border-slate-700" />
            <HashRow label="pdf_hash" value={pdfResult.pdf_hash} />
            <HashRow label="query_hash" value={pdfResult.query_hash} />
            <HashRow label="language" value={pdfResult.language} />
            <HashRow label="template_version" value={pdfResult.template_version} />
            <HashRow label="report_index" value={pdfResult.report_index} />
          </>
        )}
      </div>

      {/* Rebuild command */}
      <div className="mt-4 p-3 bg-slate-950 border border-slate-800 rounded">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Rebuild Command</div>
        <code className="text-xs text-green-400 font-mono break-all">
          {result.query_command}
        </code>
      </div>
    </div>
  );
}
