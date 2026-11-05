import { rateFor, type Snapshot } from "@/lib/preview/snapshot";
import type { LoadedSnapshot } from "@/lib/preview/load";

export function SourceFooter({ snapshot, loaded }: { snapshot: Snapshot; loaded?: LoadedSnapshot }) {
  const s = snapshot.source;
  const fx = rateFor(snapshot, snapshot.today);
  return (
    <footer className="s-footer">
      Källa: {snapshot.provider}. Datamängd <code>{s.version_id}</code> från körning {s.run_id}, manifest sha256 <code>{s.manifest_sha256}</code>.
      Tider i {snapshot.market_tz}. Timvärden är medel av fyra kvartsvärden ({snapshot.hourly_method}).
      Priserna visas i öre/kWh, omräknade från EUR/MWh med ECB:s referenskurs{fx ? ` (${fx.rate.toLocaleString("sv-SE", { maximumFractionDigits: 6 })} kr/EUR, ${fx.date})` : ""}.
      {loaded ? (loaded.origin === "blob"
        ? <> Sidans data lästes från datalagret och kontrollerades mot sha256 <code>{loaded.sha256}</code>.</>
        : <> Sidans data är den inbyggda versionen, eftersom datalagret inte kunde användas.</>) : null}
      {" "}Detta är en förhandsversion.
    </footer>
  );
}
