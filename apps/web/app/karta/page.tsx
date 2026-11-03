import Link from "next/link";

export const metadata = { title: "Kartan (kommer)" };

export default function MapPage() {
  return (
    <div style={{ maxWidth: 720 }}>
      <h1 className="s-h1">Kartan</h1>
      <div className="s-panel">
        <p style={{ lineHeight: 1.6, color: "var(--s-muted)" }}>
          Kartan över Sveriges elområden, flöden, flaskhalsar och flaskhalsintäkter byggs i nästa steg.
          Den kräver kartgränser med öppen licens som ännu inte är fastställda.
        </p>
        <p style={{ lineHeight: 1.6, color: "var(--s-muted)", marginTop: 8 }}>
          Under tiden finns dagens priser och de senaste flödena på <Link href="/">startsidan</Link> och
          täckningen per serie under <Link href="/data">Datakvalitet</Link>.
        </p>
      </div>
    </div>
  );
}
