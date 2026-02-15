"use client";

import { useState, useEffect, useCallback } from "react";
import { ZoneSelect } from "@/components/ZoneSelect";
import { DateSelect } from "@/components/DateSelect";
import { SpotChart, getZoneColor } from "@/components/SpotChart";
import { SpotTable } from "@/components/SpotTable";
import { EvidenceBadge } from "@/components/EvidenceBadge";
import { StaleIndicator } from "@/components/StaleIndicator";

interface PricePoint { hourISO: string; price: number }
interface Stats { avg: number; min: number; max: number }
interface Evidence { manifest_id: string; root_hash: string; files_sha256_path: string }

interface DayData {
  zone: string;
  date: string;
  currency: string;
  resolution: string;
  series: PricePoint[];
  stats: Stats;
  evidence: Evidence;
}

interface CompareData {
  date: string;
  currency: string;
  zones: Array<{ zone: string; series: PricePoint[]; stats: Stats }>;
  evidence: Evidence;
}

type ViewMode = "single" | "compare";

// Default to yesterday
function defaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function SpotPage() {
  const [mode, setMode] = useState<ViewMode>("single");
  const [zone, setZone] = useState("SE3");
  const [compareZones, setCompareZones] = useState(["SE1", "SE2", "SE3", "SE4"]);
  const [date, setDate] = useState(defaultDate);

  const [dayData, setDayData] = useState<DayData | null>(null);
  const [compareData, setCompareData] = useState<CompareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (mode === "single") {
        const res = await fetch(`/api/spot/day?zone=${zone}&date=${date}`);
        if (!res.ok) {
          const err = await res.json();
          setError(err.error ?? "Failed to fetch");
          setDayData(null);
          return;
        }
        setDayData(await res.json());
      } else {
        const zonesStr = compareZones.join(",");
        const res = await fetch(`/api/spot/compare?zones=${zonesStr}&date=${date}`);
        if (!res.ok) {
          const err = await res.json();
          setError(err.error ?? "Failed to fetch");
          setCompareData(null);
          return;
        }
        setCompareData(await res.json());
      }
    } catch (e) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [mode, zone, compareZones, date]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build chart data
  const chartData = mode === "single" && dayData
    ? [{ zone: dayData.zone, series: dayData.series, color: getZoneColor(dayData.zone, 0) }]
    : mode === "compare" && compareData
      ? compareData.zones.map((z, i) => ({ zone: z.zone, series: z.series, color: getZoneColor(z.zone, i) }))
      : [];

  // Build table data
  const tableZones = mode === "single" && dayData
    ? [{ zone: dayData.zone, series: dayData.series, stats: dayData.stats }]
    : mode === "compare" && compareData
      ? compareData.zones
      : [];

  const evidence = mode === "single" ? dayData?.evidence : compareData?.evidence;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">⚡ Spot Prices</h1>
        <p className="page-subtitle">
          ENTSO-E day-ahead prices. All values from canonical store with evidence trail.
        </p>
      </div>

      {/* Controls */}
      <div className="card">
        <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Mode toggle */}
          <div className="tab-row" style={{ marginBottom: 0, borderBottom: "none" }}>
            <button
              className={`tab ${mode === "single" ? "active" : ""}`}
              onClick={() => setMode("single")}
            >
              Single Zone
            </button>
            <button
              className={`tab ${mode === "compare" ? "active" : ""}`}
              onClick={() => setMode("compare")}
            >
              Compare
            </button>
          </div>

          <div style={{ borderLeft: "1px solid var(--border-color)", height: "28px" }} />

          {mode === "single" ? (
            <ZoneSelect value={zone} onChange={setZone} />
          ) : (
            <ZoneSelect
              value=""
              onChange={() => {}}
              multi
              multiValue={compareZones}
              onMultiChange={setCompareZones}
            />
          )}

          <DateSelect value={date} onChange={setDate} />

          {evidence && (
            <EvidenceBadge manifestId={evidence.manifest_id} rootHash={evidence.root_hash} />
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card" style={{ borderColor: "var(--accent-red)" }}>
          <p style={{ color: "var(--accent-red)", fontSize: "0.85rem" }}>{error}</p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "4px" }}>
            Data may not be available for this date. Run ENTSO-E ingest for the target date.
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="card">
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        </div>
      )}

      {/* Chart */}
      {!loading && !error && chartData.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              {mode === "single" ? `${zone} — ${date}` : `Zone Comparison — ${date}`}
            </span>
            <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
              {dayData?.resolution ?? compareData?.zones[0]?.series.length + " points" ?? ""}
            </span>
          </div>
          <SpotChart data={chartData} currency={dayData?.currency ?? compareData?.currency} />
        </div>
      )}

      {/* Stats summary for compare mode */}
      {!loading && !error && mode === "compare" && compareData && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Zone Statistics</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Zone</th>
                <th>Avg EUR/MWh</th>
                <th>Min</th>
                <th>Max</th>
                <th>Spread (max-min)</th>
              </tr>
            </thead>
            <tbody>
              {compareData.zones.map(z => (
                <tr key={z.zone}>
                  <td style={{ color: getZoneColor(z.zone, 0), fontWeight: 600 }}>{z.zone}</td>
                  <td>{z.stats.avg.toFixed(2)}</td>
                  <td style={{ color: "var(--accent-green)" }}>{z.stats.min.toFixed(2)}</td>
                  <td style={{ color: "var(--accent-red)" }}>{z.stats.max.toFixed(2)}</td>
                  <td>{(z.stats.max - z.stats.min).toFixed(2)}</td>
                </tr>
              ))}
              {compareData.zones.length > 1 && (
                <tr style={{ fontWeight: 600, borderTop: "2px solid var(--border-color)" }}>
                  <td style={{ color: "var(--accent-amber)" }}>Cross-zone spread</td>
                  <td style={{ color: "var(--accent-amber)" }}>
                    {(Math.max(...compareData.zones.map(z => z.stats.avg)) -
                      Math.min(...compareData.zones.map(z => z.stats.avg))).toFixed(2)}
                  </td>
                  <td colSpan={3} style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.78rem" }}>
                    Difference between highest and lowest zone average
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Hourly table */}
      {!loading && !error && tableZones.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Hourly Prices</span>
          </div>
          <SpotTable zones={tableZones} />
        </div>
      )}
    </div>
  );
}
