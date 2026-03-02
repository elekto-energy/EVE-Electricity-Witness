"use client";

interface FxInfo {
  fx_rate: number;
  fx_period: string;
  fx_source: string;
  fx_file_hash: string;
}

interface MultiResultPanelProps {
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

function eurMwhToSekKwh(v: number | null, fxRate: number): number | null {
  if (v === null || v === undefined) return null;
  return (v * fxRate) / 1000;
}

// ─── Colors & Labels ─────────────────────────────────────────────────────────

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

const ZONE_COLORS: Record<string, string> = {
  SE1: "#3b82f6", SE2: "#22d3ee", SE3: "#f59e0b", SE4: "#ef4444",
};

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

// ─── Main ────────────────────────────────────────────────────────────────────

export default function MultiResultPanel({ result, lang, fx }: MultiResultPanelProps) {
  const isSv = lang === "sv";
  const GL = isSv ? GEN_LABELS_SV : GEN_LABELS_EN;
  const agg = result.aggregate;
  const zr = result.zone_results;

  const useSek = isSv && fx !== null;
  const fxRate = fx?.fx_rate ?? 0;

  const spotUnit = useSek ? "kr/kWh" : "€/MWh";
  const spotDecimals = useSek ? 3 : 2;

  const convert = (v: number | null) => useSek ? eurMwhToSekKwh(v, fxRate) : v;

  return (
    <div className="card" style={{ padding: 20, marginTop: 12 }}>

      {/* ═══ HEADER ═══ */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
          🇸🇪 {result.label} — {result.period.from} → {result.period.to}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          {agg.rows_count} {isSv ? "rader" : "rows"} · {agg.hours_total}h × 4 {isSv ? "zoner" : "zones"}
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

      {/* ═══ AGGREGATE PRICES ═══ */}
      <SectionTitle badge="SE1–SE4" badgeColor="#10b981">
        {isSv ? "Rikspris (genomsnitt)" : "National Price (average)"}
      </SectionTitle>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Stat label={isSv ? "Medelpris" : "Mean Price"} value={fmt(convert(agg.spot.mean), spotDecimals)} unit={spotUnit} color="#f59e0b" />
        <Stat label="Min" value={fmt(convert(agg.spot.min), spotDecimals)} unit={spotUnit} />
        <Stat label="Max" value={fmt(convert(agg.spot.max), spotDecimals)} unit={spotUnit} />
      </div>

      {/* ═══ PER-ZONE COMPARISON ═══ */}
      <SectionTitle badge="CMD" badgeColor="#22c55e">
        {isSv ? "Zonpriser" : "Zone Prices"}
      </SectionTitle>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 12 }}>
        {(["SE1", "SE2", "SE3", "SE4"] as const).map(z => {
          const zResult = zr[z];
          if (!zResult) return <div key={z} style={{ fontSize: 10, color: "var(--text-muted)" }}>{z}: –</div>;
          const spotMean = convert(zResult.spot.mean);
          return (
            <div key={z} style={{
              background: "var(--bg-primary)", border: `1px solid ${ZONE_COLORS[z]}40`,
              borderRadius: 6, padding: "8px 10px", borderLeft: `3px solid ${ZONE_COLORS[z]}`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: ZONE_COLORS[z], marginBottom: 2 }}>{z}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                {fmt(spotMean, spotDecimals)}
                <span style={{ fontSize: 8, fontWeight: 400, marginLeft: 2, color: "var(--text-muted)" }}>{spotUnit}</span>
              </div>
              <div style={{ fontSize: 8, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                {fmt(convert(zResult.spot.min), spotDecimals)} – {fmt(convert(zResult.spot.max), spotDecimals)}
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ BOTTLENECK PER ZONE ═══ */}
      {result.system_price?.available && (
        <>
          <SectionTitle badge="DDM" badgeColor="#f97316">
            {isSv ? "Intern prisdifferens per zon" : "Internal Price Spread per Zone"}
          </SectionTitle>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 12 }}>
            {(["SE1", "SE2", "SE3", "SE4"] as const).map(z => {
              const zResult = zr[z];
              if (!zResult?.bottleneck?.available) return (
                <div key={z} style={{ fontSize: 10, color: "var(--text-muted)", padding: 8 }}>{z}: –</div>
              );
              const bn = zResult.bottleneck;
              const bnMean = convert(bn.mean);
              return (
                <div key={z} style={{
                  background: "var(--bg-primary)", border: "1px solid var(--border-color)",
                  borderRadius: 6, padding: "8px 10px", borderLeft: `3px solid ${ZONE_COLORS[z]}`,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: ZONE_COLORS[z], marginBottom: 2 }}>{z}</div>
                  <div style={{
                    fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono)",
                    color: bn.mean != null && bn.mean > 0 ? "#f97316" : "#22c55e",
                  }}>
                    {fmtSign(bnMean, spotDecimals)}
                    <span style={{ fontSize: 8, fontWeight: 400, marginLeft: 2, color: "var(--text-muted)" }}>{spotUnit}</span>
                  </div>
                  <div style={{ fontSize: 8, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                    {bn.mean_pct ?? 0}% · {bn.hours_positive}h+/{bn.hours_negative}h−
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ═══ EMISSIONS ═══ */}
      <SectionTitle badge="CMD" badgeColor="#22c55e">
        {isSv ? "Utsläpp (viktat riksmedel)" : "Emissions (weighted national avg)"}
      </SectionTitle>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Stat label={isSv ? "CO₂ produktion" : "CO₂ Production"} value={fmt(agg.production_co2.mean)} unit="g/kWh" color="#22c55e" />
        <Stat label={isSv ? "CO₂ konsumtion" : "CO₂ Consumption"} value={fmt(agg.consumption_co2.mean)} unit="g/kWh" color="#ef4444" />
      </div>

      {/* ═══ GENERATION MIX (total Sweden) ═══ */}
      <SectionTitle badge="CMD" badgeColor="#22c55e">
        {isSv ? "Total svensk produktion" : "Total Swedish Generation"}
      </SectionTitle>

      {(() => {
        const gm = agg.generation_mix_total_mw;
        const genEntries = Object.entries(gm as Record<string, number | null>)
          .filter(([k, v]) => k !== "total" && v != null && (v as number) > 0)
          .map(([k, v]) => ({ key: k, value: v as number }));
        const genTotal = genEntries.reduce((s, e) => s + e.value, 0);

        if (genTotal <= 0) return null;

        return (
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
        );
      })()}

      {/* ═══ WEATHER ═══ */}
      {agg.temperature.mean !== null && (
        <>
          <SectionTitle badge="CMD" badgeColor="#22c55e">
            {isSv ? "Väder (riksmedel)" : "Weather (national avg)"}
          </SectionTitle>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <Stat label={isSv ? "Temp medel" : "Temp Mean"} value={fmt(agg.temperature.mean, 1)} unit="°C" color="#22d3ee" />
            <Stat label="HDD" value={fmt(agg.hdd.sum, 0)} />
          </div>
        </>
      )}

      {/* FX note */}
      {useSek && (
        <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
          {isSv ? "Konverterat" : "Converted"} EUR→SEK: ECB {fx!.fx_period} ({fx!.fx_rate.toFixed(4)}) · {isSv ? "Exkl. nät, skatt, påslag" : "Excl. grid, tax, markup"}
        </div>
      )}

      {/* ═══ PROVENANCE FOOTER ═══ */}
      <div style={{ marginTop: 16, paddingTop: 10, borderTop: "1px solid var(--border-color)" }}>
        <div style={{ fontSize: 8, color: "var(--text-ghost)", fontFamily: "var(--font-mono)", lineHeight: 1.8 }}>
          {result.methodology_version} · {result.emission_scope} · composite_hash: {result.composite_query_hash?.slice(0, 16)}…
        </div>
        <div style={{ fontSize: 8, color: "var(--text-ghost)", fontFamily: "var(--font-mono)", lineHeight: 1.6, marginTop: 2 }}>
          {result.dataset_eve_ids?.map((id: string) => id).join(" · ")}
        </div>
      </div>
    </div>
  );
}
