/**
 * Golden test: Spot day-ahead API output determinism.
 * Uses the frozen golden fixture from data/canonical/_golden/se3_dayahead_20250213.json.
 *
 * Gate B: If series merge changes, this test fails.
 */

import { computeStats, getZoneDaySeries } from "../readCanonical";

// Golden fixture: SE3 period 1 prices from verified ENTSO-E ingest
const GOLDEN_SE3_PRICES = [
  68.78, 54.79, 46.37, 45.98, 46.02, 59.06, 93.5, 130.75,
  150.53, 159.2, 145.03, 133.8, 131.16, 103.93, 103.19, 103.18,
  115.81, 144.55, 157.15, 147.57, 129.41, 119.9, 98.39, 96.25,
];

describe("Spot golden tests", () => {
  test("computeStats produces correct output for SE3 golden data", () => {
    const stats = computeStats(GOLDEN_SE3_PRICES);

    // Golden values: verified against manual calculation
    expect(stats.avg).toBeCloseTo(107.68, 1);
    expect(stats.min).toBe(45.98);
    expect(stats.max).toBe(159.2);
  });

  test("computeStats handles empty array", () => {
    const stats = computeStats([]);
    expect(stats.avg).toBe(0);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
  });

  test("getZoneDaySeries filters and deduplicates correctly", () => {
    // Simulate two overlapping periods (as ENTSO-E returns)
    const mockRecords = [
      {
        zone_code: "SE3",
        zone_eic: "10Y1001A1001A46L",
        zone_name: "Stockholm",
        country: "SE",
        period_start: "2025-02-12T23:00Z",
        period_end: "2025-02-13T23:00Z",
        resolution: "PT60M",
        currency: "EUR",
        unit: "MWH",
        prices: [
          { position: 1, price_eur_mwh: 68.78 },
          { position: 2, price_eur_mwh: 54.79 },
        ],
        evidence_id: "test",
        source: { name: "test", publisher: "test", dataset_id: "test", uri: "test" },
        fetched_at_utc: "2026-02-15T00:00:00Z",
      },
      {
        zone_code: "SE3",
        zone_eic: "10Y1001A1001A46L",
        zone_name: "Stockholm",
        country: "SE",
        period_start: "2025-02-13T23:00Z",
        period_end: "2025-02-14T23:00Z",
        resolution: "PT60M",
        currency: "EUR",
        unit: "MWH",
        prices: [
          { position: 1, price_eur_mwh: 115.1 },
        ],
        evidence_id: "test2",
        source: { name: "test", publisher: "test", dataset_id: "test", uri: "test" },
        fetched_at_utc: "2026-02-15T00:00:00Z",
      },
    ];

    // Request 2025-02-13 — first period covers 23:00 Feb 12 to 23:00 Feb 13 (UTC)
    // Position 1 = 2025-02-12T23:00Z (NOT Feb 13)
    // Position 2 = 2025-02-13T00:00Z (IS Feb 13)
    const { series } = getZoneDaySeries(mockRecords, "SE3", "2025-02-13");

    // Position 2 of period 1 = 2025-02-13T00:00Z → included
    // Position 1 of period 2 = 2025-02-13T23:00Z → included
    expect(series.length).toBe(2);
    expect(series[0].price).toBe(54.79);
    expect(series[1].price).toBe(115.1);
  });

  test("getZoneDaySeries returns empty for unknown zone", () => {
    const { series } = getZoneDaySeries([], "XX", "2025-01-01");
    expect(series).toEqual([]);
  });
});
