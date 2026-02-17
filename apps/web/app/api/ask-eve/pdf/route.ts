/**
 * POST /api/ask-eve/pdf
 *
 * Generate evidence PDF and seal in report vault.
 * Returns PDF as download + vault metadata in headers.
 */

import { NextResponse } from "next/server";
import { resolve } from "path";
import { readFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { execSync } from "child_process";

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
    const tmpFile = resolve(tmpdir(), `eve_${randomBytes(8).toString("hex")}.pdf`);

    // Shell out to the CLI — guaranteed to work, same as manual CLI usage
    const script = resolve(root, "packages/evidence/src/ask-eve/generate_pdf.ts");
    if (!existsSync(script)) {
      return NextResponse.json(
        { error: `PDF generator not found: ${script}` },
        { status: 500 },
      );
    }

    const cmd = `npx tsx "${script}" --zone ${zone} --from ${start} --to ${end} --lang ${language} --output "${tmpFile}"`;

    try {
      const output = execSync(cmd, {
        cwd: root,
        timeout: 30_000,
        encoding: "utf-8",
        env: { ...process.env, NODE_ENV: "production" },
      });

      // Parse output for metadata
      const parseField = (prefix: string): string => {
        const line = output.split("\n").find(l => l.includes(prefix));
        return line?.split(prefix)[1]?.trim() ?? "";
      };

      const pdfHash = parseField("pdf_hash:");
      const queryHash = parseField("query_hash:");
      const templateVersion = parseField("template:");
      const reportIndex = parseField("report_index:");
      const chainHash = parseField("chain_hash:");

      if (!existsSync(tmpFile)) {
        return NextResponse.json(
          { error: "PDF generation completed but file not found" },
          { status: 500 },
        );
      }

      const pdfBuffer = readFileSync(tmpFile);
      try { unlinkSync(tmpFile); } catch {}

      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="evidence_${zone}_${start}_${end}_${language}.pdf"`,
          "X-EVE-PDF-Hash": pdfHash,
          "X-EVE-Query-Hash": queryHash,
          "X-EVE-Language": language,
          "X-EVE-Template-Version": templateVersion,
          "X-EVE-Report-Index": reportIndex,
          "X-EVE-Chain-Hash": chainHash,
        },
      });

    } catch (execErr: any) {
      return NextResponse.json(
        { error: `PDF generation failed: ${execErr.stderr || execErr.message}` },
        { status: 500 },
      );
    }

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 },
    );
  }
}
