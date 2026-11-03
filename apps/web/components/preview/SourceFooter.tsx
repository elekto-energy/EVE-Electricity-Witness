import { snapshot, rateFor } from "@/lib/preview/snapshot";

export function SourceFooter() {
  const s = snapshot.source;
  const fx = rateFor(snapshot.today);
  return (
    <footer className="s-footer">
      Källa: {snapshot.provider}. Datamängd <code>{s.version_id}</code> från körning {s.run_id}, manifest sha256 <code>{s.manifest_sha256}</code>.
      Tider i {snapshot.market_tz}. Timvärden är medel av fyra kvartsvärden ({snapshot.hourly_method}).
      Priserna visas i öre/kWh, omräknade från EUR/MWh med ECB:s referenskurs{fx ? ` (${fx.rate.toLocaleString("sv-SE", { maximumFractionDigits: 6 })} kr/EUR, ${fx.date})` : ""}.
      Detta är en förhandsversion.
    </footer>
  );
}
