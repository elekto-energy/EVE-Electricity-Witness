import { ImageResponse } from "next/og";

export const alt = "Elmonitor – elpriset idag i SE1–SE4";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Static share image (no live numbers, so a cached preview never shows an old price as current).
export default function OgImage() {
  const zones: [string, string, string][] = [["SE1", "Luleå", "#4f86b5"], ["SE2", "Sundsvall", "#2f7e86"], ["SE3", "Stockholm", "#c68a17"], ["SE4", "Malmö", "#b0285c"]];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#f4f7f8", color: "#13212e" }}>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 800 }}>elmonitor</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05 }}>Elpriset idag</div>
          <div style={{ fontSize: 34, marginTop: 18, color: "#566875" }}>Spotpris kvart för kvart, elflöden och produktion i Sveriges elområden</div>
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          {zones.map(([z, c, col]) => (
            <div key={z} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 22px", borderRadius: 14, background: "#ffffff", border: "2px solid #c9d5da" }}>
              <div style={{ width: 22, height: 22, borderRadius: 11, background: col }} />
              <div style={{ display: "flex", fontSize: 30, fontWeight: 800 }}>{z}</div>
              <div style={{ display: "flex", fontSize: 26, color: "#566875" }}>{c}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
