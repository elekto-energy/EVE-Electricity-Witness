// Patch SpotDashboard.tsx: add SimulatePanel import + replace zone cards
const fs = require('fs');
const path = 'D:\\EVE11\\Projects\\013_elekto_eu\\apps\\web\\components\\energy\\SpotDashboard.tsx';
let src = fs.readFileSync(path, 'utf8');

// 1. Add import after the existing react import
const importLine = 'import { useState, useEffect, useCallback, useRef } from "react";';
if (!src.includes('SimulatePanel')) {
  src = src.replace(
    importLine,
    importLine + '\nimport SimulatePanel from "./SimulatePanel";'
  );
  console.log('✅ Added SimulatePanel import');
} else {
  console.log('⚠ SimulatePanel import already exists');
}

// 2. Replace zone cards section with SimulatePanel
// Find the exact zone cards block
const zoneCardsStart = '        {/* ── 4 ZONKORT';
const zoneCardsEnd = '        </div>\n\n        {/* ── HERO';

const startIdx = src.indexOf(zoneCardsStart);
if (startIdx === -1) {
  // Try alternate comment style
  const alt = src.indexOf('4 ZONKORT');
  if (alt === -1) {
    console.log('❌ Could not find ZONKORT section');
    process.exit(1);
  }
}

// More robust: find by the SE_ZONES.map pattern inside the render
const zoneSectionRegex = /\{\/\*[^*]*ZONKORT[^*]*\*\/\}\s*\n\s*<div style=\{\{[^}]*display:"flex"[^}]*gap:8[^}]*padding:"12px 20px"[^}]*\}\}>\s*\n\s*\{SE_ZONES\.map\(z => \(\s*\n\s*<ZoneCard[^/]*\/>\s*\n\s*\)\)\}\s*\n\s*<\/div>/;

const match = src.match(zoneSectionRegex);
if (match) {
  const replacement = `{/* ── SIMULATE PANEL ─────────────────────────────────────── */}
        <div style={{ padding: "0 20px" }}>
          <SimulatePanel
            zone={zone}
            period={period}
            start={(() => {
              if (period === "day") return histDate;
              if (period === "week") return histDate;
              if (period === "month") return histDate.slice(0, 7) + "-01";
              return histDate.slice(0, 4) + "-01-01";
            })()}
            end={(() => {
              if (period === "day") return histDate;
              if (period === "week") {
                const d = new Date(histDate + "T12:00:00Z");
                d.setUTCDate(d.getUTCDate() + 6);
                return d.toISOString().slice(0, 10);
              }
              if (period === "month") {
                const [y, m] = histDate.slice(0, 7).split("-").map(Number);
                const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
                return \`\${y}-\${String(m).padStart(2, "0")}-\${last}\`;
              }
              return histDate.slice(0, 4) + "-12-31";
            })()}
          />
        </div>`;
  
  src = src.replace(match[0], replacement);
  console.log('✅ Replaced zone cards with SimulatePanel');
} else {
  console.log('❌ Regex did not match zone cards section');
  // Debug: show what's around ZONKORT
  const idx = src.indexOf('ZONKORT');
  if (idx > -1) {
    console.log('Context around ZONKORT:');
    console.log(JSON.stringify(src.slice(idx - 20, idx + 300)));
  }
  process.exit(1);
}

fs.writeFileSync(path, src, 'utf8');
console.log('✅ SpotDashboard.tsx patched successfully');
