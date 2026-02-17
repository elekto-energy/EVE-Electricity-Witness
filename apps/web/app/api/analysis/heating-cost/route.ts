/**
 * GET /api/analysis/heating-cost
 *
 * MODEL v4: Uppvärmningssäsong (okt–mars)
 * 
 * Syfte: Visa vad det kostar att hålla 18-20°C i hemmet under uppvärmningssäsongen.
 * Ett instrument för hälsosam temperatur — folket ska slippa frysa.
 * 
 * Perioden: 1 okt – 31 mars (6 månader)
 * Ca 85% av årets värmebehov faller under dessa 6 månader (graddagsfördelning).
 *
 * Anchor: Sverige 120 kWh/m²·år → uppvärmningssäsong = 120 × 0.85 = 102 kWh/m²
 * Sverige elpris: Verifierat spotdata okt 2025–feb 2026 + prognos mars → €0.177/kWh
 * Övriga EU: Eurostat H1 2025 (helårssnitt, DC-band 2500-5000 kWh)
 * 
 * Källor:
 * - Spotdata: Elbruk.se, Elspot.nu (Nord Pool)
 * - SCB H1 2025 elpriser per förbrukningsband
 * - Energimarknadsbyrån (komponentdata: påslag, elcertifikat)
 * - Energimyndigheten Energistatistik småhus 2024
 * - Eurostat nrg_pc_204 (el H1 2025), nrg_pc_202 (gas H1 2025)
 * - Euronews/Eurostat gasdata per land H1 2025
 */

import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\web") || cwd.endsWith("apps/web")) {
    return resolve(cwd, "../..");
  }
  return cwd;
}

// ── Constants ──────────────────────────────────────────────
const AREA_M2 = 150;
const SWEDEN_HDD = 4800;
const SWEDEN_KWH_PER_M2_YEAR = 120; // kWh/m²·år levererat värmebehov
const HEATING_SEASON_SHARE = 0.85;  // Andel av årligt värmebehov okt-mars
const SWEDEN_KWH_PER_M2_SEASON = Math.round(SWEDEN_KWH_PER_M2_YEAR * HEATING_SEASON_SHARE); // = 102
const SWEDEN_BASELINE_SEASON_KWH = AREA_M2 * SWEDEN_KWH_PER_M2_SEASON; // = 15 300 kWh
const SEK_PER_EUR = 11.0;

const EFFICIENCIES: Record<string, number> = {
  direct_electric: 1.0,
  heat_pump: 3.0,    // Lab SCOP — realvärde lägre, noteras i UI
  gas_boiler: 0.92,
};

// ── Types ──────────────────────────────────────────────────
interface CountryData {
  code: string;
  name: string;
  name_en: string;
  flag: string;
  hdd: number;
  electricity_eur_kwh: number;
  electricity_price_note?: string;
  gas_eur_kwh: number | null;
  gas_note: string | null;
  heating_mix: {
    heat_pump_pct: number;
    district_heating_pct: number;
    electric_pct: number;
    gas_pct: number;
    oil_pct: number;
    other_pct: number;
    dominant: string;
    source: string;
  };
}

// ── Calculations ───────────────────────────────────────────

/**
 * Heat demand during heating season (okt-mars), scaled by HDD ratio
 */
function calcSeasonHeatDemand(hdd: number): number {
  return Math.round(SWEDEN_BASELINE_SEASON_KWH * (hdd / SWEDEN_HDD));
}

function calcScenario(
  seasonKwhHeat: number,
  scenarioId: string,
  electricityPrice: number,
  gasPrice: number | null
) {
  const isGas = scenarioId === "gas_boiler";
  const price = isGas ? gasPrice : electricityPrice;
  const eff = EFFICIENCIES[scenarioId] ?? 1.0;

  if (price === null || price === undefined) {
    return { kwh_consumed: null, cost_eur: null, cost_sek: null };
  }

  const kwhConsumed = Math.round(seasonKwhHeat / eff);
  const costEur = Math.round(kwhConsumed * price);
  const costSek = Math.round(costEur * SEK_PER_EUR);

  return { kwh_consumed: kwhConsumed, cost_eur: costEur, cost_sek: costSek };
}

// ── Handler ────────────────────────────────────────────────
export async function GET() {
  const root = getProjectRoot();
  const filePath = resolve(root, "data", "canonical", "analysis", "heating_cost_eu_v1.json");

  if (!existsSync(filePath)) {
    return NextResponse.json(
      { error: "heating_cost_eu_v1.json not found", tried: filePath },
      { status: 404 }
    );
  }

  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  const countries: CountryData[] = raw.countries;

  const results = countries.map((c) => {
    const seasonKwhHeat = calcSeasonHeatDemand(c.hdd);
    const dominant = c.heating_mix.dominant;

    const scenarios = ["direct_electric", "heat_pump", "gas_boiler"].map((sid) => {
      const calc = calcScenario(seasonKwhHeat, sid, c.electricity_eur_kwh, c.gas_eur_kwh);
      return {
        scenario_id: sid,
        scenario_label:
          sid === "direct_electric" ? "Direkt el" :
          sid === "heat_pump" ? "Värmepump (SCOP 3)" :
          "Gaspanna (η 92%)",
        is_dominant: sid === dominant,
        ...calc,
        note:
          sid === "gas_boiler" && c.gas_eur_kwh === null
            ? c.gas_note || "Ej tillgängligt"
            : null,
      };
    });

    const dominantScenario = scenarios.find((s) => s.scenario_id === dominant);

    return {
      code: c.code,
      name: c.name,
      name_en: c.name_en,
      flag: c.flag,
      hdd: c.hdd,
      season_kwh_heat_demand: seasonKwhHeat,
      electricity_eur_kwh: c.electricity_eur_kwh,
      electricity_price_note: c.electricity_price_note || null,
      gas_eur_kwh: c.gas_eur_kwh,
      heating_mix: c.heating_mix,
      dominant_scenario: dominant,
      dominant_cost_eur: dominantScenario?.cost_eur ?? null,
      dominant_cost_sek: dominantScenario?.cost_sek ?? null,
      scenarios,
    };
  });

  results.sort((a, b) => (b.dominant_cost_eur ?? 0) - (a.dominant_cost_eur ?? 0));

  return NextResponse.json({
    meta: {
      title: raw.meta.title,
      description: raw.meta.description,
      model_version: "v4",
      period: "Uppvärmningssäsong: 1 okt – 31 mars",
      purpose: "Instrument för hälsosam temperatur i hemmet. Kostnad att hålla 18-20°C så hushåll slipper frysa.",
      methodology: {
        target_temperature: "18-20°C (Folkhälsomyndigheten HSLF-FS 2024:10)",
        building: `Villa ${AREA_M2} m², normalstandard`,
        anchor: `Sverige: ${SWEDEN_KWH_PER_M2_YEAR} kWh/m²·år → ${SWEDEN_KWH_PER_M2_SEASON} kWh/m² under okt-mars (${HEATING_SEASON_SHARE * 100}%)`,
        season_heat_demand_kwh: `${SWEDEN_BASELINE_SEASON_KWH} kWh (150m² × ${SWEDEN_KWH_PER_M2_SEASON})`,
        scaling: `Övriga länder: ${SWEDEN_BASELINE_SEASON_KWH} × (land_HDD / ${SWEDEN_HDD})`,
        sweden_electricity_price: {
          value_eur_kwh: 0.177,
          value_sek_kwh: 1.95,
          breakdown: {
            spot_ore_kwh: 82.8,
            spot_note: "SE3 snitt okt 2025–feb 2026 exkl moms (Elbruk/Elspot verifierat)",
            markup_ore: 8,
            certificates_ore: 1.4,
            energy_tax_ore: 43.9,
            subtotal_excl_vat_ore: 136.1,
            vat_25pct_ore: 34.0,
            grid_variable_ore: 25,
            grid_fixed_amortized_ore: 0,
            total_ore_kwh: 195
          },
          spot_monthly_ore: {
            "okt_2025": 62.81,
            "nov_2025": 69.64,
            "dec_2025": 51.68,
            "jan_2026": 108.45,
            "feb_2026": 121.60,
            "mar_2026_prognos": "75-115 (Skellefteå Kraft)"
          },
          sources: ["Elbruk.se (2025 månadspriser)", "Elspot.nu (2026 månadspriser)", "Energimarknadsbyrån (komponentdata)", "SCB H1 2025"]
        },
        eu_electricity_prices: "Eurostat nrg_pc_204 H1 2025, DC-band (2500-5000 kWh), inkl alla skatter. Helårspris — vinterpris generellt 20-40% högre.",
        gas_prices: "Eurostat nrg_pc_202 H1 2025 hushåll inkl alla skatter",
        scop_note: "SCOP 3.0 = lab-rating. Systemverkningsgrad i praktiken ofta 2.0-2.5 pga defrost, cirkulationspumpar, varmvatten."
      },
      regulatory_basis: raw.meta.regulatory_basis,
      sek_per_eur: SEK_PER_EUR,
    },
    countries: results,
  });
}
