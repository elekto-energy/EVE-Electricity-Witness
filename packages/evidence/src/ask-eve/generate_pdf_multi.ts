/**
 * Ask-EVE Multi-Zone PDF Evidence Report — Sverige (SE1–SE4)
 *
 * Cryptographic identity:
 *   1. Dataset identity: dataset_eve_ids[] + root_hashes (per zone)
 *   2. Query identity:   composite_query_hash = SHA256("SE1,SE2,SE3,SE4"|from|to|methodology)
 *   3. Document identity: pdf_hash (presentation)
 *
 * Usage:
 *   npx tsx packages/evidence/src/ask-eve/generate_pdf_multi.ts \
 *     --from 2024-01-01 --to 2024-01-31 --lang sv --output report.pdf
 *
 * TR1: No source, no number.
 * TR6: Code reads — never invents.
 */

import { createWriteStream, readFileSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import PDFDocument from "pdfkit";
import { queryMultiSE, computeCompositeQueryHash, type MultiZoneResult } from "./query_multi_se";
import { appendReportToVault } from "./report_vault";
import { loadLocale, isValidLocale, type SupportedLocale } from "./i18n_loader";
import { resolveFxRate, eurMwhToSekKwh, type FxResult } from "../fx/resolve_fx";

const MARGIN = 50;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const FONT_SIZES = { title: 18, h2: 13, h3: 11, body: 9.5, small: 8, mono: 8 };
const TEMPLATE_VERSION = "MULTI_SE_V1";

const ZONE_LABELS: Record<string, string> = {
  SE1: "SE1 Luleå", SE2: "SE2 Sundsvall", SE3: "SE3 Stockholm", SE4: "SE4 Malmö",
};

function fmt(v: number | null, d = 2): string { return v === null ? "—" : v.toFixed(d); }
function fmtInt(v: number | null): string { return v === null ? "—" : Math.round(v).toLocaleString("en-US"); }
function fmtSign(v: number | null, d = 2): string { return v === null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(d); }

export interface PdfMultiResult {
  file_path: string;
  pdf_hash: string;
  composite_query_hash: string;
  language: string;
  template_version: string;
  report_index: number;
  chain_hash: string;
}

export async function generateMultiPdf(
  result: MultiZoneResult,
  outputPath: string,
  lang: SupportedLocale = "en",
  sealInVault: boolean = true,
): Promise<PdfMultiResult> {
  const L = loadLocale(lang);
  const compositeHash = result.composite_query_hash;
  const isSv = lang === "sv";

  let fx: FxResult | null = null;
  try { fx = resolveFxRate(result.period.from); } catch {}

  const fmtSpot = (v: number | null): string => {
    if (v === null) return "—";
    if (isSv && fx) return eurMwhToSekKwh(v, fx.fx_rate).toFixed(3);
    return v.toFixed(2);
  };
  const spotUnit = isSv && fx ? "kr/kWh" : "EUR/MWh";

  return new Promise((res, rej) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      info: {
        Title: `EVE Evidence Report — Sverige (SE1–SE4) ${result.period.from} to ${result.period.to}`,
        Author: "EVE Electricity Witness",
        Subject: "Multi-zone deterministic evidence report for Sweden",
        Creator: `Ask-EVE PDF Engine (multi) [${lang}]`,
        Producer: "Organiq Sweden AB",
      },
    });

    const stream = createWriteStream(outputPath);
    doc.pipe(stream);
    let y = MARGIN;

    // ─── Header ──────────────────────────────────────────────────────
    doc.fontSize(FONT_SIZES.title).font("Helvetica-Bold").fillColor("#1a1a1a")
       .text(isSv ? "EVE Evidensrapport — Sverige" : "EVE Evidence Report — Sweden", MARGIN, y);
    y += 26;

    doc.fontSize(FONT_SIZES.body).font("Helvetica").fillColor("#666666")
       .text(`SE1, SE2, SE3, SE4  |  ${result.period.from} — ${result.period.to}  |  ${result.aggregate.hours_total}h × 4 ${isSv ? "zoner" : "zones"}`, MARGIN, y);
    y += 14;

    doc.fontSize(FONT_SIZES.small)
       .text(`${isSv ? "Genererad" : "Generated"}: ${result.generated_at_utc}  |  ${result.methodology_version}  |  ${isSv ? "Svenska" : "English"} (${lang})`, MARGIN, y);
    y += 20;

    doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).stroke();
    y += 15;

    // ─── Aggregate Summary ───────────────────────────────────────────
    doc.fillColor("#1a1a1a").fontSize(FONT_SIZES.h2).font("Helvetica-Bold")
       .text(isSv ? "Riksöversikt" : "National Overview", MARGIN, y);
    y += 20;

    const aggRows = [
      [isSv ? "Mått" : "Metric", isSv ? "Medel" : "Mean", "Min", "Max"],
      [`${isSv ? "Spotpris" : "Spot Price"} (${spotUnit})`, fmtSpot(result.aggregate.spot.mean), fmtSpot(result.aggregate.spot.min), fmtSpot(result.aggregate.spot.max)],
      [`${isSv ? "CO₂ produktion" : "CO₂ Production"} (g/kWh)`, fmt(result.aggregate.production_co2.mean), "—", "—"],
      [`${isSv ? "CO₂ konsumtion" : "CO₂ Consumption"} (g/kWh)`, fmt(result.aggregate.consumption_co2.mean), "—", "—"],
      [`${isSv ? "Temperatur" : "Temperature"} (°C)`, fmt(result.aggregate.temperature.mean, 1), "—", "—"],
      ["HDD", fmt(result.aggregate.hdd.sum, 0), "—", "—"],
    ];
    y = drawTable(doc, aggRows, MARGIN, y, [200, 100, 100, 100]);

    if (isSv && fx) {
      y += 4;
      doc.fontSize(FONT_SIZES.small).font("Helvetica").fillColor("#888888")
         .text(`EUR→SEK: ECB ${fx.fx_period} (${fx.fx_rate} SEK/EUR)`, MARGIN, y);
      y += 12;
    }
    y += 15;

    // ─── Per-Zone Price Comparison ───────────────────────────────────
    doc.fillColor("#1a1a1a").fontSize(FONT_SIZES.h2).font("Helvetica-Bold")
       .text(isSv ? "Zonpriser" : "Zone Prices", MARGIN, y);
    y += 20;

    const zoneRows = [
      [isSv ? "Zon" : "Zone", isSv ? "Medel" : "Mean", "Min", "Max", isSv ? "Timmar" : "Hours"],
    ];
    for (const z of ["SE1", "SE2", "SE3", "SE4"]) {
      const zr = result.zone_results[z];
      if (!zr) { zoneRows.push([z, "—", "—", "—", "—"]); continue; }
      zoneRows.push([ZONE_LABELS[z] ?? z, fmtSpot(zr.spot.mean), fmtSpot(zr.spot.min), fmtSpot(zr.spot.max), String(zr.hours_total)]);
    }
    y = drawTable(doc, zoneRows, MARGIN, y, [120, 90, 90, 90, 90]);
    y += 15;

    // ─── Bottleneck Per Zone ─────────────────────────────────────────
    if (result.system_price?.available) {
      doc.fillColor("#1a1a1a").fontSize(FONT_SIZES.h2).font("Helvetica-Bold")
         .text(isSv ? "Intern prisdifferens (DDM v1.1)" : "Internal Price Spread (DDM v1.1)", MARGIN, y);
      y += 20;

      const bnRows = [
        [isSv ? "Zon" : "Zone", isSv ? "Medel" : "Mean", "Max", isSv ? "Andel" : "Share", `${isSv ? "Tim" : "Hrs"} +`, `${isSv ? "Tim" : "Hrs"} −`],
      ];
      for (const z of ["SE1", "SE2", "SE3", "SE4"]) {
        const zr = result.zone_results[z];
        if (!zr?.bottleneck?.available) { bnRows.push([z, "—", "—", "—", "—", "—"]); continue; }
        const bn = zr.bottleneck;
        bnRows.push([
          ZONE_LABELS[z] ?? z,
          fmtSign(isSv && fx ? eurMwhToSekKwh(bn.mean!, fx.fx_rate) : bn.mean),
          fmtSign(isSv && fx ? eurMwhToSekKwh(bn.max!, fx.fx_rate) : bn.max),
          `${bn.mean_pct ?? 0}%`,
          String(bn.hours_positive),
          String(bn.hours_negative),
        ]);
      }
      y = drawTable(doc, bnRows, MARGIN, y, [120, 75, 75, 60, 60, 60]);
      y += 15;
    }

    // ─── Page break if needed ────────────────────────────────────────
    if (y > PAGE_HEIGHT - 350) { doc.addPage(); y = MARGIN; }

    // ─── Generation Mix (Total Sweden) ───────────────────────────────
    doc.fillColor("#1a1a1a").fontSize(FONT_SIZES.h2).font("Helvetica-Bold")
       .text(isSv ? "Total svensk produktion" : "Total Swedish Generation", MARGIN, y);
    y += 20;

    const gm = result.aggregate.generation_mix_total_mw;
    const genRows = [
      [isSv ? "Källa" : "Source", isSv ? "Medel MW" : "Avg MW"],
      [isSv ? "Kärnkraft" : "Nuclear", fmtInt(gm.nuclear)],
      [isSv ? "Vatten" : "Hydro", fmtInt(gm.hydro)],
      [isSv ? "Vind" : "Wind onshore", fmtInt(gm.wind_onshore)],
      [isSv ? "Vind hav" : "Wind offshore", fmtInt(gm.wind_offshore)],
      [isSv ? "Sol" : "Solar", fmtInt(gm.solar)],
      ["Gas", fmtInt(gm.gas)],
      [isSv ? "Kol" : "Coal", fmtInt(gm.coal)],
      [isSv ? "Brunkol" : "Lignite", fmtInt(gm.lignite)],
      [isSv ? "Olja" : "Oil", fmtInt(gm.oil)],
      [isSv ? "Övrigt" : "Other", fmtInt(gm.other)],
      ["Total", fmtInt(gm.total)],
    ];
    y = drawTable(doc, genRows, MARGIN, y, [200, 150]);
    y += 15;

    // ─── Methodology ─────────────────────────────────────────────────
    if (y > PAGE_HEIGHT - 250) { doc.addPage(); y = MARGIN; }

    doc.fillColor("#1a1a1a").fontSize(FONT_SIZES.h2).font("Helvetica-Bold")
       .text(isSv ? "Metodik" : "Methodology", MARGIN, y);
    y += 18;

    doc.fontSize(FONT_SIZES.body).font("Helvetica").fillColor("#333333");
    const methodLines = [
      `${isSv ? "Version" : "Version"}: ${result.methodology_version}`,
      `${isSv ? "Utsläppsomfång" : "Emission scope"}: ${result.emission_scope}`,
      isSv
        ? "Zonpriser aggregeras som enkelt medelvärde (ingen viktning — konsumtionsdata saknas)."
        : "Zone prices aggregated as simple mean (no volume weighting — consumption data unavailable).",
      isSv
        ? "Produktion summeras (total svensk kapacitet). CO₂ viktas mot produktion per zon."
        : "Generation summed (total Swedish capacity). CO₂ weighted by generation per zone.",
      isSv
        ? "Intern prisdifferens beräknas per zon (DDM v1.1: Zonpris − Systempris). Ej aggregerbar."
        : "Internal price spread computed per zone (DDM v1.1: ZonePrice − SystemPrice). Not aggregatable.",
    ];
    for (const line of methodLines) { doc.text(line, MARGIN, y, { width: CONTENT_WIDTH }); y += 13; }
    y += 10;

    // ─── Methodology warnings ────────────────────────────────────────
    if (result.methodology_warnings.length > 0) {
      doc.fillColor("#f59e0b").fontSize(FONT_SIZES.small).font("Helvetica-Bold");
      for (const w of result.methodology_warnings) {
        doc.text(`⚠ ${w}`, MARGIN, y, { width: CONTENT_WIDTH });
        y += doc.heightOfString(`⚠ ${w}`, { width: CONTENT_WIDTH }) + 4;
      }
      y += 8;
    }

    // ─── Verification Block ──────────────────────────────────────────
    if (y > PAGE_HEIGHT - 220) { doc.addPage(); y = MARGIN; }

    doc.fillColor("#1a1a1a").fontSize(FONT_SIZES.h2).font("Helvetica-Bold")
       .text(isSv ? "Verifiering" : "Verification", MARGIN, y);
    y += 18;

    const boxHeight = 140 + result.dataset_eve_ids.length * 12 + (fx ? 24 : 0);
    doc.rect(MARGIN, y, CONTENT_WIDTH, boxHeight).fillColor("#f8fafc").fill();
    const bx = MARGIN + 10;
    let by = y + 10;

    doc.fontSize(FONT_SIZES.mono).font("Courier").fillColor("#1a1a1a");
    const vLines = [
      `composite_query_hash:    ${compositeHash}`,
      `zones:                   SE1, SE2, SE3, SE4`,
      `period:                  ${result.period.from} → ${result.period.to}`,
      `methodology:             ${result.methodology_version}`,
      `template_version:        ${TEMPLATE_VERSION}`,
      `language:                ${isSv ? "Svenska" : "English"} (${lang})`,
      ``,
      ...(fx ? [
        `fx_rate:                 ${fx.fx_rate} SEK/EUR (ECB ${fx.fx_period})`,
        `fx_file_hash:            ${fx.fx_file_hash}`,
      ] : []),
      ``,
      `dataset_eve_ids:`,
      ...result.dataset_eve_ids.map(id => `  ${id}`),
      ``,
      `rebuild: ${result.query_command}`,
    ];
    for (const line of vLines) { doc.text(line, bx, by, { width: CONTENT_WIDTH - 20 }); by += 12; }
    y += boxHeight + 15;

    // ─── Disclaimer ──────────────────────────────────────────────────
    doc.strokeColor("#e2e8f0").lineWidth(0.5).moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).stroke();
    y += 8;

    doc.fontSize(FONT_SIZES.small).font("Helvetica").fillColor("#999999");
    const disclaimer = isSv
      ? "Denna rapport beskriver observerade prisrelationer. Inga slutsatser om orsak, motiv eller ansvar görs. Informationen utgör inte finansiell, juridisk eller regulatorisk rådgivning."
      : "This report describes observed price relationships. No conclusions regarding cause, motive or responsibility are drawn. The information does not constitute financial, legal or regulatory advice.";
    doc.text(disclaimer, MARGIN, y, { width: CONTENT_WIDTH });
    y += doc.heightOfString(disclaimer, { width: CONTENT_WIDTH }) + 10;

    doc.text("EVE Electricity Witness · Organiq Sweden AB", MARGIN, y, { width: CONTENT_WIDTH, align: "center" });

    doc.end();

    stream.on("finish", () => {
      const pdfBuffer = readFileSync(outputPath);
      const pdfHash = createHash("sha256").update(pdfBuffer).digest("hex");

      if (sealInVault) {
        const vaultEntry = appendReportToVault({
          report_hash: pdfHash,
          dataset_eve_id: result.dataset_eve_ids.join("|"),
          root_hash: compositeHash,
          query_hash: compositeHash,
          zone: "SE",
          period_start: result.period.from,
          period_end: result.period.to,
          language: lang,
          template_version: TEMPLATE_VERSION,
          query_command: result.query_command,
          fx_rate: fx?.fx_rate ?? null,
          fx_period: fx?.fx_period ?? null,
          fx_source: fx?.fx_source ?? null,
          fx_file_hash: fx?.fx_file_hash ?? null,
        });
        res({
          file_path: outputPath,
          pdf_hash: pdfHash,
          composite_query_hash: compositeHash,
          language: lang,
          template_version: TEMPLATE_VERSION,
          report_index: vaultEntry.report_index,
          chain_hash: vaultEntry.chain_hash,
        });
      } else {
        res({
          file_path: outputPath,
          pdf_hash: pdfHash,
          composite_query_hash: compositeHash,
          language: lang,
          template_version: TEMPLATE_VERSION,
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
  let from = "", to = "", output = "", lang = "en";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from" && args[i + 1]) from = args[++i];
    if (args[i] === "--to" && args[i + 1]) to = args[++i];
    if (args[i] === "--output" && args[i + 1]) output = args[++i];
    if (args[i] === "--lang" && args[i + 1]) lang = args[++i];
  }

  if (!from || !to) {
    console.error("Usage: generate_pdf_multi.ts --from 2024-01-01 --to 2024-01-31 [--lang sv] [--output report.pdf]");
    process.exit(1);
  }

  if (!isValidLocale(lang)) {
    console.error(`Invalid language: ${lang}. Supported: en, sv`);
    process.exit(1);
  }

  if (!output) {
    output = `evidence_SE_${from.replace(/-/g, "")}_${to.replace(/-/g, "")}_${lang}.pdf`;
  }

  console.log(`[ask-eve-multi] Querying SE1–SE4 ${from} → ${to} (${lang})...`);
  const result = queryMultiSE(from, to);

  console.log(`[ask-eve-multi] Generating PDF → ${output}`);
  generateMultiPdf(result, resolve(output), lang as SupportedLocale).then((r) => {
    console.log(`[ask-eve-multi] ✅ PDF generated: ${r.file_path}`);
    console.log(`[ask-eve-multi]    language:        ${r.language}`);
    console.log(`[ask-eve-multi]    pdf_hash:        ${r.pdf_hash}`);
    console.log(`[ask-eve-multi]    composite_hash:  ${r.composite_query_hash.slice(0, 16)}...`);
    console.log(`[ask-eve-multi]    template:        ${r.template_version}`);
    console.log(`[ask-eve-multi]    report_index:    ${r.report_index}`);
    console.log(`[ask-eve-multi]    chain_hash:      ${r.chain_hash.slice(0, 16)}...`);
  }).catch((err) => {
    console.error(`[ask-eve-multi] ❌ Failed: ${err.message}`);
    process.exit(1);
  });
}
