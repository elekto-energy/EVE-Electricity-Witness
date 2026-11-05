/**
 * TEST ONLY - offline ENTSO-E mock installed as globalThis.fetch (no network).
 * Produces A44 (prices) and A11 (flows) documents per local day with controllable gaps,
 * duplicates/sequences, publication cut-offs, revisions and failures.
 */

import { BIDDING_ZONES } from "../../../packages/evidence/src/entsoe_zones";
import { addDays, localDayOf, localDayStartUtc } from "../../../spike/a_local_ingest/lib_v3";

const EIC_TO_ZONE: Record<string, string> = Object.fromEntries(Object.values(BIDDING_ZONES).map((z: any) => [z.eic, z.code]));
const fmt = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00.000Z`;
const iso16 = (ms: number) => new Date(ms).toISOString().slice(0, 16) + "Z";

export type FailMode = "abort" | "unauthorized" | "malformed" | "gatewayjson";

export class MockEntsoe {
  calls = 0;
  callLog: string[] = [];
  /** prices for local days after this are not published yet (no-data acknowledgement for those days). */
  priceCutoffDay = "9999-12-31";
  /** flows are published only before this instant. */
  flowsUntilMs = Number.MAX_SAFE_INTEGER;
  /** omitted A11 points: `${series}|${startIso}` (series like "SE3>SE4"). */
  gaps = new Set<string>();
  /** value overrides: `${series}|${startIso}` -> value (simulates a source revision). */
  overrides = new Map<string, number>();
  failures: { series: string; mode: FailMode; times: number }[] = [];

  install(): void { (globalThis as any).fetch = (url: string) => this.handle(url); }

  value(series: string, ms: number): number {
    const k = `${series}|${new Date(ms).toISOString()}`;
    if (this.overrides.has(k)) return this.overrides.get(k)!;
    let h = 0;
    for (const c of series) h = (h * 31 + c.charCodeAt(0)) % 1000;
    return Math.round((((ms / 900000) % 97) + h / 10) * 100) / 100;
  }

  private async handle(url: string): Promise<{ text: () => Promise<string> }> {
    const u = new URL(url);
    const doc = u.searchParams.get("documentType")!;
    const inZ = EIC_TO_ZONE[u.searchParams.get("in_Domain")!];
    const outZ = EIC_TO_ZONE[u.searchParams.get("out_Domain")!];
    const series = doc === "A44" ? inZ : `${outZ}>${inZ}`;
    this.calls++;
    this.callLog.push(`${doc} ${series} ${u.searchParams.get("periodStart")}`);
    const f = this.failures.find(x => x.series === series && x.times > 0);
    if (f) {
      f.times--;
      if (f.mode === "abort") throw new Error("This operation was aborted");
      if (f.mode === "unauthorized") return { text: async () => `<Acknowledgement_MarketDocument><Reason><code>999</code><text>Unauthorized. Missing or invalid security token.</text></Reason></Acknowledgement_MarketDocument>` };
      // Real body seen 2026-11-03 (206 bytes): ENTSO-E gateway timeout answered as JSON, not as an error status.
      if (f.mode === "gatewayjson") return { text: async () => `{"uuAppErrorMap":{"uu-gateway-router/connectTimeout":{"id":"04a7213c00f33484cb61d0ecf30d3a9d","timestamp":"2026-11-03T17:03:23.533Z","type":"error","message":"Unable to access service within time limit."}}}` };
      return { text: async () => `<html><body>Bad gateway</body></html>` };
    }
    const a = Date.parse(fmt(u.searchParams.get("periodStart")!)), b = Date.parse(fmt(u.searchParams.get("periodEnd")!));
    let ts = "";
    for (let d = localDayOf(a); localDayStartUtc(d) < b; d = addDays(d, 1)) {
      const s = localDayStartUtc(d), e = localDayStartUtc(addDays(d, 1));
      const n = (e - s) / 900000;
      if (doc === "A44") {
        if (d > this.priceCutoffDay) continue;
        const mk = (off: number, seq: string | null) => {
          let p = "";
          for (let i = 1; i <= n; i++) {
            const v = Math.round((this.value(series, s + (i - 1) * 900000) + off) * 1e6) / 1e6;
            // A03 compression: an equal consecutive value is omitted (repeat rule)
            if (i > 1 && v === Math.round((this.value(series, s + (i - 2) * 900000) + off) * 1e6) / 1e6) continue;
            p += `<Point><position>${i}</position><price.amount>${v}</price.amount></Point>`;
          }
          return `<TimeSeries><mRID>1</mRID><auction.type>A01</auction.type><businessType>A62</businessType>` +
            (seq ? `<classificationSequence_AttributeInstanceComponent.position>${seq}</classificationSequence_AttributeInstanceComponent.position>` : "") +
            `<currency_Unit.name>EUR</currency_Unit.name><price_Measure_Unit.name>MWH</price_Measure_Unit.name><curveType>A03</curveType>` +
            `<Period><timeInterval><start>${iso16(s)}</start><end>${iso16(e)}</end></timeInterval><resolution>PT15M</resolution>${p}</Period></TimeSeries>`;
        };
        if (series === "DE_LU") ts += mk(0, "1") + mk(40, "2");
        else if (series === "DK1" || series === "DK2") ts += mk(0, null) + mk(-0.000001, "2");
        else ts += mk(0, null);
      } else {
        let p = "";
        for (let i = 1; i <= n; i++) {
          const t = s + (i - 1) * 900000;
          if (t >= this.flowsUntilMs || this.gaps.has(`${series}|${new Date(t).toISOString()}`)) continue;
          p += `<Point><position>${i}</position><quantity>${Math.round(this.value(series, t) * 10)}</quantity></Point>`;
        }
        if (p) ts += `<TimeSeries><mRID>1</mRID><quantity_Measure_Unit.name>MAW</quantity_Measure_Unit.name><curveType>A01</curveType>` +
          `<Period><timeInterval><start>${iso16(s)}</start><end>${iso16(e)}</end></timeInterval><resolution>PT15M</resolution>${p}</Period></TimeSeries>`;
      }
    }
    if (!ts) return { text: async () => `<Acknowledgement_MarketDocument><Reason><code>999</code><text>No matching data found for Data item</text></Reason></Acknowledgement_MarketDocument>` };
    return { text: async () => `<?xml version="1.0"?><Publication_MarketDocument>${ts}</Publication_MarketDocument>` };
  }
}
