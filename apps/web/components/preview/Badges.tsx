"use client";

import { useEffect, useState } from "react";

type Tone = "ok" | "warn" | "bad" | "info" | "muted";

const TONE: Record<Tone, { bg: string; border: string; color: string }> = {
  ok:    { bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.35)", color: "var(--s-ok)" },
  warn:  { bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.40)", color: "var(--s-warn)" },
  bad:   { bg: "rgba(239,68,68,0.10)",  border: "rgba(239,68,68,0.40)",  color: "var(--s-bad)" },
  info:  { bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.35)", color: "var(--s-se1)" },
  muted: { bg: "rgba(107,114,128,0.10)", border: "rgba(107,114,128,0.35)", color: "var(--s-muted)" },
};

export function Pill({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  const t = TONE[tone];
  return (
    <span title={title} style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 8px", borderRadius: 999,
      background: t.bg, border: `1px solid ${t.border}`, color: t.color, fontSize: "0.78rem", fontWeight: 600, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
      {children}
    </span>
  );
}

/** Status of one series-day, taken from the coverage record. The UI never guesses. */
export function StatusBadge({ status, selectionVerified, missing }: { status: string; selectionVerified?: boolean | null; missing?: number | null }) {
  if (status === "COMPLETE" && selectionVerified === false)
    return <Pill tone="warn" title="Komplett data från en vald källserie utanför den verifierade perioden">Ej verifierad</Pill>;
  switch (status) {
    case "COMPLETE": return <Pill tone="ok" title="Alla intervall för dygnet finns hos källan">Komplett</Pill>;
    case "PARTIAL": return <Pill tone="warn" title="Källan saknar vissa intervall; de fylls aldrig i">Delvis{missing ? `, ${missing} kvart saknas` : ""}</Pill>;
    case "IN_PROGRESS": return <Pill tone="info" title="Pågående dygn; källan publicerar fortfarande">Pågår</Pill>;
    case "NOT_PUBLISHED_YET": return <Pill tone="muted" title="Ännu inte publicerat av källan">Ej publicerad ännu</Pill>;
    case "CONFLICT": return <Pill tone="bad" title="Källans dubbletter stämmer inte överens; värdena visas inte">Saknas (motstridigt)</Pill>;
    case "NO_RECORD": return <Pill tone="muted" title="Ingen post i denna ögonblicksbild">Saknas</Pill>;
    default: return <Pill tone="bad" title="Ingen data för dygnet">Saknas</Pill>;
  }
}

function stockholmDate(d: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t: string) => p.find(x => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** Freshness of the whole dataset, judged in the viewer's browser against the publication time. */
export function DataFreshness({ publishedAtUtc, snapshotToday }: { publishedAtUtc: string; snapshotToday: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); }, []);
  const published = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "medium", timeStyle: "short" }).format(new Date(publishedAtUtc));
  if (!now) return <Pill tone="muted">Uppdaterad {published}</Pill>;
  const today = stockholmDate(now);
  if (today === snapshotToday) return <Pill tone="ok" title={`Uppdaterad ${published}`}>Aktuell, uppdaterad {published}</Pill>;
  return <Pill tone="warn" title="Senast publicerade data är inte från idag">Inaktuell, senast uppdaterad {published}</Pill>;
}
