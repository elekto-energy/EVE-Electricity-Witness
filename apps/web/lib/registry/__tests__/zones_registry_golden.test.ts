/**
 * Golden test: Zone registry integrity.
 * Verifies zone registry returns expected zones with correct structure.
 *
 * Gate B: If registry changes, this test fails.
 */

import { loadZoneRegistry, zonesByCountry, allCountries } from "../readZoneRegistry";

describe("Zone registry golden tests", () => {
  test("registry loads non-empty zone list", () => {
    const { zones } = loadZoneRegistry();
    expect(zones.length).toBeGreaterThan(0);
  });

  test("SE zones are present with correct EIC codes", () => {
    const { zones } = loadZoneRegistry();
    const se = zones.filter(z => z.country === "SE");
    expect(se.length).toBe(4);

    const se3 = se.find(z => z.code === "SE3");
    expect(se3).toBeDefined();
    // Critical: SE3 EIC must be 46L, NOT 46J
    expect(se3!.eic).toBe("10Y1001A1001A46L");
  });

  test("all zones have required fields", () => {
    const { zones } = loadZoneRegistry();
    for (const zone of zones) {
      expect(zone.code).toBeTruthy();
      expect(zone.eic).toBeTruthy();
      expect(zone.country).toBeTruthy();
      expect(zone.name).toBeTruthy();
      expect(zone.eic).toMatch(/^10Y/);
    }
  });

  test("zonesByCountry filters correctly", () => {
    const { zones } = loadZoneRegistry();
    const se = zonesByCountry(zones, "SE");
    expect(se.length).toBe(4);
    expect(se.every(z => z.country === "SE")).toBe(true);
  });

  test("allCountries returns unique sorted list", () => {
    const { zones } = loadZoneRegistry();
    const countries = allCountries(zones);
    expect(countries.length).toBeGreaterThan(5);
    // Check sorted
    const sorted = [...countries].sort();
    expect(countries).toEqual(sorted);
    // Check unique
    expect(new Set(countries).size).toBe(countries.length);
  });

  test("evidence metadata is present", () => {
    const { evidence } = loadZoneRegistry();
    expect(evidence.manifest_id).toBeTruthy();
    expect(evidence.root_hash).toBeTruthy();
  });
});
