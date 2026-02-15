"use client";

interface DateSelectProps {
  value: string;
  onChange: (date: string) => void;
}

export function DateSelect({ value, onChange }: DateSelectProps) {
  return (
    <input
      type="date"
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
    />
  );
}
