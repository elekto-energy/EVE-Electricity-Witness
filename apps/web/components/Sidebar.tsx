"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Status badges reflect actual data freshness, not aspiration.
 *
 * live   = data updates automatically via ingest pipelines
 * seed   = initial dataset, growing
 * static = manually curated or historical, updated periodically
 */
const NAV_ITEMS = [
  { href: "/witness/price-structure", label: "Energidata", icon: "⚡", status: "live" },
  { href: "/witness",     label: "Witness",       icon: "🔍", status: "seed" },
  { href: "/witness/statements", label: "Statements", icon: "📜", status: "seed" },
  { href: "/witness/decisions",  label: "Decisions",   icon: "⚖️", status: "static" },
  // { href: "/analysis",    label: "Analysis",      icon: "📊", status: "live" }, // Removed — saved for later
  { href: "/nyheter",     label: "Nyheter",       icon: "📰", status: "static" },
  { href: "/opinion",     label: "Opinion",       icon: "🗳", status: "static" },
  { href: "/methodology", label: "Methodology",   icon: "📐", status: "static" },
  { href: "/ask-eve",     label: "Ask-EVE",       icon: "🔒", status: "live" },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        EVE
        <span>Evidence & Verification Engine</span>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${isActive ? "active" : ""}`}
            >
              <span className="sidebar-icon">{item.icon}</span>
              {item.label}
              <span className={`status-pill ${item.status}`} style={{ marginLeft: "auto" }}>
                {item.status}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
