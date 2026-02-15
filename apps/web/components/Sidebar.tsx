"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/spot",        label: "Spot Prices",  icon: "⚡", status: "live" },
  { href: "/witness",     label: "Witness",       icon: "🔍", status: "seed" },
  { href: "/opinion",     label: "Opinion",       icon: "🗳", status: "scaffold" },
  { href: "/methodology", label: "Methodology",   icon: "📐", status: "live" },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        ELEKTO EU
        <span>EVEverified Energy Platform</span>
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
