"use client";

import { useState } from "react";

const ZONES = [
  "SE1", "SE2", "SE3", "SE4",
  "NO1", "NO2",
  "FI", "DE_LU", "PL",
  "EE", "LV", "LT", "FR", "NL",
];

interface QueryPanelProps {
  onSubmit: (params: { zone: string; start: string; end: string; lang: string }) => void;
  loading: boolean;
}

export default function QueryPanel({ onSubmit, loading }: QueryPanelProps) {
  const [zone, setZone] = useState("SE3");
  const [start, setStart] = useState("2024-01-01");
  const [end, setEnd] = useState("2024-01-31");
  const [lang, setLang] = useState("en");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ zone, start, end, lang });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
        Query
      </h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Zone */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Zone</label>
          <select
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500"
          >
            {ZONES.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </div>

        {/* From */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">From</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* To */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">To</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Language */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Language</label>
          <div className="flex gap-1">
            {["en", "sv"].map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={`flex-1 px-3 py-2 text-sm font-mono rounded border ${
                  lang === l
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-4 w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded transition-colors"
      >
        {loading ? "Computing..." : "Generate Evidence Report"}
      </button>
    </form>
  );
}
