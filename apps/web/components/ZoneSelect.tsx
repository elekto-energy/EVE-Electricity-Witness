"use client";

import { useState, useEffect } from "react";

interface ZoneOption {
  code: string;
  name: string;
  country: string;
}

interface ZoneSelectProps {
  value: string;
  onChange: (zone: string) => void;
  multi?: boolean;
  multiValue?: string[];
  onMultiChange?: (zones: string[]) => void;
}

export function ZoneSelect({ value, onChange, multi, multiValue, onMultiChange }: ZoneSelectProps) {
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/registry/zones")
      .then(r => r.json())
      .then(data => {
        setZones(data.zones ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>Loading zones…</span>;
  }

  // Group by country
  const byCountry: Record<string, ZoneOption[]> = {};
  for (const z of zones) {
    (byCountry[z.country] ??= []).push(z);
  }
  const countries = Object.keys(byCountry).sort();

  if (multi && multiValue && onMultiChange) {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {countries.map(c => (
          <div key={c} style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginRight: "2px" }}>{c}:</span>
            {byCountry[c].map(z => {
              const selected = multiValue.includes(z.code);
              return (
                <button
                  key={z.code}
                  onClick={() => {
                    if (selected) {
                      onMultiChange(multiValue.filter(v => v !== z.code));
                    } else {
                      onMultiChange([...multiValue, z.code]);
                    }
                  }}
                  style={{
                    padding: "3px 8px",
                    fontSize: "0.78rem",
                    fontFamily: "var(--font-mono)",
                    background: selected ? "var(--accent-blue)" : "var(--bg-card)",
                    color: selected ? "#fff" : "var(--text-secondary)",
                    border: `1px solid ${selected ? "var(--accent-blue)" : "var(--border-color)"}`,
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                  title={z.name}
                >
                  {z.code}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: "6px 10px",
        fontSize: "0.85rem",
        fontFamily: "var(--font-mono)",
        background: "var(--bg-card)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-color)",
        borderRadius: "4px",
      }}
    >
      {countries.map(c => (
        <optgroup key={c} label={c}>
          {byCountry[c].map(z => (
            <option key={z.code} value={z.code}>
              {z.code} — {z.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
