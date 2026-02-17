"use client";

import { useEffect, useState, useMemo, useCallback } from "react";

/**
 * WeatherCorrelationPanel
 *
 * Interactive panel comparing spot price vs weather (temp, solar, wind)
 * at day/week/month/year resolution across SE1-SE4.
 *
 * Data: /api/witness/weather-correlation?zone=SE3&res=month&from=2016-01-01&to=2025-12-31
 * Sources: ENTSO-E (spot), Open-Meteo ERA5 (weather)
 * Witness-mode: no interpretation, correlation ≠ causation.
 */

/* ── Types ── */
interface Row {
  period: string;
  spot_ore_kwh: number | null;
  temp_avg_c: number | null;
  solar_kwh_m2: number | null;
  sunshine_hours: number | null;
  wind_avg_ms: number | null;
  spot_days: number;
  weather_days: number;
}

interface APIResponse {
  zone: string;
  resolution: string;
  period: { from: string; to: string };
  count: number;
  rows: Row[];
  sources: { spot: string; weather: string };
}

/* ── Constants ── */
type Zone = "SE1" | "SE2" | "SE3" | "SE4";
type Res = "day" | "week" | "month" | "year";
const ZONES: Zone[] = ["SE1", "SE2", "SE3", "SE4"];
const RESOLUTIONS: { key: Res; label: string }[] = [
  { key: "year", label: "År" },
  { key: "month", label: "Månad" },
  { key: "week", label: "Vecka" },
  { key: "day", label: "Dag" },
];
const ZONE_COLORS: Record<string, string> = { SE1: "#22d3ee", SE2: "#38bdf8", SE3: "#f59e0b", SE4: "#ef4444" };
const ZONE_CITY: Record<string, string> = { SE1: "Luleå", SE2: "Sundsvall", SE3: "Stockholm", SE4: "Malmö" };

/* ── Helpers ── */
const r1 = (n: number | null) => (n !== null ? n.toFixed(1) : "–");
const r0 = (n: number | null) => (n !== null ? Math.round(n).toString() : "–");
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ── Chart component (inline SVG — no external deps) ── */
function MiniChart({ rows, maxRows }: { rows: Row[]; maxRows: number }) {
  // Show at most maxRows points
  const data = rows.length > maxRows ? rows.slice(rows.length - maxRows) : rows;
  const W = 800, H = 200, PAD = 40;
  const cW = W - PAD * 2, cH = H - PAD * 2;

  const spots = data.map(r => r.spot_ore_kwh).filter((v): v is number => v !== null);
  const temps = data.map(r => r.temp_avg_c).filter((v): v is number => v !== null);
  if (spots.length < 2) return null;

  const spotMin = Math.min(...spots), spotMax = Math.max(...spots);
  const tempMin = Math.min(...temps), tempMax = Math.max(...temps);
  const spotRange = spotMax - spotMin || 1;
  const tempRange = tempMax - tempMin || 1;

  const xStep = cW / (data.length - 1);

  const spotLine = data.map((r, i) => {
    if (r.spot_ore_kwh === null) return null;
    const x = PAD + i * xStep;
    const y = PAD + cH - ((r.spot_ore_kwh - spotMin) / spotRange) * cH;
    return `${x},${y}`;
  }).filter(Boolean).join(" ");

  const tempLine = data.map((r, i) => {
    if (r.temp_avg_c === null) return null;
    const x = PAD + i * xStep;
    const y = PAD + cH - ((r.temp_avg_c - tempMin) / tempRange) * cH;
    return `${x},${y}`;
  }).filter(Boolean).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 200 }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(f => (
        <line key={f} x1={PAD} x2={W - PAD} y1={PAD + cH * (1 - f)} y2={PAD + cH * (1 - f)}
          stroke="#292524" strokeWidth={0.5} />
      ))}
      {/* Spot line */}
      <polyline points={spotLine} fill="none" stroke="#f59e0b" strokeWidth={1.5} opacity={0.9} />
      {/* Temp line */}
      <polyline points={tempLine} fill="none" stroke="#22d3ee" strokeWidth={1.2} opacity={0.7} strokeDasharray="4 2" />
      {/* Y-axis labels */}
      <text x={PAD - 4} y={PAD + 4} fill="#f59e0b" fontSize={9} textAnchor="end">{Math.round(spotMax)}</text>
      <text x={PAD - 4} y={PAD + cH + 4} fill="#f59e0b" fontSize={9} textAnchor="end">{Math.round(spotMin)}</text>
      <text x={W - PAD + 4} y={PAD + 4} fill="#22d3ee" fontSize={9}>{r1(tempMax)}°</text>
      <text x={W - PAD + 4} y={PAD + cH + 4} fill="#22d3ee" fontSize={9}>{r1(tempMin)}°</text>
      {/* Legend */}
      <line x1={PAD} x2={PAD + 20} y1={H - 8} y2={H - 8} stroke="#f59e0b" strokeWidth={2} />
      <text x={PAD + 24} y={H - 4} fill="#a8a29e" fontSize={9}>Spot öre/kWh</text>
      <line x1={PAD + 110} x2={PAD + 130} y1={H - 8} y2={H - 8} stroke="#22d3ee" strokeWidth={1.5} strokeDasharray="4 2" />
      <text x={PAD + 134} y={H - 4} fill="#a8a29e" fontSize={9}>Temp °C</text>
    </svg>
  );
}

/* ── Main Component ── */
export default function WeatherCorrelationPanel() {
  const [zone, setZone] = useState<Zone>("SE3");
  const [res, setRes] = useState<Res>("month");
  const [from, setFrom] = useState("2016-01-01");
  const [to, setTo] = useState("2025-12-31");
  const [data, setData] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/witness/weather-correlation?zone=${zone}&res=${res}&from=${from}&to=${to}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (!d.rows || d.rows.length === 0) {
        setError("Ingen data. Kör ingest först:\nnpx tsx packages/evidence/src/ingest_openmeteo_weather.ts");
        setData(null);
      } else {
        setData(d);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [zone, res, from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* Stats summary */
  const stats = useMemo(() => {
    if (!data?.rows?.length) return null;
    const rows = data.rows;
    const spots = rows.map(r => r.spot_ore_kwh).filter((v): v is number => v !== null);
    const temps = rows.map(r => r.temp_avg_c).filter((v): v is number => v !== null);
    const winds = rows.map(r => r.wind_avg_ms).filter((v): v is number => v !== null);

    // Pearson correlation: spot vs temp
    let corrSpotTemp: number | null = null;
    if (spots.length > 2 && temps.length > 2) {
      const paired = rows
        .filter(r => r.spot_ore_kwh !== null && r.temp_avg_c !== null)
        .map(r => [r.spot_ore_kwh!, r.temp_avg_c!]);
      if (paired.length > 2) {
        const n = paired.length;
        const sx = paired.reduce((s, [x]) => s + x, 0);
        const sy = paired.reduce((s, [, y]) => s + y, 0);
        const sxy = paired.reduce((s, [x, y]) => s + x * y, 0);
        const sx2 = paired.reduce((s, [x]) => s + x * x, 0);
        const sy2 = paired.reduce((s, [, y]) => s + y * y, 0);
        const num = n * sxy - sx * sy;
        const den = Math.sqrt((n * sx2 - sx ** 2) * (n * sy2 - sy ** 2));
        corrSpotTemp = den > 0 ? Math.round(num / den * 100) / 100 : null;
      }
    }

    return {
      spotAvg: Math.round(spots.reduce((s, v) => s + v, 0) / spots.length * 10) / 10,
      spotMin: Math.round(Math.min(...spots) * 10) / 10,
      spotMax: Math.round(Math.max(...spots) * 10) / 10,
      tempAvg: Math.round(temps.reduce((s, v) => s + v, 0) / temps.length * 10) / 10,
      windAvg: winds.length ? Math.round(winds.reduce((s, v) => s + v, 0) / winds.length * 10) / 10 : null,
      corrSpotTemp,
      periods: data.rows.length,
    };
  }, [data]);

  /* Max rows for chart */
  const chartMaxRows = res === "day" ? 365 : res === "week" ? 520 : res === "month" ? 120 : 20;

  return (
    <section style={{ background: "#0c0a09", border: "1px solid #292524", borderRadius: 12, padding: 20, marginBottom: 24 }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ color: "#f5f5f5", fontSize: 18, fontWeight: 700, margin: 0 }}>
            Spotpris vs Väder
          </h2>
          <p style={{ color: "#78716c", fontSize: 12, margin: "4px 0 0" }}>
            ENTSO-E spotpris + ERA5 temperatur, sol, vind — per elområde och tidsperiod
          </p>
        </div>
      </div>

      {/* ── Controls ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        {/* Zone */}
        <div style={{ display: "flex", gap: 4 }}>
          {ZONES.map(z => (
            <button key={z} onClick={() => setZone(z)} style={btnStyle(zone === z, ZONE_COLORS[z])}>
              {z}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: "#44403c" }} />

        {/* Resolution */}
        <div style={{ display: "flex", gap: 4 }}>
          {RESOLUTIONS.map(r => (
            <button key={r.key} onClick={() => setRes(r.key)} style={btnStyle(res === r.key, "#a8a29e")}>
              {r.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: "#44403c" }} />

        {/* Date range */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={inputStyle} />
          <span style={{ color: "#57534e", fontSize: 11 }}>→</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={inputStyle} />
        </div>
      </div>

      {/* ── Zone label ── */}
      <div style={{ fontSize: 12, color: "#a8a29e", marginBottom: 8 }}>
        <span style={{ color: ZONE_COLORS[zone], fontWeight: 600 }}>{zone}</span>
        {" "}{ZONE_CITY[zone]} · ERA5 0.25° · ENTSO-E Day-Ahead
      </div>

      {/* ── Loading / Error ── */}
      {loading && <div style={{ padding: 20, color: "#78716c", fontSize: 13 }}>Laddar {zone} {res}…</div>}
      {error && <div style={{ padding: 12, color: "#ef4444", fontSize: 12, background: "#1c1917", borderRadius: 8 }}>{error}</div>}

      {/* ── Stats row ── */}
      {stats && !loading && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <StatBox label="Spot medel" value={`${stats.spotAvg} öre`} color="#f59e0b" />
          <StatBox label="Spot min" value={`${stats.spotMin}`} color="#78716c" />
          <StatBox label="Spot max" value={`${stats.spotMax}`} color="#ef4444" />
          <StatBox label="Temp medel" value={`${stats.tempAvg}°C`} color="#22d3ee" />
          {stats.windAvg !== null && <StatBox label="Vind medel" value={`${stats.windAvg} m/s`} color="#94a3b8" />}
          {stats.corrSpotTemp !== null && (
            <StatBox
              label="r(spot,temp)"
              value={stats.corrSpotTemp.toFixed(2)}
              color={stats.corrSpotTemp < -0.3 ? "#ef4444" : stats.corrSpotTemp < 0 ? "#f59e0b" : "#22d3ee"}
              tooltip="Pearson-korrelation. Negativt = kallare → dyrare. ≠ orsak."
            />
          )}
          <StatBox label="Perioder" value={String(stats.periods)} color="#78716c" />
        </div>
      )}

      {/* ── Chart ── */}
      {data && !loading && data.rows.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <MiniChart rows={data.rows} maxRows={chartMaxRows} />
        </div>
      )}

      {/* ── Table toggle ── */}
      {data && !loading && (
        <>
          <button
            onClick={() => setShowTable(!showTable)}
            style={{ background: "none", border: "1px solid #44403c", borderRadius: 6, padding: "4px 12px", color: "#a8a29e", fontSize: 11, cursor: "pointer", marginBottom: 8 }}
          >
            {showTable ? "Dölj tabell" : "Visa tabell"} ({data.rows.length} rader)
          </button>

          {showTable && (
            <div style={{ overflowX: "auto", maxHeight: 500, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #44403c", position: "sticky", top: 0, background: "#0c0a09" }}>
                    <th style={thS}>Period</th>
                    <th style={{ ...thS, color: "#f59e0b" }}>Spot öre/kWh</th>
                    <th style={{ ...thS, color: "#22d3ee" }}>Temp °C</th>
                    <th style={{ ...thS, color: "#facc15" }}>Sol kWh/m²</th>
                    <th style={{ ...thS, color: "#a3e635" }}>Sol tim</th>
                    <th style={{ ...thS, color: "#94a3b8" }}>Vind m/s</th>
                    <th style={thS}>Bars</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => {
                    const isCrisis = row.period.startsWith("2022");
                    return (
                      <tr key={row.period} style={{ borderBottom: "1px solid #1c1917", background: isCrisis ? "rgba(239,68,68,0.04)" : "transparent" }}>
                        <td style={{ ...tdS, fontWeight: 600, color: isCrisis ? "#ef4444" : "#e7e5e4" }}>{row.period}</td>
                        <td style={{ ...tdS, color: "#f59e0b", fontWeight: 600 }}>{r1(row.spot_ore_kwh)}</td>
                        <td style={tdS}>{r1(row.temp_avg_c)}</td>
                        <td style={tdS}>{r1(row.solar_kwh_m2)}</td>
                        <td style={tdS}>{r0(row.sunshine_hours)}</td>
                        <td style={tdS}>{r1(row.wind_avg_ms)}</td>
                        <td style={tdS}>
                          <InlineBar row={row} data={data.rows} />
                        </td>
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
        <summary style={{ color: "#a8a29e", fontSize: 12, cursor: "pointer" }}>
          Observation (utan tolkning)
        </summary>
        <div style={{ fontSize: 11, color: "#78716c", marginTop: 8, lineHeight: 1.6 }}>
          <p style={{ margin: "0 0 4px" }}>
            <strong style={{ color: "#a8a29e" }}>Vädret påverkar båda sidor:</strong>{" "}
            Kyla → högre efterfrågan. Lite sol/vind → lägre förnybar produktion. Dessa verkar åt samma håll.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong style={{ color: "#a8a29e" }}>Vad tabellen inte visar:</strong>{" "}
            Vattenkraftmagasin, gasmarknadspriser, transmissionsflöden, politiska beslut, exportflöden.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: "#a8a29e" }}>r(spot,temp)</strong> visar Pearson-korrelation.
            Negativt värde = kallare perioder sammanfaller med högre pris. Korrelation ≠ orsak.
          </p>
        </div>
      </details>

      {/* ── Source ── */}
      <div style={{ marginTop: 10, fontSize: 10, color: "#57534e" }}>
        Spot: ENTSO-E Day-Ahead (EUR/MWh → öre/kWh @ 11.49 SEK/EUR) ·{" "}
        Väder: ERA5 via{" "}
        <a href="https://open-meteo.com/en/docs/historical-weather-api" target="_blank" rel="noopener" style={{ color: "#78716c" }}>
          Open-Meteo
        </a>
        {" "}(Copernicus/ECMWF)
      </div>
    </section>
  );
}

/* ── Sub-components ── */

function StatBox({ label, value, color, tooltip }: { label: string; value: string; color: string; tooltip?: string }) {
  return (
    <div title={tooltip} style={{ background: "#1c1917", border: "1px solid #292524", borderRadius: 6, padding: "6px 10px", minWidth: 70 }}>
      <div style={{ fontSize: 10, color: "#78716c", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color }}>{value}</div>
    </div>
  );
}

function InlineBar({ row, data }: { row: Row; data: Row[] }) {
  const spots = data.map(r => r.spot_ore_kwh).filter((v): v is number => v !== null);
  const temps = data.map(r => r.temp_avg_c).filter((v): v is number => v !== null);
  const sols = data.map(r => r.solar_kwh_m2).filter((v): v is number => v !== null);
  const winds = data.map(r => r.wind_avg_ms).filter((v): v is number => v !== null);
  if (spots.length === 0) return null;

  const norm = (v: number | null, arr: number[]) => {
    if (v === null || arr.length === 0) return 0;
    const mn = Math.min(...arr), mx = Math.max(...arr);
    return mx > mn ? (v - mn) / (mx - mn) : 0.5;
  };

  return (
    <div style={{ display: "flex", gap: 1, alignItems: "center", height: 16 }}>
      <div style={{ width: Math.max(norm(row.spot_ore_kwh, spots) * 40, 2), height: 7, background: "#f59e0b", borderRadius: 1 }}
        title={`Spot: ${r1(row.spot_ore_kwh)}`} />
      <div style={{ width: Math.max((1 - norm(row.temp_avg_c, temps)) * 25, 2), height: 7, background: "#22d3ee", borderRadius: 1, opacity: 0.7 }}
        title={`Kyla: ${r1(row.temp_avg_c)}°C (inverterad)`} />
      <div style={{ width: Math.max(norm(row.solar_kwh_m2, sols) * 25, 2), height: 7, background: "#facc15", borderRadius: 1, opacity: 0.7 }}
        title={`Sol: ${r1(row.solar_kwh_m2)} kWh/m²`} />
      <div style={{ width: Math.max(norm(row.wind_avg_ms, winds) * 20, 2), height: 7, background: "#94a3b8", borderRadius: 1, opacity: 0.7 }}
        title={`Vind: ${r1(row.wind_avg_ms)} m/s`} />
    </div>
  );
}

/* ── Styles ── */
const btnStyle = (active: boolean, color: string): React.CSSProperties => ({
  padding: "4px 10px",
  fontSize: 11,
  fontWeight: active ? 700 : 400,
  background: active ? color + "18" : "transparent",
  border: `1px solid ${active ? color : "#44403c"}`,
  borderRadius: 6,
  color: active ? color : "#78716c",
  cursor: "pointer",
  transition: "all 0.15s",
});

const inputStyle: React.CSSProperties = {
  background: "#1c1917",
  border: "1px solid #44403c",
  borderRadius: 4,
  padding: "3px 6px",
  color: "#d6d3d1",
  fontSize: 11,
  width: 110,
};

const thS: React.CSSProperties = { textAlign: "left", padding: "5px 6px", color: "#a8a29e", fontWeight: 500, fontSize: 10, whiteSpace: "nowrap" };
const tdS: React.CSSProperties = { padding: "4px 6px", color: "#d6d3d1", whiteSpace: "nowrap", fontSize: 11 };
