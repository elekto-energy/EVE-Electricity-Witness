/**
 * load-parser.ts — Parsar CSV, Excel och PDF med förbrukningsdata
 *
 * Stödjer:
 *   1. CSV: Ellevio, Vattenfall Nät, generiskt "Datum;Förbrukning" format
 *   2. Excel (xlsx): Ellevio (24h kolumner), generiskt
 *   3. PDF: Extraktion av månadsförbrukning från elräkningar
 *
 * Output: NormalizedLoadData
 *   - hourly: timestamp[] + kWh[] (8760 punkter/år)
 *   - monthly: { month: string, kWh: number }[] (12 punkter)
 *
 * All data normaliseras till UTC timestamps.
 * Alla värden i kWh.
 *
 * ⚠ PDF-parsning är best-effort — elräkningar varierar kraftigt mellan bolag.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type LoadDataGranularity = "hourly" | "monthly" | "unknown";

export interface HourlyLoadPoint {
  ts: string;      // ISO timestamp (UTC)
  kWh: number;     // Förbrukning denna timme
}

export interface MonthlyLoadPoint {
  month: string;   // "2024-01" format
  kWh: number;     // Total förbrukning denna månad
}

export interface NormalizedLoadData {
  granularity: LoadDataGranularity;
  source: string;              // "ellevio_csv" | "vattenfall_csv" | "generic_csv" | "excel" | "pdf"
  hourly?: HourlyLoadPoint[];  // Om timdata finns
  monthly?: MonthlyLoadPoint[];// Om månadsdata finns (eller aggregerat från timdata)
  totalKwh: number;            // Total förbrukning i datasetet
  startDate: string;           // Första datapunkt
  endDate: string;             // Sista datapunkt
  warnings: string[];          // Varningar/problem vid parsning
  raw_filename?: string;       // Ursprungligt filnamn
}

export interface ParseResult {
  ok: boolean;
  data?: NormalizedLoadData;
  error?: string;
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

/**
 * Detect CSV format and parse accordingly.
 *
 * Supported formats:
 *   A) Generic: "Datum;Förbrukning" or "timestamp;kWh"
 *   B) Ellevio-style: "Datum;00:00-01:00;01:00-02:00;...;23:00-00:00"
 *   C) Comma-separated variants of A/B
 */
export function parseCSV(content: string, filename?: string): ParseResult {
  const warnings: string[] = [];

  // Normalize line endings
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim());

  if (lines.length < 2) {
    return { ok: false, error: "Filen innehåller för lite data (< 2 rader)" };
  }

  // Detect separator
  const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const header = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ""));

  // Detect format
  const headerLower = header.map(h => h.toLowerCase());

  // Check for Ellevio 24h-column format: header has time ranges
  const timeRangePattern = /^\d{2}:\d{2}-\d{2}:\d{2}$/;
  const timeColumns = header.filter(h => timeRangePattern.test(h));

  if (timeColumns.length >= 20) {
    // Format B: Ellevio-style with 24 hour columns
    return parseEllevioCSV(lines, sep, header, filename, warnings);
  }

  // Format A: Generic two-column or similar
  return parseGenericCSV(lines, sep, header, filename, warnings);
}

function parseEllevioCSV(
  lines: string[], sep: string, header: string[],
  filename: string | undefined, warnings: string[]
): ParseResult {
  const hourly: HourlyLoadPoint[] = [];

  // Find date column (first column usually)
  const dateColIdx = 0;

  // Find hour columns — map column index to hour (0-23)
  const hourCols: { idx: number; hour: number }[] = [];
  for (let i = 1; i < header.length; i++) {
    const m = header[i].match(/^(\d{2}):\d{2}-\d{2}:\d{2}$/);
    if (m) {
      hourCols.push({ idx: i, hour: parseInt(m[1]) });
    }
  }

  for (let lineNo = 1; lineNo < lines.length; lineNo++) {
    const cols = lines[lineNo].split(sep).map(c => c.trim().replace(/^"|"$/g, ""));
    const dateStr = cols[dateColIdx];
    if (!dateStr || !/\d{4}/.test(dateStr)) continue;

    // Parse date — handle "YYYY-MM-DD" or "DD/MM/YYYY" or "DD.MM.YYYY"
    const date = parseSwedishDate(dateStr);
    if (!date) {
      warnings.push(`Rad ${lineNo + 1}: Kunde inte tolka datum "${dateStr}"`);
      continue;
    }

    for (const { idx, hour } of hourCols) {
      const val = parseSwedishNumber(cols[idx]);
      if (val === null) continue;

      const ts = new Date(Date.UTC(date.y, date.m - 1, date.d, hour));
      hourly.push({ ts: ts.toISOString(), kWh: val });
    }
  }

  if (hourly.length === 0) {
    return { ok: false, error: "Kunde inte parsa någon förbrukningsdata från Ellevio-CSV" };
  }

  hourly.sort((a, b) => a.ts.localeCompare(b.ts));
  const totalKwh = hourly.reduce((s, p) => s + p.kWh, 0);
  const monthly = aggregateToMonthly(hourly);

  return {
    ok: true,
    data: {
      granularity: "hourly",
      source: "ellevio_csv",
      hourly,
      monthly,
      totalKwh,
      startDate: hourly[0].ts,
      endDate: hourly[hourly.length - 1].ts,
      warnings,
      raw_filename: filename,
    },
  };
}

function parseGenericCSV(
  lines: string[], sep: string, header: string[],
  filename: string | undefined, warnings: string[]
): ParseResult {
  const hourly: HourlyLoadPoint[] = [];
  const monthly: MonthlyLoadPoint[] = [];

  // Detect which columns contain date and consumption
  const headerLower = header.map(h => h.toLowerCase());

  let dateIdx = headerLower.findIndex(h =>
    h.includes("datum") || h.includes("date") || h.includes("tid") || h.includes("time") || h.includes("timestamp")
  );
  let valIdx = headerLower.findIndex(h =>
    h.includes("förbrukning") || h.includes("forbrukning") || h.includes("consumption") ||
    h.includes("kwh") || h.includes("energi") || h.includes("energy") || h.includes("mätarställning") === false
  );

  // Fallback: assume col 0 = date, col 1 = value
  if (dateIdx < 0) dateIdx = 0;
  if (valIdx < 0 || valIdx === dateIdx) valIdx = dateIdx === 0 ? 1 : 0;

  // Check if we have "Månad" or "Month" column → monthly data
  const isMonthly = headerLower.some(h => h.includes("månad") || h.includes("month"));

  for (let lineNo = 1; lineNo < lines.length; lineNo++) {
    const cols = lines[lineNo].split(sep).map(c => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 2) continue;

    const dateStr = cols[dateIdx];
    const valStr = cols[valIdx];

    const val = parseSwedishNumber(valStr);
    if (val === null || val < 0) continue;

    if (isMonthly) {
      // Try to parse as month "2024-01" or "januari 2024" etc
      const monthKey = parseMonthKey(dateStr);
      if (monthKey) {
        monthly.push({ month: monthKey, kWh: val });
      }
    } else {
      // Try to parse as timestamp
      const ts = parseTimestamp(dateStr);
      if (ts) {
        hourly.push({ ts, kWh: val });
      } else {
        if (lineNo <= 5) warnings.push(`Rad ${lineNo + 1}: Kunde inte tolka "${dateStr}"`);
      }
    }
  }

  if (hourly.length === 0 && monthly.length === 0) {
    return { ok: false, error: "Kunde inte parsa någon förbrukningsdata från CSV" };
  }

  if (hourly.length > 0) {
    hourly.sort((a, b) => a.ts.localeCompare(b.ts));
    const totalKwh = hourly.reduce((s, p) => s + p.kWh, 0);
    const monthlyAgg = aggregateToMonthly(hourly);

    return {
      ok: true,
      data: {
        granularity: "hourly",
        source: filename?.toLowerCase().includes("ellevio") ? "ellevio_csv" : "generic_csv",
        hourly,
        monthly: monthlyAgg,
        totalKwh,
        startDate: hourly[0].ts,
        endDate: hourly[hourly.length - 1].ts,
        warnings,
        raw_filename: filename,
      },
    };
  }

  // Monthly data
  monthly.sort((a, b) => a.month.localeCompare(b.month));
  const totalKwh = monthly.reduce((s, p) => s + p.kWh, 0);

  return {
    ok: true,
    data: {
      granularity: "monthly",
      source: "generic_csv",
      monthly,
      totalKwh,
      startDate: monthly[0].month + "-01",
      endDate: monthly[monthly.length - 1].month + "-28",
      warnings,
      raw_filename: filename,
    },
  };
}

// ─── Excel Parser ─────────────────────────────────────────────────────────────

/**
 * Parse Excel file (xlsx/xls).
 * Uses SheetJS (xlsx package).
 */
export async function parseExcel(buffer: Buffer, filename?: string): Promise<ParseResult> {
  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });

    if (workbook.SheetNames.length === 0) {
      return { ok: false, error: "Excel-filen innehåller inga ark" };
    }

    // Try first sheet
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as string[][];

    if (rows.length < 2) {
      return { ok: false, error: "Excel-arket innehåller för lite data" };
    }

    // Convert to CSV-like format and reuse CSV parser
    const sep = ";";
    const csvLines = rows.map(row => row.map(cell => String(cell ?? "")).join(sep));

    return parseCSV(csvLines.join("\n"), filename);
  } catch (e: any) {
    return { ok: false, error: `Kunde inte läsa Excel-filen: ${e.message}` };
  }
}

// ─── PDF Parser ───────────────────────────────────────────────────────────────

/**
 * Parse PDF electricity bill.
 * Extracts monthly consumption data using text pattern matching.
 *
 * ⚠ Best-effort — Swedish electricity bills vary significantly.
 * Looks for patterns like:
 *   - "Förbrukning: 1 234 kWh"
 *   - Monthly tables with kWh values
 *   - "Jan 450 kWh  Feb 520 kWh ..."
 */
export async function parsePDF(buffer: Buffer, filename?: string): Promise<ParseResult> {
  const warnings: string[] = [];

  try {
    // Dynamic import — pdf-parse needs to be installed
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    const text = data.text;

    if (!text || text.trim().length < 20) {
      return { ok: false, error: "PDF:en verkar vara tom eller skannad (OCR krävs)" };
    }

    // Strategy 1: Look for monthly consumption table
    const monthly = extractMonthlyFromPDF(text, warnings);
    if (monthly.length >= 3) {
      const totalKwh = monthly.reduce((s, p) => s + p.kWh, 0);
      return {
        ok: true,
        data: {
          granularity: "monthly",
          source: "pdf",
          monthly,
          totalKwh,
          startDate: monthly[0].month + "-01",
          endDate: monthly[monthly.length - 1].month + "-28",
          warnings: [
            ...warnings,
            "⚠ PDF-parsning är uppskattad — verifiera siffrorna",
          ],
          raw_filename: filename,
        },
      };
    }

    // Strategy 2: Look for annual total + try to extract period
    const annualMatch = text.match(/(?:årsförbrukning|total\s*förbrukning|förbruk(?:ning|at))\s*[:\s]*(\d[\d\s,.]*)\s*kWh/i);
    if (annualMatch) {
      const totalKwh = parseSwedishNumber(annualMatch[1]);
      if (totalKwh && totalKwh > 100) {
        warnings.push("Hittade bara årstotal i PDF — ingen månadsfördelning");
        return {
          ok: true,
          data: {
            granularity: "unknown",
            source: "pdf",
            totalKwh,
            startDate: "unknown",
            endDate: "unknown",
            warnings: [
              ...warnings,
              `⚠ Hittade årsförbrukning: ${Math.round(totalKwh)} kWh — använd förbrukningsprofil för fördelning`,
            ],
            raw_filename: filename,
          },
        };
      }
    }

    return {
      ok: false,
      error: "Kunde inte hitta förbrukningsdata i PDF:en. Prova CSV-export från ditt nätbolag istället.",
    };
  } catch (e: any) {
    return { ok: false, error: `Kunde inte läsa PDF: ${e.message}` };
  }
}

function extractMonthlyFromPDF(text: string, warnings: string[]): MonthlyLoadPoint[] {
  const monthly: MonthlyLoadPoint[] = [];
  const lines = text.split("\n").map(l => l.trim());

  // Swedish month names → month number
  const monthMap: Record<string, number> = {
    jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, mars: 3,
    apr: 4, april: 4, maj: 5, jun: 6, juni: 6,
    jul: 7, juli: 7, aug: 8, augusti: 8, sep: 9, september: 9,
    okt: 10, oktober: 10, nov: 11, november: 11, dec: 12, december: 12,
  };

  // Pattern 1: "januari  1234" or "jan 1234 kWh"
  const monthNamePattern = new RegExp(
    `(${Object.keys(monthMap).join("|")})\\w*\\s+(\\d[\\d\\s,.]*)\\s*(?:kWh)?`,
    "gi"
  );

  // Try to find year context
  const yearMatch = text.match(/20[12]\d/);
  const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear();

  let match;
  while ((match = monthNamePattern.exec(text)) !== null) {
    const monthName = match[1].toLowerCase();
    const monthNum = monthMap[monthName];
    if (!monthNum) continue;

    const val = parseSwedishNumber(match[2]);
    if (val === null || val < 10 || val > 50000) continue; // sanity check

    const monthKey = `${year}-${String(monthNum).padStart(2, "0")}`;
    // Avoid duplicates
    if (!monthly.find(m => m.month === monthKey)) {
      monthly.push({ month: monthKey, kWh: val });
    }
  }

  // Pattern 2: "2024-01  1234" format
  const isoPattern = /(\d{4}-\d{2})\s+([\d\s,.]+)\s*(?:kWh)?/g;
  while ((match = isoPattern.exec(text)) !== null) {
    const monthKey = match[1];
    const val = parseSwedishNumber(match[2]);
    if (val === null || val < 10 || val > 50000) continue;

    if (!monthly.find(m => m.month === monthKey)) {
      monthly.push({ month: monthKey, kWh: val });
    }
  }

  monthly.sort((a, b) => a.month.localeCompare(b.month));
  return monthly;
}

// ─── Auto-detect and parse ────────────────────────────────────────────────────

/**
 * Auto-detect file type and parse.
 */
export async function parseLoadFile(
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<ParseResult> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mime = mimeType?.toLowerCase() ?? "";

  if (ext === "csv" || ext === "tsv" || mime.includes("csv") || mime.includes("text/plain")) {
    const text = buffer.toString("utf-8");
    return parseCSV(text, filename);
  }

  if (ext === "xlsx" || ext === "xls" || mime.includes("spreadsheet") || mime.includes("excel")) {
    return parseExcel(buffer, filename);
  }

  if (ext === "pdf" || mime.includes("pdf")) {
    return parsePDF(buffer, filename);
  }

  // Try as text (CSV)
  try {
    const text = buffer.toString("utf-8");
    if (text.includes(";") || text.includes(",")) {
      return parseCSV(text, filename);
    }
  } catch {}

  return { ok: false, error: `Filtyp "${ext}" stöds inte. Använd CSV, Excel (.xlsx) eller PDF.` };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSwedishNumber(s: string | undefined): number | null {
  if (!s || !s.trim()) return null;
  // Swedish: "1 234,56" → 1234.56
  // Also handle "1234.56" (international)
  let clean = s.trim().replace(/\s/g, "");
  // If has comma but no dot → Swedish decimal
  if (clean.includes(",") && !clean.includes(".")) {
    clean = clean.replace(",", ".");
  }
  // If has both comma and dot, comma is thousand sep
  if (clean.includes(",") && clean.includes(".")) {
    clean = clean.replace(/,/g, "");
  }
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function parseSwedishDate(s: string): { y: number; m: number; d: number } | null {
  // "2024-01-15"
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  // "15/01/2024" or "15.01.2024"
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return { y: +m[3], m: +m[2], d: +m[1] };
  // "2024/01/15"
  m = s.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  return null;
}

function parseTimestamp(s: string): string | null {
  // "2024-01-15 08:00" or "2024-01-15T08:00:00"
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (m) {
    return new Date(`${m[1]}T${m[2]}:00Z`).toISOString();
  }
  // "2024-01-15 08:00:00"
  const m2 = s.match(/^(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2}:\d{2})/);
  if (m2) {
    return new Date(`${m2[1]}T${m2[2]}Z`).toISOString();
  }
  // Date only → midnight
  const d = parseSwedishDate(s);
  if (d) {
    return new Date(Date.UTC(d.y, d.m - 1, d.d)).toISOString();
  }
  return null;
}

function parseMonthKey(s: string): string | null {
  // "2024-01"
  const m1 = s.match(/^(\d{4})-(\d{2})$/);
  if (m1) return s;
  // "januari 2024" etc
  const monthMap: Record<string, string> = {
    januari: "01", februari: "02", mars: "03", april: "04",
    maj: "05", juni: "06", juli: "07", augusti: "08",
    september: "09", oktober: "10", november: "11", december: "12",
    jan: "01", feb: "02", mar: "03", apr: "04",
    jun: "06", jul: "07", aug: "08", sep: "09",
    okt: "10", nov: "11", dec: "12",
  };
  const m2 = s.match(/^(\w+)\s+(\d{4})$/i);
  if (m2) {
    const mm = monthMap[m2[1].toLowerCase()];
    if (mm) return `${m2[2]}-${mm}`;
  }
  return null;
}

function aggregateToMonthly(hourly: HourlyLoadPoint[]): MonthlyLoadPoint[] {
  const map = new Map<string, number>();
  for (const p of hourly) {
    const month = p.ts.slice(0, 7); // "2024-01"
    map.set(month, (map.get(month) ?? 0) + p.kWh);
  }
  return Array.from(map.entries())
    .map(([month, kWh]) => ({ month, kWh }))
    .sort((a, b) => a.month.localeCompare(b.month));
}
