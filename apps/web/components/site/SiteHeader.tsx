"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Elpriset" },
  { href: "/import-export", label: "Import och export", short: "Import" },
  { href: "/omraden", label: "Grannländer och flöden", short: "Grannländer" },
  { href: "/data", label: "Datakvalitet" },
  { href: "/methodology", label: "Metod", wideOnly: true }, // hidden on phones; still linked from the home page
];

const NEW_ROUTES = new Set(["/", "/import-export", "/omraden", "/data"]);

export function SiteHeader() {
  const path = usePathname() ?? "/";
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  return (
    <header className="s-header">
      <div className="s-header-inner">
        <Link href="/" className="s-wordmark">
          elmonitor
        </Link>
        <nav className="s-nav" aria-label="Huvudmeny">
          {NAV.map(n => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined} className={"wideOnly" in n && n.wideOnly ? "s-wide-only" : undefined}>
              {"short" in n && n.short ? <><span className="s-long">{n.label}</span><span className="s-short">{n.short}</span></> : n.label}
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
  if (NEW_ROUTES.has(path) || path.startsWith("/elpris/")) return <main className="s-main">{children}</main>;
  if (LEGACY_WORKING.has(path)) return <main className="s-legacy">{children}</main>;
  return (
    <main className="s-main">
      <div className="s-panel" role="status" style={{ maxWidth: 640 }}>
        <h1 className="s-h2" style={{ marginBottom: 8 }}>Den här vyn uppdateras. Data är ännu inte tillgängliga här.</h1>
        <p className="s-note">
          Dagens elpriser finns på <Link href="/">startsidan</Link>. Täckningen per serie visas under <Link href="/data">Datakvalitet</Link>.
        </p>
      </div>
    </main>
  );
}
