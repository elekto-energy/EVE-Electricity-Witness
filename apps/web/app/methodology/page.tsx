export default function MethodologyPage() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📐 EVE Electricity Witness — Metodbeskrivning</h1>
        <p className="page-subtitle">
          Deterministisk dekomposition av nordiska elpriser. Observation + algebra. Inga modellparametrar i DDM.
          Proxy-beräkningar (PMM) visas separat med tydlig markering.
        </p>
      </div>

      {/* ── DDM v1.1 — Deterministic Decomposition Model ── */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: "4px" }}>DDM v1.1 — Deterministic Decomposition Model</div>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "16px" }}>
          Status: FINAL &nbsp;|&nbsp; Scope: Day-Ahead zonprisdekomposition &nbsp;|&nbsp; Mode: Witness (ingen kausal tolkning)
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Formel</th>
              <th>Beskrivning</th>
              <th>Enhet</th>
              <th>Källa</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>F1</td>
              <td>Zonpris(t) = Systempris(t) + InternPrisDiff(t)</td>
              <td>Zonprisdekomposition. Gäller endast när Systempris(t) är observerat.</td>
              <td>EUR/MWh</td>
              <td>A44 + SYS</td>
            </tr>
            <tr>
              <td>F2</td>
              <td>InternPrisDiff(t) = Zonpris(t) − Systempris(t)</td>
              <td>Observerad prisdifferens. Null ersätts aldrig med 0.</td>
              <td>EUR/MWh</td>
              <td>A44 + SYS</td>
            </tr>
            <tr>
              <td>F3</td>
              <td>Andel(t) = InternPrisDiff(t) / Zonpris(t)</td>
              <td>Andel av zonpris hänförbar till intern prisdifferens.</td>
              <td>%</td>
              <td>Härledd</td>
            </tr>
            <tr>
              <td>F4</td>
              <td>PrisDelta(a→b, t) = Pris_b(t) − Pris_a(t)</td>
              <td>Gränsprisdifferens. Ren differens — ingen max()-funktion i prisvisning.</td>
              <td>EUR/MWh</td>
              <td>A44</td>
            </tr>
            <tr>
              <td>F5</td>
              <td>Gränsintäkt(a→b, t) = max(0, ΔPris) × Flöde(a→b, t)</td>
              <td>Flaskhalsintäkt per timme. max(0) används <em>endast här</em>, per EU CACM/FCA.</td>
              <td>EUR/h</td>
              <td>A44 + A11</td>
            </tr>
            <tr>
              <td>F6</td>
              <td>Nettoimport(z, t) = Σ inflöde(t) − Σ utflöde(t)</td>
              <td>Fysisk nettoimport per zon och timme.</td>
              <td>MW</td>
              <td>A11</td>
            </tr>
            <tr>
              <td>F7</td>
              <td>Medelvärde = Σ pris_t / n</td>
              <td>Periodmedel. Ingen viktning om ej explicit angiven.</td>
              <td>EUR/MWh</td>
              <td>Härledd</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── DDM §5 — Systempris saknas ── */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: "8px" }}>DDM §5 — När Systempris saknas</div>
        <ul style={{ color: "var(--text-secondary)", fontSize: "0.85rem", lineHeight: "1.9", paddingLeft: "20px" }}>
          <li>InternPrisDiff(t) = <code>null</code></li>
          <li>Andel(t) = <code>null</code></li>
          <li>Ingen zondekomposition visas</li>
          <li>Ingen proxy används i DDM</li>
          <li>Proxy-modeller klassificeras separat under PMM och ingår ej i DDM v1.1</li>
        </ul>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "8px" }}>
          DDM v1.1 är matematiskt sluten, regulatoriskt korrekt och deterministiskt definierad. Ändras ej utan
          methodology_version → v1.2, tydlig changelog och hash-bump.
        </p>
      </div>

      {/* ── PMM — Proxy Model Module ── */}
      <div className="card" style={{ borderLeft: "3px solid #eab308" }}>
        <div className="card-title" style={{ marginBottom: "4px" }}>
          PMM v1.0 — Proxy Model Module
          <span style={{ marginLeft: "8px", padding: "1px 6px", borderRadius: 3, fontSize: "0.7rem", fontWeight: 600, background: "rgba(234,179,8,0.12)", color: "#eab308", border: "1px solid rgba(234,179,8,0.25)" }}>MODELL</span>
        </div>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "12px" }}>
          Aktiveras automatiskt när SYS-data saknas (historisk data pre-2026).
          PMM är en modellberäkning — inte observation.
        </p>
        <table className="data-table">
          <thead>
            <tr><th>Formel</th><th>Beskrivning</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>S*(t) = Σ w_z × Pris_z(t)</td>
              <td>Modellberäknat systempris (viktat medelvärde av SE1–SE4 zonpriser)</td>
            </tr>
            <tr>
              <td>InternDiff*(t) = Zonpris(t) − S*(t)</td>
              <td>Modellberäknad intern prisdifferens (proxy)</td>
            </tr>
          </tbody>
        </table>
        <div style={{ marginTop: "12px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          <strong>Visuell markering i UI:</strong>
        </div>
        <ul style={{ color: "var(--text-secondary)", fontSize: "0.85rem", lineHeight: "1.9", paddingLeft: "20px" }}>
          <li>Diagonala ränder (stripes) på stapelsegment</li>
          <li>Gul kant på PMM-segment — aldrig DDM-orange (#f97316)</li>
          <li>Asterisk (*) i alla etiketter</li>
          <li>PMM-badge visas i headern</li>
          <li>Tooltip: &quot;Systempris beräknas enligt PMM. Motsvarar inte Nord Pools officiella systempris (SYS).&quot;</li>
          <li>PMM och DDM blandas aldrig visuellt — en screenshot avslöjar alltid modellstatus</li>
        </ul>
      </div>

      {/* ── Konsumentprisberäkning ── */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: "8px" }}>Konsumentprisberäkning</div>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "12px" }}>
          &quot;Vad du betalar per kWh&quot; — total elpris inklusive avgifter.
        </p>
        <table className="data-table">
          <thead>
            <tr><th>Steg</th><th>Formel</th><th>Beskrivning</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>Spotpris (kr/kWh) = Zonpris (EUR/MWh) × EUR/SEK / 1000</td>
              <td>Valutakonvertering + enhetsbyte. EUR/SEK från ECB.</td>
            </tr>
            <tr>
              <td>2</td>
              <td>Subtotal = Spotpris + Nätavgift + Energiskatt</td>
              <td>Nätavgift: 0.32 kr/kWh. Energiskatt: 0.36 kr/kWh (2021–).</td>
            </tr>
            <tr>
              <td>3</td>
              <td>Moms = Subtotal × 25%</td>
              <td>Svensk mervärdesskatt.</td>
            </tr>
            <tr>
              <td>4</td>
              <td>Totalt elpris = Subtotal + Moms</td>
              <td>Visas i header, stapel och donut.</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── El vs Avgifter (donut) ── */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: "8px" }}>El vs Avgifter — Donut &amp; Stapel</div>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "12px" }}>
          Stapel och donut visar identisk dekomposition. Tre segment:
        </p>
        <table className="data-table">
          <thead>
            <tr><th>Segment</th><th>Färg</th><th>Beräkning</th><th>Källa</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>El (systempris)</td>
              <td style={{ color: "#22c55e" }}>■ Grön</td>
              <td>Systempris i kr/kWh</td>
              <td>DDM (SYS) eller PMM (S*)</td>
            </tr>
            <tr>
              <td>Överföring (flaskhals)</td>
              <td><span style={{ color: "#f97316" }}>■ Orange (DDM)</span> / <span style={{ color: "#eab308" }}>■ Gul (PMM)</span></td>
              <td>Zonpris − Systempris, clamped ≥ 0</td>
              <td>DDM: F2. PMM: InternDiff*</td>
            </tr>
            <tr>
              <td>Avgifter (nät/skatt/moms)</td>
              <td style={{ color: "#ef4444" }}>■ Röd</td>
              <td>Nätavgift + Energiskatt + Moms</td>
              <td>Lagstadgad</td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "8px" }}>
          DDM: solid färger. PMM: diagonala ränder + gul kant + asterisk.
          Segment summerar alltid till totalt elpris (= header-värdet).
        </p>
      </div>

      {/* ── Datakällor ── */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: "12px" }}>Datakällor</div>
        <table className="data-table">
          <thead>
            <tr><th>ID</th><th>Källa</th><th>Innehåll</th></tr>
          </thead>
          <tbody>
            <tr><td>A44</td><td>ENTSO-E Transparency Platform</td><td>Day-Ahead zonpriser (EUR/MWh)</td></tr>
            <tr><td>SYS</td><td>Nord Pool</td><td>Nordiskt systempris, area SYS</td></tr>
            <tr><td>A11</td><td>ENTSO-E Transparency Platform</td><td>Fysiska gränsflöden (MW)</td></tr>
            <tr><td>A75</td><td>ENTSO-E Transparency Platform</td><td>Produktion per typ (MW)</td></tr>
            <tr><td>ECB</td><td>Europeiska centralbanken</td><td>EUR/SEK referenskurs (daglig)</td></tr>
            <tr><td>TAX</td><td>Svensk lagstiftning</td><td>Energiskatt (öre/kWh)</td></tr>
            <tr><td>NET</td><td>Nätoperatör</td><td>Nätavgift (öre/kWh)</td></tr>
          </tbody>
        </table>
      </div>

      {/* ── Datahanteringsregler ── */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: "8px" }}>Datahantering</div>
        <ul style={{ color: "var(--text-secondary)", fontSize: "0.85rem", lineHeight: "1.9", paddingLeft: "20px" }}>
          <li>Alla observationer lagras med <code>dataset_eve_id</code>, <code>retrieved_at</code>, <code>raw_hash</code>, <code>canonical_hash</code></li>
          <li>Null ersätts aldrig med 0</li>
          <li>Ingen interpolation tillämpas — saknade observationer rapporteras som <code>null</code></li>
          <li>Valutakonvertering sker post-ingest med ECB-kurs</li>
          <li>Alla beräkningar är deterministiska: observation + algebra</li>
          <li><code>methodology_version</code> inkluderas i varje <code>query_hash</code></li>
        </ul>
      </div>

      {/* ── Trinity Rules ── */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: "12px" }}>Trinity Rules</div>
        <table className="data-table">
          <thead>
            <tr><th>Regel</th><th>Beskrivning</th></tr>
          </thead>
          <tbody>
            <tr><td>TR1</td><td>No source, no number — inget värde utan källhänvisning</td></tr>
            <tr><td>TR2</td><td>Ingest → manifest + SHA256 + root_hash</td></tr>
            <tr><td>TR3</td><td>Varje diagram länkas till evidence-ID</td></tr>
            <tr><td>TR4</td><td>Modelländring ⇒ methodology_version bump</td></tr>
            <tr><td>TR5</td><td>Endast mänskligt godkänd merge</td></tr>
            <tr><td>TR6</td><td>Kod genererar struktur — aldrig värden</td></tr>
            <tr><td>TR7</td><td>Witness mode — ingen tolkning</td></tr>
            <tr><td>TR8</td><td>Varje påstående måste resolve till rådata</td></tr>
            <tr><td>TR9</td><td>Proof Pack = raw + canonical + manifest + hashes</td></tr>
          </tbody>
        </table>
      </div>

      {/* ── Terminologisk avgränsning ── */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: "8px" }}>Terminologi &amp; juridisk avgränsning</div>
        <ul style={{ color: "var(--text-secondary)", fontSize: "0.85rem", lineHeight: "1.9", paddingLeft: "20px" }}>
          <li><strong>Intern prisdifferens</strong> — observerad prisskillnad mellan zonpris och nordiskt systempris. Motsvarar regulatoriskt begrepp &quot;flaskhalsintäkt&quot; / &quot;congestion rent&quot;.</li>
          <li><strong>Gränsintäkt</strong> — definieras per EU-förordning (CACM/FCA) som max(0, Δpris) × flöde.</li>
          <li><strong>PMM-proxy</strong> — modellberäknat systempris. Är <em>inte</em> Nord Pools officiella SYS.</li>
        </ul>
        <div style={{ marginTop: "12px", padding: "12px 16px", background: "var(--bg-card-hover)", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: "1.7" }}>
          Analysen beskriver observerade prisrelationer. Inga slutsatser om orsak, motiv eller ansvar görs.
          Korrelation tolkas inte som avsikt. Informationen utgör inte finansiell, juridisk eller regulatorisk rådgivning.
        </div>
      </div>

      {/* ── Version ── */}
      <div className="card" style={{ textAlign: "center" }}>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          DDM v1.1 (FINAL) &nbsp;|&nbsp; PMM v1.0 (SE_STATIC_LOAD) &nbsp;|&nbsp; EVE Electricity Witness &nbsp;|&nbsp; Organiq Sweden AB
        </p>
      </div>
    </div>
  );
}
