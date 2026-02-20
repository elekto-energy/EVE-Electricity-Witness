import PriceCompositionPanel from "@/components/price/PriceCompositionPanel";
import CongestionRevenuePanel from "@/components/price/CongestionRevenuePanel";
import ProducerFinancialsPanel from "@/components/price/ProducerFinancialsPanel";
import SpotDashboard from "@/components/energy/SpotDashboard";
import EnergyIntelPanel from "@/components/price/EnergyIntelPanel";


export const metadata = {
  title: "Elpris idag — Spotpris, elskatt, flaskhalsintäkter & elräkning uppdelad",
  description:
    "Se hela elräkningen uppdelad: spotpris per timme, nätavgift, energiskatt, moms. " +
    "Flaskhalsintäkter i miljarder — vart går pengarna? Producentresultat, CO₂-utsläpp och " +
    "elproduktion per kraftslag. SE1–SE4 med källor från ENTSO-E, Ei och Nord Pool.",
};

export default function PriceStructurePage() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>

      {/* Spot Dashboard — full V3 with interactive chart */}
      <SpotDashboard />

      {/* Divider */}
      <div style={{ borderTop: "1px solid var(--border-color)", margin: "32px 0 24px" }} />

      {/* EVE Energipanel — allt i ett fönster */}
      <div id="energy-intel" style={{ marginBottom: 24 }}>
        <EnergyIntelPanel />
      </div>

      {/* Prisstruktur sections */}
      <h2 style={{ color: "var(--text-primary)", fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
        Prisstruktur &amp; Kostnadsanalys
      </h2>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
        Tre separata lager — vad hushållet betalar, prisområdesdifferenser (SvK/BC), producentresultat.
        Inga slutsatser. Inga motiv. Bara data och källa.
      </p>

      {/* Taxonomy notice */}
      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-color)",
        borderLeft: "3px solid #fbbf24",
        borderRadius: 8,
        padding: 12,
        marginBottom: 24,
        fontSize: 12,
        color: "var(--text-secondary)",
      }}>
        <strong style={{ color: "#fbbf24" }}>Taxonomi:</strong> Tre kostnadslager visas separat och blandas aldrig.{" "}
        <strong>A)</strong> Hushållets elräkning (spot + nät + skatt + moms) ·{" "}
        <strong>B)</strong> Prisområdesdifferenser &amp; flaskhalsintäkter (SvK/BC) ·{" "}
        <strong>C)</strong> Producentresultat (generation).
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
      <section id="methodology" style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: 8, padding: 20 }}>
        <h3 style={{ color: "var(--text-primary)", margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>
          Metodik
        </h3>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          <p style={{ margin: "0 0 8px" }}>
            <strong style={{ color: "var(--text-primary)" }}>Datakällor:</strong> ENTSO-E (spotpriser, generation, flöden), Open-Meteo/ERA5 (väder),
            EEA 2023 (emissionsfaktorer), Skatteverket (energiskatt, moms),
            Energimarknadsinspektionen (prisområdesdifferenser, nätavgifter), bolagsrapporter (producentresultat).
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <strong style={{ color: "var(--text-primary)" }}>Tidsupplösning:</strong> Timvis (spot, generation, CO₂, väder), årsvis (skatt, prisområdesintäkter, finansiella).
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <strong style={{ color: "var(--text-primary)" }}>CO₂-metodik:</strong> Produktions-CO₂ beräknas som viktat medel av emissionsfaktorer (EEA 2023, Scope 1).
            Konsumtions-CO₂ justeras för import med EU-medel 242 g/kWh.
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <strong style={{ color: "var(--text-primary)" }}>Språkpolicy:</strong> Inga påståenden om motiv. Inga formuleringar som
            &ldquo;staten tjänar på&rdquo;. Korrelation ≠ avsikt. Alla siffror har källhänvisning.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: "var(--text-primary)" }}>Verifiering:</strong> All data kryptografiskt sealad i X-Vault (SHA-256, WORM).
            Dataset-ID och root-hash visas per vy.
          </p>
        </div>
      </section>
    </main>
  );
}
