/**
 * SimulatePanel.tsx — Effekttariff-Simulering
 *
 * Frikopplad komponent. Får all kontext via props från SpotDashboard.
 * Anropar POST /api/simulate med panelens zone/period/datum.
 *
 * Visar 3 prisnivåer sida vid sida:
 *   A) Rå spot (marknaden)
 *   B) Spot inkl rörliga avgifter (jämförbar per-kWh)
 *   C) Total inkl allt (simulerat, utslaget per kWh)
 *
 * Sparar inputs i localStorage.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getClientTariff,
  listClientTariffs,
  calcSpotInklRorligt,
  type ClientTariffConfig,
} from "@/lib/simulate/tariff-registry";

const FONT = "var(--font-mono, 'JetBrains Mono', monospace)";

const C = {
  bg:     "var(--bg-primary)",
  card:   "var(--bg-card)",
  card2:  "var(--bg-primary)",
  border: "var(--border-color)",
  text:   "var(--text-primary)",
  muted:  "var(--text-muted)",
  dim:    "var(--text-ghost)",
  spot:   "#f59e0b",
  green:  "#22c55e",
  blue:   "#3b82f6",
  red:    "#ef4444",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface BatteryResult {
  status: string;
  capacityKwh: number;
  maxKw: number;
  efficiency: number;
  peakBefore: number;
  peakAfter: number;
  peakReductionKw: number;
  totalGridKwh: number;
  solveTimeMs: number;
  numVars: number;
  numConstraints: number;
  costWithoutBattery: number;
  soc: number[];
  charge: number[];
  discharge: number[];
  timestamps: string[];
  sampleStep: number;
  error?: string;
}

interface SimulateResult {
  totalCost: number;
  spotCost: number;
  energyFee: number;
  effectFee: number;
  fixedFee: number;
  tax: number;
  vat: number;
  totalKwh: number;
  peakKw: number;
  avgCostOrePerKwh: number;
  monthlyPeaks: Array<{
    month: string;
    peakKw: number;
    topHours: number[];
  }>;
  solar: {
    kWp: number;
    orientation: string;
    totalProductionKwh: number;
    selfConsumptionKwh: number;
    gridExportKwh: number;
    gridImportKwh: number;
    selfConsumptionRatio: number;
    exportRevenueSek: number;
    monthlyProductionKwh: number[];
  } | null;
  battery: BatteryResult | null;
  meta: {
    zone: string;
    period: string;
    start: string;
    end: string;
    annualKwh: number;
    fuse: string;
    tariff: string;
    resolution: string;
    spotPoints: number;
    eurSek: number;
    tariffVerified: boolean;
  };
}

interface SimulatePanelProps {
  zone: string;
  period: "day" | "week" | "month" | "year";
  start: string;
  end: string;
  /** Current live spot in öre/kWh (for A/B display even without simulation) */
  spotOreNow?: number | null;
  /** EUR/SEK rate from parent */
  eurSek?: number;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(`eve-sim-${key}`);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

function saveStored(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(`eve-sim-${key}`, JSON.stringify(value)); } catch {}
}

// ─── Battery presets ──────────────────────────────────────────────────────────

interface BatteryPreset {
  id: string;
  name: string;
  kwh: number;
  maxKw: number;
  efficiency: number;
  priceKr: number;
}

const BATTERY_PRESETS: BatteryPreset[] = [
  { id: "custom",           name: "Egen konfiguration",     kwh: 10,   maxKw: 5,    efficiency: 0.90, priceKr: 80000 },
  { id: "huawei_5",         name: "Huawei LUNA 2000 5kWh",  kwh: 5,    maxKw: 2.5,  efficiency: 0.90, priceKr: 45000 },
  { id: "huawei_10",        name: "Huawei LUNA 2000 10kWh", kwh: 10,   maxKw: 5,    efficiency: 0.90, priceKr: 75000 },
  { id: "huawei_15",        name: "Huawei LUNA 2000 15kWh", kwh: 15,   maxKw: 5,    efficiency: 0.90, priceKr: 105000 },
  { id: "tesla_pw3",        name: "Tesla Powerwall 3",      kwh: 13.5, maxKw: 11.5, efficiency: 0.90, priceKr: 120000 },
  { id: "byd_hvs10",        name: "BYD HVS 10.2",          kwh: 10.2, maxKw: 10.2, efficiency: 0.90, priceKr: 85000 },
  { id: "growatt_apx12",    name: "Growatt APX 12kWh",      kwh: 12,   maxKw: 6,    efficiency: 0.90, priceKr: 70000 },
  { id: "pixii_10",         name: "Pixii Home 10kWh",       kwh: 10,   maxKw: 6,    efficiency: 0.90, priceKr: 90000 },
  { id: "elekto_zbox100",   name: "ELEKTO (Zetara ZBox100-HS) · Kommersiell", kwh: 100, maxKw: 50, efficiency: 0.90, priceKr: 247000 },
];

// ─── Solar panel presets ───────────────────────────────────────────────────

interface SolarPanel {
  id: string;
  name: string;
  watt: number;
  efficiency: number;
  degradationY1: number;
  degradationAnnual: number;
}

const SOLAR_PANELS: SolarPanel[] = [
  { id: "suntech_440", name: "Suntech Ultra V Pro 440W", watt: 440, efficiency: 0.225, degradationY1: 0.01, degradationAnnual: 0.004 },
  { id: "custom",      name: "Egen panel",              watt: 400, efficiency: 0.20,  degradationY1: 0.02, degradationAnnual: 0.005 },
];

type SolarOrientation = "south_30" | "east_west" | "flat" | "south_45";

const SOLAR_ORIENTATION_LABELS: Record<SolarOrientation, string> = {
  south_30: "Söder 30° (optimal)",
  south_45: "Söder 45°",
  east_west: "Öst/Väst",
  flat:      "Platt tak",
};

// kWh per installed kWp per month — Stockholm (SE3)
// Source: PVGIS typical values, adjusted for Swedish climate
const SOLAR_MONTHLY_KWH_PER_KWP: Record<SolarOrientation, number[]> = {
  south_30:  [15, 35, 75, 110, 135, 140, 135, 110, 70, 35, 15, 8],
  south_45:  [13, 32, 72, 105, 128, 132, 128, 105, 65, 32, 13, 7],
  east_west: [11, 28, 62,  95, 120, 125, 120,  95, 58, 28, 11, 6],
  flat:      [10, 25, 58,  88, 115, 120, 115,  88, 55, 25, 10, 5],
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SimulatePanel({ zone, period, start, end, spotOreNow, eurSek }: SimulatePanelProps) {
  const tariffs = listClientTariffs();

  const [annualKwh, setAnnualKwh] = useState(() => loadStored("annualKwh", 20000));
  const [fuse, setFuse] = useState(() => loadStored("fuse", "20A"));
  const [tariffId, setTariffId] = useState(() => loadStored("tariff", tariffs[0]?.id ?? "vattenfall_stockholm"));

  // Battery state
  const [batteryEnabled, setBatteryEnabled] = useState(() => loadStored("batteryEnabled", false));
  const [batteryKwh, setBatteryKwh] = useState(() => loadStored("batteryKwh", 10));
  const [batteryMaxKw, setBatteryMaxKw] = useState(() => loadStored("batteryMaxKw", 5));
  const [batteryEff, setBatteryEff] = useState(() => loadStored("batteryEff", 0.90));
  const [batteryCostKr, setBatteryCostKr] = useState(() => loadStored("batteryCostKr", 80000));
  const [batteryDeductPct, setBatteryDeductPct] = useState(() => loadStored("batteryDeductPct", 50));
  const [batteryPreset, setBatteryPreset] = useState(() => loadStored("batteryPreset", "custom"));

  // Solar panel state
  const [solarEnabled, setSolarEnabled] = useState(() => loadStored("solarEnabled", false));
  const [solarPanelCount, setSolarPanelCount] = useState(() => loadStored("solarPanelCount", 20));
  const [solarPanelId, setSolarPanelId] = useState(() => loadStored("solarPanelId", "suntech_440"));
  const [solarOrientation, setSolarOrientation] = useState<SolarOrientation>(() => loadStored("solarOrientation", "south_30"));
  const [solarPriceKr, setSolarPriceKr] = useState(() => loadStored("solarPriceKr", 150000));

  // Load profile
  const [loadProfile, setLoadProfile] = useState<"flat" | "standard" | "heatpump">(() => loadStored("loadProfile", "heatpump"));

  // Uploaded load data
  const [uploadedLoad, setUploadedLoad] = useState<{
    filename: string;
    granularity: string;
    totalKwh: number;
    source: string;
    monthly?: Array<{ month: string; kWh: number }>;
    hourlyCount?: number;
    warnings: string[];
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulateResult | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [showMath, setShowMath] = useState(false);

  // Persist inputs
  useEffect(() => { saveStored("annualKwh", annualKwh); }, [annualKwh]);
  useEffect(() => { saveStored("fuse", fuse); }, [fuse]);
  useEffect(() => { saveStored("tariff", tariffId); }, [tariffId]);
  useEffect(() => { saveStored("batteryEnabled", batteryEnabled); }, [batteryEnabled]);
  useEffect(() => { saveStored("batteryKwh", batteryKwh); }, [batteryKwh]);
  useEffect(() => { saveStored("batteryMaxKw", batteryMaxKw); }, [batteryMaxKw]);
  useEffect(() => { saveStored("batteryEff", batteryEff); }, [batteryEff]);
  useEffect(() => { saveStored("batteryCostKr", batteryCostKr); }, [batteryCostKr]);
  useEffect(() => { saveStored("batteryDeductPct", batteryDeductPct); }, [batteryDeductPct]);
  useEffect(() => { saveStored("batteryPreset", batteryPreset); }, [batteryPreset]);
  useEffect(() => { saveStored("loadProfile", loadProfile); }, [loadProfile]);
  useEffect(() => { saveStored("solarEnabled", solarEnabled); }, [solarEnabled]);
  useEffect(() => { saveStored("solarPanelCount", solarPanelCount); }, [solarPanelCount]);
  useEffect(() => { saveStored("solarPanelId", solarPanelId); }, [solarPanelId]);
  useEffect(() => { saveStored("solarOrientation", solarOrientation); }, [solarOrientation]);
  useEffect(() => { saveStored("solarPriceKr", solarPriceKr); }, [solarPriceKr]);

  const applyPreset = (presetId: string) => {
    setBatteryPreset(presetId);
    const p = BATTERY_PRESETS.find(x => x.id === presetId);
    if (p && presetId !== "custom") {
      setBatteryKwh(p.kwh);
      setBatteryMaxKw(p.maxKw);
      setBatteryEff(p.efficiency);
      setBatteryCostKr(p.priceKr);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/load/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) {
        setUploadError(json.error || "Okänt fel vid uppladdning");
        setUploadedLoad(null);
        return;
      }
      const d = json.data;
      setUploadedLoad({
        filename: d.raw_filename || file.name,
        granularity: d.granularity,
        totalKwh: d.totalKwh,
        source: d.source,
        monthly: d.monthly,
        hourlyCount: d.hourly?.length,
        warnings: d.warnings || [],
      });
      // Auto-update annualKwh if we got a reasonable value
      if (d.totalKwh > 500) {
        // If data covers < 12 months, extrapolate
        const months = d.monthly?.length || 12;
        const annual = months < 12 ? Math.round(d.totalKwh * 12 / months) : Math.round(d.totalKwh);
        setAnnualKwh(annual);
      }
      setUploadError(null);
    } catch (e: any) {
      setUploadError(e.message || "Uppladdning misslyckades");
    } finally {
      setUploading(false);
    }
  };

  const tariffCfg = getClientTariff(tariffId, fuse);
  const currentTariff = tariffs.find(t => t.id === tariffId);
  const fuseOptions = currentTariff?.fuses ?? ["16A", "20A", "25A", "35A"];

  const runSimulation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zone, period, start, end,
          annual_kwh: annualKwh, fuse, tariff: tariffId,
          has_heat_pump: loadProfile === "heatpump",
          has_ev: false,
          load_profile: loadProfile,
          ...(batteryEnabled && { battery_kwh: batteryKwh, battery_max_kw: batteryMaxKw, battery_efficiency: batteryEff }),
          ...(solarEnabled && {
            solar_kwp: (SOLAR_PANELS.find(p => p.id === solarPanelId)?.watt ?? 440) * solarPanelCount / 1000,
            solar_orientation: solarOrientation,
          }),
          ...(uploadedLoad?.monthly && uploadedLoad.monthly.length > 0 && {
            uploaded_monthly: uploadedLoad.monthly,
          }),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data: SimulateResult = await res.json();
      setResult(data);
      setLastRun(new Date().toLocaleTimeString("sv-SE"));
    } catch (e: any) {
      setError(e.message || "Simulation failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [zone, period, start, end, annualKwh, fuse, tariffId, loadProfile, batteryEnabled, batteryKwh, batteryMaxKw, batteryEff, solarEnabled, solarPanelCount, solarPanelId, solarOrientation, uploadedLoad]);

  // Auto-run simulation when upload data changes
  useEffect(() => {
    if (uploadedLoad && (period === "month" || period === "year")) {
      runSimulation();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedLoad]);

  const isFullPeriod = period === "month" || period === "year";

  // ─── A/B/C values ──────────────────────────────────────────────────────────

  // A: Rå spot (live from parent, or from sim result)
  const spotA = result
    ? (result.spotCost / result.totalKwh) * 100  // weighted avg in öre
    : spotOreNow ?? null;

  // B: Spot inkl rörliga (per kWh, no fixed/effect)
  const spotB = spotA != null && tariffCfg
    ? calcSpotInklRorligt(spotA, tariffCfg)
    : null;

  // C: Total inkl allt (only from simulation)
  const spotC = result
    ? (result.totalCost / result.totalKwh) * 100
    : null;

  return (
    <div style={{ padding: "12px 0" }}>

      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        marginBottom: 12, paddingBottom: 8,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
          ⚡ Simulera din elkostnad
        </span>
        <span style={{
          fontSize: 8, padding: "2px 6px", borderRadius: 3,
          background: "rgba(59,130,246,0.12)", color: C.blue,
          border: "1px solid rgba(59,130,246,0.25)", fontWeight: 600,
        }}>BETA</span>
        {!isFullPeriod && (
          <span style={{ fontSize: 9, color: C.muted, marginLeft: "auto" }}>
            Välj Månad/År för full simulering
          </span>
        )}
      </div>

      {/* ── Layout: inputs left, results right ── */}
      <div className="sim-layout" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>

        {/* ── Inputs ── */}
        <div className="sim-inputs" style={{
          flex: "0 0 220px", minWidth: 180,
          display: "flex", flexDirection: "column", gap: 10,
        }}>

          {/* Annual kWh */}
          <div>
            <label style={{ fontSize: 9, color: C.muted, display: "block", marginBottom: 3 }}>
              Årsförbrukning (kWh/år)
            </label>
            <input
              type="number"
              value={annualKwh}
              onChange={e => setAnnualKwh(Number(e.target.value) || 0)}
              min={100} max={500000} step={1000}
              style={{
                width: "100%", padding: "6px 8px", fontSize: 13,
                fontFamily: FONT, fontWeight: 600,
                background: C.card2, color: C.text,
                border: `1px solid ${C.border}`, borderRadius: 5,
              }}
            />
          </div>

          {/* Fuse */}
          <div>
            <label style={{ fontSize: 9, color: C.muted, display: "block", marginBottom: 3 }}>
              Säkring
            </label>
            <select
              value={fuse}
              onChange={e => setFuse(e.target.value)}
              style={{
                width: "100%", padding: "6px 8px", fontSize: 12,
                fontFamily: FONT,
                background: C.card2, color: C.text,
                border: `1px solid ${C.border}`, borderRadius: 5,
              }}
            >
              {fuseOptions.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          {/* Tariff */}
          <div>
            <label style={{ fontSize: 9, color: C.muted, display: "block", marginBottom: 3 }}>
              Nätbolag
            </label>
            <select
              value={tariffId}
              onChange={e => setTariffId(e.target.value)}
              style={{
                width: "100%", padding: "6px 8px", fontSize: 12,
                fontFamily: FONT,
                background: C.card2, color: C.text,
                border: `1px solid ${C.border}`, borderRadius: 5,
              }}
            >
              {tariffs.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Förbrukningsprofil */}
          <div>
            <label style={{ fontSize: 9, color: C.muted, display: "block", marginBottom: 3 }}>
              Förbrukningsprofil
            </label>
            <select
              value={loadProfile}
              onChange={e => setLoadProfile(e.target.value as "flat" | "standard" | "heatpump")}
              style={{
                width: "100%", padding: "6px 8px", fontSize: 12,
                fontFamily: FONT,
                background: C.card2, color: C.text,
                border: `1px solid ${C.border}`, borderRadius: 5,
              }}
            >
              <option value="flat">Jämn (lika alla månader)</option>
              <option value="standard">Lägenhet / ej eluppvärmning</option>
              <option value="heatpump">Villa med värmepump ⚡</option>
            </select>
            {loadProfile !== "flat" && !uploadedLoad && (
              <div style={{ fontSize: 7, color: C.spot, marginTop: 2 }}>
                ⚠ Uppskattad säsongsfördelning — ej faktisk mätdata
              </div>
            )}
          </div>

          {/* 📄 Upload förbrukningsdata */}
          <div style={{
            padding: "8px 10px", borderRadius: 6,
            background: uploadedLoad ? "rgba(59,130,246,0.06)" : "rgba(107,114,128,0.04)",
            border: `1px solid ${uploadedLoad ? "rgba(59,130,246,0.2)" : C.border}`,
          }}>
            <div style={{ fontSize: 9, color: uploadedLoad ? C.blue : C.muted, fontWeight: 600, marginBottom: 6 }}>
              📄 Egen förbrukningsdata
            </div>
            {!uploadedLoad ? (
              <>
                <label style={{
                  display: "block", padding: "6px 10px", borderRadius: 4,
                  background: C.card2, border: `1px dashed ${C.border}`,
                  textAlign: "center", cursor: "pointer",
                  fontSize: 9, color: C.muted,
                }}>
                  {uploading ? "Laddar upp…" : "Ladda upp CSV, Excel eller PDF"}
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls,.pdf,.tsv"
                    style={{ display: "none" }}
                    disabled={uploading}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <div style={{ fontSize: 7, color: C.dim, marginTop: 3 }}>
                  Ellevio, Vattenfall Nät, E.ON — timdata eller elräkning
                </div>
              </>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                  <span style={{ fontSize: 9, color: C.blue, fontWeight: 600 }}>✓</span>
                  <span style={{ fontSize: 9, color: C.text, fontWeight: 600 }}>{uploadedLoad.filename}</span>
                </div>
                <div style={{ fontSize: 8, color: C.muted }}>
                  {uploadedLoad.granularity === "hourly"
                    ? `${(uploadedLoad.hourlyCount ?? 0).toLocaleString()} timvärden`
                    : `${uploadedLoad.monthly?.length ?? 0} månader`
                  } · {Math.round(uploadedLoad.totalKwh).toLocaleString()} kWh totalt
                </div>
                {uploadedLoad.monthly && uploadedLoad.monthly.length > 0 && (
                  <div style={{ marginTop: 4, display: "flex", gap: 1, height: 24, alignItems: "flex-end" }}>
                    {uploadedLoad.monthly.map((m, i) => {
                      const max = Math.max(...uploadedLoad.monthly!.map(x => x.kWh));
                      const h = max > 0 ? (m.kWh / max) * 20 : 2;
                      return (
                        <div key={i} title={`${m.month}: ${Math.round(m.kWh)} kWh`}
                          style={{ flex: 1, height: h, background: C.blue, borderRadius: 1, minWidth: 3, opacity: 0.7 }} />
                      );
                    })}
                  </div>
                )}
                {uploadedLoad.warnings.length > 0 && (
                  <div style={{ fontSize: 7, color: C.spot, marginTop: 3 }}>
                    {uploadedLoad.warnings[0]}
                  </div>
                )}
                <button onClick={() => { setUploadedLoad(null); setUploadError(null); }}
                  style={{ marginTop: 4, fontSize: 8, color: C.muted, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                  Ta bort
                </button>
              </div>
            )}
            {uploadError && (
              <div style={{ fontSize: 8, color: C.red, marginTop: 4 }}>
                {uploadError}
              </div>
            )}
          </div>

          {/* ☀️ Solpaneler */}
          <div style={{
            padding: "8px 10px", borderRadius: 6,
            background: solarEnabled ? "rgba(251,191,36,0.06)" : "rgba(107,114,128,0.04)",
            border: `1px solid ${solarEnabled ? "rgba(251,191,36,0.2)" : C.border}`,
          }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={solarEnabled}
                onChange={e => setSolarEnabled(e.target.checked)}
                style={{ accentColor: "#fbbf24" }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: solarEnabled ? "#fbbf24" : C.muted }}>
                ☀️ Solpaneler
              </span>
            </label>

            {solarEnabled && (() => {
              const panel = SOLAR_PANELS.find(p => p.id === solarPanelId) ?? SOLAR_PANELS[0];
              const totalKwp = (panel.watt * solarPanelCount) / 1000;
              const monthlyProfile = SOLAR_MONTHLY_KWH_PER_KWP[solarOrientation];
              const annualKwh = monthlyProfile.reduce((s, m) => s + m, 0) * totalKwp;

              return (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* Panel model */}
                  <div>
                    <div style={{ fontSize: 8, color: C.muted, marginBottom: 2 }}>Panelmodell</div>
                    <select value={solarPanelId}
                      onChange={e => setSolarPanelId(e.target.value)}
                      style={{ width: "100%", padding: "4px 6px", fontSize: 10, fontFamily: FONT,
                        background: C.card2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text }}>
                      {SOLAR_PANELS.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Panel count */}
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 8, color: C.muted, marginBottom: 2 }}>Antal paneler</div>
                      <input type="number" value={solarPanelCount} min={1} max={200}
                        onChange={e => setSolarPanelCount(Math.max(1, +e.target.value || 1))}
                        style={{ width: "100%", padding: "4px 6px", fontSize: 11, fontFamily: FONT,
                          background: C.card2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text }} />
                    </div>
                    <div style={{ fontSize: 10, color: "#fbbf24", fontWeight: 700, fontFamily: FONT, paddingBottom: 4 }}>
                      {totalKwp.toFixed(1)} kWp
                    </div>
                  </div>

                  {/* Orientation */}
                  <div>
                    <div style={{ fontSize: 8, color: C.muted, marginBottom: 2 }}>Takriktning</div>
                    <select value={solarOrientation}
                      onChange={e => setSolarOrientation(e.target.value as SolarOrientation)}
                      style={{ width: "100%", padding: "4px 6px", fontSize: 10, fontFamily: FONT,
                        background: C.card2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text }}>
                      {(Object.keys(SOLAR_ORIENTATION_LABELS) as SolarOrientation[]).map(k => (
                        <option key={k} value={k}>{SOLAR_ORIENTATION_LABELS[k]}</option>
                      ))}
                    </select>
                  </div>

                  {/* Installation cost */}
                  <div>
                    <div style={{ fontSize: 8, color: C.muted, marginBottom: 2 }}>Anläggningskostnad (kr, inkl installation)</div>
                    <input type="number" value={solarPriceKr} min={0} step={10000}
                      onChange={e => setSolarPriceKr(+e.target.value || 0)}
                      style={{ width: "100%", padding: "4px 6px", fontSize: 11, fontFamily: FONT,
                        background: C.card2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text }} />
                    {solarPriceKr > 0 && (
                      <div style={{ fontSize: 7, color: C.dim, marginTop: 2 }}>
                        Grönt avdrag (50%): {Math.round(solarPriceKr * 0.5).toLocaleString()} kr → Nettokostnad: {Math.round(solarPriceKr * 0.5).toLocaleString()} kr
                      </div>
                    )}
                  </div>

                  {/* Summary */}
                  <div style={{
                    padding: "6px 8px", borderRadius: 4,
                    background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.15)",
                    marginTop: 2,
                  }}>
                    <div style={{ fontSize: 8, color: "#fbbf24", marginBottom: 4 }}>Beräknad årsproduktion</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#fbbf24", fontFamily: FONT }}>
                        {Math.round(annualKwh).toLocaleString()}
                        <span style={{ fontSize: 9, color: "#fbbf2488", marginLeft: 2 }}>kWh/år</span>
                      </span>
                      <span style={{ fontSize: 9, color: C.muted }}>
                        {(annualKwh / totalKwp).toFixed(0)} kWh/kWp
                      </span>
                    </div>
                    {/* Monthly production mini bar chart */}
                    <div style={{ marginTop: 4, display: "flex", gap: 1, height: 20, alignItems: "flex-end" }}>
                      {monthlyProfile.map((m, i) => {
                        const max = Math.max(...monthlyProfile);
                        const h = max > 0 ? (m / max) * 18 : 2;
                        const months = ["J","F","M","A","M","J","J","A","S","O","N","D"];
                        return (
                          <div key={i} title={`${months[i]}: ${Math.round(m * totalKwp)} kWh`}
                            style={{ flex: 1, height: h, background: "#fbbf24", borderRadius: 1, minWidth: 3, opacity: 0.7 }} />
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                      {["J","F","M","A","M","J","J","A","S","O","N","D"].map((m, i) => (
                        <span key={i} style={{ flex: 1, fontSize: 6, color: C.dim, textAlign: "center" }}>{m}</span>
                      ))}
                    </div>
                  </div>

                  <div style={{ fontSize: 7, color: C.dim }}>
                    Schablon baserad på PVGIS · {SOLAR_ORIENTATION_LABELS[solarOrientation]} · Stockholm
                  </div>
                </div>
              );
            })()}
          </div>

          {/* 🔋 Batteri */}
          <div style={{
            padding: "8px 10px", borderRadius: 6,
            background: batteryEnabled ? "rgba(34,197,94,0.06)" : "rgba(107,114,128,0.04)",
            border: `1px solid ${batteryEnabled ? "rgba(34,197,94,0.2)" : C.border}`,
          }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginBottom: batteryEnabled ? 8 : 0 }}>
              <input
                type="checkbox"
                checked={batteryEnabled}
                onChange={e => setBatteryEnabled(e.target.checked)}
                style={{ accentColor: C.green }}
              />
              <span style={{ fontSize: 10, color: batteryEnabled ? C.green : C.muted, fontWeight: 600 }}>
                🔋 Batteri
              </span>
              {!isFullPeriod && batteryEnabled && (
                <span style={{ fontSize: 7, color: C.spot }}>Kräver Månad/År</span>
              )}
            </label>
            {batteryEnabled && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {/* Preset dropdown */}
                <div>
                  <label style={{ fontSize: 8, color: C.muted, display: "block", marginBottom: 2 }}>Batterimodell</label>
                  <select value={batteryPreset} onChange={e => applyPreset(e.target.value)}
                    style={{ width: "100%", padding: "4px 6px", fontSize: 10, fontFamily: FONT,
                      background: C.card2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4 }}>
                    {BATTERY_PRESETS.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.id !== "custom" ? ` (${p.kwh} kWh)` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 8, color: C.muted, display: "block", marginBottom: 2 }}>Kapacitet (kWh)</label>
                  <input type="number" value={batteryKwh}
                    onChange={e => { setBatteryKwh(Number(e.target.value) || 0); setBatteryPreset("custom"); }}
                    min={1} max={200} step={1}
                    style={{ width: "100%", padding: "4px 6px", fontSize: 11, fontFamily: FONT, fontWeight: 600,
                      background: C.card2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4 }} />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 8, color: C.muted, display: "block", marginBottom: 2 }}>Max effekt (kW)</label>
                    <input type="number" value={batteryMaxKw}
                      onChange={e => { setBatteryMaxKw(Number(e.target.value) || 0); setBatteryPreset("custom"); }}
                      min={0.5} max={50} step={0.5}
                      style={{ width: "100%", padding: "4px 6px", fontSize: 11, fontFamily: FONT, fontWeight: 600,
                        background: C.card2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 8, color: C.muted, display: "block", marginBottom: 2 }}>Effektivitet</label>
                    <select value={batteryEff} onChange={e => setBatteryEff(Number(e.target.value))}
                      style={{ width: "100%", padding: "4px 6px", fontSize: 11, fontFamily: FONT,
                        background: C.card2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4 }}>
                      <option value={0.85}>85%</option>
                      <option value={0.90}>90%</option>
                      <option value={0.95}>95%</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 8, color: C.muted, display: "block", marginBottom: 2 }}>Batteripris (kr, inkl installation)</label>
                  <input type="number" value={batteryCostKr} onChange={e => setBatteryCostKr(Number(e.target.value) || 0)}
                    min={5000} max={1000000} step={5000}
                    style={{ width: "100%", padding: "4px 6px", fontSize: 11, fontFamily: FONT, fontWeight: 600,
                      background: C.card2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4 }} />
                </div>
                <div>
                  <label style={{ fontSize: 8, color: C.muted, display: "block", marginBottom: 2 }}>Grönt avdrag (kräver solceller)</label>
                  <select value={batteryDeductPct} onChange={e => setBatteryDeductPct(Number(e.target.value))}
                    style={{ width: "100%", padding: "4px 6px", fontSize: 10, fontFamily: FONT,
                      background: C.card2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4 }}>
                    <option value={0}>Inget avdrag</option>
                    <option value={50}>50% — 1 person (max 50 000 kr)</option>
                    <option value={100}>50% — 2 personer (max 100 000 kr)</option>
                  </select>
                  {batteryDeductPct > 0 && (() => {
                    const maxDeduct = batteryDeductPct === 100 ? 100000 : 50000;
                    const deduct = Math.min(Math.round(batteryCostKr * 0.50), maxDeduct);
                    return (
                      <div style={{ fontSize: 8, color: C.green, marginTop: 2 }}>
                        Avdrag: {deduct.toLocaleString("sv-SE")} kr
                        → Nettokostnad: {(batteryCostKr - deduct).toLocaleString("sv-SE")} kr
                        <div style={{ fontSize: 7, color: C.dim, marginTop: 1 }}>
                          Grön teknik 50% på batteri · max {(maxDeduct/1000).toFixed(0)}k kr/år · kräver solceller
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Run button */}
          <button
            onClick={runSimulation}
            disabled={loading}
            style={{
              padding: "8px 16px", fontSize: 12, fontWeight: 700,
              fontFamily: FONT,
              background: loading ? C.muted : C.blue,
              color: "#fff", border: "none", borderRadius: 6,
              cursor: loading ? "wait" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {loading ? "Beräknar…" : "Kör simulering"}
          </button>

          {lastRun && (
            <div style={{ fontSize: 8, color: C.dim }}>
              Senast beräknad: {lastRun}
            </div>
          )}
          {error && (
            <div style={{ fontSize: 10, color: C.red, padding: "4px 0" }}>{error}</div>
          )}
        </div>

        {/* ── Results ── */}
        {result ? (
          <div className="sim-results" style={{ flex: "1 1 300px", minWidth: 260 }}>

            {/* ── A / B / C sida vid sida ── */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>

              {/* A: Rå spot */}
              <div style={{
                flex: "1 1 100px", padding: "10px 12px",
                background: C.card2, border: `1px solid ${C.border}`, borderRadius: 8,
              }}>
                <div style={{ fontSize: 8, color: C.muted, marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 }}>
                  A · Rå spot
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.spot, fontFamily: FONT }}>
                  {spotA != null ? spotA.toFixed(1) : "–"}
                  <span style={{ fontSize: 9, color: C.muted, marginLeft: 3 }}>öre/kWh</span>
                </div>
                <div style={{ fontSize: 8, color: C.dim }}>
                  {result ? "viktad mot förbrukning" : "marknadspris"}
                </div>
              </div>

              {/* B: Spot inkl rörliga */}
              <div style={{
                flex: "1 1 100px", padding: "10px 12px",
                background: "rgba(59,130,246,0.05)",
                border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8,
              }}>
                <div style={{ fontSize: 8, color: C.blue, marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 }}>
                  B · Inkl rörliga
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.blue, fontFamily: FONT }}>
                  {spotB != null ? spotB.toFixed(1) : "–"}
                  <span style={{ fontSize: 9, color: C.muted, marginLeft: 3 }}>öre/kWh</span>
                </div>
                <div style={{ fontSize: 8, color: C.dim }}>
                  spot + nät {tariffCfg?.energyRateOrePerKwh ?? "?"} + skatt {tariffCfg?.taxOrePerKwh ?? "?"} + moms
                </div>
              </div>

              {/* C: Total inkl allt */}
              <div style={{
                flex: "1 1 100px", padding: "10px 12px",
                background: "rgba(34,197,94,0.05)",
                border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8,
              }}>
                <div style={{ fontSize: 8, color: C.green, marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 }}>
                  C · Total inkl allt
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.green, fontFamily: FONT }}>
                  {spotC != null ? spotC.toFixed(1) : "–"}
                  <span style={{ fontSize: 9, color: C.muted, marginLeft: 3 }}>öre/kWh</span>
                </div>
                <div style={{ fontSize: 8, color: C.dim }}>
                  {isFullPeriod ? "inkl effekt + fast + moms" : "inkl moms (ej effekt/fast)"}
                </div>
              </div>
            </div>

            {/* ── Totaler row ── */}
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {/* Total cost */}
              <div style={{
                flex: "1 1 130px", padding: "10px 12px",
                background: "rgba(59,130,246,0.06)",
                border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8,
              }}>
                <div style={{ fontSize: 9, color: C.blue, marginBottom: 3 }}>Total kostnad</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.blue, fontFamily: FONT }}>
                  {Math.round(result.totalCost).toLocaleString("sv-SE")}
                  <span style={{ fontSize: 11, color: C.muted, marginLeft: 4 }}>kr</span>
                </div>
                <div style={{ fontSize: 9, color: C.muted }}>
                  {period === "day" ? "denna dag" : period === "week" ? "denna vecka" : period === "month" ? "denna månad" : "detta år"}
                </div>
              </div>

              {/* Peak */}
              <div style={{
                flex: "1 1 100px", padding: "10px 12px",
                background: isFullPeriod && result.effectFee > 0
                  ? "rgba(239,68,68,0.06)" : C.card2,
                border: `1px solid ${isFullPeriod && result.effectFee > 0
                  ? "rgba(239,68,68,0.2)" : C.border}`,
                borderRadius: 8,
              }}>
                <div style={{ fontSize: 9, color: isFullPeriod ? C.red : C.muted, marginBottom: 3 }}>
                  Effekttopp
                </div>
                <div style={{
                  fontSize: 24, fontWeight: 800, fontFamily: FONT,
                  color: isFullPeriod ? C.red : C.text,
                }}>
                  {result.peakKw.toFixed(1)}
                  <span style={{ fontSize: 11, color: C.muted, marginLeft: 4 }}>kW</span>
                </div>
                <div style={{ fontSize: 9, color: C.muted }}>
                  {isFullPeriod
                    ? `${Math.round(result.effectFee)} kr effektavgift`
                    : "Debiteras ej (månadsbaserat)"}
                </div>
              </div>

              {/* Total kWh */}
              <div style={{
                flex: "1 1 80px", padding: "10px 12px",
                background: C.card2, border: `1px solid ${C.border}`, borderRadius: 8,
              }}>
                <div style={{ fontSize: 9, color: C.muted, marginBottom: 3 }}>Förbrukning</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.text, fontFamily: FONT }}>
                  {Math.round(result.totalKwh).toLocaleString("sv-SE")}
                  <span style={{ fontSize: 11, color: C.muted, marginLeft: 4 }}>kWh</span>
                </div>
              </div>
            </div>

            {/* ── Solar result ── */}
            {result.solar && (() => {
              const s = result.solar!;
              return (
                <div style={{
                  padding: "10px 12px", borderRadius: 8, marginTop: 10,
                  background: "rgba(251,191,36,0.04)",
                  border: "1px solid rgba(251,191,36,0.15)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24" }}>☀️ Solproduktion</span>
                    <span style={{ fontSize: 9, color: C.muted }}>{s.kWp} kWp · {s.orientation.replace("_", " ")}</span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <div style={{ padding: "6px 8px", borderRadius: 6, background: C.card2 }}>
                      <div style={{ fontSize: 7, color: C.muted }}>Produktion</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#fbbf24", fontFamily: FONT }}>
                        {Math.round(s.totalProductionKwh).toLocaleString("sv-SE")}
                        <span style={{ fontSize: 8, color: C.muted, marginLeft: 2 }}>kWh</span>
                      </div>
                    </div>
                    <div style={{ padding: "6px 8px", borderRadius: 6, background: C.card2 }}>
                      <div style={{ fontSize: 7, color: C.muted }}>Egenförbrukning</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.green, fontFamily: FONT }}>
                        {Math.round(s.selfConsumptionKwh).toLocaleString("sv-SE")}
                        <span style={{ fontSize: 8, color: C.muted, marginLeft: 2 }}>kWh</span>
                      </div>
                      <div style={{ fontSize: 7, color: C.dim }}>{s.selfConsumptionRatio}% av produktion</div>
                    </div>
                    <div style={{ padding: "6px 8px", borderRadius: 6, background: C.card2 }}>
                      <div style={{ fontSize: 7, color: C.muted }}>Sålt till nät</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.blue, fontFamily: FONT }}>
                        {Math.round(s.gridExportKwh).toLocaleString("sv-SE")}
                        <span style={{ fontSize: 8, color: C.muted, marginLeft: 2 }}>kWh</span>
                      </div>
                      <div style={{ fontSize: 7, color: C.dim }}>
                        Intäkt: {Math.round(s.exportRevenueSek).toLocaleString("sv-SE")} kr
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 7, color: C.dim, marginTop: 6 }}>
                    Nätuttag med sol: {Math.round(s.gridImportKwh).toLocaleString("sv-SE")} kWh
                    (minskade med {Math.round(s.selfConsumptionKwh).toLocaleString("sv-SE")} kWh)
                  </div>
                </div>
              );
            })()}

            {/* ── Battery result ── */}
            {result.battery && result.battery.status === "optimal" && (() => {
              const b = result.battery!;
              const savings = b.costWithoutBattery - result.totalCost;
              const monthlySavings = period === "year" ? savings / 12 : savings;
              const annualSavings = period === "year" ? savings : savings * 12;
              const maxDeduct = batteryDeductPct === 100 ? 100000 : batteryDeductPct === 50 ? 50000 : 0;
              const deduction = batteryDeductPct > 0 ? Math.min(Math.round(batteryCostKr * 0.50), maxDeduct) : 0;
              const netCost = batteryCostKr - deduction;
              const paybackYears = netCost > 0 && annualSavings > 0 ? netCost / annualSavings : null;
              return (
                <div style={{
                  padding: "10px 12px", marginBottom: 10, borderRadius: 8,
                  background: "rgba(34,197,94,0.06)",
                  border: "1px solid rgba(34,197,94,0.2)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.green }}>🔋 Batterioptimering</span>
                    <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3,
                      background: "rgba(34,197,94,0.15)", color: C.green, fontWeight: 600 }}>
                      LP · {b.solveTimeMs}ms
                    </span>
                  </div>

                  {/* ── Comparison: without vs with ── */}
                  {(() => {
                    const avgWithout = result.totalKwh > 0 ? (b.costWithoutBattery / result.totalKwh * 100) : 0;
                    const avgWith = result.totalKwh > 0 ? (result.totalCost / result.totalKwh * 100) : 0;
                    const avgDiff = avgWithout - avgWith;
                    return (
                      <div style={{
                        display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap",
                        padding: "8px 10px", background: C.card2,
                        border: `1px solid ${C.border}`, borderRadius: 6,
                      }}>
                        <div style={{ flex: "1 1 90px" }}>
                          <div style={{ fontSize: 8, color: C.muted, marginBottom: 2 }}>Utan batteri</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: C.red, fontFamily: FONT, opacity: 0.7 }}>
                            {Math.round(b.costWithoutBattery).toLocaleString("sv-SE")}
                            <span style={{ fontSize: 9, color: C.muted, marginLeft: 3 }}>kr</span>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.red, fontFamily: FONT, opacity: 0.6, marginTop: 2 }}>
                            {avgWithout.toFixed(1)}
                            <span style={{ fontSize: 8, color: C.dim, marginLeft: 2 }}>öre/kWh</span>
                          </div>
                        </div>
                        <div style={{ flex: "0 0 20px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: C.muted }}>→</div>
                        <div style={{ flex: "1 1 90px" }}>
                          <div style={{ fontSize: 8, color: C.muted, marginBottom: 2 }}>Med batteri</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: C.green, fontFamily: FONT }}>
                            {Math.round(result.totalCost).toLocaleString("sv-SE")}
                            <span style={{ fontSize: 9, color: C.muted, marginLeft: 3 }}>kr</span>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.green, fontFamily: FONT, marginTop: 2 }}>
                            {avgWith.toFixed(1)}
                            <span style={{ fontSize: 8, color: C.dim, marginLeft: 2 }}>öre/kWh</span>
                          </div>
                        </div>
                        <div style={{ flex: "1 1 90px" }}>
                          <div style={{ fontSize: 8, color: C.green, marginBottom: 2 }}>Besparing</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: C.green, fontFamily: FONT }}>
                            {Math.round(savings).toLocaleString("sv-SE")}
                            <span style={{ fontSize: 9, color: C.muted, marginLeft: 3 }}>kr</span>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.green, fontFamily: FONT, marginTop: 2 }}>
                            −{avgDiff.toFixed(1)}
                            <span style={{ fontSize: 8, color: C.dim, marginLeft: 2 }}>öre/kWh</span>
                          </div>
                          <div style={{ fontSize: 8, color: C.dim }}>
                            {((savings / b.costWithoutBattery) * 100).toFixed(1)}% av totalkostnad
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {/* Peak before → after */}
                    <div style={{ flex: "1 1 100px", padding: "8px 10px", background: C.card2,
                      border: `1px solid ${C.border}`, borderRadius: 6 }}>
                      <div style={{ fontSize: 8, color: C.muted, marginBottom: 3 }}>Effekttopp</div>
                      <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700 }}>
                        <span style={{ color: C.red, textDecoration: "line-through", opacity: 0.6 }}>
                          {b.peakBefore.toFixed(1)}
                        </span>
                        <span style={{ color: C.muted, margin: "0 4px" }}>→</span>
                        <span style={{ color: C.green }}>
                          {b.peakAfter.toFixed(1)}
                        </span>
                        <span style={{ fontSize: 9, color: C.muted, marginLeft: 3 }}>kW</span>
                      </div>
                      <div style={{ fontSize: 8, color: C.green, fontWeight: 600, marginTop: 2 }}>
                        ↓ {b.peakReductionKw.toFixed(1)} kW ({((b.peakReductionKw / b.peakBefore) * 100).toFixed(0)}%)
                      </div>
                    </div>
                    {/* ROI */}
                    <div style={{ flex: "1 1 100px", padding: "8px 10px", background: C.card2,
                      border: `1px solid ${C.border}`, borderRadius: 6 }}>
                      <div style={{ fontSize: 8, color: C.muted, marginBottom: 3 }}>Återbetalningstid (ROI)</div>
                      {paybackYears != null ? (
                        <>
                          <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700,
                            color: paybackYears < 10 ? C.green : paybackYears < 15 ? C.spot : C.red }}>
                            {paybackYears.toFixed(1)}
                            <span style={{ fontSize: 9, color: C.muted, marginLeft: 3 }}>år</span>
                          </div>
                          <div style={{ fontSize: 8, color: C.dim, marginTop: 2 }}>
                            {netCost.toLocaleString("sv-SE")} kr{deduction > 0 ? " (efter avdrag)" : ""} / {Math.round(annualSavings).toLocaleString("sv-SE")} kr/år
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 10, color: C.dim }}>Ange batteripris</div>
                      )}
                    </div>
                    {/* LP stats */}
                    <div style={{ flex: "1 1 80px", padding: "8px 10px", background: C.card2,
                      border: `1px solid ${C.border}`, borderRadius: 6 }}>
                      <div style={{ fontSize: 8, color: C.muted, marginBottom: 3 }}>LP-modell</div>
                      <div style={{ fontSize: 10, fontFamily: FONT, color: C.text, lineHeight: 1.5 }}>
                        {b.numVars.toLocaleString()} vars<br />
                        {b.numConstraints.toLocaleString()} constraints<br />
                        {b.capacityKwh} kWh / {b.maxKw} kW
                      </div>
                    </div>
                  </div>

                  {/* ── SoC Chart ── */}
                  {b.soc && b.soc.length > 2 && (() => {
                    const W = 600, H = 100;
                    const P = { t: 8, r: 8, b: 16, l: 32 };
                    const pw = W - P.l - P.r, ph = H - P.t - P.b;
                    const len = b.soc.length;
                    const cap = b.capacityKwh;
                    const xp = (i: number) => P.l + (i / Math.max(len - 1, 1)) * pw;
                    const yp = (v: number) => P.t + ph - (v / (cap || 1)) * ph;

                    const socPath = b.soc.map((v, i) => `${i === 0 ? "M" : "L"} ${xp(i).toFixed(1)} ${yp(v).toFixed(1)}`).join(" ");

                    // Charge/discharge bars
                    const maxCD = Math.max(...b.charge, ...b.discharge, 0.01);
                    const barH = 20;

                    return (
                      <div>
                        <div style={{ fontSize: 8, color: C.muted, marginBottom: 4 }}>Batteristatus (SoC) — grön=laddning, röd=urladdning</div>
                        <svg viewBox={`0 0 ${W} ${H + barH + 4}`} style={{ width: "100%", height: "auto", display: "block" }}>
                          {/* SoC area */}
                          <path d={socPath + ` L ${xp(len-1).toFixed(1)} ${P.t+ph} L ${P.l} ${P.t+ph} Z`}
                            fill="rgba(34,197,94,0.15)" />
                          <path d={socPath} fill="none" stroke={C.green} strokeWidth={1.5} />
                          {/* Y axis labels */}
                          <text x={P.l-3} y={P.t+4} textAnchor="end" fontSize={7} fill={C.dim} fontFamily={FONT}>{cap}</text>
                          <text x={P.l-3} y={P.t+ph+3} textAnchor="end" fontSize={7} fill={C.dim} fontFamily={FONT}>0</text>
                          <text x={P.l-3} y={P.t+ph/2+3} textAnchor="end" fontSize={7} fill={C.dim} fontFamily={FONT}>{(cap/2).toFixed(0)}</text>
                          <line x1={P.l} x2={W-P.r} y1={P.t+ph} y2={P.t+ph} stroke={C.border} strokeWidth={0.5} />
                          {/* Charge/discharge bars */}
                          {b.charge.map((c, i) => {
                            const d = b.discharge[i] ?? 0;
                            if (c < 0.001 && d < 0.001) return null;
                            const bx = xp(i);
                            const bw = Math.max(pw / len, 1);
                            if (c > 0.001) return <rect key={`c${i}`} x={bx} y={H+2} width={bw} height={(c/maxCD)*barH} fill="rgba(34,197,94,0.5)" />;
                            return <rect key={`d${i}`} x={bx} y={H+2} width={bw} height={(d/maxCD)*barH} fill="rgba(239,68,68,0.5)" />;
                          })}
                          {/* X labels */}
                          {b.timestamps && [0, Math.floor(len/4), Math.floor(len/2), Math.floor(3*len/4), len-1].map(i => {
                            if (i >= b.timestamps.length) return null;
                            const d = new Date(b.timestamps[i]);
                            const lbl = `${d.getUTCDate()}/${d.getUTCMonth()+1}`;
                            return <text key={i} x={xp(i)} y={H+barH+12} textAnchor="middle" fontSize={7} fill={C.dim} fontFamily={FONT}>{lbl}</text>;
                          })}
                        </svg>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* Battery error */}
            {result.battery && result.battery.status !== "optimal" && (
              <div style={{
                padding: "8px 12px", marginBottom: 10, borderRadius: 6,
                background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)",
                fontSize: 10, color: C.red,
              }}>
                🔋 Batterioptimering: {result.battery.status} {result.battery.error && `— ${result.battery.error}`}
              </div>
            )}

            {/* ── Breakdown ── */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
              gap: 6, marginBottom: 10,
            }}>
              {[
                { label: "Spot", value: result.spotCost, color: C.spot },
                { label: "Nät (rörlig)", value: result.energyFee, color: C.text },
                { label: "Nät (fast)", value: result.fixedFee, color: C.text },
                { label: "Effektavgift", value: result.effectFee, color: isFullPeriod ? C.red : C.dim },
                { label: "Energiskatt", value: result.tax, color: C.text },
                { label: "Moms", value: result.vat, color: C.text },
              ].map(item => (
                <div key={item.label} style={{
                  padding: "6px 8px", background: C.card2,
                  border: `1px solid ${C.border}`, borderRadius: 6,
                }}>
                  <div style={{ fontSize: 8, color: C.muted, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: FONT, color: item.color }}>
                    {Math.round(item.value).toLocaleString("sv-SE")}
                    <span style={{ fontSize: 8, color: C.dim, marginLeft: 2 }}>kr</span>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Meta row ── */}
            <div style={{
              fontSize: 9, color: C.muted, marginBottom: 8,
              display: "flex", gap: 12, flexWrap: "wrap",
            }}>
              <span>Spotpunkter: <strong style={{ color: C.text }}>{result.meta.spotPoints}</strong></span>
              <span>Resolution: <strong style={{ color: C.text }}>{result.meta.resolution}</strong></span>
              <span>EUR/SEK: <strong style={{ color: C.text }}>{result.meta.eurSek}</strong></span>
            </div>

            {/* ── Monthly peaks (year only) ── */}
            {period === "year" && result.monthlyPeaks.length > 1 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>
                  Effekttoppar per månad (kW)
                </div>
                <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 50 }}>
                  {result.monthlyPeaks
                    .sort((a, b) => a.month.localeCompare(b.month))
                    .map(mp => {
                      const maxP = Math.max(...result.monthlyPeaks.map(m => m.peakKw));
                      const h = maxP > 0 ? (mp.peakKw / maxP) * 40 + 6 : 6;
                      const monthNum = parseInt(mp.month.split("-")[1]);
                      const labels = ["", "J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
                      return (
                        <div key={mp.month} style={{
                          flex: 1, display: "flex", flexDirection: "column",
                          alignItems: "center", gap: 2,
                        }}>
                          <div style={{
                            width: "100%", height: h,
                            background: mp.peakKw > 5 ? "rgba(239,68,68,0.5)" :
                              mp.peakKw > 3 ? "rgba(245,158,11,0.5)" : "rgba(34,197,94,0.4)",
                            borderRadius: 2,
                          }} title={`${mp.month}: ${mp.peakKw.toFixed(2)} kW`} />
                          <div style={{ fontSize: 7, color: C.dim }}>{labels[monthNum]}</div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* ── Tariff warning ── */}
            {!result.meta.tariffVerified && (
              <div style={{
                fontSize: 8, color: C.spot, padding: "4px 8px",
                background: "rgba(245,158,11,0.06)",
                border: "1px solid rgba(245,158,11,0.15)",
                borderRadius: 4, marginBottom: 8,
              }}>
                ⚠ Tariffvärden ej verifierade mot prisblad — beräkningen är indikativ.
              </div>
            )}

            {/* ── Så räknar vi ── */}
            <button
              onClick={() => setShowMath(v => !v)}
              style={{
                background: "none", border: "none",
                color: C.muted, fontSize: 9, cursor: "pointer",
                fontFamily: FONT, padding: "4px 0",
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <span style={{
                transform: showMath ? "rotate(180deg)" : "none",
                transition: "transform 0.2s", display: "inline-block",
              }}>▾</span>
              {showMath ? "Dölj beräkning" : "Så räknar vi"}
            </button>

            {showMath && result.meta && (
              <div style={{
                marginTop: 6, padding: "8px 10px",
                background: C.card2, border: `1px solid ${C.border}`,
                borderRadius: 6, fontSize: 9, color: C.muted,
                fontFamily: FONT, lineHeight: 1.6,
              }}>
                <div><strong style={{ color: C.text }}>Zon:</strong> {result.meta.zone}</div>
                <div><strong style={{ color: C.text }}>Period:</strong> {result.meta.start} → {result.meta.end} ({result.meta.period})</div>
                <div><strong style={{ color: C.text }}>Årsförbrukning:</strong> {result.meta.annualKwh.toLocaleString("sv-SE")} kWh</div>
                <div><strong style={{ color: C.text }}>Säkring:</strong> {result.meta.fuse}</div>
                <div><strong style={{ color: C.text }}>Tariff:</strong> {result.meta.tariff} {result.meta.tariffVerified ? "✓" : "(ej verifierad)"}</div>
                <div><strong style={{ color: C.text }}>Resolution:</strong> {result.meta.resolution}</div>
                <div><strong style={{ color: C.text }}>EUR/SEK:</strong> {result.meta.eurSek}</div>

                <div style={{ marginTop: 6, borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
                  <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>Formler:</div>
                  <div>A = viktad spot (spotCost / totalKwh × 100)</div>
                  <div>B = (A + nät {tariffCfg?.energyRateOrePerKwh} + skatt {tariffCfg?.taxOrePerKwh}) × {tariffCfg?.vatMultiplier}</div>
                  <div>C = totalCost / totalKwh × 100</div>
                </div>

                {result.monthlyPeaks.length > 0 && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
                    <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>Effekttoppar:</div>
                    {result.monthlyPeaks
                      .sort((a, b) => a.month.localeCompare(b.month))
                      .map(mp => (
                        <div key={mp.month}>
                          {mp.month}: top3 avg = {mp.peakKw.toFixed(2)} kW
                          → {isFullPeriod ? `${(mp.peakKw * (tariffCfg?.effectRateKrPerKw ?? 75)).toFixed(0)} kr` : "(ej debiterad)"}
                        </div>
                      ))}
                  </div>
                )}

                <div style={{ marginTop: 6, borderTop: `1px solid ${C.border}`, paddingTop: 6, color: C.dim }}>
                  Beräkning: spot×load + nätavgift + energiskatt + effektavgift + fast + moms 25%
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── Empty state ── */
          <div className="sim-results" style={{
            flex: "1 1 300px", minWidth: 260,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "30px 20px", gap: 10,
            border: `1px dashed ${C.border}`, borderRadius: 8,
          }}>
            {/* Show A/B even before simulation if we have live spot */}
            {spotOreNow != null && tariffCfg ? (
              <div style={{ width: "100%" }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                  <div style={{
                    flex: "1 1 100px", padding: "10px 12px",
                    background: C.card2, border: `1px solid ${C.border}`, borderRadius: 8,
                  }}>
                    <div style={{ fontSize: 8, color: C.muted, marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 }}>
                      A · Rå spot nu
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: C.spot, fontFamily: FONT }}>
                      {spotOreNow.toFixed(1)}
                      <span style={{ fontSize: 9, color: C.muted, marginLeft: 3 }}>öre/kWh</span>
                    </div>
                  </div>
                  <div style={{
                    flex: "1 1 100px", padding: "10px 12px",
                    background: "rgba(59,130,246,0.05)",
                    border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8,
                  }}>
                    <div style={{ fontSize: 8, color: C.blue, marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 }}>
                      B · Inkl rörliga nu
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: C.blue, fontFamily: FONT }}>
                      {calcSpotInklRorligt(spotOreNow, tariffCfg).toFixed(1)}
                      <span style={{ fontSize: 9, color: C.muted, marginLeft: 3 }}>öre/kWh</span>
                    </div>
                    <div style={{ fontSize: 8, color: C.dim }}>
                      spot + nät {tariffCfg.energyRateOrePerKwh} + skatt {tariffCfg.taxOrePerKwh} + moms
                    </div>
                  </div>
                  <div style={{
                    flex: "1 1 100px", padding: "10px 12px",
                    border: `1px dashed ${C.border}`, borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <div style={{ fontSize: 9, color: C.dim, textAlign: "center" }}>
                      C · Kör simulering<br />för total inkl allt
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: C.dim, fontSize: 12 }}>
                Tryck "Kör simulering" för att beräkna din elkostnad
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
