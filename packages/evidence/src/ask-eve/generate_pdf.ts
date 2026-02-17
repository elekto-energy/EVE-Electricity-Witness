/**
 * Ask-EVE PDF Evidence Report Generator (i18n)
 *
 * Three-layer cryptographic identity:
 *   1. Dataset identity: dataset_eve_id + root_hash (data truth)
 *   2. Query identity:   query_hash = SHA256(zone|from|to|methodology) (computation)
 *   3. Document identity: pdf_hash (presentation, affected by language)
 *
 * Usage:
 *   npx tsx packages/evidence/src/ask-eve/generate_pdf.ts \
 *     --zone SE3 --from 2024-01-01 --to 2024-01-31 \
 *     --lang sv --output report.pdf
 *
 * Prerequisites: npm install pdfkit @types/pdfkit
 */

import { createWriteStream, readFileSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import PDFDocument from "pdfkit";
import { query, type QueryResult } from "./query_v2";
import { appendReportToVault } from "./report_vault";
import { loadLocale, isValidLocale, type SupportedLocale, type Locale } from "./i18n_loader";
import { computeQueryHash } from "./query_hash";

// ─── Layout Constants ────────────────────────────────────────────────────────

const MARGIN = 50;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

const FONT_SIZES = { title: 18, h2: 13, body: 9.5, small: 8, mono: 8 };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number | null, d = 2): string { return v === null ? "—" : v.toFixed(d); }
function fmtInt(v: number | null): string { return v === null ? "—" : Math.round(v).toLocaleString("en-US"); }

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PdfResult {
  file_path: string;
  pdf_hash: string;
  query_hash: string;
  language: string;
  template_version: string;
  report_index: number;
  chain_hash: string;
}

// ─── PDF Generator ───────────────────────────────────────────────────────────

export async function generatePdf(
  result: QueryResult,
  outputPath: string,
  lang: SupportedLocale = "en",
  sealInVault: boolean = true,
): Promise<PdfResult> {
  const L = loadLocale(lang);
  const qHash = computeQueryHash(result.zone, result.period.from, result.period.to, result.methodology_version);

  return new Promise((res, rej) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      info: {
        Title: `${L.header.title} — ${result.zone} ${result.period.from} to ${result.period.to}`,
        Author: "EVE Electricity Witness",
        Subject: `Deterministic evidence report for ${result.zone}`,
        Creator: `Ask-EVE PDF Engine (pdfkit) [${lang}]`,
        Producer: "Organiq Sweden AB",
      },
    });

    const stream = createWriteStream(outputPath);
    doc.pipe(stream);
    let y = MARGIN;

    // ─── Header ──────────────────────────────────────────────────────
    doc.fontSize(FONT_SIZES.title).font("Helvetica-Bold").fillColor("#1a1a1a")
       .text(L.header.title, MARGIN, y);
    y += 26;

    doc.fontSize(FONT_SIZES.body).font("Helvetica").fillColor("#666666")
       .text(`${L.labels.zone}: ${result.zone}  |  ${L.labels.period}: ${result.period.from} — ${result.period.to}  |  ${result.hours_total} ${L.header.hours}`, MARGIN, y);
    y += 14;

    doc.fontSize(FONT_SIZES.small)
       .text(`${L.header.generated}: ${result.generated_at_utc}  |  ${L.header.methodology}: ${result.methodology_version}  |  ${L.meta.language_name} (${lang})`, MARGIN, y);
    y += 20;

    doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).stroke();
    y += 15;

    // ─── Summary Statistics ──────────────────────────────────────────
    doc.fillColor("#1a1a1a").fontSize(FONT_SIZES.h2).font("Helvetica-Bold")
       .text(L.sections.summary, MARGIN, y);
    y += 20;

    const summaryRows = [
      [L.labels.metric, L.labels.mean, L.labels.min, L.labels.max],
      [L.labels.spot_price, fmt(result.spot.mean), fmt(result.spot.min), fmt(result.spot.max)],
      [L.labels.production_co2, fmt(result.production_co2.mean), fmt(result.production_co2.min), fmt(result.production_co2.max)],
      [L.labels.consumption_co2, fmt(result.consumption_co2.mean), fmt(result.consumption_co2.min), fmt(result.consumption_co2.max)],
      [L.labels.temperature, fmt(result.temperature.mean, 1), fmt(result.temperature.min, 1), fmt(result.temperature.max, 1)],
      [L.labels.net_import, fmt(result.net_import.mean, 0), "—", "—"],
      [L.labels.hdd_sum, fmt(result.hdd.sum, 0), "—", "—"],
    ];
    y = drawTable(doc, summaryRows, MARGIN, y, [200, 100, 100, 100]);
    y += 15;

    // ─── Generation Mix ──────────────────────────────────────────────
    doc.fillColor("#1a1a1a").fontSize(FONT_SIZES.h2).font("Helvetica-Bold")
       .text(L.sections.generation_mix, MARGIN, y);
    y += 20;

    const gm = result.generation_mix_avg_mw;
    const genRows = [
      [L.labels.source, L.labels.avg_mw],
      [L.labels.nuclear, fmtInt(gm.nuclear)],
      [L.labels.hydro, fmtInt(gm.hydro)],
      [L.labels.wind_onshore, fmtInt(gm.wind_onshore)],
      [L.labels.wind_offshore, fmtInt(gm.wind_offshore)],
      [L.labels.solar, fmtInt(gm.solar)],
      [L.labels.gas, fmtInt(gm.gas)],
      [L.labels.coal, fmtInt(gm.coal)],
      [L.labels.lignite, fmtInt(gm.lignite)],
      [L.labels.oil, fmtInt(gm.oil)],
      [L.labels.other, fmtInt(gm.other)],
      [L.labels.total, fmtInt(gm.total)],
    ];
    y = drawTable(doc, genRows, MARGIN, y, [200, 150]);
    y += 15;

    // ─── Page break if needed ────────────────────────────────────────
    if (y > PAGE_HEIGHT - 300) { doc.addPage(); y = MARGIN; }

    // ─── Methodology ─────────────────────────────────────────────────
    doc.fillColor("#1a1a1a").fontSize(FONT_SIZES.h2).font("Helvetica-Bold")
       .text(L.sections.methodology, MARGIN, y);
    y += 18;

    doc.fontSize(FONT_SIZES.body).font("Helvetica").fillColor("#333333");
    const methodLines = [
      `${L.methodology_fields.version}: ${result.methodology_version}`,
      `${L.methodology_fields.scope}: ${result.emission_scope}`,
      L.methodology_fields.source_description,
      L.methodology_fields.aggregation,
      L.methodology_fields.import_co2,
    ];
    for (const line of methodLines) { doc.text(line, MARGIN, y); y += 13; }
    y += 10;

    // ─── Verification Block ──────────────────────────────────────────
    doc.fillColor("#1a1a1a").fontSize(FONT_SIZES.h2).font("Helvetica-Bold")
       .text(L.sections.verification, MARGIN, y);
    y += 18;

    const boxHeight = 135;
    doc.rect(MARGIN, y, CONTENT_WIDTH, boxHeight).fillColor("#f8fafc").fill();
    const bx = MARGIN + 10;
    let by = y + 10;

    doc.fontSize(FONT_SIZES.mono).font("Courier").fillColor("#1a1a1a");
    const vLines = [
      `${L.verification_fields.dataset_eve_id}:      ${result.dataset_eve_id ?? "N/A"}`,
      `${L.verification_fields.registry_hash}:       ${result.registry_hash ?? "N/A"}`,
      `${L.verification_fields.vault_root_hash}:     ${result.vault?.root_hash ?? "N/A"}`,
      `${L.verification_fields.vault_chain_hash}:    ${result.vault?.chain_hash ?? "N/A"}`,
      `${L.verification_fields.vault_event_index}:   ${result.vault?.event_index ?? "N/A"}`,
      `${L.verification_fields.query_hash}:          ${qHash.slice(0, 32)}...`,
      `${L.verification_fields.language}:             ${L.meta.language_name} (${lang})`,
      `${L.verification_fields.template_version}:    ${L.meta.template_version}`,
      ``,
      `${L.verification_fields.rebuild}: ${result.query_command}`,
    ];
    for (const line of vLines) { doc.text(line, bx, by, { width: CONTENT_WIDTH - 20 }); by += 12; }
    y += boxHeight + 15;

    // ─── Disclaimer ──────────────────────────────────────────────────
    doc.strokeColor("#e2e8f0").lineWidth(0.5).moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).stroke();
    y += 8;

    doc.fontSize(FONT_SIZES.small).font("Helvetica").fillColor("#999999");
    doc.text(L.disclaimer, MARGIN, y, { width: CONTENT_WIDTH });
    y += doc.heightOfString(L.disclaimer, { width: CONTENT_WIDTH }) + 10;

    doc.text(L.footer, MARGIN, y, { width: CONTENT_WIDTH, align: "center" });

    doc.end();

    stream.on("finish", () => {
      const pdfBuffer = readFileSync(outputPath);
      const pdfHash = createHash("sha256").update(pdfBuffer).digest("hex");

      if (sealInVault) {
        const vaultEntry = appendReportToVault({
          report_hash: pdfHash,
          dataset_eve_id: result.dataset_eve_id ?? "UNKNOWN",
          root_hash: result.vault?.root_hash ?? "UNKNOWN",
          query_hash: qHash,
          zone: result.zone,
          period_start: result.period.from,
          period_end: result.period.to,
          language: lang,
          template_version: L.meta.template_version,
          query_command: result.query_command,
        });
        res({
          file_path: outputPath,
          pdf_hash: pdfHash,
          query_hash: qHash,
          language: lang,
          template_version: L.meta.template_version,
          report_index: vaultEntry.report_index,
          chain_hash: vaultEntry.chain_hash,
        });
      } else {
        res({
          file_path: outputPath,
          pdf_hash: pdfHash,
          query_hash: qHash,
          language: lang,
          template_version: L.meta.template_version,
          report_index: 0,
          chain_hash: "NOT_SEALED",
        });
      }
    });
    stream.on("error", rej);
  });
}

// ─── Table Drawing ───────────────────────────────────────────────────────────

function drawTable(doc: PDFKit.PDFDocument, rows: string[][], x: number, startY: number, colWidths: number[]): number {
  let y = startY;
  const rowHeight = 16;

  for (let i = 0; i < rows.length; i++) {
    const isHeader = i === 0;
    let cx = x;

    if (isHeader) {
      doc.rect(x, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fillColor("#f1f5f9").fill();
    }

    doc.fillColor(isHeader ? "#475569" : "#333333")
       .fontSize(isHeader ? FONT_SIZES.small : FONT_SIZES.body)
       .font(isHeader ? "Helvetica-Bold" : "Helvetica");

    for (let j = 0; j < rows[i].length; j++) {
      doc.text(rows[i][j], cx + 4, y + 3, { width: colWidths[j] - 8, align: j === 0 ? "left" : "right" });
      cx += colWidths[j];
    }

    y += rowHeight;
    doc.strokeColor("#e2e8f0").lineWidth(0.5).moveTo(x, y).lineTo(x + colWidths.reduce((a, b) => a + b, 0), y).stroke();
  }

  return y;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  let zone = "", from = "", to = "", output = "", lang = "en";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--zone" && args[i + 1]) zone = args[++i];
    if (args[i] === "--from" && args[i + 1]) from = args[++i];
    if (args[i] === "--to" && args[i + 1]) to = args[++i];
    if (args[i] === "--output" && args[i + 1]) output = args[++i];
    if (args[i] === "--lang" && args[i + 1]) lang = args[++i];
  }

  if (!zone || !from || !to) {
    console.error("Usage: generate_pdf.ts --zone SE3 --from 2024-01-01 --to 2024-01-31 [--lang sv] [--output report.pdf]");
    process.exit(1);
  }

  if (!isValidLocale(lang)) {
    console.error(`Invalid language: ${lang}. Supported: en, sv`);
    process.exit(1);
  }

  if (!output) {
    output = `evidence_${zone}_${from.replace(/-/g, "")}_${to.replace(/-/g, "")}_${lang}.pdf`;
  }

  console.log(`[ask-eve] Querying ${zone} ${from} → ${to} (${lang})...`);
  const result = query({ zone, from, to });

  console.log(`[ask-eve] Generating PDF → ${output}`);
  generatePdf(result, resolve(output), lang as SupportedLocale).then((r) => {
    console.log(`[ask-eve] ✅ PDF generated: ${r.file_path}`);
    console.log(`[ask-eve]    language:        ${r.language}`);
    console.log(`[ask-eve]    pdf_hash:        ${r.pdf_hash}`);
    console.log(`[ask-eve]    query_hash:      ${r.query_hash.slice(0, 16)}...`);
    console.log(`[ask-eve]    template:        ${r.template_version}`);
    console.log(`[ask-eve]    report_index:    ${r.report_index}`);
    console.log(`[ask-eve]    chain_hash:      ${r.chain_hash.slice(0, 16)}...`);
    console.log(`[ask-eve]    dataset_eve_id:  ${result.dataset_eve_id}`);
  }).catch((err) => {
    console.error(`[ask-eve] ❌ Failed: ${err.message}`);
    process.exit(1);
  });
}
