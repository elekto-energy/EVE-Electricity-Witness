/**
 * GET /api/witness/price-structure
 *
 * Returns all three price structure datasets:
 * 1. price_breakdown (tax/network/spot components)
 * 2. congestion_revenue (flaskhalsintäkter)
 * 3. producer_financials (placeholder for v2)
 *
 * Witness-mode: no interpretation, no motive attribution.
 * CODEFACTORY scope.
 */

import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps/web") || cwd.endsWith("apps\\web")) {
    return resolve(cwd, "../..");
  }
  return cwd;
}

const ROOT = getProjectRoot();

function loadJson(relPath: string): any {
  const p = resolve(ROOT, relPath);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8"));
}

export async function GET() {
  const priceBreakdown = loadJson("data/canonical/prices/price_breakdown_v1.json");
  const congestion = loadJson("data/canonical/congestion/congestion_revenue_v1.json");
  const spotAnnual = loadJson("data/canonical/prices/spot_price_annual_v1.json");
  const weatherAnnual = loadJson("data/canonical/weather/weather_annual_combined.json");

  // Producer financials placeholder
  const producerFinancials = {
    status: "pending_v2",
    note: "Requires PDF ingest of annual reports (Vattenfall, Fortum). Not yet available.",
  };

  return NextResponse.json({
    price_breakdown: priceBreakdown,
    congestion_revenue: congestion,
    spot_annual: spotAnnual,
    producer_financials: producerFinancials,
    weather_annual: weatherAnnual,
    methodology: {
      language_policy: "No motive attribution. Correlation ≠ intention.",
      taxonomy_rule: "Retail ≠ Generation ≠ System Operator. Never mix in same view.",
      legal_note: "No statements like 'staten tjänar på…'. Only: 'statliga intäkter som korrelerar med prisnivå'.",
    },
  });
}
