import Link from "next/link";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\web") || cwd.endsWith("apps/web")) {
    return resolve(cwd, "../..");
  }
  return cwd;
}

interface NewsItem {
  id: string;
  date: string;
  source: string;
  source_url: string | null;
  category: string;
  title: string;
  summary: string;
  platform_link: string | null;
}

function getLatestNews(count: number): NewsItem[] {
  const path = resolve(getProjectRoot(), "data", "canonical", "news", "curated_v1.json");
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  return (raw.items ?? [])
    .sort((a: NewsItem, b: NewsItem) => b.date.localeCompare(a.date))
    .slice(0, count);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

const SOURCE_COLORS: Record<string, string> = {
  "Ei": "#3b82f6",
  "Energimyndigheten": "#10b981",
  "SVK": "#f59e0b",
  "Second Opinion": "#8b5cf6",
  "EVE": "#ec4899",
};

export default function HomePage() {
  const latestNews = getLatestNews(3);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">ELEKTO EU</h1>
        <p className="page-subtitle">
          Open, neutral, evidence-driven EU energy transparency. No opinions. Only data + method.
        </p>
      </div>

      {/* Latest news widget */}
      {latestNews.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}>
            <h2 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
              📰 Senaste nyheterna
            </h2>
            <Link href="/nyheter" style={{
              fontSize: "0.78rem",
              color: "#93c5fd",
            }}>
              Visa alla →
            </Link>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {latestNews.map((item) => {
              const srcColor = SOURCE_COLORS[item.source] || "var(--text-muted)";
              return (
                <Link
                  key={item.id}
                  href={item.platform_link || "/nyheter"}
                  style={{ textDecoration: "none" }}
                >
                  <div className="card" style={{
                    marginBottom: 0,
                    cursor: "pointer",
                    padding: "12px 16px",
                    transition: "border-color 0.15s",
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.7rem",
                            color: "var(--text-muted)",
                          }}>
                            {formatDate(item.date)}
                          </span>
                          <span style={{
                            padding: "1px 6px",
                            fontSize: "0.65rem",
                            borderRadius: 8,
                            background: `${srcColor}22`,
                            border: `1px solid ${srcColor}44`,
                            color: srcColor,
                            fontWeight: 500,
                          }}>
                            {item.source}
                          </span>
                        </div>
                        <div style={{
                          fontWeight: 600,
                          fontSize: "0.85rem",
                          lineHeight: 1.3,
                          color: "var(--text-primary)",
                          marginBottom: 2,
                        }}>
                          {item.title}
                        </div>
                        <div style={{
                          fontSize: "0.78rem",
                          color: "var(--text-muted)",
                          lineHeight: 1.4,
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical" as any,
                        }}>
                          {item.summary}
                        </div>
                      </div>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>→</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Main navigation grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <Link href="/spot" style={{ textDecoration: "none" }}>
          <div className="card" style={{ cursor: "pointer" }}>
            <div className="card-header">
              <span className="card-title">⚡ Spot Prices</span>
              <span className="status-pill live">live</span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              ENTSO-E day-ahead prices across EU bidding zones. Compare SE1–SE4 and beyond.
            </p>
          </div>
        </Link>

        <Link href="/witness/price-structure" style={{ textDecoration: "none" }}>
          <div className="card" style={{ cursor: "pointer" }}>
            <div className="card-header">
              <span className="card-title">💰 Energidata</span>
              <span className="status-pill live">live</span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              Prisstruktur, flaskhalsintäkter, nätavgifter och CO₂-data per elområde.
            </p>
          </div>
        </Link>

        <Link href="/nyheter" style={{ textDecoration: "none" }}>
          <div className="card" style={{ cursor: "pointer" }}>
            <div className="card-header">
              <span className="card-title">📰 Nyheter</span>
              <span className="status-pill live">live</span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              Kuraterade myndighetsnyheter kopplade till energidata. Nyheten + siffrorna.
            </p>
          </div>
        </Link>

        <Link href="/opinion" style={{ textDecoration: "none" }}>
          <div className="card" style={{ cursor: "pointer" }}>
            <div className="card-header">
              <span className="card-title">🗳 Opinion & Analys</span>
              <span className="status-pill live">live</span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              Ringhals-tidslinje, flaskhalslösningar, och evidenskopplade polls.
            </p>
          </div>
        </Link>

        <Link href="/witness" style={{ textDecoration: "none" }}>
          <div className="card" style={{ cursor: "pointer" }}>
            <div className="card-header">
              <span className="card-title">🔍 Witness Mode</span>
              <span className="status-pill seed">seed v1</span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              Trace energy decisions through Riksdagen. No interpretation — evidence only.
            </p>
          </div>
        </Link>

        <Link href="/methodology" style={{ textDecoration: "none" }}>
          <div className="card" style={{ cursor: "pointer" }}>
            <div className="card-header">
              <span className="card-title">📐 Methodology</span>
              <span className="status-pill live">live</span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              Formulas, assumptions, data sources. Everything is auditable.
            </p>
          </div>
        </Link>
      </div>

      {/* RSS banner */}
      <div style={{
        marginTop: 20,
        padding: "10px 16px",
        background: "rgba(245,158,11,0.06)",
        border: "1px solid rgba(245,158,11,0.2)",
        borderRadius: 6,
        fontSize: "0.78rem",
        color: "var(--text-secondary)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <span style={{ fontSize: "1.1rem" }}>📡</span>
        <span>
          Prenumerera på kuraterade energinyheter:{" "}
          <a href="/api/news/rss" style={{ color: "#f59e0b", fontWeight: 600 }}>
            RSS-feed
          </a>
          {" "}— Fungerar i alla RSS-läsare.
        </span>
      </div>
    </div>
  );
}
