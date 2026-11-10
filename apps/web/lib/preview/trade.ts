/**
 * Sweden's cross-border trade for one day, from measured physical flows (A11, hourly net) on the 11 external borders,
 * with the generation mix (A75) of the zone the electricity leaves, for the same hour.
 *
 * - Volumes: sum of measured hourly net MW = MWh (one hour each). Unmeasured hours are left out, never filled.
 * - "Fossil" = the ENTSO-E types named "Fossil ..." (see GEN_GROUPS). "Other" includes Sweden's unspecified B20.
 * - The origin mix is the average production mix of the exporting zone in that hour: an approximation (electricity
 *   is not traceable, transit is possible). Shares only; no emission factors.
 * - An hour whose origin zone has no fully measured mix for that exact hour counts as "unknown mix" (no fallback hour).
 */

import { GEN_GROUP_ORDER, generationMix, type Snapshot } from "./snapshot";

const SE = new Set(["SE1", "SE2", "SE3", "SE4"]);

export const COUNTRY_OF: Record<string, string> = {
  FI: "FI", NO1: "NO", NO3: "NO", NO4: "NO", DK1: "DK", DK2: "DK", DE_LU: "DE", PL: "PL", LT: "LT",
};
export const COUNTRY_NAME: Record<string, string> = {
  NO: "Norge", FI: "Finland", DK: "Danmark", DE: "Tyskland", PL: "Polen", LT: "Litauen",
};

export interface MixShare { fossil: number; other: number } // MWh attributed to fossil / other in the origin mix

export interface TradeSide {
  mwh: number;            // measured volume
  knownMwh: number;       // part of it with a measured origin mix for the same hour
  fossilMwh: number;      // knownMwh x fossil share of the origin zone, summed per hour
  otherMwh: number;       // knownMwh x "other" share (incl. unspecified)
}

export interface CountryTrade { country: string; name: string; imp: TradeSide; exp: TradeSide }

export interface HourTrade { hour: string; importMw: number; exportMw: number; importFossilPct: number | null; exportFossilPct: number | null }

export interface DayTrade {
  day: string;
  hoursMeasured: number;  // hours with a measured value on at least one external border
  imp: TradeSide;
  exp: TradeSide;
  byCountry: CountryTrade[];
  hours: HourTrade[];
}

const side = (): TradeSide => ({ mwh: 0, knownMwh: 0, fossilMwh: 0, otherMwh: 0 });

function originShares(snapshot: Snapshot, zone: string, day: string, hour: string): { fossil: number; other: number } | null {
  const m = generationMix(snapshot, zone, day, hour);
  if (!m || !m.requested_hour_measured) return null;     // exact hour only
  const total = GEN_GROUP_ORDER.reduce((s, g) => s + Math.max(0, m.groups[g]), 0);
  if (total <= 0) return null;
  return { fossil: Math.max(0, m.groups.fossil) / total, other: Math.max(0, m.groups.other) / total };
}

function add(s: TradeSide, mwh: number, sh: { fossil: number; other: number } | null) {
  s.mwh += mwh;
  if (sh) { s.knownMwh += mwh; s.fossilMwh += mwh * sh.fossil; s.otherMwh += mwh * sh.other; }
}

export function tradeForDay(snapshot: Snapshot, day: string): DayTrade {
  const imp = side(), exp = side();
  const countries = new Map<string, CountryTrade>();
  const hourMap = new Map<string, { importMw: number; exportMw: number; impF: number; impK: number; expF: number; expK: number }>();

  for (const f of Object.values(snapshot.flows)) {
    const seSide = SE.has(f.from) ? f.from : SE.has(f.to) ? f.to : null;
    const foreign = SE.has(f.from) ? f.to : f.from;
    if (!seSide || SE.has(foreign)) continue;               // internal Swedish links are not trade
    const c = COUNTRY_OF[foreign];
    if (!c) continue;
    if (!countries.has(c)) countries.set(c, { country: c, name: COUNTRY_NAME[c], imp: side(), exp: side() });
    const ct = countries.get(c)!;
    const hourly = (f.days.find(d => d.day === day)?.hourly_net ?? []) as [string, number][];
    for (const [hour, net] of hourly) {
      // net > 0 = from -> to
      const fromSe = (net >= 0) === (f.from === seSide);
      const mwh = Math.abs(net);
      const h = hourMap.get(hour) ?? { importMw: 0, exportMw: 0, impF: 0, impK: 0, expF: 0, expK: 0 };
      if (fromSe) {
        const sh = originShares(snapshot, seSide, day, hour);
        add(exp, mwh, sh); add(ct.exp, mwh, sh);
        h.exportMw += mwh; if (sh) { h.expK += mwh; h.expF += mwh * sh.fossil; }
      } else {
        const sh = originShares(snapshot, foreign, day, hour);
        add(imp, mwh, sh); add(ct.imp, mwh, sh);
        h.importMw += mwh; if (sh) { h.impK += mwh; h.impF += mwh * sh.fossil; }
      }
      hourMap.set(hour, h);
    }
  }

  const order = ["NO", "FI", "DK", "DE", "PL", "LT"];
  const hours = [...hourMap.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([hour, h]) => ({
    hour, importMw: h.importMw, exportMw: h.exportMw,
    importFossilPct: h.impK > 0 ? (h.impF / h.impK) * 100 : null,
    exportFossilPct: h.expK > 0 ? (h.expF / h.expK) * 100 : null,
  }));
  return {
    day, hoursMeasured: hours.length, imp, exp, hours,
    byCountry: [...countries.values()].sort((a, b) => order.indexOf(a.country) - order.indexOf(b.country)),
  };
}

/** Fossil share (%) of the part of a side whose origin mix is known; null when nothing is known. */
export const fossilPct = (s: TradeSide) => (s.knownMwh > 0 ? (s.fossilMwh / s.knownMwh) * 100 : null);
export const otherPct = (s: TradeSide) => (s.knownMwh > 0 ? (s.otherMwh / s.knownMwh) * 100 : null);
