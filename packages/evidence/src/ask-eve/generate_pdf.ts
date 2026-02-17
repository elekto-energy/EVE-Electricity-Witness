/**
 * Ask-EVE PDF Evidence Report Generator
 *
 * Generates a cryptographically verifiable PDF from V2 query results.
 * 100% TypeScript. No Python. No external dependencies beyond pdfkit.
 *
 * The PDF is not opinion. It is a rendered snapshot of locked dataset.
 *
 * Every PDF includes:
 *   - dataset_eve_id
 *   - root_hash
 *   - registry_hash
 *   - vault chain_hash
 *   - reproducible query command
 *
 * Usage:
 *   npx tsx packages/evidence/src/ask-eve/generate_pdf.ts \
 *     --zone SE3 --from 2024-01-01 --to 2024-01-31 \
 *     --output evidence_SE3_202401.pdf
 *
 * Prerequisites: npm install pdfkit @types/pdfkit
 *
 * TR1: No source, no number.
 * TR6: Code renders — never invents.
 */

import { createWriteStream, readFileSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import PDFDocument from "pdfkit";
import { query, type QueryResult } from "./query_v2";
import { appendReportToVault } from "./report_vault";

// ─── Layout Constants ────────────────────────────────────────────────────────

const MARGIN = 50;
const PAGE_WIDTH = 595.28;   // A4
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

const FONT_SIZES = {
  title: 18,
  h2: 13,
  h3: 11,
  body: 9.5,
  small: 8,
  mono: 8,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number | null, decimals = 2): string {
  if (v === null) return "—";
  return v.toFixed(decimals);
}

function fmtInt(v: number | null): string {
  if (v === null) return "—";
  return Math.round(v).toLocaleString("en-US");
}

// ─── PDF Generator ───────────────────────────────────────────────────────────

export interface PdfResult {
  file_path: string;
  pdf_hash: string;
  report_index: number;
  chain_hash: string;
}

export async function generatePdf(
  result: QueryResult,
  outputPath: string,
  sealInVault: boolean = true,
): Promise<PdfResult> {
  return new Promise((res, rej) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      info: {
        Title: `EVE Evidence Report — ${result.zone} ${result.period.from} to ${result.period.to}`,
        Author: "EVE Electricity Witness",
        Subject: `Deterministic evidence report for ${result.zone}`,
        Creator: "Ask-EVE PDF Engine (pdfkit)",
        Producer: "Organiq Sweden AB",
      },
    });

    const stream = createWriteStream(outputPath);
    doc.pipe(stream);

    let y = MARGIN;

    // ─── Header ────────────────────────────────────────────────────────
    doc.fontSize(FONT_SIZES.title)
       .font("Helvetica-Bold")
       .text("EVE Evidence Report", MARGIN, y);
    y += 26;

    doc.fontSize(FONT_SIZES.body)
       .font("Helvetica")
       .fillColor("#666666")
       .text(`Zone: ${result.zone}  |  Period: ${result.period.from} to ${result.period.to}  |  ${result.hours_total} hours`, MARGIN, y);
    y += 14;

    doc.fontSize(FONT_SIZES.small)
       .text(`Generated: ${result.generated_at_utc}  |  Methodology: ${result.methodology_version}`, MARGIN, y);
    y += 20;

    // Divider
    doc.strokeColor("#e2e8f0").lineWidth(1)
       .moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).stroke();
    y += 15;

    // ─── Summary Statistics ────────────────────────────────────────────
    doc.fillColor("#1a1a1a")
       .fontSize(FONT_SIZES.h2)
       .font("Helvetica-Bold")
       .text("Summary Statistics", MARGIN, y);
    y += 20;

    const summaryRows = [
      ["Metric", "Mean", "Min", "Max"],
      ["Spot Price (EUR/MWh)", fmt(result.spot.mean), fmt(result.spot.min), fmt(result.spot.max)],
      ["Production CO2 (g/kWh)", fmt(result.production_co2.mean), fmt(result.production_co2.min), fmt(result.production_co2.max)],
      ["Consumption CO2 (g/kWh)", fmt(result.consumption_co2.mean), fmt(result.consumption_co2.min), fmt(result.consumption_co2.max)],
      ["Temperature (C)", fmt(result.temperature.mean, 1), fmt(result.temperature.min, 1), fmt(result.temperature.max, 1)],
      ["Net Import (MW avg)", fmt(result.net_import.mean, 0), "—", "—"],
      ["HDD Sum", fmt(result.hdd.sum, 0), "—", "—"],
    ];

    y = drawTable(doc, summaryRows, MARGIN, y, [200, 100, 100, 100]);
    y += 15;

    // ─── Generation Mix ────────────────────────────────────────────────
    doc.fillColor("#1a1a1a")
       .fontSize(FONT_SIZES.h2)
       .font("Helvetica-Bold")
       .text("Generation Mix (Average MW)", MARGIN, y);
    y += 20;

    const gm = result.generation_mix_avg_mw;
    const genRows = [
      ["Source", "Avg MW"],
      ["Nuclear", fmtInt(gm.nuclear)],
      ["Hydro", fmtInt(gm.hydro)],
      ["Wind Onshore", fmtInt(gm.wind_onshore)],
      ["Wind Offshore", fmtInt(gm.wind_offshore)],
      ["Solar", fmtInt(gm.solar)],
      ["Gas", fmtInt(gm.gas)],
      ["Coal", fmtInt(gm.coal)],
      ["Lignite", fmtInt(gm.lignite)],
      ["Oil", fmtInt(gm.oil)],
      ["Other", fmtInt(gm.other)],
      ["Total", fmtInt(gm.total)],
    ];

    y = drawTable(doc, genRows, MARGIN, y, [200, 150]);
    y += 15;

    // ─── Check if we need a new page for verification block ───────────
    if (y > PAGE_HEIGHT - 280) {
      doc.addPage();
      y = MARGIN;
    }

    // ─── Methodology Block ─────────────────────────────────────────────
    doc.fillColor("#1a1a1a")
       .fontSize(FONT_SIZES.h2)
       .font("Helvetica-Bold")
       .text("Methodology", MARGIN, y);
    y += 18;

    doc.fontSize(FONT_SIZES.body).font("Helvetica").fillColor("#333333");
    const methodLines = [
      `Version: ${result.methodology_version}`,
      `Emission Scope: ${result.emission_scope}`,
      `Source: EEA 2023 emission factors, direct combustion only`,
      `Aggregation: PT15M to PT60M arithmetic mean`,
      `Import CO2: EU average 242 gCO2/kWh (Ember 2023)`,
    ];
    for (const line of methodLines) {
      doc.text(line, MARGIN, y);
      y += 13;
    }
    y += 10;

    // ─── Verification Block ────────────────────────────────────────────
    doc.fillColor("#1a1a1a")
       .fontSize(FONT_SIZES.h2)
       .font("Helvetica-Bold")
       .text("Cryptographic Verification", MARGIN, y);
    y += 18;

    // Grey background box
    const boxHeight = 110;
    doc.rect(MARGIN, y, CONTENT_WIDTH, boxHeight)
       .fillColor("#f8fafc").fill();

    const bx = MARGIN + 10;
    let by = y + 10;

    doc.fontSize(FONT_SIZES.mono).font("Courier").fillColor("#1a1a1a");

    const verifyLines = [
      `dataset_eve_id:      ${result.dataset_eve_id ?? "N/A"}`,
      `registry_hash:       ${result.registry_hash ?? "N/A"}`,
      `vault.root_hash:     ${result.vault?.root_hash ?? "N/A"}`,
      `vault.chain_hash:    ${result.vault?.chain_hash ?? "N/A"}`,
      `vault.event_index:   ${result.vault?.event_index ?? "N/A"}`,
      ``,
      `Rebuild: ${result.query_command}`,
    ];

    for (const line of verifyLines) {
      doc.text(line, bx, by, { width: CONTENT_WIDTH - 20 });
      by += 12;
    }
    y += boxHeight + 15;

    // ─── Footer ────────────────────────────────────────────────────────
    doc.strokeColor("#e2e8f0").lineWidth(0.5)
       .moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).stroke();
    y += 8;

    doc.fontSize(FONT_SIZES.small).font("Helvetica").fillColor("#999999");
    doc.text(
      "This report is a deterministic snapshot of locked EVE Timeseries V2 data. " +
      "All values can be independently reproduced using the rebuild command above. " +
      "EVE does not claim normative truth. EVE provides a reproducible computational reference.",
      MARGIN, y, { width: CONTENT_WIDTH }
    );
    y += 30;

    doc.text(
      "EVE Electricity Witness — Organiq Sweden AB — https://github.com/elekto-energy/EVE-Electricity-Witness",
      MARGIN, y, { width: CONTENT_WIDTH, align: "center" }
    );

    // ─── Finalize ──────────────────────────────────────────────────────
    doc.end();

    stream.on("finish", () => {
      // SHA256 of generated PDF
      const pdfBuffer = readFileSync(outputPath);
      const pdfHash = createHash("sha256").update(pdfBuffer).digest("hex");

      if (sealInVault) {
        const vaultEntry = appendReportToVault({
          report_hash: pdfHash,
          dataset_eve_id: result.dataset_eve_id ?? "UNKNOWN",
          root_hash: result.vault?.root_hash ?? "UNKNOWN",
          zone: result.zone,
          period_start: result.period.from,
          period_end: result.period.to,
          query_command: result.query_command,
        });
        res({
          file_path: outputPath,
          pdf_hash: pdfHash,
          report_index: vaultEntry.report_index,
          chain_hash: vaultEntry.chain_hash,
        });
      } else {
        res({
          file_path: outputPath,
          pdf_hash: pdfHash,
          report_index: 0,
          chain_hash: "NOT_SEALED",
        });
      }
    });
    stream.on("error", rej);
  });
}

// ─── Table Drawing Helper ────────────────────────────────────────────────────

function drawTable(
  doc: PDFKit.PDFDocument,
  rows: string[][],
  x: number,
  startY: number,
  colWidths: number[],
): number {
  let y = startY;
  const rowHeight = 16;

  for (let i = 0; i < rows.length; i++) {
    const isHeader = i === 0;
    let cx = x;

    if (isHeader) {
      doc.rect(x, y, colWidths.reduce((a, b) => a + b, 0), rowHeight)
         .fillColor("#f1f5f9").fill();
    }

    doc.fillColor(isHeader ? "#475569" : "#333333")
       .fontSize(isHeader ? FONT_SIZES.small : FONT_SIZES.body)
       .font(isHeader ? "Helvetica-Bold" : "Helvetica");

    for (let j = 0; j < rows[i].length; j++) {
      doc.text(rows[i][j], cx + 4, y + 3, {
        width: colWidths[j] - 8,
        align: j === 0 ? "left" : "right",
      });
      cx += colWidths[j];
    }

    y += rowHeight;

    // Light border
    doc.strokeColor("#e2e8f0").lineWidth(0.5)
       .moveTo(x, y).lineTo(x + colWidths.reduce((a, b) => a + b, 0), y).stroke();
  }

  return y;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  let zone = "", from = "", to = "", output = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--zone" && args[i + 1]) zone = args[++i];
    if (args[i] === "--from" && args[i + 1]) from = args[++i];
    if (args[i] === "--to" && args[i + 1]) to = args[++i];
    if (args[i] === "--output" && args[i + 1]) output = args[++i];
  }

  if (!zone || !from || !to) {
    console.error("Usage: generate_pdf.ts --zone SE3 --from 2024-01-01 --to 2024-01-31 [--output report.pdf]");
    process.exit(1);
  }

  if (!output) {
    output = `evidence_${zone}_${from.replace(/-/g, "")}_${to.replace(/-/g, "")}.pdf`;
  }

  console.log(`[ask-eve] Querying ${zone} ${from} → ${to}...`);
  const result = query({ zone, from, to });

  console.log(`[ask-eve] Generating PDF → ${output}`);
  generatePdf(result, resolve(output)).then((pdfResult) => {
    console.log(`[ask-eve] ✅ PDF generated: ${pdfResult.file_path}`);
    console.log(`[ask-eve]    pdf_hash:       ${pdfResult.pdf_hash}`);
    console.log(`[ask-eve]    report_index:   ${pdfResult.report_index}`);
    console.log(`[ask-eve]    chain_hash:     ${pdfResult.chain_hash.slice(0, 16)}...`);
    console.log(`[ask-eve]    dataset_eve_id: ${result.dataset_eve_id}`);
    console.log(`[ask-eve]    rows:           ${result.rows_count}`);
    console.log(`[ask-eve]    root_hash:      ${result.vault?.root_hash?.slice(0, 16) ?? "N/A"}...`);
  }).catch((err) => {
    console.error(`[ask-eve] ❌ PDF generation failed: ${err.message}`);
    process.exit(1);
  });
}
