import { snapshot } from "@/lib/preview/snapshot";

export function SourceFooter() {
  const s = snapshot.source;
  return (
    <footer className="s-footer">
      Källa: {snapshot.provider}. Datamängd <code>{s.version_id}</code> från körning {s.run_id}, manifest sha256 <code>{s.manifest_sha256}</code>.
      Tider i {snapshot.market_tz}. Timvärden är medel av fyra kvartsvärden ({snapshot.hourly_method}).
      Priserna visas i EUR/MWh; omräkning till öre/kWh kräver en valutakurs och ingår inte ännu.
      Detta är en förhandsversion och inte elmonitor.se.
    </footer>
  );
}
