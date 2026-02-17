"use client";

import { useEffect, useState, useMemo, useCallback } from "react";

/* ══════════════════════════════════════════════
   SpotHistoryPanel — Spotpris + Väder
   Dag / Vecka / Månad / År × SE1-SE4

   Data:
     År-vy:    /api/witness/price-structure  (spot_annual + weather_annual)
     Detaljvy: /api/witness/weather-correlation?zone=XX&res=XX&from=XX&to=XX

   Sources: ENTSO-E (spot), Open-Meteo ERA5 (weather), Nord Pool (annual)
   Witness-mode: Korrelation ≠ orsak.
   ══════════════════════════════════════════════ */

/* ── Types ── */
interface SpotRecord { year: number; SE1: number; SE2: number; SE3: number; SE4: number; note: string; confidence: string; }
interface TaxRecord { year: number; energy_tax_ore_kwh_excl_vat: number; }
interface SpotAnnualData { records: SpotRecord[]; energy_tax_history: TaxRecord[]; evidence_ref: { manifest_id: string; root_hash: string }; }
interface AnnualWeather { year: number; temp_avg_c: number | null; solar_kwh_m2: number | null; sunshine_hours: number | null; wind_avg_max_ms: number | null; }
interface ZoneWeather { zone: string; location: { city: string }; annual: AnnualWeather[]; }
interface WeatherData { zones: ZoneWeather[]; evidence_id: string; }

interface CorrelationRow {
  period: string;
  spot_ore_kwh: number | null;
  temp_avg_c: number | null;
  solar_kwh_m2: number | null;
  sunshine_hours: number | null;
  wind_avg_ms: number | null;
  spot_days: number;
  weather_days: number;
}
interface CorrelationResponse {
  zone: string; resolution: string; count: number;
  rows: CorrelationRow[];
}

/* ── Constants ── */
type Zone = "SE1" | "SE2" | "SE3" | "SE4";
type Res = "year" | "month" | "week" | "day";
const ZONES: Zone[] = ["SE1", "SE2", "SE3", "SE4"];
const ZONE_COLORS: Record<string, string> = { SE1: "#22d3ee", SE2: "#38bdf8", SE3: "#f59e0b", SE4: "#ef4444" };
const ZONE_CITY: Record<string, string> = { SE1: "Luleå", SE2: "Sundsvall", SE3: "Stockholm", SE4: "Malmö" };
const RES_OPTIONS: { key: Res; label: string }[] = [
  { key: "year",  label: "År" },
  { key: "month", label: "Månad" },
  { key: "week",  label: "Vecka" },
  { key: "day",   label: "Dag" },
];
const NETWORK_TYPICAL = 32;

/* ── Helpers ── */
const r1 = (n: number | null) => n !== null ? n.toFixed(1) : "–";
const r0 = (n: number | null) => n !== null ? Math.round(n).toString() : "–";

function pearson(xs: number[], ys: number[]): number | null {
  const paired: [number, number][] = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    if (!isNaN(xs[i]) && !isNaN(ys[i])) paired.push([xs[i], ys[i]]);
  }
  if (paired.length < 3) return null;
  const n = paired.length;
  const sx = paired.reduce((s, [x]) => s + x, 0);
  const sy = paired.reduce((s, [, y]) => s + y, 0);
  const sxy = paired.reduce((s, [x, y]) => s + x * y, 0);
  const sx2 = paired.reduce((s, [x]) => s + x * x, 0);
  const sy2 = paired.reduce((s, [, y]) => s + y * y, 0);
  const den = Math.sqrt((n * sx2 - sx ** 2) * (n * sy2 - sy ** 2));
  return den > 0 ? Math.round((n * sxy - sx * sy) / den * 100) / 100 : null;
}

/* ═══════════ SVG Chart ═══════════ */
function DualChart({ rows, maxPts }: { rows: CorrelationRow[]; maxPts: number }) {
  const data = rows.length > maxPts ? rows.slice(rows.length - maxPts) : rows;
  const W = 820, H = 180, P = 36;
  const cW = W - P * 2, cH = H - P - 16;

  const spots = data.map(r => r.spot_ore_kwh).filter((v): v is number => v !== null);
  const temps = data.map(r => r.temp_avg_c).filter((v): v is number => v !== null);
  if (spots.length < 2) return null;

  const sMin = Math.min(...spots), sMax = Math.max(...spots), sR = sMax - sMin || 1;
  const tMin = Math.min(...temps), tMax = Math.max(...temps), tR = tMax - tMin || 1;
  const step = cW / (data.length - 1);

  const line = (vals: (number | null)[], mn: number, rng: number) =>
    data.map((_, i) => {
      const v = vals[i]; if (v === null) return null;
      return `${P + i * step},${P + cH - ((v - mn) / rng) * cH}`;
    }).filter(Boolean).join(" ");

  const spotPts = line(data.map(r => r.spot_ore_kwh), sMin, sR);
  const tempPts = line(data.map(r => r.temp_avg_c), tMin, tR);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 180, display: "block" }}>
      {[0, 0.5, 1].map(f => (
        <line key={f} x1={P} x2={W - P} y1={P + cH * (1 - f)} y2={P + cH * (1 - f)} stroke="#292524" strokeWidth={0.5} />
      ))}
      <polyline points={spotPts} fill="none" stroke="#f59e0b" strokeWidth={1.5} opacity={0.9} />
      <polyline points={tempPts} fill="none" stroke="#22d3ee" strokeWidth={1.2} opacity={0.7} strokeDasharray="4 2" />
      {/* Y labels */}
      <text x={P - 3} y={P + 3} fill="#f59e0b" fontSize={8} textAnchor="end">{Math.round(sMax)}</text>
      <text x={P - 3} y={P + cH + 3} fill="#f59e0b" fontSize={8} textAnchor="end">{Math.round(sMin)}</text>
      <text x={W - P + 3} y={P + 3} fill="#22d3ee" fontSize={8}>{r1(tMax)}°</text>
      <text x={W - P + 3} y={P + cH + 3} fill="#22d3ee" fontSize={8}>{r1(tMin)}°</text>
      {/* Legend */}
      <line x1={P} x2={P + 16} y1={H - 6} y2={H - 6} stroke="#f59e0b" strokeWidth={2} />
      <text x={P + 20} y={H - 2} fill="#78716c" fontSize={8}>Spot öre/kWh</text>
      <line x1={P + 100} x2={P + 116} y1={H - 6} y2={H - 6} stroke="#22d3ee" strokeWidth={1.5} strokeDasharray="4 2" />
      <text x={P + 120} y={H - 2} fill="#78716c" fontSize={8}>Temp °C</text>
    </svg>
  );
}

/* ═══════════ Inline bar ═══════════ */
function InlineBar({ row, allRows }: { row: CorrelationRow; allRows: CorrelationRow[] }) {
  const norm = (v: number | null, arr: number[]) => {
    if (v === null || arr.length === 0) return 0;
    const mn = Math.min(...arr), mx = Math.max(...arr);
    return mx > mn ? (v - mn) / (mx - mn) : 0.5;
  };
  const spots = allRows.map(r => r.spot_ore_kwh).filter((v): v is number => v !== null);
  const temps = allRows.map(r => r.temp_avg_c).filter((v): v is number => v !== null);
  const sols = allRows.map(r => r.solar_kwh_m2).filter((v): v is number => v !== null);
  const winds = allRows.map(r => r.wind_avg_ms).filter((v): v is number => v !== null);

  return (
    <div style={{ display: "flex", gap: 1, alignItems: "center", height: 14 }}>
      <div style={{ width: Math.max(norm(row.spot_ore_kwh, spots) * 40, 2), height: 6, background: "#f59e0b", borderRadius: 1 }} title={`Spot ${r1(row.spot_ore_kwh)}`} />
      <div style={{ width: Math.max((1 - norm(row.temp_avg_c, temps)) * 24, 2), height: 6, background: "#22d3ee", borderRadius: 1, opacity: 0.7 }} title={`Kyla ${r1(row.temp_avg_c)}°C`} />
      <div style={{ width: Math.max(norm(row.solar_kwh_m2, sols) * 24, 2), height: 6, background: "#facc15", borderRadius: 1, opacity: 0.7 }} title={`Sol ${r1(row.solar_kwh_m2)}`} />
      <div style={{ width: Math.max(norm(row.wind_avg_ms, winds) * 18, 2), height: 6, background: "#94a3b8", borderRadius: 1, opacity: 0.7 }} title={`Vind ${r1(row.wind_avg_ms)}`} />
    </div>
  );
}

/* ═══════════ Stat box ═══════════ */
function Stat({ label, value, color, tip }: { label: string; value: string; color: string; tip?: string }) {
  return (
    <div title={tip} style={{ background: "#1c1917", border: "1px solid #292524", borderRadius: 6, padding: "5px 8px", minWidth: 60 }}>
      <div style={{ fontSize: 9, color: "#78716c" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color }}>{value}</div>
    </div>
  );
}

/* ═══════════ MAIN ═══════════ */
export default function SpotHistoryPanel() {
  /* State */
  const [zone, setZone] = useState<Zone>("SE3");
  const [res, setRes] = useState<Res>("year");
  const [from, setFrom] = useState("2016-01-01");
  const [to, setTo] = useState("2025-12-31");
  const [showTotalCost, setShowTotalCost] = useState(false);
  const [showTable, setShowTable] = useState(false);

  /* Annual data (spot + weather) */
  const [annualSpot, setAnnualSpot] = useState<SpotAnnualData | null>(null);
  const [annualWeather, setAnnualWeather] = useState<WeatherData | null>(null);

  /* Correlation data (detail view) */
  const [corrData, setCorrData] = useState<CorrelationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Fetch annual once */
  useEffect(() => {
    fetch("/api/witness/price-structure")
      .then((r) => r.json())
      .then((d) => {
        setAnnualSpot(d.spot_annual);
        setAnnualWeather(d.weather_annual);
      })
      .catch(() => setError("Kunde inte ladda data"));
  }, []);

  /* Fetch correlation on zone/res/from/to change */
  const fetchCorr = useCallback(async () => {
    if (res === "year") { setCorrData(null); return; } // year uses annual data
    setLoading(true);
    try {
      const r = await fetch(`/api/witness/weather-correlation?zone=${zone}&res=${res}&from=${from}&to=${to}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setCorrData(d);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [zone, res, from, to]);

  useEffect(() => { fetchCorr(); }, [fetchCorr]);

  /* ── Year view: merge spot + weather ── */
  const yearRows = useMemo((): CorrelationRow[] => {
    if (!annualSpot?.records || !annualWeather?.zones) return [];
    const zw = annualWeather.zones.find(z => z.zone === zone);
    const wxMap = new Map(zw?.annual.map(a => [a.year, a]) ?? []);
    return annualSpot.records
      .filter(r => r.year >= 2016 && r.year <= 2025)
      .map(r => {
        const w = wxMap.get(r.year);
        return {
          period: String(r.year),
          spot_ore_kwh: r[zone],
          temp_avg_c: w?.temp_avg_c ?? null,
          solar_kwh_m2: w?.solar_kwh_m2 ?? null,
          sunshine_hours: w?.sunshine_hours ?? null,
          wind_avg_ms: w?.wind_avg_max_ms ?? null,
          spot_days: 365,
          weather_days: w ? 365 : 0,
        };
      });
  }, [annualSpot, annualWeather, zone]);

  /* Active rows = year view OR correlation view */
  const rows: CorrelationRow[] = res === "year" ? yearRows : (corrData?.rows ?? []);

  /* Stats */
  const stats = useMemo(() => {
    if (!rows.length) return null;
    const sp = rows.map(r => r.spot_ore_kwh).filter((v): v is number => v !== null);
    const tp = rows.map(r => r.temp_avg_c).filter((v): v is number => v !== null);
    const wd = rows.map(r => r.wind_avg_ms).filter((v): v is number => v !== null);
    const corr = pearson(
      rows.filter(r => r.spot_ore_kwh !== null && r.temp_avg_c !== null).map(r => r.spot_ore_kwh!),
      rows.filter(r => r.spot_ore_kwh !== null && r.temp_avg_c !== null).map(r => r.temp_avg_c!),
    );
    return {
      spotAvg: sp.length ? Math.round(sp.reduce((s, v) => s + v, 0) / sp.length * 10) / 10 : null,
      spotMax: sp.length ? Math.round(Math.max(...sp) * 10) / 10 : null,
      tempAvg: tp.length ? Math.round(tp.reduce((s, v) => s + v, 0) / tp.length * 10) / 10 : null,
      windAvg: wd.length ? Math.round(wd.reduce((s, v) => s + v, 0) / wd.length * 10) / 10 : null,
      corr,
      n: rows.length,
    };
  }, [rows]);

  /* Total cost (year view only) */
  const records = annualSpot?.records ?? [];
  const taxes = annualSpot?.energy_tax_history ?? [];
  const totalCostRows = useMemo(() => {
    if (!records.length || !taxes.length) return [];
    return records.map(r => {
      const tax = taxes.find(t => t.year === r.year)?.energy_tax_ore_kwh_excl_vat ?? 36;
      const zones = ZONES.map(z => {
        const spot = r[z];
        const sub = spot + NETWORK_TYPICAL + tax;
        const vat = sub * 0.25;
        const total = sub + vat;
        const statePct = ((tax + vat) / total) * 100;
        return { zone: z, spot, tax, network: NETWORK_TYPICAL, vat, total, statePct };
      });
      return { year: r.year, note: r.note, confidence: r.confidence, zones };
    });
  }, [records, taxes]);

  const maxSpot = records.length > 0 ? Math.max(...records.flatMap(r => ZONES.map(z => r[z]))) : 100;
  const chartMaxPts = res === "day" ? 365 : res === "week" ? 260 : res === "month" ? 120 : 20;

  if (error && !annualSpot) return <div style={{ color: "#ef4444", padding: 16 }}>{error}</div>;
  if (!annualSpot) return <div style={{ padding: 16, color: "#888" }}>Laddar spotprisdata…</div>;

  return (
    <section style={{ background: "#0c0a09", border: "1px solid #292524", borderRadius: 12, padding: 20, marginBottom: 24 }}>
      {/* ── Header ── */}
      <h3 style={{ color: "#f5f5f5", margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>
        Spotpris & Väder — historik
      </h3>
      <p style={{ color: "#78716c", fontSize: 12, margin: "0 0 14px" }}>
        Elpris per elområde jämfört med temperatur, sol och vind. Dag, vecka, månad eller år.
      </p>

      {/* ── Controls row 1: zone + resolution ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        {/* Zones */}
        <div style={{ display: "flex", gap: 3 }}>
          {ZONES.map(z => (
            <button key={z} onClick={() => setZone(z)} style={btnS(zone === z, ZONE_COLORS[z])}>
              {z}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 22, background: "#44403c" }} />

        {/* Resolution */}
        <div style={{ display: "flex", gap: 3 }}>
          {RES_OPTIONS.map(r => (
            <button key={r.key} onClick={() => setRes(r.key)} style={btnS(res === r.key, "#a8a29e")}>
              {r.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 22, background: "#44403c" }} />

        {/* Date range (hidden for year view) */}
        {res !== "year" && (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputS} />
            <span style={{ color: "#57534e", fontSize: 10 }}>→</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputS} />
          </div>
        )}

        {/* Year view controls */}
        {res === "year" && (
          <label style={{ fontSize: 11, color: "#78716c", cursor: "pointer" }}>
            <input type="checkbox" checked={showTotalCost} onChange={e => setShowTotalCost(e.target.checked)}
              style={{ marginRight: 4, accentColor: "#f59e0b" }} />
            Totalkostnad
          </label>
        )}
      </div>

      {/* ── Zone/city label ── */}
      <div style={{ fontSize: 11, color: "#78716c", marginBottom: 10 }}>
        <span style={{ color: ZONE_COLORS[zone], fontWeight: 600 }}>{zone}</span> {ZONE_CITY[zone]}
        {res !== "year" && " · ENTSO-E + ERA5"}
        {res === "year" && " · Nord Pool + ERA5"}
        {loading && <span style={{ marginLeft: 8, color: "#f59e0b" }}>⏳ Laddar…</span>}
      </div>

      {/* ══════ YEAR VIEW: bar chart ══════ */}
      {res === "year" && !showTotalCost && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 200 }}>
            {records.map(r => {
              const val = r[zone];
              const h = (val / maxSpot) * 100;
              const is22 = r.year === 2022;
              const wx = annualWeather?.zones.find(z => z.zone === zone)?.annual.find(a => a.year === r.year);
              return (
                <div key={r.year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ fontSize: 8, color: "#a8a29e", marginBottom: 1 }}>
                    {val.toFixed(0)}
                  </div>
                  {/* Weather mini-indicator */}
                  {wx && (
                    <div style={{ fontSize: 7, color: "#57534e", marginBottom: 1 }} title={`${r1(wx.temp_avg_c)}°C · ${r0(wx.solar_kwh_m2)} kWh/m² · ${r1(wx.wind_avg_max_ms)} m/s`}>
                      {r1(wx.temp_avg_c)}°
                    </div>
                  )}
                  <div style={{
                    width: "60%", height: `${h}%`, minHeight: 2,
                    background: is22 ? `linear-gradient(180deg, ${ZONE_COLORS[zone]}, #ef4444)` : ZONE_COLORS[zone],
                    borderRadius: "3px 3px 0 0", opacity: 0.85,
                  }} />
                  <div style={{ fontSize: 10, color: is22 ? "#ef4444" : "#78716c", marginTop: 3, fontWeight: is22 ? 700 : 400 }}>
                    {r.year}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════ YEAR VIEW: total cost table ══════ */}
      {res === "year" && showTotalCost && (
        <div style={{ marginBottom: 16, overflowX: "auto" }}>
          <div style={{ fontSize: 11, color: "#78716c", marginBottom: 6 }}>
            Totalkostnad inkl nätavgift ({NETWORK_TYPICAL} öre), energiskatt och moms (25%). Öre/kWh.
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}>
            <thead>
              <tr>
                <th style={thA}>År</th>
                {ZONES.map(z => <th key={z} style={{ ...thA, color: ZONE_COLORS[z], textAlign: "right" }}>{z} spot</th>)}
                <th style={{ ...thA, textAlign: "right" }}>Skatt</th>
                {ZONES.map(z => <th key={z + "t"} style={{ ...thA, textAlign: "right", color: "#f5f5f5", fontWeight: 700 }}>{z} total</th>)}
              </tr>
            </thead>
            <tbody>
              {totalCostRows.map(row => (
                <tr key={row.year}>
                  <td style={{ ...tdA, color: row.year === 2022 ? "#ef4444" : "#d6d3d1", fontWeight: row.year === 2022 ? 700 : 400 }}>
                    {row.year}{row.confidence === "estimated" && <span style={{ fontSize: 8, color: "#57534e" }}> *</span>}
                  </td>
                  {row.zones.map(z => <td key={z.zone} style={{ ...tdA, color: ZONE_COLORS[z.zone], textAlign: "right" }}>{z.spot.toFixed(0)}</td>)}
                  <td style={{ ...tdA, color: "#ef4444", textAlign: "right" }}>{row.zones[0].tax.toFixed(0)}</td>
                  {row.zones.map(z => (
                    <td key={z.zone + "t"} style={{ ...tdA, color: "#f5f5f5", textAlign: "right", fontWeight: 600 }}>
                      {z.total.toFixed(0)}
                      <span style={{ fontSize: 8, color: z.statePct > 55 ? "#ef4444" : "#f59e0b" }}> ({z.statePct.toFixed(0)}%)</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 9, color: "#57534e", marginTop: 4 }}>
            * = estimerat. (%) = statens andel (skatt+moms). Lågt spot → hög statlig andel.
          </div>
        </div>
      )}

      {/* ══════ STATS ROW (all views with weather data) ══════ */}
      {stats && rows.length > 0 && !loading && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {stats.spotAvg !== null && <Stat label="Spot medel" value={`${stats.spotAvg}`} color="#f59e0b" />}
          {stats.spotMax !== null && <Stat label="Spot max" value={`${stats.spotMax}`} color="#ef4444" />}
          {stats.tempAvg !== null && <Stat label="Temp medel" value={`${stats.tempAvg}°C`} color="#22d3ee" />}
          {stats.windAvg !== null && <Stat label="Vind medel" value={`${stats.windAvg} m/s`} color="#94a3b8" />}
          {stats.corr !== null && (
            <Stat label="r(spot,temp)" value={stats.corr.toFixed(2)} color={stats.corr < -0.3 ? "#ef4444" : stats.corr < 0 ? "#f59e0b" : "#22d3ee"}
              tip="Pearson-korrelation. Negativt = kallare → dyrare. ≠ orsak." />
          )}
          <Stat label="Perioder" value={String(stats.n)} color="#78716c" />
        </div>
      )}

      {/* ══════ CHART (detail views + year view with weather) ══════ */}
      {rows.length > 1 && !loading && (
        <DualChart rows={rows} maxPts={chartMaxPts} />
      )}

      {/* ══════ DATA TABLE (toggle) ══════ */}
      {rows.length > 0 && !loading && (
        <>
          <button onClick={() => setShowTable(!showTable)}
            style={{ background: "none", border: "1px solid #44403c", borderRadius: 6, padding: "3px 10px", color: "#a8a29e", fontSize: 10, cursor: "pointer", marginTop: 8, marginBottom: 6 }}>
            {showTable ? "Dölj" : "Visa"} datatabell ({rows.length} rader)
          </button>

          {showTable && (
            <div style={{ overflowX: "auto", maxHeight: 460, overflowY: "auto", marginTop: 4 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #44403c", position: "sticky", top: 0, background: "#0c0a09" }}>
                    <th style={thD}>Period</th>
                    <th style={{ ...thD, color: "#f59e0b" }}>Spot</th>
                    <th style={{ ...thD, color: "#22d3ee" }}>Temp °C</th>
                    <th style={{ ...thD, color: "#facc15" }}>Sol kWh/m²</th>
                    <th style={{ ...thD, color: "#a3e635" }}>Sol h</th>
                    <th style={{ ...thD, color: "#94a3b8" }}>Vind m/s</th>
                    <th style={thD}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const is22 = row.period.startsWith("2022");
                    return (
                      <tr key={row.period} style={{ borderBottom: "1px solid #1c1917", background: is22 ? "rgba(239,68,68,0.04)" : "transparent" }}>
                        <td style={{ ...tdD, fontWeight: 600, color: is22 ? "#ef4444" : "#e7e5e4" }}>{row.period}</td>
                        <td style={{ ...tdD, color: "#f59e0b", fontWeight: 600 }}>{r1(row.spot_ore_kwh)}</td>
                        <td style={tdD}>{r1(row.temp_avg_c)}</td>
                        <td style={tdD}>{r1(row.solar_kwh_m2)}</td>
                        <td style={tdD}>{r0(row.sunshine_hours)}</td>
                        <td style={tdD}>{r1(row.wind_avg_ms)}</td>
                        <td style={tdD}><InlineBar row={row} allRows={rows} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Observation ── */}
      <details style={{ marginTop: 12 }}>
        <summary style={{ color: "#78716c", fontSize: 11, cursor: "pointer" }}>Observation (utan tolkning)</summary>
        <div style={{ fontSize: 10, color: "#57534e", marginTop: 6, lineHeight: 1.6 }}>
          <p style={{ margin: "0 0 4px" }}>
            <strong style={{ color: "#78716c" }}>Vädret påverkar båda sidor:</strong>{" "}
            Kyla → högre efterfrågan (uppvärmning). Lite sol/vind → lägre förnybar produktion.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong style={{ color: "#78716c" }}>Tabellen visar inte:</strong>{" "}
            Vattenkraftmagasin, gasmarknadspriser, transmissionsflöden, politiska beslut.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: "#78716c" }}>Korrelation ≠ orsak.</strong>
          </p>
        </div>
      </details>

      {/* ── Source ── */}
      <div style={{ fontSize: 9, color: "#44403c", borderTop: "1px solid #292524", paddingTop: 8, marginTop: 10 }}>
        Spot: {res === "year" ? "Nord Pool via elpriser24.se" : "ENTSO-E Day-Ahead (EUR/MWh → öre/kWh @ 11.49 SEK/EUR)"}
        {" · "}Väder: ERA5 via <a href="https://open-meteo.com/en/docs/historical-weather-api" target="_blank" rel="noopener" style={{ color: "#57534e" }}>Open-Meteo</a> (Copernicus/ECMWF)
        {annualSpot?.evidence_ref && <span style={{ marginLeft: 8 }}>📋 {annualSpot.evidence_ref.manifest_id}</span>}
      </div>
    </section>
  );
}

/* ── Styles ── */
const btnS = (on: boolean, c: string): React.CSSProperties => ({
  padding: "3px 9px", fontSize: 11, fontWeight: on ? 700 : 400,
  background: on ? c + "18" : "transparent",
  border: `1px solid ${on ? c : "#44403c"}`,
  borderRadius: 5, color: on ? c : "#78716c", cursor: "pointer",
});
const inputS: React.CSSProperties = {
  background: "#1c1917", border: "1px solid #44403c", borderRadius: 4,
  padding: "2px 5px", color: "#d6d3d1", fontSize: 10, width: 105,
};
const thA: React.CSSProperties = { textAlign: "left", padding: "4px", fontSize: 10, color: "#78716c", borderBottom: "1px solid #292524" };
const tdA: React.CSSProperties = { padding: "3px 4px", fontSize: 11, borderBottom: "1px solid #1c1917", color: "#d6d3d1" };
const thD: React.CSSProperties = { textAlign: "left", padding: "4px 5px", color: "#78716c", fontWeight: 500, fontSize: 9, whiteSpace: "nowrap" };
const tdD: React.CSSProperties = { padding: "3px 5px", color: "#d6d3d1", whiteSpace: "nowrap", fontSize: 10 };
