"use client";

/**
 * SpotLiveBar — Kompakt live-panel SE1–SE4
 *
 * Visar aktuellt spotpris per zon + sparkline för dygnet.
 * Hämtar från /api/spot/live per zon.
 * Auto-refresh var 5:e minut.
 *
 * Placeras högst upp på sidan — alltid synlig.
 *
 * Layer: CMD (ENTSO-E A44 direkt)
 * TR1: No source, no number.
 * TR6: Code fetches — never invents.
 */

import { useState, useEffect, useCallback, useMemo } from "react";

const ZONES = ["SE1", "SE2", "SE3", "SE4"] as const;
const ZONE_NAMES: Record<string, string> = { SE1: "Luleå", SE2: "Sundsvall", SE3: "Stockholm", SE4: "Malmö" };
const ZONE_COLORS: Record<string, string> = { SE1: "#22d3ee", SE2: "#a78bfa", SE3: "#f59e0b", SE4: "#ef4444" };
const EUR_SEK = 11.2;
const FONT = "var(--font-mono, 'JetBrains Mono', monospace)";

interface LiveRow {
  ts: string;
  zone: string;
  spot: number | null;
  temp: number | null;
  is_forecast: boolean;
}

interface LiveResp {
  zone: string;
  rows: LiveRow[];
  has_tomorrow: boolean;
  stats: {
    today_spot: { avg: number | null; min: number | null; max: number | null };
    tomorrow_spot: { avg: number | null; min: number | null; max: number | null };
    temp: { avg: number | null };
  };
}

interface ZoneData {
  zone: string;
  rows: LiveRow[];
  now: LiveRow | null;
  stats: LiveResp["stats"];
  hasTomorrow: boolean;
}

function toKr(eurMwh: number): string {
  return ((eurMwh * EUR_SEK) / 1000).toFixed(2);
}
function toOre(eurMwh: number): string {
  return ((eurMwh * EUR_SEK) / 10).toFixed(1);
}

// ─── Sparkline ───────────────────────────────────────────────────────────

function Sparkline({ rows, color, nowHour }: { rows: LiveRow[]; color: string; nowHour: number }) {
  const spots = rows.filter(r => !r.is_forecast).map(r => r.spot);
  const valid = spots.filter((v): v is number => v !== null);
  if (valid.length < 3) return null;

  const W = 120, H = 32;
  const mn = Math.min(...valid) * 0.95;
  const mx = Math.max(...valid) * 1.05;
  const rng = mx - mn || 1;

  const pts = spots.map((v, i) => {
    if (v === null) return null;
    const xp = (i / (spots.length - 1)) * W;
    const yp = H - ((v - mn) / rng) * H;
    return { x: xp, y: yp, v };
  }).filter(Boolean) as { x: number; y: number; v: number }[];

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  // Now marker
  const nowPt = pts[nowHour] ?? null;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} opacity={0.6} />
      {nowPt && (
        <>
          <circle cx={nowPt.x} cy={nowPt.y} r={3} fill={color} />
          <circle cx={nowPt.x} cy={nowPt.y} r={6} fill={color} opacity={0.2} />
        </>
      )}
    </svg>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────

export default function SpotLiveBar() {
  const [data, setData] = useState<ZoneData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const results = await Promise.all(
        ZONES.map(async (zone) => {
          const res = await fetch(`/api/spot/live?zone=${zone}`);
          if (!res.ok) return null;
          const d: LiveResp = await res.json();
          const nowH = new Date().getUTCHours();
          const nowRow = d.rows.find(r => !r.is_forecast && new Date(r.ts).getUTCHours() === nowH) ?? null;
          return { zone, rows: d.rows, now: nowRow, stats: d.stats, hasTomorrow: d.has_tomorrow } as ZoneData;
        })
      );
      setData(results.filter(Boolean) as ZoneData[]);
      setLastFetch(new Date());
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    const iv = setInterval(fetchAll, 300_000); // 5 min
    return () => clearInterval(iv);
  }, [fetchAll]);

  const nowH = new Date().getUTCHours();

  if (loading && data.length === 0) {
    return (
      <div className="card" style={{ padding: "8px 16px" }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Hämtar live-priser…</span>
      </div>
    );
  }

  if (data.length === 0) return null;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "8px 16px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>⚡ Spotpris Live</span>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", background: "#22c55e",
            boxShadow: "0 0 6px #22c55e",
            animation: "slb-pulse 2s ease-in-out infinite",
          }} />
          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>ENTSO-E A44</span>
        </div>
        <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: FONT }}>
          {lastFetch && `${lastFetch.toLocaleTimeString("sv-SE").slice(0, 5)}`}
          {data.some(d => d.hasTomorrow) && (
            <span style={{ marginLeft: 8, color: "#3b82f6" }}>+ imorgon</span>
          )}
        </div>
      </div>

      {/* Zone cards */}
      <div style={{ display: "flex", gap: 1, padding: "0 1px 1px" }}>
        {data.map(z => {
          const nowSpot = z.now?.spot;
          const avgSpot = z.stats.today_spot.avg;
          const diff = nowSpot != null && avgSpot != null ? nowSpot - avgSpot : null;
          const color = ZONE_COLORS[z.zone];

          return (
            <div key={z.zone} style={{
              flex: 1, padding: "8px 12px 10px",
              background: "var(--bg-elevated, #0e0e15)",
              borderTop: `2px solid ${color}`,
            }}>
              {/* Zone label */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color }}>
                  {z.zone}
                </span>
                <span style={{ fontSize: 8, color: "var(--text-muted)" }}>{ZONE_NAMES[z.zone]}</span>
              </div>

              {/* Big price */}
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: FONT, color: nowSpot != null ? color : "var(--text-muted)", lineHeight: 1.1 }}>
                {nowSpot != null ? toOre(nowSpot) : "–"}
                <span style={{ fontSize: 9, fontWeight: 400, color: "var(--text-muted)", marginLeft: 3 }}>öre</span>
              </div>

              {/* Secondary: kr/kWh */}
              {nowSpot != null && (
                <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: FONT, marginTop: 2 }}>
                  {toKr(nowSpot)} kr/kWh
                </div>
              )}

              {/* Sparkline */}
              <div style={{ marginTop: 6 }}>
                <Sparkline rows={z.rows} color={color} nowHour={nowH} />
              </div>

              {/* Stats row */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 8, color: "var(--text-muted)" }}>
                <span>ø {avgSpot != null ? toOre(avgSpot) : "–"}</span>
                {diff != null && (
                  <span style={{ color: diff > 0 ? "#ef4444" : "#22c55e", fontWeight: 600 }}>
                    {diff > 0 ? "▲" : "▼"} {Math.abs(diff * EUR_SEK / 10).toFixed(1)}
                  </span>
                )}
                <span>
                  {z.stats.today_spot.min != null ? toOre(z.stats.today_spot.min) : "–"}–{z.stats.today_spot.max != null ? toOre(z.stats.today_spot.max) : "–"}
                </span>
              </div>

              {/* Tomorrow preview */}
              {z.hasTomorrow && z.stats.tomorrow_spot.avg != null && (
                <div style={{ marginTop: 4, fontSize: 8, color: "#3b82f6", display: "flex", justifyContent: "space-between" }}>
                  <span>Imorgon ø</span>
                  <span style={{ fontWeight: 600 }}>{toOre(z.stats.tomorrow_spot.avg)} öre</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes slb-pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
      `}</style>
    </div>
  );
}
