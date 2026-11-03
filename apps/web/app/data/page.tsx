import { snapshot, SE_ZONES, NEIGHBOUR_ZONES, ZONE_LABEL, type Coverage } from "@/lib/preview/snapshot";
import { StatusBadge, DataFreshness, Pill } from "@/components/preview/Badges";
import { SourceFooter } from "@/components/preview/SourceFooter";

export const metadata = { title: "Datakvalitet (förhandsversion)" };

const STATUS_ORDER = ["COMPLETE", "PARTIAL", "IN_PROGRESS", "NOT_PUBLISHED_YET", "MISSING", "CONFLICT"];
const MEANING_SV: Record<string, string> = {
  COMPLETE: "Alla intervall för dygnet finns hos källan.",
  PARTIAL: "Källan saknar vissa intervall. De listas och fylls aldrig i.",
  IN_PROGRESS: "Flöden för pågående dygn; källan publicerar fortfarande.",
  NOT_PUBLISHED_YET: "Kommande dygn som källan ännu inte publicerat.",
  MISSING: "Inget värde för ett dygn som borde vara publicerat.",
  CONFLICT: "Källans dubbletter stämmer inte överens; de berörda intervallen visas inte.",
};
const STATUS_SV: Record<string, string> = {
  COMPLETE: "Komplett", PARTIAL: "Delvis", IN_PROGRESS: "Pågår", NOT_PUBLISHED_YET: "Ej publicerad ännu", MISSING: "Saknas", CONFLICT: "Motstridigt",
};

function Counts({ c }: { c: Coverage | null }) {
  if (!c) return <StatusBadge status="NO_RECORD" />;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
      {STATUS_ORDER.filter(s => c.status_counts[s]).map(s => (
        <span key={s} style={{ fontSize: "0.78rem" }}>
          {STATUS_SV[s]} {c.status_counts[s]}
        </span>
      ))}
    </span>
  );
}

export default function DataPage() {
  const priceRows = [...SE_ZONES, ...NEIGHBOUR_ZONES].map(z => ({ z, c: snapshot.prices[z]?.coverage ?? null }));
  const flowRows = Object.entries(snapshot.flows).flatMap(([, f]) =>
    Object.entries(f.coverage).map(([series, c]) => ({ series, c })));
  const partial = flowRows.flatMap(({ series, c }) =>
    (c?.not_complete ?? []).filter(n => n.status === "PARTIAL").map(n => ({ series, ...n })))
    .sort((a, b) => a.day.localeCompare(b.day) || a.series.localeCompare(b.series));
  const partialQuarters = partial.reduce((s, p) => s + (p.missing_intervals ?? 0), 0);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <h1 className="s-h1">Datakvalitet</h1>
        <DataFreshness publishedAtUtc={snapshot.source.published_at_utc} snapshotToday={snapshot.today} />
      </div>
      <p style={{ color: "var(--s-muted)", marginBottom: 16, maxWidth: 780, lineHeight: 1.5 }}>
        Varje dygn och serie har en status som räknas fram ur källan, inte uppskattas. Saknade intervall fylls aldrig i.
        Täckning från {snapshot.history_start} till och med {snapshot.window.last}.
      </p>

      <div className="s-section">
        <div className="s-section-head"><div className="s-h2">Vad statusarna betyder</div></div>
        <table className="s-table">
          <tbody>
            {STATUS_ORDER.map(s => (
              <tr key={s}><td style={{ width: 200 }}><StatusBadge status={s} /></td><td style={{ fontFamily: "inherit" }}>{MEANING_SV[s]}</td></tr>
            ))}
            <tr><td><Pill tone="warn">Ej verifierad</Pill></td><td style={{ fontFamily: "inherit" }}>Komplett data från en vald källserie, men utanför perioden där valet är verifierat mot en oberoende källa.</td></tr>
          </tbody>
        </table>
      </div>

      <div className="s-section">
        <div className="s-section-head"><div className="s-h2">Priser per elområde (dygn)</div></div>
        <div style={{ overflowX: "auto" }}>
          <table className="s-table">
            <thead><tr><th>Område</th><th>Från</th><th>Till</th><th>Status</th><th>Ej verifierade dygn</th><th>Öppna fel</th></tr></thead>
            <tbody>
              {priceRows.map(({ z, c }) => (
                <tr key={z}>
                  <td>{ZONE_LABEL[z] ?? z}</td><td>{c?.first_day ?? "–"}</td><td>{c?.last_day ?? "–"}</td>
                  <td><Counts c={c} /></td>
                  <td>{c?.selection_unverified?.length ? c.selection_unverified.join(", ") : "–"}</td>
                  <td>{c ? c.open_errors.length : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="s-section">
        <div className="s-section-head"><div className="s-h2">Fysiska flöden per riktning (dygn)</div></div>
        <div style={{ overflowX: "auto" }}>
          <table className="s-table">
            <thead><tr><th>Riktning</th><th>Från</th><th>Till</th><th>Status</th><th>Saknade kvart</th><th>Öppna fel</th></tr></thead>
            <tbody>
              {flowRows.map(({ series, c }) => (
                <tr key={series}>
                  <td>{series.replace(">", " → ")}</td><td>{c?.first_day ?? "–"}</td><td>{c?.last_day ?? "–"}</td>
                  <td><Counts c={c} /></td><td>{c ? c.missing_intervals_total : "–"}</td><td>{c ? c.open_errors.length : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="s-section">
        <div className="s-section-head">
          <div className="s-h2">Dygn där källan saknar intervall</div>
          <span style={{ fontSize: "0.8rem", color: "var(--s-muted)" }}>{partial.length} dygn, {partialQuarters} kvart</span>
        </div>
        {partial.length === 0 ? <p style={{ color: "var(--s-muted)" }}>Inga delvisa dygn.</p> : (
          <div style={{ overflowX: "auto", maxHeight: 420 }}>
            <table className="s-table">
              <thead><tr><th>Dygn</th><th>Riktning</th><th>Saknade kvart</th></tr></thead>
              <tbody>
                {partial.map(p => (
                  <tr key={p.series + p.day}><td>{p.day}</td><td>{p.series.replace(">", " → ")}</td><td>{p.missing_intervals ?? "–"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SourceFooter />
    </div>
  );
}
