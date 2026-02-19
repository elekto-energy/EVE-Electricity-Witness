"use client";

interface FxInfo {
  fx_rate: number;
  fx_period: string;
  fx_source: string;
  fx_file_hash: string;
}

interface ResultPanelProps {
  result: any;
  lang: string;
  fx: FxInfo | null;
}

function fmt(v: number | null | undefined, d = 2): string {
  if (v === null || v === undefined) return "–";
  return v.toFixed(d);
}

function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "–";
  return Math.round(v).toLocaleString("sv-SE");
}

function fmtSign(v: number | null | undefined, d = 2): string {
  if (v === null || v === undefined) return "–";
  return (v >= 0 ? "+" : "") + v.toFixed(d);
}

/** Convert €/MWh → kr/kWh using ECB rate */
function eurMwhToSekKwh(v: number | null, fxRate: number): number | null {
  if (v === null || v === undefined) return null;
  return (v * fxRate) / 1000;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Stat({ label, value, unit, color, sub }: {
  label: string; value: string; unit?: string; color?: string; sub?: string;
}) {
  return (
    <div style={{
      background: "var(--bg-primary)", border: "1px solid var(--border-color)",
      borderRadius: 6, padding: "8px 10px", flex: "1 1 100px", minWidth: 80,
    }}>
      <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? "var(--text-primary)", fontFamily: "var(--font-mono)", lineHeight: 1.2 }}>
        {value}
        {unit && <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 3, color: "var(--text-muted)" }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 8, color: "var(--text-muted)", marginTop: 1, fontFamily: "var(--font-mono)" }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children, badge, badgeColor }: {
  children: React.ReactNode; badge?: string; badgeColor?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, marginTop: 20 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {children}
      </span>
      {badge && (
        <span style={{
          fontSize: 8, padding: "1px 5px", borderRadius: 3, fontFamily: "var(--font-mono)",
          background: `${badgeColor ?? "#3b82f6"}15`, border: `1px solid ${badgeColor ?? "#3b82f6"}40`,
          color: badgeColor ?? "#3b82f6",
        }}>{badge}</span>
      )}
    </div>
  );
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const GEN_COLORS: Record<string, string> = {
  nuclear: "#a78bfa", hydro: "#3b82f6", wind_onshore: "#22d3ee", wind_offshore: "#06b6d4",
  solar: "#facc15", gas: "#f97316", coal: "#78716c", lignite: "#57534e", oil: "#44403c", other: "#a8a29e",
};

const GEN_LABELS_SV: Record<string, string> = {
  nuclear: "Kärnkraft", hydro: "Vatten", wind_onshore: "Vind", wind_offshore: "Vind hav",
  solar: "Sol", gas: "Gas", coal: "Kol", lignite: "Brunkol", oil: "Olja", other: "Övrigt",
};

const GEN_LABELS_EN: Record<string, string> = {
  nuclear: "Nuclear", hydro: "Hydro", wind_onshore: "Wind", wind_offshore: "Wind offshore",
  solar: "Solar", gas: "Gas", coal: "Coal", lignite: "Lignite", oil: "Oil", other: "Other",
};

// ─── Main ────────────────────────────────────────────────────────────────────

export default function ResultPanel({ result, lang, fx }: ResultPanelProps) {
  const isSv = lang === "sv";
  const gm = result.generation_mix_avg_mw;
  const GL = isSv ? GEN_LABELS_SV : GEN_LABELS_EN;

  const useSek = isSv && fx !== null;
  const fxRate = fx?.fx_rate ?? 0;

  const spotMean = useSek ? eurMwhToSekKwh(result.spot.mean, fxRate) : result.spot.mean;
  const spotMin = useSek ? eurMwhToSekKwh(result.spot.min, fxRate) : result.spot.min;
  const spotMax = useSek ? eurMwhToSekKwh(result.spot.max, fxRate) : result.spot.max;
  const spotUnit = useSek ? "kr/kWh" : "€/MWh";
  const spotDecimals = useSek ? 3 : 2;

  const sp = result.system_price;
  const bn = result.bottleneck;
  const fl = result.flows;

  const sysMean = useSek && sp?.mean != null ? eurMwhToSekKwh(sp.mean, fxRate) : sp?.mean;
  const sysUnit = useSek ? "kr/kWh" : "€/MWh";
  const sysDecimals = useSek ? 3 : 2;

  const bnMean = useSek && bn?.mean != null ? eurMwhToSekKwh(bn.mean, fxRate) : bn?.mean;
  const bnMax = useSek && bn?.max != null ? eurMwhToSekKwh(bn.max, fxRate) : bn?.max;
  const bnUnit = useSek ? "kr/kWh" : "€/MWh";
  const bnDecimals = useSek ? 3 : 2;

  // Generation mix bar
  const genEntries = Object.entries(gm as Record<string, number | null>)
    .filter(([k, v]) => k !== "total" && v != null && v > 0)
    .map(([k, v]) => ({ key: k, value: v as number }));
  const genTotal = genEntries.reduce((s, e) => s + e.value, 0);

  return (
    <div className="card" style={{ padding: 20, marginTop: 12 }}>

      {/* ═══ HEADER ═══ */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
          {result.zone} — {result.period.from} → {result.period.to}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          {result.rows_count} {isSv ? "rader" : "rows"} · {result.hours_total}h
        </span>
      </div>

      {/* Methodology warnings */}
      {result.methodology_warnings?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {result.methodology_warnings.map((w: string, i: number) => (
            <div key={i} style={{
              fontSize: 10, color: "#f59e0b", padding: "4px 8px", marginBottom: 3,
              background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)",
              borderRadius: 4, fontFamily: "var(--font-mono)",
            }}>⚠ {w}</div>
          ))}
        </div>
      )}

      {/* ═══ SECTION 1: PRICES ═══ */}
      <SectionTitle badge="CMD" badgeColor="#22c55e">
        {isSv ? "Priser" : "Prices"}
      </SectionTitle>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Stat label={isSv ? "Zonpris medel" : "Zone Price Mean"} value={fmt(spotMean, spotDecimals)} unit={spotUnit} color="#f59e0b" />
        <Stat label={isSv ? "Zonpris min" : "Zone Price Min"} value={fmt(spotMin, spotDecimals)} unit={spotUnit} />
        <Stat label={isSv ? "Zonpris max" : "Zone Price Max"} value={fmt(spotMax, spotDecimals)} unit={spotUnit} />
      </div>

      {sp?.available && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <Stat
            label={isSv ? "Systempris medel" : "System Price Mean"}
            value={fmt(sysMean, sysDecimals)} unit={sysUnit} color="#3b82f6"
            sub={`${sp.hours_matched}h matched · ${sp.source}`}
          />
          <Stat
            label={isSv ? "Flaskhals medel" : "Bottleneck Mean"}
            value={fmtSign(bnMean, bnDecimals)} unit={bnUnit}
            color={bn?.mean != null && bn.mean > 0 ? "#f97316" : "#22c55e"}
            sub={`${bn?.mean_pct ?? 0}% av zon`}
          />
          <Stat
            label={isSv ? "Flaskhals max" : "Bottleneck Max"}
            value={fmtSign(bnMax, bnDecimals)} unit={bnUnit}
            color={bn?.max != null && bn.max > 5 ? "#f97316" : "var(--text-primary)"}
            sub={`${bn?.max_pct ?? 0}% av zon`}
          />
        </div>
      )}

      {/* Bottleneck hours breakdown */}
      {bn?.available && (
        <div style={{ display: "flex", gap: 12, marginBottom: 8, fontSize: 10, color: "var(--text-muted)" }}>
          <span>
            <span style={{ color: "#f97316", fontWeight: 600 }}>{bn.hours_positive}h</span>{" "}
            {isSv ? "zon dyrare" : "zone premium"}
          </span>
          <span>
            <span style={{ color: "#22c55e", fontWeight: 600 }}>{bn.hours_negative}h</span>{" "}
            {isSv ? "zon billigare" : "zone discount"}
          </span>
          <span>
            <span style={{ fontWeight: 600 }}>{bn.hours_zero}h</span>{" "}
            {isSv ? "noll" : "zero"}
          </span>
        </div>
      )}

      {/* FX conversion note */}
      {useSek && (
        <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 4, fontFamily: "var(--font-mono)" }}>
          {isSv ? "Konverterat" : "Converted"} EUR→SEK: ECB {fx!.fx_period} ({fx!.fx_rate.toFixed(4)}) · {isSv ? "Exkl. nät, skatt, påslag" : "Excl. grid, tax, markup"}
        </div>
      )}

      {/* ═══ SECTION 2: EMISSIONS ═══ */}
      <SectionTitle badge="CMD" badgeColor="#22c55e">
        {isSv ? "Utsläpp" : "Emissions"}
      </SectionTitle>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Stat label={isSv ? "CO₂ produktion" : "CO₂ Production"} value={fmt(result.production_co2.mean)} unit="g/kWh" color="#22c55e" />
        <Stat label={isSv ? "CO₂ konsumtion" : "CO₂ Consumption"} value={fmt(result.consumption_co2.mean)} unit="g/kWh" color="#ef4444" />
      </div>

      {/* ═══ SECTION 3: GENERATION MIX ═══ */}
      <SectionTitle badge="CMD" badgeColor="#22c55e">
        {isSv ? "Produktionsmix" : "Generation Mix"}
      </SectionTitle>

      {genTotal > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", height: 28, borderRadius: 6, overflow: "hidden", marginBottom: 6 }}>
            {genEntries.map(e => {
              const pct = (e.value / genTotal) * 100;
              if (pct < 0.5) return null;
              return (
                <div key={e.key} style={{
                  width: `${pct}%`, background: GEN_COLORS[e.key] ?? "#666",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: pct > 8 ? 9 : 0, color: "#fff", fontWeight: 600, fontFamily: "var(--font-mono)",
                }} title={`${GL[e.key] ?? e.key}: ${Math.round(e.value)} MW (${pct.toFixed(1)}%)`}>
                  {pct > 12 ? `${GL[e.key] ?? e.key} ${pct.toFixed(0)}%` : pct > 5 ? `${pct.toFixed(0)}%` : ""}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px" }}>
            {genEntries.filter(e => (e.value / genTotal) * 100 >= 1).map(e => (
              <span key={e.key} style={{ fontSize: 9, color: "var(--text-muted)" }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: GEN_COLORS[e.key] ?? "#666", marginRight: 3, verticalAlign: "middle" }} />
                {GL[e.key] ?? e.key} {fmtInt(e.value)} MW
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ═══ SECTION 4: CROSS-BORDER FLOWS ═══ */}
      {fl && (
        <>
          <SectionTitle badge={fl.available ? "CMD" : "N/A"} badgeColor={fl.available ? "#22c55e" : "#6b7280"}>
            {isSv ? "Gränsöverskridande flöden" : "Cross-Border Flows"}
          </SectionTitle>

          {fl.available ? (
            <div style={{ marginBottom: 8 }}>
              {/* Summary KPIs */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <Stat label={isSv ? "Total import" : "Total Import"} value={fmtInt(fl.total_import_mwh)} unit="MWh" color="#60a5fa" />
                <Stat label={isSv ? "Total export" : "Total Export"} value={fmtInt(fl.total_export_mwh)} unit="MWh" color="#f87171" />
                <Stat
                  label={isSv ? "Netto" : "Net"}
                  value={fmtSign(fl.net_mwh, 0)} unit="MWh"
                  color={fl.net_mwh > 0 ? "#60a5fa" : "#f87171"}
                  sub={fl.net_mwh > 0 ? (isSv ? "nettoimportör" : "net importer") : (isSv ? "nettoexportör" : "net exporter")}
                />
              </div>

              {/* Border details */}
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                {/* Import borders */}
                {fl.top_borders_in?.length > 0 && (
                  <div style={{ flex: "1 1 180px" }}>
                    <div style={{ fontSize: 9, color: "#60a5fa", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      ↓ {isSv ? "Import per gräns" : "Import by border"}
                    </div>
                    {fl.top_borders_in.map((b: any) => {
                      const pct = fl.total_import_mwh > 0 ? (b.total_mwh / fl.total_import_mwh) * 100 : 0;
                      return (
                        <div key={b.border} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 9, color: "var(--text-muted)", width: 70, fontFamily: "var(--font-mono)" }}>{b.border}</span>
                          <div style={{ flex: 1, height: 8, background: "var(--border-color)", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: "#60a5fa", borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 9, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", width: 65, textAlign: "right" }}>
                            {fmtInt(b.total_mwh)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Export borders */}
                {fl.top_borders_out?.length > 0 && (
                  <div style={{ flex: "1 1 180px" }}>
                    <div style={{ fontSize: 9, color: "#f87171", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      ↑ {isSv ? "Export per gräns" : "Export by border"}
                    </div>
                    {fl.top_borders_out.map((b: any) => {
                      const pct = fl.total_export_mwh > 0 ? (b.total_mwh / fl.total_export_mwh) * 100 : 0;
                      return (
                        <div key={b.border} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 9, color: "var(--text-muted)", width: 70, fontFamily: "var(--font-mono)" }}>{b.border}</span>
                          <div style={{ flex: 1, height: 8, background: "var(--border-color)", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: "#f87171", borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 9, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", width: 65, textAlign: "right" }}>
                            {fmtInt(b.total_mwh)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Dataset IDs */}
              {fl.dataset_ids?.length > 0 && (
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 6, fontFamily: "var(--font-mono)" }}>
                  {fl.dataset_ids.join(" · ")}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>
              {isSv ? "Flödesdata ej tillgänglig för denna period." : "Flow data not available for this period."}
            </div>
          )}
        </>
      )}

      {/* ═══ SECTION 5: WEATHER ═══ */}
      {(result.temperature.mean !== null || result.hdd.sum !== null) && (
        <>
          <SectionTitle badge="CMD" badgeColor="#22c55e">
            {isSv ? "Väder" : "Weather"}
          </SectionTitle>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <Stat label={isSv ? "Temp medel" : "Temp Mean"} value={fmt(result.temperature.mean, 1)} unit="°C" color="#22d3ee" />
            {result.temperature.min !== null && (
              <Stat label={isSv ? "Temp min" : "Temp Min"} value={fmt(result.temperature.min, 1)} unit="°C" />
            )}
            {result.temperature.max !== null && (
              <Stat label={isSv ? "Temp max" : "Temp Max"} value={fmt(result.temperature.max, 1)} unit="°C" />
            )}
            <Stat label="HDD" value={fmtInt(result.hdd.sum)} />
          </div>
        </>
      )}

      {/* ═══ PROVENANCE FOOTER ═══ */}
      <div style={{ marginTop: 16, paddingTop: 10, borderTop: "1px solid var(--border-color)" }}>
        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", fontFamily: "var(--font-mono)", lineHeight: 1.8 }}>
          {result.methodology_version} · {result.emission_scope}
          {sp?.dataset_eve_id && ` · sys: ${sp.dataset_eve_id}`}
          {sp?.canonical_hash && ` · sys_hash: ${sp.canonical_hash.slice(0, 12)}…`}
        </div>
      </div>
    </div>
  );
}
