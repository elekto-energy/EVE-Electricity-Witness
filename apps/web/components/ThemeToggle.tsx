"use client";

import { useState, useEffect } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("eve-theme") as "dark" | "light" | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    } else {
      // First visit — default light, show hint
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("eve-theme", "light");
      setShowHint(true);
    }

    // Check if user has ever toggled
    const hasToggled = localStorage.getItem("eve-theme-seen");
    if (!hasToggled) {
      setShowHint(true);
    }
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("eve-theme", next);
    // Dismiss hint permanently
    if (showHint) {
      setShowHint(false);
      localStorage.setItem("eve-theme-seen", "1");
    }
  }

  function dismissHint() {
    setShowHint(false);
    localStorage.setItem("eve-theme-seen", "1");
  }

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      {/* Pulsing hint — first visit only */}
      {showHint && (
        <div
          onClick={dismissHint}
          style={{
            position: "absolute",
            right: "calc(100% + 6px)",
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 4,
            whiteSpace: "nowrap",
            animation: "theme-hint-pulse 2s ease-in-out infinite",
            cursor: "pointer",
          }}
        >
          <span style={{
            fontSize: 10,
            color: "var(--accent-amber)",
            fontWeight: 600,
            background: "var(--bg-card)",
            border: "1px solid var(--accent-amber)",
            borderRadius: 4,
            padding: "2px 8px",
          }}>
            Ljust / Mörkt
          </span>
          <span style={{ fontSize: 14, color: "var(--accent-amber)" }}>→</span>
        </div>
      )}

      <button
        onClick={toggle}
        aria-label={theme === "dark" ? "Byt till ljust tema" : "Byt till mörkt tema"}
        title={theme === "dark" ? "Ljust tema" : "Mörkt tema"}
        style={{
          background: "none",
          border: `1px solid ${showHint ? "var(--accent-amber)" : "var(--border-color)"}`,
          borderRadius: 6,
          padding: "4px 8px",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          color: "var(--text-secondary)",
          transition: "border-color 0.2s, box-shadow 0.2s",
          boxShadow: showHint ? "0 0 8px rgba(245,158,11,0.3)" : "none",
        }}
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>

      <style>{`
        @keyframes theme-hint-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
