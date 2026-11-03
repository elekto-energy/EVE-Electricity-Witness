"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Elpriset" },
  { href: "/omraden", label: "Grannländer och flöden" },
  { href: "/data", label: "Datakvalitet" },
  { href: "/karta", label: "Kartan", soon: true },
  { href: "/methodology", label: "Metod" },
];

const NEW_ROUTES = new Set(["/", "/omraden", "/data", "/karta"]);

export function SiteHeader() {
  const path = usePathname() ?? "/";
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  return (
    <header className="s-header">
      <div className="s-header-inner">
        <Link href="/" className="s-wordmark">
          elmonitor<span className="s-tag" title="Testversion för granskning, inte elmonitor.se">förhandsversion</span>
        </Link>
        <nav className="s-nav" aria-label="Huvudmeny">
          {NAV.map(n => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined} className={n.soon ? "s-soon" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

/** Older pages that still work without the old data services. */
const LEGACY_WORKING = new Set(["/methodology"]);

/**
 * New pages get the new page frame. Older pages keep their addresses; those that depend on the
 * old data services show a notice instead of empty or misleading views (owner decision 2026-11-03).
 */
export function SiteMain({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? "/";
  if (NEW_ROUTES.has(path)) return <main className="s-main">{children}</main>;
  if (LEGACY_WORKING.has(path)) return <main className="s-legacy">{children}</main>;
  return (
    <main className="s-main">
      <div className="s-panel" role="status" style={{ maxWidth: 640 }}>
        <h1 className="s-h2" style={{ marginBottom: 8 }}>Den här vyn uppdateras. Data är ännu inte tillgängliga i förhandsversionen.</h1>
        <p className="s-note">
          Dagens elpriser finns på <Link href="/">startsidan</Link>. Täckningen per serie visas under <Link href="/data">Datakvalitet</Link>.
        </p>
      </div>
    </main>
  );
}
