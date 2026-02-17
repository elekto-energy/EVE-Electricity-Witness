"use client";

import { useEffect, useState, useMemo } from "react";

/* ───── Types ───── */
interface PriceRecord {
  country: string;
  year: number;
  components: {
    energy_tax_ore_kwh_excl_vat: number;
    energy_tax_ore_kwh_incl_vat: number;
    energy_tax_reduced_ore_kwh_excl_vat: number;
    vat_pct: number;
  };
  sources: { component: string; authority: string; url: string; effective_date: string }[];
  evidence_ref: { manifest_id: string; root_hash: string };
}

interface SpotZone {
  zone_code: string;
  zone_name: string;
  avg_eur_mwh: number;
}

/* ───── Constants ───── */
const EUR_SEK = 11.5;
const eurMwhToOre = (eur: number) => (eur / 1000) * EUR_SEK * 100;
const NETWORK_TYPICAL = 32; // öre/kWh excl moms

/* ───── Component ───── */
export default function PriceCompositionPanel() {
  const [priceData, setPriceData] = useState<{ records: PriceRecord[] } | null>(null);
  const [spotZones, setSpotZones] = useState<SpotZone[] | null>(null);
  const [year, setYear] = useState(2026);
  const [simSpot, setSimSpot] = useState(50); // öre/kWh slider
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/witness/price-structure")
      .then((r) => r.json())
      .then((d) => setPriceData(d.price_breakdown))
      .catch(() => setError("Kunde inte ladda prisdata"));

    fetch("/api/spot/compare?zones=SE1,SE2,SE3,SE4")
      .then((r) => r.json())
      .then((d) => {
        if (d.zones) {
          const zones = d.zones.map((z: any) => ({
            zone_code: z.zone_code || z.zone || "",
            zone_name: z.zone_name || z.zone || "",
            avg_eur_mwh: z.stats?.avg ?? 0,
          }));
          setSpotZones(zones);
          // Set slider to SE3 average
          const se3 = zones.find((z: SpotZone) => z.zone_code === "SE3");
          if (se3) setSimSpot(Math.round(eurMwhToOre(se3.avg_eur_mwh)));
        }
      })
      .catch(() => {});
  }, []);

  const record = priceData?.records.find((r) => r.year === year);
  const years = priceData?.records.map((r) => r.year).sort() ?? [];
  const tax = record?.components.energy_tax_ore_kwh_excl_vat ?? 36;

  /* ───── Computed breakdown ───── */
  const breakdown = useMemo(() => {
    const spot = simSpot;
    const net = NETWORK_TYPICAL;
    const subtotalExVat = spot + net + tax;
    const vat = subtotalExVat * 0.25;
    const total = subtotalExVat + vat;

    // "Staten" = energiskatt + moms (moms beräknas på allt inkl skatt)
    const stateTotal = tax + vat;
    const statePct = (stateTotal / total) * 100;
    const spotPct = (spot / total) * 100;
    const netPct = (net / total) * 100;

    // Moms breakdown: moms på spot, moms på nät, moms på skatt
    const vatOnSpot = spot * 0.25;
    const vatOnNet = net * 0.25;
    const vatOnTax = tax * 0.25; // skatt-på-skatt

    return {
      spot, net, tax, vat, total, subtotalExVat,
      stateTotal, statePct, spotPct, netPct,
      vatOnSpot, vatOnNet, vatOnTax,
    };
  }, [simSpot, tax]);

  /* ───── Per-zone summary ───── */
  const zoneRows = useMemo(() => {
    if (!spotZones) return [];
    return spotZones.map((z) => {
      const spotOre = eurMwhToOre(z.avg_eur_mwh);
      const sub = spotOre + NETWORK_TYPICAL + tax;
      const vat = sub * 0.25;
      const total = sub + vat;
      const state = tax + vat;
      return { ...z, spotOre, total, state, statePct: (state / total) * 100 };
    });
  }, [spotZones, tax]);

  if (error) return <div style={{ color: "#ef4444", padding: 16 }}>{error}</div>;
  if (!priceData) return <div style={{ padding: 16, color: "#888" }}>Laddar prisstruktur…</div>;

  const th: React.CSSProperties = { textAlign: "right", padding: "6px 8px", fontSize: 12, color: "#888", borderBottom: "1px solid #333", fontWeight: 500 };
  const td: React.CSSProperties = { textAlign: "right", padding: "6px 8px", fontSize: 13, color: "#e5e5e5", borderBottom: "1px solid #222" };
  const tdL: React.CSSProperties = { ...td, textAlign: "left", color: "#ccc" };

  return (
    <section style={{ background: "#111", border: "1px solid #333", borderRadius: 8, padding: 20, marginBottom: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={{ color: "#f5f5f5", margin: 0, fontSize: 16, fontWeight: 600 }}>
          Elprisets sammansättning i siffror
        </h3>
        <div style={{ display: "flex", gap: 6 }}>
          {years.map((y) => (
            <button key={y} onClick={() => setYear(y)} style={{
              background: y === year ? "#333" : "transparent", color: y === year ? "#fff" : "#888",
              border: "1px solid #444", borderRadius: 4, padding: "2px 8px", fontSize: 12, cursor: "pointer",
            }}>{y}</button>
          ))}
        </div>
      </div>
      <p style={{ color: "#888", fontSize: 12, margin: "0 0 16px" }}>
        Alla värden i öre/kWh. Typiskt hushåll (~20 MWh/år), {year}.
      </p>

      {/* ════════ KLUMPSUMMA — Spot vs Avgifter ════════ */}
      <div style={{ background: "#0a0a0a", border: "1px solid #333", borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: "#999", marginBottom: 12, fontWeight: 500 }}>
          Vad du betalar — uppdelat
        </div>

        {/* Big numbers */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          {/* Spotpris */}
          <div style={{ flex: 1, background: "#1e293b", borderRadius: 8, padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#60a5fa", marginBottom: 4 }}>⚡ Spotpris (elhandel)</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#3b82f6" }}>{breakdown.spot.toFixed(0)}</div>
            <div style={{ fontSize: 11, color: "#888" }}>öre/kWh</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#60a5fa", marginTop: 4 }}>
              {breakdown.spotPct.toFixed(0)}%
            </div>
          </div>
          {/* Avgifter */}
          <div style={{ flex: 1, background: "#1c1917", borderRadius: 8, padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 4 }}>🏛 Avgifter (nät + skatt + moms)</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#f59e0b" }}>
              {(breakdown.net + breakdown.tax + breakdown.vat).toFixed(0)}
            </div>
            <div style={{ fontSize: 11, color: "#888" }}>öre/kWh</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#fbbf24", marginTop: 4 }}>
              {(100 - breakdown.spotPct).toFixed(0)}%
            </div>
          </div>
          {/* Total */}
          <div style={{ flex: 1, background: "#111827", borderRadius: 8, padding: 12, textAlign: "center", border: "1px solid #333" }}>
            <div style={{ fontSize: 11, color: "#ccc", marginBottom: 4 }}>💰 Totalt</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#f5f5f5" }}>{breakdown.total.toFixed(0)}</div>
            <div style={{ fontSize: 11, color: "#888" }}>öre/kWh</div>
            <div style={{ fontSize: 14, color: "#ef4444", marginTop: 4 }}>
              varav stat: {breakdown.stateTotal.toFixed(0)} öre ({breakdown.statePct.toFixed(0)}%)
            </div>
          </div>
        </div>

        {/* Stacked bar */}
        <div style={{ display: "flex", height: 32, borderRadius: 6, overflow: "hidden", marginBottom: 4 }}>
          <div style={{ width: `${(breakdown.spot / breakdown.total) * 100}%`, background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff", fontWeight: 600 }}>
            Spot {breakdown.spot.toFixed(0)}
          </div>
          <div style={{ width: `${(breakdown.net / breakdown.total) * 100}%`, background: "#8b5cf6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff", fontWeight: 600 }}>
            Nät {breakdown.net.toFixed(0)}
          </div>
          <div style={{ width: `${(breakdown.tax / breakdown.total) * 100}%`, background: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff", fontWeight: 600 }}>
            Skatt {breakdown.tax.toFixed(0)}
          </div>
          <div style={{ width: `${(breakdown.vat / breakdown.total) * 100}%`, background: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff", fontWeight: 600 }}>
            Moms {breakdown.vat.toFixed(0)}
          </div>
        </div>
        <div style={{ fontSize: 10, color: "#666", textAlign: "right" }}>
          {breakdown.total.toFixed(1)} öre/kWh totalt
        </div>
      </div>

      {/* ════════ SIMULATOR ════════ */}
      <div style={{ background: "#0f172a", border: "1px solid #1e40af", borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#93c5fd" }}>
            🎛 Simulera: Dra i spotpriset
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#3b82f6" }}>
            {simSpot} öre/kWh
          </div>
        </div>

        {/* Slider */}
        <input
          type="range"
          min={5}
          max={300}
          step={1}
          value={simSpot}
          onChange={(e) => setSimSpot(Number(e.target.value))}
          style={{ width: "100%", accentColor: "#3b82f6", cursor: "pointer", height: 8 }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#666", marginBottom: 12 }}>
          <span>5 öre (billigt)</span>
          <span>150 öre (dyrt)</span>
          <span>300 öre (kris)</span>
        </div>

        {/* Sim results table */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={tdL}>⚡ Spotpris</td>
              <td style={td}>{breakdown.spot.toFixed(1)}</td>
              <td style={{ ...td, color: "#3b82f6" }}>{breakdown.spotPct.toFixed(1)}%</td>
            </tr>
            <tr>
              <td style={tdL}>🔌 Nätavgift</td>
              <td style={td}>{breakdown.net.toFixed(1)}</td>
              <td style={{ ...td, color: "#8b5cf6" }}>{breakdown.netPct.toFixed(1)}%</td>
            </tr>
            <tr>
              <td style={tdL}>🏛 Energiskatt</td>
              <td style={td}>{breakdown.tax.toFixed(1)}</td>
              <td style={{ ...td, color: "#ef4444" }}>{((breakdown.tax / breakdown.total) * 100).toFixed(1)}%</td>
            </tr>
            <tr>
              <td style={tdL}>📄 Moms (25% på allt)</td>
              <td style={td}>{breakdown.vat.toFixed(1)}</td>
              <td style={{ ...td, color: "#f59e0b" }}>{((breakdown.vat / breakdown.total) * 100).toFixed(1)}%</td>
            </tr>
            <tr style={{ borderTop: "2px solid #333" }}>
              <td style={{ ...tdL, fontWeight: 700, color: "#f5f5f5" }}>Totalt</td>
              <td style={{ ...td, fontWeight: 700, color: "#f5f5f5" }}>{breakdown.total.toFixed(1)}</td>
              <td style={{ ...td, color: "#888" }}>100%</td>
            </tr>
          </tbody>
        </table>

        {/* State revenue insight */}
        <div style={{ marginTop: 12, background: "#1c1917", borderRadius: 6, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#fbbf24", marginBottom: 6 }}>
            Statliga intäkter per kWh: {breakdown.stateTotal.toFixed(1)} öre ({breakdown.statePct.toFixed(0)}%)
          </div>
          <div style={{ fontSize: 12, color: "#999", lineHeight: 1.5 }}>
            <div>Energiskatt: {breakdown.tax.toFixed(1)} öre (fast)</div>
            <div>
              Moms på spotpris: {breakdown.vatOnSpot.toFixed(1)} öre
              <span style={{ color: "#ef4444" }}> ← ökar med spotpriset</span>
            </div>
            <div>Moms på nätavgift: {breakdown.vatOnNet.toFixed(1)} öre</div>
            <div>
              Moms på energiskatt: {breakdown.vatOnTax.toFixed(1)} öre
              <span style={{ color: "#888" }}> (skatt på skatt)</span>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "#666", fontStyle: "italic" }}>
            Observation: Vid spotpris {simSpot} öre är statens andel {breakdown.statePct.toFixed(0)}% av totalpriset.
            Momsen ökar proportionellt med spotpriset — högre marknadspris ger högre statlig intäkt.
          </div>
        </div>

        {/* Mini comparison: low vs high */}
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          {[20, 50, 100, 200].map((s) => {
            const sub = s + NETWORK_TYPICAL + tax;
            const v = sub * 0.25;
            const tot = sub + v;
            const st = tax + v;
            const pct = (st / tot) * 100;
            const isActive = s === simSpot;
            return (
              <div
                key={s}
                onClick={() => setSimSpot(s)}
                style={{
                  flex: 1, background: isActive ? "#1e3a5f" : "#1a1a1a",
                  border: isActive ? "1px solid #3b82f6" : "1px solid #333",
                  borderRadius: 6, padding: 8, textAlign: "center", cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 11, color: "#888" }}>Spot {s}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#f5f5f5" }}>{tot.toFixed(0)} öre</div>
                <div style={{ fontSize: 11, color: pct > 50 ? "#ef4444" : "#f59e0b" }}>
                  stat {pct.toFixed(0)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ════════ FIXED COMPONENTS TABLE ════════ */}
      <h4 style={{ color: "#ccc", fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>
        Fasta komponenter ({year})
      </h4>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Komponent</th>
            <th style={th}>Exkl moms</th>
            <th style={th}>Inkl moms (25%)</th>
            <th style={{ ...th, textAlign: "left" }}>Källa</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={tdL}>Energiskatt</td>
            <td style={td}>{tax.toFixed(1)}</td>
            <td style={td}>{(tax * 1.25).toFixed(1)}</td>
            <td style={{ ...td, textAlign: "left", fontSize: 11, color: "#888" }}>Skatteverket {year}</td>
          </tr>
          {record?.components.energy_tax_reduced_ore_kwh_excl_vat != null && (
            <tr>
              <td style={{ ...tdL, color: "#888", paddingLeft: 20, fontSize: 12 }}>— reducerad (norra Sv.)</td>
              <td style={{ ...td, color: "#888" }}>{record.components.energy_tax_reduced_ore_kwh_excl_vat.toFixed(1)}</td>
              <td style={{ ...td, color: "#888" }}>{(record.components.energy_tax_reduced_ore_kwh_excl_vat * 1.25).toFixed(1)}</td>
              <td style={{ ...td, textAlign: "left", fontSize: 11, color: "#666" }}>Avdrag 9,6 öre/kWh</td>
            </tr>
          )}
          <tr>
            <td style={tdL}>Nätavgift (typkund)</td>
            <td style={td}>22–42</td>
            <td style={td}>28–53</td>
            <td style={{ ...td, textAlign: "left", fontSize: 11, color: "#888" }}>Ei / nätägare ⚠ intervall</td>
          </tr>
          <tr>
            <td style={tdL}>Moms</td>
            <td style={td}>—</td>
            <td style={td}>25%</td>
            <td style={{ ...td, textAlign: "left", fontSize: 11, color: "#888" }}>På hela beloppet inkl skatt</td>
          </tr>
        </tbody>
      </table>

      {/* ════════ PER-ZONE TABLE ════════ */}
      {zoneRows.length > 0 && (
        <>
          <h4 style={{ color: "#ccc", fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>
            Spotpris + total per elområde (dagssnitt)
          </h4>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Zon</th>
                <th style={th}>Spot</th>
                <th style={th}>Nät</th>
                <th style={th}>Skatt</th>
                <th style={th}>Moms</th>
                <th style={{ ...th, color: "#f5f5f5", fontWeight: 700 }}>Total</th>
                <th style={{ ...th, color: "#ef4444" }}>Stat%</th>
              </tr>
            </thead>
            <tbody>
              {zoneRows.map((z, i) => (
                <tr key={z.zone_code || `zone-${i}`}>
                  <td style={tdL}>{z.zone_code}</td>
                  <td style={td}>{z.spotOre.toFixed(1)}</td>
                  <td style={td}>{NETWORK_TYPICAL}</td>
                  <td style={td}>{tax.toFixed(1)}</td>
                  <td style={td}>{((z.spotOre + NETWORK_TYPICAL + tax) * 0.25).toFixed(1)}</td>
                  <td style={{ ...td, fontWeight: 700, color: "#f5f5f5" }}>{z.total.toFixed(1)}</td>
                  <td style={{ ...td, color: z.statePct > 50 ? "#ef4444" : "#f59e0b" }}>{z.statePct.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ════════ Disclaimer + Sources ════════ */}
      <div style={{ fontSize: 10, color: "#666", marginTop: 12, fontStyle: "italic", borderTop: "1px solid #333", paddingTop: 8 }}>
        ⚠ Spotpris varierar per timme och zon. Nätavgift varierar per nätägare (22–42 öre).
        Elhandelspåslag ej inkluderat. EUR/SEK ≈ {EUR_SEK}. Alla siffror i öre/kWh.
        Observation: Momsen (25%) beräknas på hela beloppet inklusive energiskatt — högre spotpris ger högre statlig intäkt.
      </div>
      {record?.sources && (
        <div style={{ fontSize: 10, color: "#555", marginTop: 8 }}>
          {record.sources.map((s, i) => (
            <div key={i}>📄 {s.component}: {s.authority} ({s.effective_date}) — <a href={s.url} target="_blank" rel="noopener" style={{ color: "#666" }}>källa</a></div>
          ))}
        </div>
      )}
    </section>
  );
}
