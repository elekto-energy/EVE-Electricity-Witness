/**
 * Zone Colors — Single Source of Truth
 *
 * Used by: SpotDashboard, SpotChart, Ask-EVE Panel, all zone-colored UI.
 * If you change a color here, it changes everywhere.
 */

export const ZONE_COLORS: Record<string, string> = {
  SE1: "#22d3ee",   // cyan
  SE2: "#38bdf8",   // blue
  SE3: "#f59e0b",   // amber
  SE4: "#ef4444",   // red
  FI:  "#a78bfa",   // purple
  DE_LU: "#10b981", // emerald
  NO1: "#34d399",   // green
  NO2: "#2dd4bf",   // teal
  PL:  "#fb923c",   // orange
  EE:  "#c084fc",   // light purple
  LV:  "#f472b6",   // pink
  LT:  "#fbbf24",   // yellow
  FR:  "#60a5fa",   // light blue
  NL:  "#4ade80",   // light green
};

export const ZONE_NAMES: Record<string, string> = {
  SE1: "Luleå",
  SE2: "Sundsvall",
  SE3: "Stockholm",
  SE4: "Malmö",
  FI: "Finland",
  DE_LU: "Tyskland",
  NO1: "Oslo",
  NO2: "Kristiansand",
  PL: "Polen",
  EE: "Estland",
  LV: "Lettland",
  LT: "Litauen",
  FR: "Frankrike",
  NL: "Nederländerna",
};

const FALLBACK_COLORS = ["#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316"];

export function getZoneColor(zone: string, index = 0): string {
  return ZONE_COLORS[zone] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

export function getZoneName(zone: string): string {
  return ZONE_NAMES[zone] ?? zone;
}
