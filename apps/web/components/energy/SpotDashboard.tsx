"use client";

/**
 * SpotDashboard — Folkets Spotprisverktyg
 *
 * Data: /api/spot/live (ENTSO-E A44, PT15M, 96 punkter idag+imorgon)
 *       /api/spot/v2   (historisk data, Vecka/Manad/Ar)
 *
 * X-axel skalas med period:
 *   Dag    -> timmar (00:00, 04:00, ...)
 *   Vecka  -> dagar (man 17, tis 18, ...)
 *   Manad  -> datum (1/2, 5/2, ...)
 *   Ar     -> manader (jan, feb, ...)
 */

import { useState, useEffect, useCallback, useRef } from "react";

const FONT = "var(--font-mono, 'JetBrains Mono', monospace)";

const C = {
  bg:      "var(--bg-primary)",
  card:    "var(--bg-card)",
  card2:   "var(--bg-primary)",
  border:  "var(--border-color)",
  text:    "var(--text-primary)",
  muted:   "var(--text-muted)",
  dim:     "var(--text-ghost)",
  spot:    "#f59e0b",
  green:   "#22c55e",
  blue:    "#3b82f6",
  red:     "#ef4444",
  wind:    "#34d399",
  nuclear: "#a78bfa",
  hydro:   "#3b82f6",
  solar:   "#fbbf24",
  other:   "#6b7280",
};

const ZONE_COLORS: Record<string, string> = {
  SE1: "#3b82f6", SE2: "#22d3ee", SE3: "#f59e0b", SE4: "#10b981",
};
const ZONE_NAMES: Record<string, string> = {
  SE1: "Luleå", SE2: "Sundsvall", SE3: "Stockholm", SE4: "Malmö",
};
const SE_ZONES = ["SE1", "SE2", "SE3", "SE4"] as const;
type SEZone = typeof SE_ZONES[number];

const GC: Record<string, string> = {
  nuclear_mw: C.nuclear, hydro_mw: C.hydro,
  wind_onshore_mw: C.wind, wind_offshore_mw: "#06b6d4",
  solar_mw: C.solar, other_mw: C.other,
};
const GL: Record<string, string> = {
  nuclear_mw: "Kärnkraft", hydro_mw: "Vatten",
  wind_onshore_mw: "Vind land", wind_offshore_mw: "Vind hav",
  solar_mw: "Sol", other_mw: "Övrigt",
};

type Period = "day" | "week" | "month" | "year";
type Unit   = "sek" | "eur";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LiveRow {
  ts: string; zone: string; spot: number | null;
  temp: number | null; wind_speed: number | null;
  solar_rad: number | null; is_forecast: boolean;
}
interface LiveResp {
  zone: string; resolution: "PT15M" | "PT60M"; rows: LiveRow[];
  stats: {
    today_spot: { avg: number | null; min: number | null; max: number | null };
    tomorrow_spot: { avg: number | null; min: number | null; max: number | null };
  };
  has_tomorrow: boolean; today: string; tomorrow: string;
}
interface V2Row {
  ts: string; spot: number | null;
  nuclear_mw: number | null; hydro_mw: number | null;
  wind_onshore_mw: number | null; wind_offshore_mw: number | null;
  solar_mw: number | null; total_gen_mw: number | null;
  net_import_mw: number | null; production_co2_g_kwh: number | null;
}
interface V2Resp {
  rows: V2Row[];
  stats: { spot: { avg: number | null; min: number | null; max: number | null } };
  generation_mix?: Record<string, number | null>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().slice(0, 10); }
function toOre(eur: number | null, eurSek: number) { return eur != null ? +(eur * eurSek / 10).toFixed(1) : null; }
function dp(eur: number | null, unit: Unit, eurSek: number) {
  if (eur == null) return "–";
  return unit === "eur" ? eur.toFixed(1) : toOre(eur, eurSek)!.toFixed(1);
}
function pu(unit: Unit) { return unit === "eur" ? "EUR/MWh" : "öre/kWh"; }

function currentRow(rows: LiveRow[]): LiveRow | null {
  if (!rows.length) return null;
  const now = Date.now();
  let best: LiveRow | null = null, d = Infinity;
  for (const r of rows) {
    if (r.is_forecast) continue;
    const x = Math.abs(now - new Date(r.ts).getTime());
    if (x < d) { d = x; best = r; }
  }
  return best;
}

function addDays(s: string, n: number) {
  const d = new Date(s + "T12:00:00Z");
  d.setDate(d.getDate() + n);
  const r = d.toISOString().slice(0, 10);
  return r > todayStr() ? todayStr() : r;
}

function fmtPeriodLabel(date: string, period: Period) {
  const d = new Date(date + "T12:00:00Z");
  if (period === "day") return d.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });
  if (period === "week") {
    const e = new Date(d); e.setUTCDate(e.getUTCDate() + 6);
    return `${d.getDate()}–${e.getDate()} ${e.toLocaleDateString("sv-SE", { month: "short" })}`;
  }
  if (period === "month") return d.toLocaleDateString("sv-SE", { month: "long", year: "numeric" });
  return d.getUTCFullYear().toString();
}

// ─── X-axis label per period ─────────────────────────────────────────────────

const WEEKDAYS = ["sön","mån","tis","ons","tor","fre","lör"];
const MONTHS   = ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];

function xLabel(ts: string, period: Period, resolution: "PT15M" | "PT60M"): string {
  const d = new Date(ts);
  if (period === "day") {
    const h = d.getUTCHours().toString().padStart(2, "0");
    const m = d.getUTCMinutes().toString().padStart(2, "0");
    return resolution === "PT15M" ? `${h}:${m}` : `${h}:00`;
  }
  if (period === "week") return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
  if (period === "month") return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  return MONTHS[d.getUTCMonth()];
}

function tooltipLabel(ts: string, period: Period, resolution: "PT15M" | "PT60M"): string {
  const d = new Date(ts);
  if (period === "day") {
    const h = d.getUTCHours().toString().padStart(2, "0");
    const m = d.getUTCMinutes().toString().padStart(2, "0");
    return resolution === "PT15M" ? `${h}:${m}` : `${h}:00`;
  }
  const date = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  if (period === "week") return `${WEEKDAYS[d.getUTCDay()]} ${date} ${d.getUTCHours().toString().padStart(2,"0")}:00`;
  if (period === "month") return `${date} ${d.getUTCHours().toString().padStart(2,"0")}:00`;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchLive(zone: string): Promise<LiveResp | null> {
  try { const r = await fetch(`/api/spot/live?zone=${zone}`); return r.ok ? r.json() : null; } catch { return null; }
}
async function fetchV2Month(zone: string, month: string): Promise<V2Resp | null> {
  try { const r = await fetch(`/api/spot/v2?zone=${zone}&month=${month}`); return r.ok ? r.json() : null; } catch { return null; }
}

// ─── ZoneCard ─────────────────────────────────────────────────────────────────

function ZoneCard({ zone, live, selected, unit, eurSek, onClick }: {
  zone: SEZone; live: LiveResp | null | "loading";
  selected: boolean; unit: Unit; eurSek: number; onClick: () => void;
}) {
  const col = ZONE_COLORS[zone];
  const loading = live === "loading";
  const data = live && live !== "loading" ? live : null;
  const now = data ? currentRow(data.rows) : null;
  const spot = now?.spot ?? null;
  const avg = data?.stats.today_spot.avg ?? null;
  const diff = spot != null && avg != null ? spot - avg : null;
  const diffVal = diff != null ? (unit === "eur" ? diff : toOre(diff, eurSek)) : null;

  const sparkRows = data ? data.rows.filter(r => !r.is_forecast).slice(-24) : [];
  const sparkSpots = sparkRows.map(r => r.spot).filter((v): v is number => v != null);
  const sMin = sparkSpots.length ? Math.min(...sparkSpots) : 0;
  const sMax = sparkSpots.length ? Math.max(...sparkSpots) : 1;
  const sR = sMax - sMin || 1;
  const sw = 80, sh = 28;
  const sparkPath = sparkRows.map((r, i) => {
    if (r.spot == null) return "";
    const x = (i / Math.max(sparkRows.length - 1, 1)) * sw;
    const y = sh - ((r.spot - sMin) / sR) * sh;
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).filter(Boolean).join(" ");

  return (
    <button onClick={onClick} className="zone-card" style={{
      flex: "1 1 100px", minWidth: 100, textAlign: "left", cursor: "pointer",
      background: selected ? `${col}12` : C.card,
      border: `1.5px solid ${selected ? col : C.border}`,
      borderRadius: 8, padding: "12px 14px",
      transition: "border-color 0.15s, background 0.15s",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: selected ? col : C.text, fontFamily: FONT }}>{zone}</span>
        <span style={{ fontSize: 9, color: C.muted }}>{ZONE_NAMES[zone]}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: col, fontFamily: FONT, lineHeight: 1, marginBottom: 1 }}>
        {loading ? "…" : dp(spot, unit, eurSek)}
      </div>
      <div style={{ fontSize: 9, color: C.muted, marginBottom: 8 }}>{pu(unit)}</div>
      {diffVal != null && Math.abs(diffVal) > 0.5 && (
        <div style={{ fontSize: 9, fontWeight: 600, fontFamily: FONT,
          color: diffVal > 5 ? C.red : diffVal < -5 ? C.green : C.muted }}>
          {diffVal > 0 ? "▲" : "▼"} {Math.abs(diffVal).toFixed(1)} vs medel
        </div>
      )}
      {sparkPath && (
        <div style={{ position: "absolute", bottom: 10, right: 10, opacity: 0.4 }}>
          <svg width={sw} height={sh} viewBox={`0 0 ${sw} ${sh}`}>
            <path d={sparkPath} fill="none" stroke={col} strokeWidth={1.5} />
          </svg>
        </div>
      )}
    </button>
  );
}

// ─── SpotChart ────────────────────────────────────────────────────────────────

function SpotChart({ rows, resolution, unit, zone, showTomorrow, period, eurSek }: {
  rows: LiveRow[]; resolution: "PT15M" | "PT60M";
  unit: Unit; zone: string; showTomorrow: boolean; period: Period; eurSek: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hi, setHi] = useState<number | null>(null);
  const col = ZONE_COLORS[zone] ?? C.spot;

  const display = showTomorrow ? rows : rows.filter(r => !r.is_forecast);
  if (display.length < 2) return (
    <div style={{ padding: "32px 0", textAlign: "center", color: C.muted, fontSize: 12 }}>
      Ingen data — ENTSO-E publicerar dagspriser ~12:42 CET
    </div>
  );

  const W = 900, H = 220;
  const P = { t: 16, r: 12, b: 28, l: 44 };
  const pw = W - P.l - P.r, ph = H - P.t - P.b;
  const len = display.length;

  const spots = display.map(r => r.spot).filter((v): v is number => v != null);
  const sMin = spots.length ? Math.floor(Math.min(...spots) / 10) * 10 : 0;
  const sMax = spots.length ? Math.ceil(Math.max(...spots) / 10) * 10 + 5 : 100;
  const sR   = sMax - sMin || 1;

  const xp = (i: number) => P.l + (i / Math.max(len - 1, 1)) * pw;
  const yp = (v: number) => P.t + ph - ((v - sMin) / sR) * ph;

  const pts = display.map((r, i) => r.spot != null ? { i, v: r.spot } : null).filter(Boolean) as {i:number;v:number}[];
  const areaD = pts.length >= 2
    ? pts.map((p, j) => `${j===0?"M":"L"} ${xp(p.i).toFixed(1)} ${yp(p.v).toFixed(1)}`).join(" ")
      + ` L ${xp(pts[pts.length-1].i).toFixed(1)} ${P.t+ph} L ${xp(pts[0].i).toFixed(1)} ${P.t+ph} Z`
    : "";

  const linePath = display.map((r, i) => {
    if (r.spot == null) return "";
    return `${i===0||display[i-1]?.spot==null?"M":"L"} ${xp(i).toFixed(1)} ${yp(r.spot).toFixed(1)}`;
  }).filter(Boolean).join(" ");

  const splitIdx = display.findIndex(r => r.is_forecast);

  // Now marker — only day view
  let nowIdx: number | null = null;
  if (period === "day") {
    const nowMs = Date.now();
    let bd = Infinity;
    display.forEach((r, i) => {
      if (r.is_forecast) return;
      const d = Math.abs(nowMs - new Date(r.ts).getTime());
      if (d < bd) { bd = d; nowIdx = i; }
    });
  }

  // ─── X-axis ticks scaled to period ────────────────────────────────────────
  // day:   every 4h  → stepPts = 16 (PT15M) or 4 (PT60M)
  // week:  one per day
  // month: every ~5 days
  // year:  one per month
  let tickStep: number;
  if (period === "day") {
    tickStep = resolution === "PT15M" ? 16 : 4;
  } else if (period === "week") {
    tickStep = Math.max(1, Math.round(len / 7));
  } else if (period === "month") {
    tickStep = Math.max(1, Math.round(len / 30 * 5));
  } else {
    tickStep = Math.max(1, Math.round(len / 12));
  }

  const ticks: number[] = [];
  const seenLbls = new Set<string>();
  for (let i = 0; i < len; i += tickStep) {
    const lbl = xLabel(display[i].ts, period, resolution);
    if (!seenLbls.has(lbl)) { ticks.push(i); seenLbls.add(lbl); }
  }

  const getIdx = (e: React.MouseEvent) => {
    const svg = svgRef.current; if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const frac = ((e.clientX - rect.left) / rect.width * W - P.l) / pw;
    const idx = Math.round(frac * (len - 1));
    return idx >= 0 && idx < len ? idx : null;
  };

  const hRow = hi != null ? display[hi] : null;

  return (
    <div style={{ position: "relative" }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair", touchAction: "none" }}
        onMouseMove={e => setHi(getIdx(e))}
        onMouseLeave={() => setHi(null)}
        onTouchMove={e => { const t = e.touches[0]; if (t && svgRef.current) { const rect = svgRef.current.getBoundingClientRect(); const frac = ((t.clientX - rect.left) / rect.width * W - P.l) / pw; const idx = Math.round(frac * (len - 1)); setHi(idx >= 0 && idx < len ? idx : null); } }}
        onTouchEnd={() => setHi(null)}
      >
        <defs>
          <linearGradient id="sd-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity={0.25} />
            <stop offset="100%" stopColor={col} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={P.l} x2={W-P.r} y1={P.t+ph*(1-f)} y2={P.t+ph*(1-f)}
            stroke={C.border} strokeWidth={0.6} />
        ))}

        {[0, 0.5, 1].map(f => {
          const raw = sMin + sR * f;
          const val = unit === "eur" ? Math.round(raw) : Math.round(toOre(raw, eurSek)!);
          return <text key={f} x={P.l-5} y={P.t+ph*(1-f)+4}
            textAnchor="end" fontSize={9} fill={C.muted} fontFamily={FONT}>{val}</text>;
        })}
        <text x={P.l-5} y={P.t-4} textAnchor="end" fontSize={7} fill={C.dim} fontFamily={FONT}>{pu(unit)}</text>

        {/* X labels — period-aware */}
        {ticks.map(i => {
          const r = display[i]; if (!r) return null;
          return <text key={i} x={xp(i)} y={H-5} textAnchor="middle"
            fontSize={9} fill={C.muted} fontFamily={FONT}>
            {xLabel(r.ts, period, resolution)}
          </text>;
        })}

        {showTomorrow && splitIdx > 0 && (
          <rect x={xp(splitIdx)} y={P.t} width={W-P.r-xp(splitIdx)} height={ph} fill="var(--bg-card-hover)" opacity={0.3} />
        )}
        {showTomorrow && splitIdx > 0 && (
          <text x={xp(splitIdx)+4} y={P.t+10} fontSize={8} fill={C.dim} fontFamily={FONT}>imorgon</text>
        )}

        {areaD && <path d={areaD} fill="url(#sd-area)" />}
        {linePath && <path d={linePath} fill="none" stroke={col} strokeWidth={2.5} />}

        {/* NU marker — dag only */}
        {nowIdx != null && (
          <>
            <line x1={xp(nowIdx)} x2={xp(nowIdx)} y1={P.t} y2={P.t+ph}
              stroke={col} strokeWidth={1.5} strokeDasharray="3 2" opacity={0.5} />
            <text x={xp(nowIdx)} y={P.t-4} textAnchor="middle"
              fontSize={8} fill={col} fontFamily={FONT} fontWeight={700}>NU</text>
          </>
        )}

        {hi != null && hRow && (
          <>
            <line x1={xp(hi)} x2={xp(hi)} y1={P.t} y2={P.t+ph}
              stroke="var(--border-color)" strokeWidth={1} />
            {hRow.spot != null && (
              <circle cx={xp(hi)} cy={yp(hRow.spot)} r={5} fill={col} stroke={C.card} strokeWidth={2} />
            )}
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hi != null && hRow?.spot != null && (() => {
        const left = xp(hi) / W * 100;
        return (
          <div style={{
            position: "absolute", top: 12,
            left: `${left}%`,
            transform: left > 65 ? "translateX(-110%)" : "translateX(8%)",
            background: "var(--bg-card)",
            border: `1px solid ${C.border}`,
            borderRadius: 6, padding: "8px 12px",
            fontSize: 11, fontFamily: FONT,
            pointerEvents: "none", zIndex: 10, minWidth: 140,
          }}>
            <div style={{ fontSize: 9, color: C.muted, paddingBottom: 4, marginBottom: 4, borderBottom: `1px solid ${C.border}` }}>
              {tooltipLabel(hRow.ts, period, resolution)}
              {hRow.is_forecast && <span style={{ color: C.blue, marginLeft: 4 }}>imorgon</span>}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
              <span style={{ color: C.muted }}>Spot</span>
              <span style={{ color: col, fontWeight: 700 }}>
                {dp(hRow.spot, unit, eurSek)} <span style={{ fontSize: 8, color: C.muted }}>{pu(unit)}</span>
              </span>
            </div>
            {unit === "sek" && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 14, marginTop: 2 }}>
                <span style={{ color: C.dim, fontSize: 9 }}>EUR/MWh</span>
                <span style={{ color: C.dim, fontSize: 9 }}>{hRow.spot.toFixed(1)}</span>
              </div>
            )}
            {period === "day" && resolution === "PT15M" && (
              <div style={{ marginTop: 4, fontSize: 8, color: C.dim }}>15-min · ENTSO-E A44</div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── GenMixBar ────────────────────────────────────────────────────────────────

function GenMixBar({ mix }: { mix: Record<string, number | null> }) {
  const active = Object.keys(GC).map(f => ({ f, v: (mix[f] ?? 0) as number })).filter(e => e.v > 0);
  const total = active.reduce((s, e) => s + e.v, 0);
  if (total <= 0) return null;
  return (
    <div>
      <div style={{ display: "flex", height: 20, borderRadius: 4, overflow: "hidden", marginBottom: 5 }}>
        {active.map(e => {
          const pct = (e.v / total) * 100;
          if (pct < 0.5) return null;
          return (
            <div key={e.f} style={{
              width: `${pct}%`, background: GC[e.f],
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: pct > 8 ? 8 : 0, color: "#fff", fontWeight: 600,
            }} title={`${GL[e.f]}: ${pct.toFixed(1)}%`}>
              {pct > 12 ? GL[e.f] : pct > 6 ? `${pct.toFixed(0)}%` : ""}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px" }}>
        {active.filter(e => (e.v / total) * 100 >= 1).map(e => (
          <span key={e.f} style={{ fontSize: 9, color: C.muted, display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: GC[e.f], display: "inline-block" }} />
            {GL[e.f]} {((e.v / total) * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SpotDashboard() {
  const [zone, setZone] = useState<SEZone>("SE3");
  const [period, setPeriod] = useState<Period>("day");
  const [histDate, setHistDate] = useState(() => todayStr());
  const [unit, setUnit] = useState<Unit>("sek");
  const [showTomorrow, setShowTomorrow] = useState(false);
  const [showAdv, setShowAdv] = useState(false);

  const [liveData, setLiveData] = useState<Partial<Record<SEZone, LiveResp | "loading">>>({
    SE1: "loading", SE2: "loading", SE3: "loading", SE4: "loading",
  });
  const [histData, setHistData] = useState<V2Resp | null>(null);
  const [histLoading, setHistLoading] = useState(false);

  // ─── EUR/SEK from ECB canonical data (TR1) ──────────────────────────────
  const [eurSek, setEurSek] = useState(11.20); // fallback until API responds
  useEffect(() => {
    fetch("/api/energy/forex")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.rate) setEurSek(d.rate); })
      .catch(() => {});
  }, []);

  const isLiveMode = period === "day" && histDate >= todayStr();

  const loadLive = useCallback(async () => {
    const results = await Promise.all(SE_ZONES.map(z => fetchLive(z)));
    const map: Partial<Record<SEZone, LiveResp>> = {};
    results.forEach((r, i) => { if (r) map[SE_ZONES[i]] = r; });
    setLiveData(map);
  }, []);

  useEffect(() => {
    loadLive();
    const iv = setInterval(loadLive, 5 * 60_000);
    return () => clearInterval(iv);
  }, [loadLive]);

  const loadHist = useCallback(async () => {
    if (isLiveMode) { setHistData(null); return; }
    if (period === "day") {
      // Historisk dag via v2
      setHistLoading(true);
      try {
        const r = await fetch(`/api/spot/v2?zone=${zone}&date=${histDate}`);
        setHistData(r.ok ? await r.json() : null);
      } finally { setHistLoading(false); }
      return;
    }
    setHistLoading(true);
    try {
      let data: V2Resp | null = null;
      if (period === "month" || period === "year") {
        const m = period === "year" ? histDate.slice(0,4)+"-01" : histDate.slice(0,7);
        data = await fetchV2Month(zone, m);
      } else if (period === "week") {
        data = await fetchV2Month(zone, histDate.slice(0,7));
        if (data) {
          const start = new Date(histDate+"T00:00:00Z").getTime();
          const end   = start + 7*86400_000;
          data.rows = data.rows.filter(r => {
            const t = new Date(r.ts).getTime();
            return t >= start && t < end;
          });
        }
      }
      setHistData(data);
    } finally {
      setHistLoading(false);
    }
  }, [zone, period, histDate, isLiveMode]);

  useEffect(() => { loadHist(); }, [loadHist]);

  const zoneLive = liveData[zone];
  const liveResp = zoneLive && zoneLive !== "loading" ? zoneLive : null;
  const nowRow   = liveResp ? currentRow(liveResp.rows) : null;
  const todayStats = liveResp?.stats.today_spot ?? { avg: null, min: null, max: null };
  const tomorrowStats = liveResp?.stats.tomorrow_spot ?? { avg: null, min: null, max: null };
  const hasTomorrow = liveResp?.has_tomorrow ?? false;
  const res = liveResp?.resolution ?? "PT60M";

  const chartRows: LiveRow[] = isLiveMode
    ? (liveResp?.rows ?? [])
    : (histData?.rows.map(r => ({
        ts: r.ts, zone, spot: r.spot, temp: null,
        wind_speed: null, solar_rad: null, is_forecast: false,
      })) ?? []);

  const co2Avg = (() => {
    if (!histData?.rows.length) return null;
    const vals = histData.rows.map(r => r.production_co2_g_kwh).filter((v): v is number => v != null);
    return vals.length ? Math.round(vals.reduce((s,x) => s+x,0)/vals.length) : null;
  })();

  const periodStep = period === "day" ? 1 : period === "week" ? 7 : period === "month" ? 30 : 365;

  return (
    <>
      <style>{`
        @keyframes sd-live { 0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0.4)} 70%{box-shadow:0 0 0 6px rgba(34,197,94,0)}}
      `}</style>

      <div className="card" style={{ overflow: "hidden", padding: 0 }}>

        {/* ── HEADER ──────────────────────────────────────────────────────── */}
        <div style={{ padding: "12px 20px 0" }}>

          {/* Row 1 */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>Spotpris <span style={{ color: C.dim }}>/</span> Elpris</span>
            <span style={{ padding: "1px 5px", borderRadius: 3, fontSize: 8, fontWeight: 600,
              background: "rgba(245,158,11,0.12)", color: C.spot, border: `1px solid ${C.spot}44` }}>
              ENTSO-E A44
            </span>
            {isLiveMode && res === "PT15M" && (
              <span style={{ padding: "1px 5px", borderRadius: 3, fontSize: 8, fontWeight: 600,
                background: "rgba(34,197,94,0.12)", color: C.green, border: "1px solid rgba(34,197,94,0.3)" }}>
                PT15M · 96 punkter
              </span>
            )}
            <div style={{ display: "flex", gap: 2 }}>
              {SE_ZONES.map(z => (
                <button key={z} onClick={() => setZone(z)} style={{
                  padding: "3px 10px", fontSize: 11, fontWeight: zone===z ? 700 : 400,
                  background: zone===z ? `${ZONE_COLORS[z]}18` : "transparent",
                  border: `1px solid ${zone===z ? ZONE_COLORS[z]+"66" : C.border}`,
                  borderRadius: 4, color: zone===z ? ZONE_COLORS[z] : C.muted,
                  cursor: "pointer", fontFamily: FONT,
                }}>{z}</button>
              ))}
            </div>
            {isLiveMode && (
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: C.green, marginLeft: "auto" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, animation: "sd-live 2s infinite" }} />
                LIVE
              </span>
            )}
          </div>

          {/* Row 2 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 12,
            borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>

            <div style={{ display: "flex", gap: 1, background: C.border, borderRadius: 6, padding: 1 }}>
              {(["day","week","month","year"] as Period[]).map(p => {
                const L: Record<Period, string> = { day:"Dag", week:"Vecka", month:"Månad", year:"År" };
                return (
                  <button key={p} onClick={() => setPeriod(p)} style={{
                    padding: "4px 12px", fontSize: 10, fontWeight: period===p ? 700 : 400,
                    background: period===p ? C.card2 : "transparent",
                    border: "none", borderRadius: 5,
                    color: period===p ? C.text : C.muted, cursor: "pointer", fontFamily: FONT,
                  }}>{L[p]}</button>
                );
              })}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button onClick={() => setHistDate(d => addDays(d, -periodStep))}
                style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:4,
                  color:C.muted, fontSize:12, padding:"3px 8px", cursor:"pointer" }}>◀</button>
              <span style={{ fontSize:11, fontWeight:600, color:C.text, fontFamily:FONT,
                minWidth:130, textAlign:"center" }}>
                {isLiveMode ? histDate : fmtPeriodLabel(histDate, period)}
              </span>
              <button
                onClick={() => { const n=addDays(histDate,periodStep); if(n<=todayStr()) setHistDate(n); }}
                disabled={histDate >= todayStr()}
                style={{ background:"none", border:`1px solid ${histDate >= todayStr() ? C.dim : C.border}`, borderRadius:4,
                  color: histDate >= todayStr() ? C.dim : C.muted, fontSize:12, padding:"3px 8px",
                  cursor: histDate >= todayStr() ? "default" : "pointer" }}>▶</button>
              {histDate < todayStr() && (
                <button onClick={() => setHistDate(todayStr())}
                  style={{ background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.3)",
                    borderRadius:4, color:C.green, fontSize:9, padding:"3px 8px",
                    cursor:"pointer", fontFamily:FONT, fontWeight:600 }}>Idag</button>
              )}
            </div>

            <div style={{ flex: 1 }} />

            {isLiveMode && hasTomorrow && (
              <button onClick={() => setShowTomorrow(v => !v)} style={{
                padding: "4px 10px", fontSize: 9, fontFamily: FONT,
                background: showTomorrow ? "rgba(59,130,246,0.12)" : "transparent",
                border: `1px solid ${showTomorrow ? C.blue+"66" : C.border}`,
                borderRadius: 5, color: showTomorrow ? C.blue : C.muted, cursor: "pointer",
              }}>+ Imorgon</button>
            )}

            <div style={{ display:"flex", borderRadius:4, overflow:"hidden", border:`1px solid ${C.border}` }}>
              {(["sek","eur"] as Unit[]).map((u,i) => (
                <button key={u} onClick={() => setUnit(u)} style={{
                  padding: "4px 10px", fontSize: 9, cursor:"pointer", fontFamily: FONT,
                  background: unit===u ? `${C.spot}18` : "transparent",
                  borderLeft: i>0 ? `1px solid ${C.border}` : "none",
                  color: unit===u ? C.spot : C.muted, fontWeight: unit===u ? 700 : 400,
                }}>{u==="sek" ? "öre/kWh" : "€/MWh"}</button>
              ))}
            </div>
          </div>
        </div>

        {/* ── 4 ZONKORT ──────────────────────────────────────────────────── */}
        <div style={{ display:"flex", gap:8, padding:"12px 20px", flexWrap:"wrap" }}>
          {SE_ZONES.map(z => (
            <ZoneCard key={z} zone={z} live={liveData[z] ?? "loading"}
              selected={zone===z} unit={unit} eurSek={eurSek} onClick={() => setZone(z)} />
          ))}
        </div>

        {/* ── HERO + STATS ────────────────────────────────────────────────── */}
        <div style={{ padding:"0 20px 12px", borderBottom:`1px solid ${C.border}` }}>
          <div style={{ display:"flex", gap:16, alignItems:"flex-start", flexWrap:"wrap" }}>
            <div style={{ minWidth:120 }}>
              <div style={{ fontSize:10, color:C.muted, marginBottom:3 }}>
                {zone} {ZONE_NAMES[zone]} — just nu
              </div>
              <div className="spot-hero-price" style={{ fontSize:52, fontWeight:800, lineHeight:1,
                color: ZONE_COLORS[zone], fontFamily: FONT }}>
                {zoneLive === "loading" ? "…" : dp(nowRow?.spot ?? null, unit, eurSek)}
              </div>
              <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{pu(unit)}</div>
              {unit==="sek" && nowRow?.spot != null && (
                <div style={{ fontSize:10, color:C.muted, fontFamily:FONT, marginTop:1 }}>
                  {nowRow.spot.toFixed(1)} EUR/MWh
                </div>
              )}
              {res === "PT15M" && isLiveMode && (
                <div style={{ fontSize:8, color:C.dim, marginTop:4 }}>15-min · ENTSO-E A44</div>
              )}
              {nowRow?.spot != null && unit === "sek" && (
                <div style={{ marginTop:6, padding:"4px 8px", borderRadius:5, background:"rgba(96,165,250,0.08)", border:"1px solid rgba(96,165,250,0.15)" }}>
                  <div style={{ fontSize:8, color:"#60a5fa", marginBottom:2 }}>Elpris inkl avgifter</div>
                  <div style={{ fontSize:16, fontWeight:700, color:"#60a5fa", fontFamily:FONT }}>
                    {(() => {
                      const spotOre = toOre(nowRow.spot, eurSek) ?? 0;
                      const net = 32; // nätavgift öre/kWh
                      const tax = 36; // energiskatt öre/kWh (2026)
                      const sub = spotOre + net + tax;
                      const moms = sub * 0.25;
                      return (sub + moms).toFixed(0);
                    })()}
                    <span style={{ fontSize:9, color:"#60a5fa88", marginLeft:2 }}>öre/kWh</span>
                  </div>
                  <div style={{ fontSize:7, color:C.dim }}>nät 32 + skatt 36 + moms 25%</div>
                </div>
              )}
            </div>
            <div className="spot-stats-row" style={{ flex:1, display:"flex", gap:8, flexWrap:"wrap" }}>
              {[
                { label: isLiveMode ? "Dagmedel"  : "Periodmedel", val: isLiveMode ? todayStats.avg   : histData?.stats.spot.avg ?? null },
                { label: isLiveMode ? "Dagsmin"   : "Periodmin",   val: isLiveMode ? todayStats.min   : histData?.stats.spot.min ?? null },
                { label: isLiveMode ? "Dagsmax"   : "Periodmax",   val: isLiveMode ? todayStats.max   : histData?.stats.spot.max ?? null },
                ...(hasTomorrow && showTomorrow ? [{ label:"Imorgon avg", val: tomorrowStats.avg }] : []),
              ].map(({ label, val }) => (
                <div key={label} style={{
                  flex:"1 1 70px", background: C.card2,
                  border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 10px",
                }}>
                  <div style={{ fontSize:9, color:C.muted, marginBottom:3 }}>{label}</div>
                  <div style={{ fontSize:17, fontWeight:700, color:C.text, fontFamily:FONT }}>{dp(val, unit, eurSek)}</div>
                  <div style={{ fontSize:8, color:C.muted }}>{pu(unit)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── CHART ──────────────────────────────────────────────────────── */}
        <div style={{ padding:"12px 20px" }}>
          {histLoading ? (
            <div style={{ padding:"32px 0", textAlign:"center", color:C.muted, fontSize:12 }}>Laddar…</div>
          ) : (
            <SpotChart
              rows={chartRows}
              resolution={res}
              unit={unit}
              zone={zone}
              showTomorrow={showTomorrow && isLiveMode}
              period={period}
              eurSek={eurSek}
            />
          )}
        </div>

        {/* ── AVANCERAT TOGGLE ───────────────────────────────────────────── */}
        <div style={{ borderTop:`1px solid ${C.border}` }}>
          <button onClick={() => setShowAdv(v => !v)} style={{
            width:"100%", padding:8, background:"none", border:"none",
            color:C.muted, fontSize:9, cursor:"pointer", fontFamily:FONT,
            display:"flex", alignItems:"center", justifyContent:"center", gap:6,
          }}>
            <span style={{ transform:showAdv?"rotate(180deg)":"none", transition:"transform .2s", display:"inline-block" }}>▾</span>
            {showAdv ? "Dölj avancerat" : "Visa avancerat — CO₂, vind, produktionsmix"}
          </button>

          {showAdv && (
            <div style={{ padding:"0 20px 16px", borderTop:`1px solid ${C.border}` }}>
              {!histData && (
                <div style={{ color:C.muted, fontSize:11, padding:"12px 0" }}>
                  Välj Vecka/Månad/År för avancerad data
                </div>
              )}
              {histData && (
                <>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14, marginTop:12 }}>
                    {co2Avg != null && (
                      <div style={{ flex:"1 1 90px", background:C.card2, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 12px" }}>
                        <div style={{ fontSize:9, color:C.green, marginBottom:2 }}>CO₂ produktion</div>
                        <div style={{ fontSize:18, fontWeight:700, color:C.green, fontFamily:FONT }}>{co2Avg}</div>
                        <div style={{ fontSize:8, color:C.muted }}>g/kWh medel</div>
                      </div>
                    )}
                    {(() => {
                      const vals = histData.rows.map(r => (r.wind_onshore_mw??0)+(r.wind_offshore_mw??0)).filter(v => v > 0);
                      const avg = vals.length ? Math.round(vals.reduce((s,x)=>s+x,0)/vals.length) : null;
                      return avg != null ? (
                        <div style={{ flex:"1 1 90px", background:C.card2, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 12px" }}>
                          <div style={{ fontSize:9, color:C.wind, marginBottom:2 }}>Vind</div>
                          <div style={{ fontSize:18, fontWeight:700, color:C.wind, fontFamily:FONT }}>{avg}</div>
                          <div style={{ fontSize:8, color:C.muted }}>MW medel</div>
                        </div>
                      ) : null;
                    })()}
                    {(() => {
                      const vals = histData.rows.map(r => r.net_import_mw).filter((v): v is number => v != null);
                      const avg = vals.length ? Math.round(vals.reduce((s,x)=>s+x,0)/vals.length) : null;
                      return avg != null ? (
                        <div style={{ flex:"1 1 90px", background:C.card2, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 12px" }}>
                          <div style={{ fontSize:9, color:avg>0?C.blue:C.red, marginBottom:2 }}>Netto import</div>
                          <div style={{ fontSize:18, fontWeight:700, color:avg>0?C.blue:C.red, fontFamily:FONT }}>{avg>0?"+":""}{avg}</div>
                          <div style={{ fontSize:8, color:C.muted }}>MW medel</div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                  {histData.generation_mix && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:9, color:C.muted, marginBottom:6 }}>Produktionsmix — medel</div>
                      <GenMixBar mix={histData.generation_mix} />
                    </div>
                  )}
                </>
              )}
              <div style={{ fontSize:8, color:C.dim, marginTop:8 }}>
                ENTSO-E A44 (spot) · A75 (generation) · A11 (flows) · ERA5 (väder) · EEA 2023 (CO₂)
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:"6px 20px", fontSize:8, color:C.dim,
          borderTop:`1px solid ${C.border}`, fontFamily:FONT }}>
          EUR/SEK {eurSek.toFixed(4)} (ECB) · ENTSO-E A44 · Uppdateras var 5:e min
        </div>
      </div>
    </>
  );
}
