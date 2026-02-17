/**
 * Generate SVK Technical Summary — 1 page A4 PDF
 *
 * EVE Electricity Witness — Deterministic Evidence Layer for Nordic Power Markets
 *
 * Usage:
 *   npx tsx packages/evidence/src/ask-eve/generate_svk_summary.ts
 */

import { createWriteStream } from "fs";
import { resolve } from "path";
import PDFDocument from "pdfkit";

const OUTPUT = resolve(__dirname, "../../../../docs/EVE_Technical_Summary_SVK.pdf");

async function generate() {
  return new Promise<void>((res, rej) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 55, right: 55 },
      info: {
        Title: "EVE Electricity Witness — Technical Summary",
        Author: "Organiq Sweden AB",
        Subject: "Deterministic Evidence Layer for Nordic Power Markets",
      },
    });

    const stream = createWriteStream(OUTPUT);
    doc.pipe(stream);

    const W = 595.28 - 110; // content width
    let y = 50;

    // ─── Title ─────────────────────────────────────────────────────────
    doc.fontSize(16).font("Helvetica-Bold").fillColor("#1a1a1a");
    doc.text("EVE Electricity Witness", 55, y);
    y += 22;

    doc.fontSize(10).font("Helvetica").fillColor("#555555");
    doc.text("Deterministic Evidence Layer for Nordic Power Markets", 55, y);
    y += 16;

    doc.fontSize(8).fillColor("#888888");
    doc.text("Organiq Sweden AB  |  February 2026  |  v2.0.0-locked", 55, y);
    y += 18;

    // Divider
    doc.strokeColor("#cccccc").lineWidth(0.5)
       .moveTo(55, y).lineTo(55 + W, y).stroke();
    y += 14;

    // ─── What EVE Is ───────────────────────────────────────────────────
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#1a1a1a");
    doc.text("What EVE Is", 55, y);
    y += 16;

    doc.fontSize(9).font("Helvetica").fillColor("#333333");
    const intro =
      "EVE is a deterministic computational engine that transforms public energy data " +
      "(ENTSO-E Transparency Platform, Open-Meteo ERA5, EEA emission factors) into " +
      "cryptographically sealed, independently verifiable hourly datasets. " +
      "EVE does not model, predict, or recommend. It computes and seals.";
    doc.text(intro, 55, y, { width: W, lineGap: 2 });
    y += doc.heightOfString(intro, { width: W, lineGap: 2 }) + 10;

    // ─── Scope ─────────────────────────────────────────────────────────
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#1a1a1a");
    doc.text("Dataset Scope", 55, y);
    y += 16;

    doc.fontSize(9).font("Helvetica").fillColor("#333333");
    const scopeLines = [
      ["Coverage", "14 bidding zones: SE1-4, NO1-2, FI, DE_LU, PL, EE, LV, LT, FR, NL"],
      ["Period", "2020-01 to present (hourly resolution)"],
      ["Records", "756,336 hourly rows across 1,036 files"],
      ["Schema", "24 fields per row including dataset_eve_id"],
      ["Methodology", "TS_V2_EEA_2023_DIRECT (direct combustion, EEA 2023)"],
      ["Emission scope", "Scope 1 only. No lifecycle, no marginal."],
    ];

    for (const [label, value] of scopeLines) {
      doc.font("Helvetica-Bold").text(`${label}: `, 55, y, { continued: true, width: W });
      doc.font("Helvetica").text(value, { width: W });
      y += 14;
    }
    y += 6;

    // ─── Integrity ─────────────────────────────────────────────────────
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#1a1a1a");
    doc.text("Integrity Guarantees", 55, y);
    y += 16;

    doc.fontSize(9).font("Helvetica").fillColor("#333333");
    const integrityLines = [
      ["Determinism", "Same raw input always produces identical output (root_hash verified)"],
      ["WORM Vault", "Append-only chain with SHA-256 linking. No retroactive mutation."],
      ["Method Lock", "Registry hash 83CCEEBC... anchors methodology. Changes require version bump."],
      ["Audit Endpoint", "GET /api/audit/dataset/{id} returns root_hash, chain, rebuild command"],
      ["Golden Tests", "9/9 automated tests enforce schema, CO2 bounds, flow symmetry, field count"],
      ["Report Vault", "Generated evidence PDFs sealed in separate append-only chain linked to dataset root hashes"],
      ["Rebuild", "Any party can rebuild from public sources and verify hash match"],
    ];

    for (const [label, value] of integrityLines) {
      doc.font("Helvetica-Bold").text(`${label}: `, 55, y, { continued: true, width: W });
      doc.font("Helvetica").text(value, { width: W });
      y += 14;
    }
    y += 6;

    // ─── Architecture ──────────────────────────────────────────────────
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#1a1a1a");
    doc.text("Architecture Principles", 55, y);
    y += 16;

    doc.fontSize(9).font("Helvetica").fillColor("#333333");
    const archLines = [
      "The computational layer contains no probabilistic components. AI may translate queries; it never calculates.",
      "No external runtime dependencies. Runs fully offline in sovereign Docker container.",
      "No black-box inference. Every output traces to public source data via deterministic pipeline.",
      "Evidence reports (PDF) are SHA-256 hashed and sealed in a separate report vault chain.",
    ];

    for (const line of archLines) {
      doc.text(`\u2022  ${line}`, 55, y, { width: W, lineGap: 1 });
      y += doc.heightOfString(`\u2022  ${line}`, { width: W, lineGap: 1 }) + 3;
    }
    y += 6;

    // ─── Deployment ────────────────────────────────────────────────────
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#1a1a1a");
    doc.text("Deployment", 55, y);
    y += 16;

    doc.fontSize(9).font("Helvetica").fillColor("#333333");
    const deployText =
      "Available as Docker container (Light edition for on-premise, Full edition with embedded data). " +
      "No internet access required. Complete audit capability within isolated environment.";
    doc.text(deployText, 55, y, { width: W, lineGap: 2 });
    y += doc.heightOfString(deployText, { width: W, lineGap: 2 }) + 10;

    // ─── What EVE Does NOT Do ──────────────────────────────────────────
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#1a1a1a");
    doc.text("Explicit Non-Claims", 55, y);
    y += 16;

    doc.fontSize(9).font("Helvetica").fillColor("#333333");
    const nonClaims =
      "No marginal emissions. No lifecycle analysis. No demand attribution. " +
      "No forecasting. No policy recommendations. No normative claims. " +
      "EVE provides a reproducible computational reference, not regulatory guidance.";
    doc.text(nonClaims, 55, y, { width: W, lineGap: 2 });
    y += doc.heightOfString(nonClaims, { width: W, lineGap: 2 }) + 10;

    // ─── Contact ───────────────────────────────────────────────────────
    doc.strokeColor("#cccccc").lineWidth(0.5)
       .moveTo(55, y).lineTo(55 + W, y).stroke();
    y += 10;

    doc.fontSize(8).font("Helvetica").fillColor("#888888");
    doc.text(
      "Organiq Sweden AB  |  Joakim Svensson, Founder & Chief Architect  |  github.com/elekto-energy/EVE-Electricity-Witness",
      55, y, { width: W, align: "center" }
    );

    doc.end();
    stream.on("finish", res);
    stream.on("error", rej);
  });
}

generate().then(() => {
  console.log(`✅ SVK Technical Summary generated: ${OUTPUT}`);
}).catch((err) => {
  console.error(`❌ Failed: ${err.message}`);
  process.exit(1);
});
