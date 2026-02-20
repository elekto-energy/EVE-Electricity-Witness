"use client";

/**
 * MethodologyPanel — Prisstruktur & Kostnadsanalys
 *
 * Lager 3 (förenklad) visas direkt.
 * En vertikal expander som växer djupare:
 *   Lager 1 (formell metod) → Lager 2 (regulatorisk) → Lager 4 (matematisk validering)
 *
 * Ingen navigation. Inga flikar. Bara ett expander-djup i taget.
 *
 * TR6: Code renders — never invents.
 * TR7: Observation + algebra. No interpretation.
 */

import { useState } from "react";

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:     "var(--bg-primary)",
  card:   "var(--bg-card)",
  card2:  "var(--bg-primary)",
  border: "var(--border-color)",
  text:   "var(--text-primary)",
  muted:  "var(--text-muted)",
  dim:    "var(--text-ghost)",
  amber:  "#f59e0b",
  blue:   "#3b82f6",
  green:  "#22c55e",
  orange: "#f97316",
  purple: "#a78bfa",
  red:    "#ef4444",
};

const MONO = "var(--font-mono, 'JetBrains Mono', monospace)";

// ─── Atom components ──────────────────────────────────────────────────────────

function SectionLabel({ text, color = C.blue }: { text: string; color?: string }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, letterSpacing: 2,
      textTransform: "uppercase", color, marginTop: 16, marginBottom: 8,
    }}>
      {text}
    </div>
  );
}

function SourceRow({ id, label }: { id: string; label: string }) {
  return (
    <div style={{ display: "flex", gap: 10, fontSize: 10, marginBottom: 4, alignItems: "baseline" }}>
      <span style={{ fontFamily: MONO, color: C.amber, minWidth: 32, fontWeight: 700 }}>{id}</span>
      <span style={{ color: C.muted }}>{label}</span>
    </div>
  );
}

function FormulaBox({ eq, note, accentColor = C.blue }: {
  eq: string; note?: string; accentColor?: string;
}) {
  return (
    <div style={{
      background: C.card2,
      border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: 6, padding: "8px 14px", marginBottom: 8,
    }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.text, lineHeight: 1.6 }}>{eq}</div>
      {note && (
        <div style={{ fontSize: 9, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{note}</div>
      )}
    </div>
  );
}

function RuleRow({ label, text, color = C.purple }: { label: string; text: string; color?: string }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 7, fontSize: 10 }}>
      <span style={{ fontFamily: MONO, color, fontWeight: 700, minWidth: 20, flexShrink: 0 }}>{label}</span>
      <span style={{ color: C.muted, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

function ValidationBox({ n, eq, note, color = C.green }: {
  n: number; eq: string; note: string; color?: string;
}) {
  return (
    <div style={{
      background: C.card2,
      border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 6, padding: "8px 14px", marginBottom: 8,
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color, fontWeight: 700 }}>V{n}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.text }}>{eq}</span>
      </div>
      <div style={{ fontSize: 9, color: C.muted, lineHeight: 1.5 }}>{note}</div>
    </div>
  );
}

function ExpandButton({ open, onClick, label, sub }: {
  open: boolean; onClick: () => void; label: string; sub: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", padding: "10px 0", background: "none", border: "none",
        borderTop: `1px solid ${C.border}`,
        cursor: "pointer", marginTop: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1,
          textTransform: "uppercase",
          color: open ? C.blue : C.muted,
          transition: "color .2s",
        }}>
          {label}
        </span>
        <span style={{ fontSize: 9, color: C.dim }}>{sub}</span>
      </div>
      <span style={{
        fontSize: 13, color: open ? C.blue : C.dim,
        transform: open ? "rotate(180deg)" : "none",
        transition: "transform .2s, color .2s",
        display: "inline-block",
      }}>▾</span>
    </button>
  );
}

// ─── MethodDeclaration ──────────────────────────────────────────────────────

function MethodDeclaration() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      marginBottom: 14, paddingBottom: 14,
      borderBottom: `1px solid ${C.border}`,
    }}>
      {/* Alltid synlig: kärntexten */}
      <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.7 }}>
        Denna analys beskriver observerad prisbildning på den nordiska elmarknaden baserat på
        offentligt tillgängliga datakällor. Samtliga beräkningar är deterministiska och består av
        observationer samt algebraiska operationer. Analysen innehåller inga antaganden om
        produktionskostnader, inga modellparametrar och inga kausala tolkningar.
      </div>
      <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.7, marginTop: 6 }}>
        Analysen gör inga påståenden om motiv, ansvar, avsikt eller orsaksförhållanden.
        Resultaten utgör en statistisk och matematisk dekomposition av observerade priser.
      </div>

      {/* Läs mer — avgränsning + dataintegritet */}
      <button
        onClick={() => setExpanded(p => !p)}
        style={{
          marginTop: 8, padding: 0, background: "none", border: "none",
          fontSize: 9, color: expanded ? C.blue : C.dim,
          cursor: "pointer", fontFamily: MONO,
          display: "flex", alignItems: "center", gap: 4,
          transition: "color .2s",
        }}
      >
        <span style={{
          display: "inline-block",
          transform: expanded ? "rotate(90deg)" : "none",
          transition: "transform .2s",
        }}>▸</span>
        {expanded ? "Dölj" : "Läs mer"}
      </button>

      {expanded && (
        <div style={{ marginTop: 10, animation: "meth-in .2s ease-out" }}>
          {/* Avgränsning */}
          <div style={{
            background: C.card2, border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${C.dim}`,
            borderRadius: 6, padding: "8px 14px", marginBottom: 10,
            fontSize: 9, color: C.dim, lineHeight: 1.6, fontFamily: MONO,
          }}>
            Informationen tillhandahålls i informationssyfte och utgör inte finansiell,
            juridisk eller regulatorisk rådgivning. Analysen beskriver prisstruktur och
            observerade differenser — inga påståenden om orsaksförhållanden görs.
          </div>

          {/* Dataintegritet */}
          <div style={{ fontSize: 9, color: C.dim, lineHeight: 1.7, fontFamily: MONO }}>
            Samtliga observationer lagras med datasetidentifierare och kryptografisk hash
            för att säkerställa oförändrad dataintegritet. Saknade observationer redovisas
            som null och ersätts inte med nollvärden.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Layer descriptors ───────────────────────────────────────────────────────────────────────────────

const LAYERS = [
  {
    label: "A)",
    title: "Hushållets pris per kWh",
    desc:  "Zonpris + nätavgift + energiskatt + moms 25 %. Intern prisdifferens (zon − systempris) ingår i zonpriset.",
    color: C.amber,
  },
  {
    label: "B)",
    title: "Prisområdesdifferenser & flaskhalsintäkter",
    desc:  "Prisområdesdifferens × faktiskt flöde per gräns = constraint rent (SvK/BC). EU-förordning CACM/FCA.",
    color: C.orange,
  },
  {
    label: "C)",
    title: "Producentresultat (generation)",
    desc:  "Producenternas intäkter från elproduktion. Separerat från konsumentpris och systemintäkter.",
    color: C.purple,
  },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function MethodologyPanel() {
  const [openFormal, setFormal] = useState(false);
  const [openRegul,  setRegul]  = useState(false);
  const [openMath,   setMath]   = useState(false);

  return (
    <div className="card" style={{ padding: "16px 20px" }}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>
          Prisstruktur &amp; Kostnadsanalys
        </div>
        <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
          Tre separata lager — vad hushållet betalar, prisområdesdifferenser &amp; flaskhalsintäkter (SvK/BC), producentresultat.
          Inga slutsatser. Inga motiv. Bara data och källa.
        </div>
      </div>

      {/* ── Metoddeklaration ────────────────────────────────────── */}
      <MethodDeclaration />

      {/* ── Taxonomi-box ─────────────────────────────────────────── */}
      <div style={{
        background: C.card2,
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${C.amber}`,
        borderRadius: 6, padding: "10px 14px", marginBottom: 14,
        fontSize: 11, color: C.muted, lineHeight: 1.65,
      }}>
        <span style={{ color: C.amber, fontWeight: 700 }}>Taxonomi: </span>
        Tre kostnadslager visas separat och blandas aldrig.{" "}
        <span style={{ color: C.text }}>A)</span> Hushållets elräkning
        (spot + nät + skatt + moms){" · "}
        <span style={{ color: C.text }}>B)</span> Prisområdesdifferenser &amp; flaskhalsintäkter (SvK/BC){" · "}
        <span style={{ color: C.text }}>C)</span> Producentresultat (generation).
        Korrelation ≠ avsikt.
      </div>

      {/* ── Lager 3 — Förenklad (alltid synlig) ─────────────────── */}
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, lineHeight: 1.65 }}>
        Vi delar upp elpriset i tre separata lager som hålls isär:
      </div>

      {LAYERS.map(item => (
        <div key={item.label} style={{
          display: "flex", gap: 10, marginBottom: 6,
          padding: "8px 12px", borderRadius: 6,
          background: C.card2, border: `1px solid ${C.border}`,
        }}>
          <span style={{
            fontFamily: MONO, fontSize: 11, fontWeight: 700,
            color: item.color, minWidth: 20, paddingTop: 2, flexShrink: 0,
          }}>
            {item.label}
          </span>
          <div>
            <div style={{ color: C.text, fontWeight: 600, fontSize: 11, marginBottom: 2 }}>
              {item.title}
            </div>
            <div style={{ color: C.muted, fontSize: 10, lineHeight: 1.5 }}>
              {item.desc}
            </div>
          </div>
        </div>
      ))}

      <div style={{ marginTop: 6, marginBottom: 2, fontSize: 9, color: C.dim, fontFamily: MONO }}>
        Endast observerad data. Inga antaganden. Ingen modellering.
      </div>

      {/* ═══════════════════════════════════════════════════════════
          Lager 1 — Formell metod
      ═══════════════════════════════════════════════════════════ */}
      <ExpandButton
        open={openFormal}
        onClick={() => {
          const next = !openFormal;
          setFormal(next);
          if (!next) { setRegul(false); setMath(false); }
        }}
        label="Formell metod"
        sub="Datakällor · definitioner · formler"
      />

      {openFormal && (
        <div style={{ animation: "meth-in .2s ease-out" }}>

          <SectionLabel text="Datakällor" color={C.blue} />
          <SourceRow id="A44" label="ENTSO-E Transparency — Day-Ahead zonpriser" />
          <SourceRow id="SYS" label="Nord Pool — Nordiskt systempris (Area = SYS)" />
          <SourceRow id="A11" label="ENTSO-E Transparency — Fysiska gränsflöden" />
          <SourceRow id="A75" label="ENTSO-E Transparency — Produktion per kraftslag" />
          <SourceRow id="ECB" label="Europeiska centralbanken — EUR/SEK" />

          <SectionLabel text="Definitioner" color={C.blue} />
          <FormulaBox
            eq="Z(z, t)     Zonpris — observerat Day-Ahead pris per zon och timme (EUR/MWh)"
            note="Källa: ENTSO-E A44. Ingen modellering. Direkt observation."
          />
          <FormulaBox
            eq="S(t)         Systempris — nordiskt referenspris utan interna begränsningar"
            note="Källa: Nord Pool SYS. Beräknas av börsen som om Norden vore en zon."
          />
          <FormulaBox
            eq="InternFlaskhals(Z, t) = Σ max(0, Pris_to(t) − Pris_from(t))"
            note="Kedjesummering uppströms: SE1→SE2, SE2→SE3, SE3→SE4. Algebraiskt ekvivalent med Z(z,t) − S(t) när samtliga länkar beaktas."
          />
          <FormulaBox
            eq="Rent(a→b, t) = max(0, (Pris_b(t) − Pris_a(t)) × Flöde(a→b, t))"
            note="Constraint rent per gräns och timme. DailyRent = Σₜ Rent(t)."
          />
          <FormulaBox
            eq="Slutpris = (Zonpris + Nät + Skatt) × 1.25"
            note="Nät = fast tariff (angiven parameter). Skatt = riksdagsbeslut. Moms 25 %."
          />

          {/* ── Lager 2 — Regulatorisk kontext ──────────── */}
          <ExpandButton
            open={openRegul}
            onClick={() => {
              const next = !openRegul;
              setRegul(next);
              if (!next) setMath(false);
            }}
            label="Regulatorisk kontext"
            sub="Begreppsdefinitioner · juridisk precision · dataintegritet"
          />

          {openRegul && (
            <div style={{ animation: "meth-in .2s ease-out" }}>

              <SectionLabel text="Terminologi" color={C.purple} />
              <RuleRow label="▸" text={'"Flaskhals" avser prisdifferens mellan elområden — inte en administrativ avgift.'} />
              <RuleRow label="▸" text={'"Flaskhalsintäkt" definieras enligt EU-förordning (CACM/FCA). Intäkt uppstår genom Δpris × flöde.'} />
              <RuleRow label="▸" text="Ingen kausal tolkning görs. Analysen separerar tre ekonomiska lager, inget mer." />
              <RuleRow label="▸" text="Ingen bedömning av marknadsaktörers motiv eller avsikt görs." />
              <RuleRow label="▸" text="Korrelation tolkas inte som avsikt." />

              <SectionLabel text="Dataintegritet" color={C.purple} />
              <RuleRow label="TR1" text="Alla observationer har dataset_eve_id och canonical_hash." />
              <RuleRow label="TR2" text="Null-värden ersätts aldrig med 0. Saknad data = null i output." />
              <RuleRow label="TR4" text="Methodology_version ingår i query_hash. Metodändring → ny version." />
              <RuleRow label="TR6" text="Claude genererar kod — aldrig datavärden." />
              <RuleRow label="TR7" text="Witness mode = NO interpretation." />

              {/* ── Lager 4 — Matematisk validering ──────── */}
              <ExpandButton
                open={openMath}
                onClick={() => setMath(p => !p)}
                label="Matematisk validering"
                sub="Konsistenskontroller per timme · tolerans ≤ 0.001 kr"
              />

              {openMath && (
                <div style={{ animation: "meth-in .2s ease-out" }}>
                  <SectionLabel text="Konsistenskontroller" color={C.green} />

                  <ValidationBox
                    n={1}
                    eq="Z(z, t) = S(t) + InternFlaskhals(z, t)"
                    note="Verifieras per timme innan aggregering. Avvikelse > 0.001 kr/kWh per timme flaggas som datakvalitetsvarning."
                    color={C.green}
                  />
                  <ValidationBox
                    n={2}
                    eq="Σ_länkar max(0, Δpris) = Z(z, t) − S(t)"
                    note="Verifieras per timme innan aggregering. Kedjesummeringen skall stämma med flaskhalsklyftan. Tolerans: ±0.001 kr/kWh (EUR/SEK-avrundning)."
                    color={C.green}
                  />
                  <ValidationBox
                    n={3}
                    eq="Total Constraint Rent = Σₜ max(0, Δpris × flöde)"
                    note="Summeras per dygn. Enheter EUR vid beräkning, konverteras till SEK vid visning."
                    color={C.amber}
                  />

                  <div style={{
                    marginTop: 10, padding: "6px 12px",
                    borderRadius: 5, background: C.card2,
                    border: `1px solid ${C.border}`,
                    fontSize: 9, color: C.dim, fontFamily: MONO, lineHeight: 1.6,
                  }}>
                    Data saknas → null. Null ersätts aldrig med 0.
                    Methodology_version ingår i hash-kedjan.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────────── */}
      <div style={{
        marginTop: 16, paddingTop: 10,
        borderTop: `1px solid ${C.border}`,
        fontSize: 8, color: C.dim, fontFamily: MONO,
        lineHeight: 1.8,
      }}>
        <div><span style={{ color: C.muted }}>EVE-DDM</span>{" "}v1.1</div>
        <div><span style={{ color: C.muted }}>Methodology:</span>{" "}TS_V2_EEA_2023_DIRECT_NP1</div>
        <div><span style={{ color: C.muted }}>Deterministic:</span>{" "}Yes</div>
        <div><span style={{ color: C.muted }}>Model parameters:</span>{" "}None</div>
        <div style={{ marginTop: 4, color: C.dim }}>
          Källa: ENTSO-E A44 · A11 · A75 · Nord Pool SYS · ECB
        </div>
      </div>

      <style>{`
        @keyframes meth-in {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
