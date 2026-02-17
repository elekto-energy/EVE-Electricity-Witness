/**
 * POST /api/ask-eve/pdf
 *
 * Generate evidence PDF and seal in report vault.
 * Returns PDF as download + vault metadata in headers.
 */

import { NextResponse } from "next/server";
import { resolve } from "path";
import { readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\web") || cwd.endsWith("apps/web")) {
    return resolve(cwd, "../..");
  }
  return cwd;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { zone, start, end, lang } = body;

    if (!zone || !start || !end) {
      return NextResponse.json(
        { error: "Missing required fields: zone, start, end" },
        { status: 400 },
      );
    }

    const language = lang ?? "en";
    const root = getProjectRoot();

    // Import query + PDF engine
    const { query } = await import(`${root}/packages/evidence/src/ask-eve/query_v2`);
    const { generatePdf } = await import(`${root}/packages/evidence/src/ask-eve/generate_pdf`);

    // Run deterministic query
    const result = query({ zone, from: start, to: end });

    // Generate PDF to temp file
    const tmpFile = resolve(tmpdir(), `eve_${randomBytes(8).toString("hex")}.pdf`);
    const pdfResult = await generatePdf(result, tmpFile, language);

    // Read PDF and clean up
    const pdfBuffer = readFileSync(tmpFile);
    try { unlinkSync(tmpFile); } catch {}

    // Return PDF with metadata in headers
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="evidence_${zone}_${start}_${end}_${language}.pdf"`,
        "X-EVE-PDF-Hash": pdfResult.pdf_hash,
        "X-EVE-Query-Hash": pdfResult.query_hash,
        "X-EVE-Language": pdfResult.language,
        "X-EVE-Template-Version": pdfResult.template_version,
        "X-EVE-Report-Index": String(pdfResult.report_index),
        "X-EVE-Chain-Hash": pdfResult.chain_hash,
      },
    });

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 },
    );
  }
}
