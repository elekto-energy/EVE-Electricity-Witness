"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Status badges reflect actual data freshness, not aspiration.
 *
 * live   = data updates automatically via ingest pipelines
 * seed   = initial dataset, growing
 * static = manually curated or historical, updated periodically
 */
const NAV_ITEMS = [
  { href: "/witness/price-structure", label: "Energidata", icon: "⚡", status: "live" },
  // { href: "/witness",     label: "Witness",       icon: "🔍", status: "seed" },       // Hidden — not public yet
  // { href: "/witness/statements", label: "Statements", icon: "📜", status: "seed" },    // Hidden — WIP
  // { href: "/witness/decisions",  label: "Decisions",   icon: "⚖️", status: "static" },  // Hidden — WIP
  // { href: "/analysis",    label: "Analysis",      icon: "📊", status: "live" },        // Hidden — saved for later
  // { href: "/nyheter",     label: "Nyheter",       icon: "📰", status: "static" },      // Hidden — not public yet
  // { href: "/opinion",     label: "Opinion",       icon: "🗳", status: "static" },      // Hidden — not public yet
  { href: "/methodology", label: "Methodology",   icon: "📐", status: "static" },
  { href: "/ask-eve",     label: "Rapport",       icon: "📊", status: "live" },
  { href: "/ask-eve/verify", label: "Verifiera",  icon: "🔒", status: "live" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close menu on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      {/* Hamburger button — mobile only */}
      <button
        className="sidebar-hamburger"
        onClick={() => setOpen(!open)}
        aria-label="Toggle menu"
      >
        <span style={{
          display: "block", width: 20, height: 2,
          background: "var(--text-primary)",
          transition: "transform 0.2s, opacity 0.2s",
          transform: open ? "translateY(6px) rotate(45deg)" : "none",
        }} />
        <span style={{
          display: "block", width: 20, height: 2,
          background: "var(--text-primary)",
          marginTop: 4,
          transition: "opacity 0.2s",
          opacity: open ? 0 : 1,
        }} />
        <span style={{
          display: "block", width: 20, height: 2,
          background: "var(--text-primary)",
          marginTop: 4,
          transition: "transform 0.2s, opacity 0.2s",
          transform: open ? "translateY(-6px) rotate(-45deg)" : "none",
        }} />
      </button>

      {/* Overlay — mobile only */}
      {open && (
        <div
          className="sidebar-overlay"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          EVE
          <span>Electricity Verified</span>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActive ? "active" : ""}`}
                onClick={() => setOpen(false)}
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
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border-color)", marginTop: "auto" }}>
          <ThemeToggle />
        </div>
      </aside>
    </>
  );
}
