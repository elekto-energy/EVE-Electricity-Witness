import PriceCompositionPanel from "@/components/price/PriceCompositionPanel";
import CongestionRevenuePanel from "@/components/price/CongestionRevenuePanel";
import ProducerFinancialsPanel from "@/components/price/ProducerFinancialsPanel";
import SpotDashboard from "@/components/energy/SpotDashboard";


export const metadata = {
  title: "Energidata & Prisstruktur | EVE Witness",
  description: "Spotpris, CO₂, väder, produktion, flaskhalsintäkter och producentresultat — utan tolkning.",
};

export default function PriceStructurePage() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>

      {/* Spot Dashboard — full V3 with interactive chart */}
      <SpotDashboard />

      {/* Divider */}
      <div style={{ borderTop: "1px solid var(--border-color)", margin: "32px 0 24px" }} />

      {/* Prisstruktur sections */}
      <h2 style={{ color: "#f5f5f5", fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
        Prisstruktur & Intäktsbarometer
      </h2>
      <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
        Tre separata lager — elräkningens uppdelning, flaskhalsintäkter, producentresultat.
        Inga slutsatser. Inga motiv. Bara data och källa.
      </p>

      {/* Taxonomy notice */}
      <div style={{
        background: "#1c1917",
        border: "1px solid #44403c",
        borderRadius: 8,
        padding: 12,
        marginBottom: 24,
        fontSize: 12,
        color: "#a8a29e",
      }}>
        <strong style={{ color: "#fbbf24" }}>Taxonomi:</strong> Tre intäktsflöden visas separat och blandas aldrig.{" "}
        <strong>A)</strong> Elhandel (retail) · <strong>B)</strong> Systemoperatör (Svk/BC) · <strong>C)</strong> Producenter (generation).
        Korrelation ≠ avsikt.
      </div>

      {/* Section A: Price Composition */}
      <div id="price-composition">
        <PriceCompositionPanel />
      </div>

      {/* Section B: Congestion Revenue */}
      <div id="congestion-revenue">
        <CongestionRevenuePanel />
      </div>

      {/* Section C: Producer Financials */}
      <div id="producer-financials">
        <ProducerFinancialsPanel />
      </div>

      {/* Methodology */}
      <section id="methodology" style={{ background: "#111", border: "1px solid #333", borderRadius: 8, padding: 20 }}>
        <h3 style={{ color: "#f5f5f5", margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>
          Metodik
        </h3>
        <div style={{ fontSize: 13, color: "#999", lineHeight: 1.6 }}>
          <p style={{ margin: "0 0 8px" }}>
            <strong style={{ color: "#ccc" }}>Datakällor:</strong> ENTSO-E (spotpriser, generation, flöden), Open-Meteo/ERA5 (väder),
            EEA 2023 (emissionsfaktorer), Skatteverket (energiskatt, moms),
            Energimarknadsinspektionen (flaskhalsintäkter, nätavgifter), bolagsrapporter (producentresultat).
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <strong style={{ color: "#ccc" }}>Tidsupplösning:</strong> Timvis (spot, generation, CO₂, väder), årsvis (skatt, flaskhals, finansiella).
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <strong style={{ color: "#ccc" }}>CO₂-metodik:</strong> Produktions-CO₂ beräknas som viktat medel av emissionsfaktorer (EEA 2023, Scope 1).
            Konsumtions-CO₂ justeras för import med EU-medel 242 g/kWh.
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <strong style={{ color: "#ccc" }}>Språkpolicy:</strong> Inga påståenden om motiv. Inga formuleringar som
            &ldquo;staten tjänar på&rdquo;. Korrelation ≠ avsikt. Alla siffror har källhänvisning.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: "#ccc" }}>Verifiering:</strong> All data kryptografiskt sealad i X-Vault (SHA-256, WORM).
            Dataset-ID och root-hash visas per vy.
          </p>
        </div>
      </section>
    </main>
  );
}
