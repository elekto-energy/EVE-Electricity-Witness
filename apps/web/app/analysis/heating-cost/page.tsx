"use client";

import { useState, useEffect } from "react";

interface ScenarioResult {
  scenario_id: string;
  scenario_label: string;
  is_dominant: boolean;
  kwh_consumed: number | null;
  cost_eur: number | null;
  cost_sek: number | null;
  note: string | null;
}

interface HeatingMix {
  heat_pump_pct: number;
  electric_pct: number;
  gas_pct: number;
  oil_pct: number;
  district_heating_pct: number;
  other_pct: number;
  dominant: string;
  source: string;
}

interface CountryResult {
  code: string;
  name: string;
  name_en: string;
  flag: string;
  hdd: number;
  season_kwh_heat_demand: number;
  electricity_eur_kwh: number;
  gas_eur_kwh: number | null;
  heating_mix: HeatingMix;
  dominant_scenario: string;
  electricity_price_note: string | null;
  dominant_cost_eur: number | null;
  dominant_cost_sek: number | null;
  scenarios: ScenarioResult[];
}

interface ApiResponse {
  meta: {
    title: string;
    description: string;
    model_version: string;
    period: string;
    purpose: string;
    methodology: Record<string, any>;
    regulatory_basis: {
      authority: string;
      regulation: string;
      effective_date: string;
      minimum_operative_temperature_c: number;
      sensitive_groups_minimum_c: number;
      comfort_range_c: string;
      source_url: string;
    };
    sek_per_eur: number;
  };
  countries: CountryResult[];
}

type ViewMode = "dominant" | "direct_electric" | "heat_pump" | "gas_boiler";
type Currency = "SEK" | "EUR";

const SCENARIO_COLORS: Record<string, string> = {
  direct_electric: "#ef4444",
  heat_pump: "#10b981",
  gas_boiler: "#f59e0b",
};

const SCENARIO_ICONS: Record<string, string> = {
  direct_electric: "🔌",
  heat_pump: "♨️",
  gas_boiler: "🔥",
};

const SCENARIO_LABELS: Record<string, string> = {
  direct_electric: "Direkt el",
  heat_pump: "Värmepump",
  gas_boiler: "Gas",
};

function formatCost(val: number | null, currency: Currency): string {
  if (val === null) return "—";
  if (currency === "SEK") return `${val.toLocaleString("sv-SE")} kr`;
  return `€${val.toLocaleString("de-DE")}`;
}

function getCost(s: ScenarioResult, currency: Currency): number | null {
  return currency === "SEK" ? s.cost_sek : s.cost_eur;
}

function getCountryCost(c: CountryResult, mode: ViewMode, currency: Currency): number | null {
  if (mode === "dominant") {
    return currency === "SEK" ? c.dominant_cost_sek : c.dominant_cost_eur;
  }
  const s = c.scenarios.find((s) => s.scenario_id === mode);
  return s ? getCost(s, currency) : null;
}

function getCountryScenarioId(c: CountryResult, mode: ViewMode): string {
  return mode === "dominant" ? c.dominant_scenario : mode;
}

function CostBar({ cost, maxCost, color }: { cost: number | null; maxCost: number; color: string }) {
  if (cost === null || maxCost === 0) return null;
  const pct = Math.max(2, (cost / maxCost) * 100);
  return (
    <div style={{ height: "6px", borderRadius: "3px", background: "var(--border-color)", width: "100%", marginTop: "3px" }}>
      <div style={{ height: "100%", borderRadius: "3px", width: `${pct}%`, background: color, transition: "width 0.4s ease" }} />
    </div>
  );
}

function MixBar({ mix }: { mix: HeatingMix }) {
  const segments = [
    { pct: mix.gas_pct, color: "#f59e0b", label: "Gas" },
    { pct: mix.electric_pct, color: "#ef4444", label: "El" },
    { pct: mix.heat_pump_pct, color: "#10b981", label: "VP" },
    { pct: mix.district_heating_pct, color: "#3b82f6", label: "FV" },
    { pct: mix.oil_pct, color: "#6b7280", label: "Olja" },
    { pct: mix.other_pct, color: "#374151", label: "Övrigt" },
  ].filter((s) => s.pct > 0);

  return (
    <div style={{ display: "flex", height: "4px", borderRadius: "2px", overflow: "hidden", width: "100%", marginTop: "2px" }}>
      {segments.map((s, i) => (
        <div key={i} title={`${s.label}: ${s.pct}%`} style={{ width: `${s.pct}%`, background: s.color, minWidth: s.pct > 0 ? "2px" : 0 }} />
      ))}
    </div>
  );
}

function SweBadge() {
  return (
    <span style={{
      display: "inline-block", padding: "1px 6px", borderRadius: "3px",
      fontSize: "0.65rem", fontWeight: 700,
      background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa",
      border: "1px solid rgba(59, 130, 246, 0.3)", marginLeft: "6px", verticalAlign: "middle",
    }}>DU ÄR HÄR</span>
  );
}

function DominantBadge({ scenarioId }: { scenarioId: string }) {
  return (
    <span style={{
      display: "inline-block", padding: "1px 6px", borderRadius: "3px",
      fontSize: "0.62rem", fontWeight: 600,
      background: `${SCENARIO_COLORS[scenarioId]}15`,
      color: SCENARIO_COLORS[scenarioId],
      border: `1px solid ${SCENARIO_COLORS[scenarioId]}40`,
    }}>
      {SCENARIO_ICONS[scenarioId]} {SCENARIO_LABELS[scenarioId]}
    </span>
  );
}

export default function HeatingCostPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ViewMode>("dominant");
  const [currency, setCurrency] = useState<Currency>("SEK");
  const [sortBy, setSortBy] = useState<"cost" | "hdd" | "price">("cost");

  useEffect(() => {
    fetch("/api/analysis/heating-cost")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">🌡️ Uppvärmningskostnad EU</h1></div>
        <div className="card"><p style={{ color: "var(--text-muted)" }}>Beräknar…</p></div>
      </div>
    );
  }

  if (!data || !data.countries) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">🌡️ Uppvärmningskostnad EU</h1></div>
        <div className="card"><p style={{ color: "var(--text-muted)" }}>Data ej tillgänglig</p></div>
      </div>
    );
  }

  const { meta, countries } = data;

  const sorted = [...countries].sort((a, b) => {
    if (sortBy === "hdd") return b.hdd - a.hdd;
    if (sortBy === "price") return b.electricity_eur_kwh - a.electricity_eur_kwh;
    return (getCountryCost(b, mode, currency) ?? 0) - (getCountryCost(a, mode, currency) ?? 0);
  });

  const maxCost = Math.max(...countries.map((c) => getCountryCost(c, mode, currency) ?? 0));

  const sweData = countries.find((c) => c.code === "SE");
  const sweCost = sweData ? getCountryCost(sweData, mode, currency) : null;
  const sweRank = sorted.findIndex((c) => c.code === "SE") + 1;
  const sweScenarioId = sweData ? getCountryScenarioId(sweData, mode) : "heat_pump";

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px", borderRadius: "4px", fontSize: "0.78rem",
    fontWeight: active ? 600 : 400,
    background: active ? "rgba(59, 130, 246, 0.15)" : "transparent",
    color: active ? "#60a5fa" : "var(--text-muted)",
    border: active ? "1px solid rgba(59, 130, 246, 0.3)" : "1px solid var(--border-color)",
    cursor: "pointer", transition: "all 0.15s",
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">🌡️ Uppvärmningskostnad EU</h1>
        <p className="page-subtitle">
          Vad kostar det att hålla 18–20°C i en 150 m² villa under uppvärmningssäsongen?
          <br />
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            {meta.period} · Miniminivå enligt {meta.regulatory_basis.authority} ({meta.regulatory_basis.regulation})
          </span>
        </p>
      </div>

      {/* Model separation notice */}
      <div className="card" style={{ background: "rgba(245, 158, 11, 0.06)", border: "1px solid rgba(245, 158, 11, 0.2)", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <span style={{ fontSize: "1rem" }}>📐</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.82rem", color: "#f59e0b", marginBottom: "4px" }}>Scenariobaserad modell</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Detta är en <strong>beräkningsmodell</strong>, inte rådata. Den använder EVE-datasets (HDD, elpris) men bygger på
              antaganden om hustyp, isolering och verkningsgrad. Tre scenarier visas för jämförbarhet —
              alla med synliga parametrar. Dra egna slutsatser.
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.68rem", padding: "1px 6px", borderRadius: 3, background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>A: Direkt el (COP=1)</span>
              <span style={{ fontSize: "0.68rem", padding: "1px 6px", borderRadius: 3, background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)" }}>B: Värmepump (SCOP=3 lab)</span>
              <span style={{ fontSize: "0.68rem", padding: "1px 6px", borderRadius: 3, background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.2)" }}>C: Gas (\u03b7=92%)</span>
            </div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "6px" }}>
              Villa 150 m\u00b2 \u00b7 Bas: SE 120 kWh/m\u00b2\u00b7\u00e5r \u00b7 Skalat via HDD \u00b7 Eurostat H1 2025 (hel\u00e5rspris) \u00b7 SE: verifierat spot okt 25\u2013feb 26
            </div>
          </div>
        </div>
      </div>

      {/* Regulatory callout */}
      <div className="card" style={{ background: "rgba(59, 130, 246, 0.06)", border: "1px solid rgba(59, 130, 246, 0.2)", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <span style={{ fontSize: "1.4rem" }}>⚖️</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.88rem", marginBottom: "4px" }}>
              Folkhälsomyndighetens krav: minst 18°C operativ temperatur
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Enligt HSLF-FS 2024:10 (gäller fr.o.m. 15 maj 2024) får inomhustemperaturen inte
              långvarigt understiga 18°C. För känsliga grupper gäller minst 20°C.
              Rekommenderat komfortintervall: 20–23°C.
            </div>
            <a href={meta.regulatory_basis.source_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: "0.72rem", color: "var(--accent-blue)", marginTop: "4px", display: "inline-block" }}>
              Källa: Folkhälsomyndigheten →
            </a>
          </div>
        </div>
      </div>

      {/* Sweden highlight */}
      {sweData && sweCost !== null && (
        <div className="card" style={{ background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.2)", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "1.8rem" }}>🇸🇪</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "6px" }}>
                Sverige okt–mars — {mode === "dominant" ? "Vanligaste uppvärmning" : SCENARIO_LABELS[mode]}
                {mode === "dominant" && <DominantBadge scenarioId={sweScenarioId} />}
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                {formatCost(sweCost, currency)}
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 400, marginLeft: "8px" }}>/år</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Värmebehov</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.88rem" }}>{sweData.season_kwh_heat_demand.toLocaleString("sv-SE")} kWh</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Ranking</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.88rem", color: sweRank <= 3 ? "#ef4444" : sweRank <= 7 ? "#f59e0b" : "#10b981" }}>
                #{sweRank} av {sorted.length}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="card" style={{ marginBottom: "12px" }}>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Visa</div>
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
              <button onClick={() => setMode("dominant")} style={pillStyle(mode === "dominant")}>🏠 Verklig kostnad</button>
              <button onClick={() => setMode("direct_electric")} style={pillStyle(mode === "direct_electric")}>🔌 Direkt el</button>
              <button onClick={() => setMode("heat_pump")} style={pillStyle(mode === "heat_pump")}>♨️ Värmepump</button>
              <button onClick={() => setMode("gas_boiler")} style={pillStyle(mode === "gas_boiler")}>🔥 Gas</button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Valuta</div>
            <div style={{ display: "flex", gap: "4px" }}>
              <button onClick={() => setCurrency("SEK")} style={pillStyle(currency === "SEK")}>SEK</button>
              <button onClick={() => setCurrency("EUR")} style={pillStyle(currency === "EUR")}>EUR</button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Sortera</div>
            <div style={{ display: "flex", gap: "4px" }}>
              <button onClick={() => setSortBy("cost")} style={pillStyle(sortBy === "cost")}>Kostnad</button>
              <button onClick={() => setSortBy("hdd")} style={pillStyle(sortBy === "hdd")}>Klimat</button>
              <button onClick={() => setSortBy("price")} style={pillStyle(sortBy === "price")}>Elpris</button>
            </div>
          </div>
        </div>
        {mode === "dominant" && (
          <div style={{ marginTop: "8px", fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
            🏠 <strong>Verklig kostnad</strong> = beräknad med landets vanligaste uppvärmningskälla.
            Gas-länder jämförs med gaspris, VP-länder med elpris÷3.
            <span style={{ display: "inline-flex", gap: "8px", marginLeft: "8px" }}>
              <span style={{ color: "#f59e0b" }}>■ Gas</span>
              <span style={{ color: "#ef4444" }}>■ El</span>
              <span style={{ color: "#10b981" }}>■ VP</span>
              <span style={{ color: "#3b82f6" }}>■ FV</span>
              <span style={{ color: "#6b7280" }}>■ Olja</span>
            </span>
          </div>
        )}
      </div>

      {/* Country list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {sorted.map((c, i) => {
          const cost = getCountryCost(c, mode, currency);
          const scenarioId = getCountryScenarioId(c, mode);
          const barColor = SCENARIO_COLORS[scenarioId] ?? "#3b82f6";
          const isSwe = c.code === "SE";

          return (
            <div key={c.code} className="card" style={{
              marginBottom: 0, padding: "10px 14px",
              border: isSwe ? "1px solid rgba(59, 130, 246, 0.4)" : undefined,
              background: isSwe ? "rgba(59, 130, 246, 0.04)" : undefined,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--text-muted)", width: "22px", textAlign: "right" }}>
                  {i + 1}.
                </span>
                <span style={{ fontSize: "1.2rem" }}>{c.flag}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{c.name}</span>
                    {isSwe && <SweBadge />}
                    {mode === "dominant" && <DominantBadge scenarioId={scenarioId} />}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                    {c.hdd} HDD · {c.season_kwh_heat_demand.toLocaleString("sv-SE")} kWh okt–mar ·{" "}
                    {scenarioId === "gas_boiler" && c.gas_eur_kwh !== null
                      ? `${c.gas_eur_kwh.toFixed(3)} €/kWh gas`
                      : `${c.electricity_eur_kwh.toFixed(2)} €/kWh el`
                    }
                  </div>
                  <CostBar cost={cost} maxCost={maxCost} color={barColor} />
                  {mode === "dominant" && <MixBar mix={c.heating_mix} />}
                </div>
                <div style={{ textAlign: "right", minWidth: "100px" }}>
                  {cost !== null ? (
                    <>
                      <div style={{
                        fontFamily: "var(--font-mono)", fontSize: "1rem", fontWeight: 700,
                        color: cost > (maxCost * 0.7) ? "#ef4444" : cost > (maxCost * 0.4) ? "#f59e0b" : "#10b981",
                      }}>
                        {formatCost(cost, currency)}
                      </div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>okt–mar</div>
                    </>
                  ) : (
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                      Ej tillgängligt
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Methodology */}
      <details style={{ marginTop: "20px" }}>
        <summary style={{ color: "var(--accent-blue)", cursor: "pointer", fontSize: "0.82rem" }}>
          Metodik & källor
        </summary>
        <div className="card" style={{ marginTop: "8px", fontSize: "0.78rem", lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>Beräkningsmodell (v4 — Uppvärmningssäsong)</div>
          <div style={{ color: "var(--text-secondary)", marginBottom: "12px" }}>
            <strong>Period:</strong> {meta.period} (6 månader, ~85% av årligt värmebehov)<br />
            <strong>Mål:</strong> 18–20°C (Folkhälsomyndighetens minimum)<br />
            <strong>Byggnad:</strong> Villa 150 m², normalstandard<br />
            <strong>Ankare:</strong> Sverige 120 kWh/m²·år → 102 kWh/m² under okt–mars = 15 300 kWh<br />
            <strong>Källa:</strong> Energimyndigheten 2024: 90,5 kWh/m² köpt snitt. Direkt el ~110 kWh/m².<br />
            <strong>Elpris SE:</strong> Verifierat spotdata okt 2025–feb 2026 (Elbruk, Elspot) + alla avgifter = 1,95 kr/kWh (€0.177)<br />
            <strong>Elpris övriga:</strong> Eurostat H1 2025 DC-band (helårspris, vinterpris ~20-40% högre)<br />
            <strong>Skalning:</strong> 15 300 × (land_HDD ÷ 4 800)<br />
            <strong>Kostnad:</strong> Värmebehov ÷ verkningsgrad × energipris<br />
            <strong>Växelkurs:</strong> 1 EUR = {meta.sek_per_eur} SEK<br />
            <strong>SCOP-not:</strong> VP SCOP 3.0 = lab-rating. Reell systemverkningsgrad ofta 2.0–2.5.
          </div>

          <div style={{ fontWeight: 600, marginBottom: "8px" }}>Verklig kostnad (per land)</div>
          <div style={{ color: "var(--text-secondary)", marginBottom: "12px" }}>
            I läget &quot;Verklig kostnad&quot; används landets <strong>vanligaste uppvärmningskälla</strong> (baserat på bostadsbeståndets fördelning).
            Exempelvis: Tyskland 56% gas → gaspanna, Sverige 43% VP → värmepump.
            Fördelningen visas som färgad stapel under varje land.
          </div>

          <div style={{ fontWeight: 600, marginBottom: "8px" }}>Källor</div>
          <div style={{ color: "var(--text-secondary)" }}>
            <div><strong>El SE:</strong> <a href="https://www.elbruk.se/elpris-historik-2025" target="_blank" rel="noopener noreferrer">Elbruk.se</a>, <a href="https://elspot.nu/elpriser-historik-2026/" target="_blank" rel="noopener noreferrer">Elspot.nu</a>, SCB, Energimarknadsbyrån (okt 2025–feb 2026)</div>
            <div><strong>El EU:</strong> <a href="https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Electricity_price_statistics" target="_blank" rel="noopener noreferrer">Eurostat nrg_pc_204</a> (H1 2025, DC-band)</div>
            <div><strong>Gas EU:</strong> <a href="https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Natural_gas_price_statistics" target="_blank" rel="noopener noreferrer">Eurostat nrg_pc_202</a> (H1 2025)</div>
            <div><strong>Värmebehov:</strong> Energimyndigheten Energistatistik småhus 2024</div>
            <div><strong>Uppvärmningsmix:</strong> BDEW 2024, EHPA 2025, nationella energimyndigheter</div>
            <div><strong>Reglering:</strong> <a href="https://www.folkhalsomyndigheten.se/regler-och-tillsyn/tillsynsvagledning-och-stod/halsoskydd-vagledning-och-tillsyn/vagledning-om-temperatur-inomhus/" target="_blank" rel="noopener noreferrer">Folkhälsomyndigheten HSLF-FS 2024:10</a></div>
          </div>

          <div style={{
            marginTop: "12px", padding: "8px 10px",
            background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.2)",
            borderRadius: "4px", fontSize: "0.72rem", color: "var(--accent-amber)",
          }}>
            ⚠️ Beräkningarna är indikativa. Verkliga kostnader varierar med isoleringsgrad,
            beteende, elavtal, klimatzon och byggnadstyp. Syftet är att visa relativa skillnader
            mellan EU-länder, inte exakta belopp.
          </div>
        </div>
      </details>

      <div style={{ marginTop: "16px", fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", textAlign: "center" }}>
        Scenariomodell v4 · Okt–Mars · Eurostat H1 2025 · {countries.length} länder · Bygger på EVE-datasets men är inte EVE-evidens
      </div>
    </div>
  );
}
