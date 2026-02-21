/**
 * POST /api/load/upload
 *
 * Tar emot förbrukningsfil (CSV, Excel, PDF) och returnerar parsad lastdata.
 * Ingen server-side lagring — all data returneras direkt till klienten.
 *
 * Request: multipart/form-data med fält "file"
 * Response: ParseResult (se load-parser.ts)
 *
 * Max filstorlek: 10 MB
 */

import { NextRequest, NextResponse } from "next/server";
import { parseLoadFile } from "@/lib/simulate/load-parser";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Ingen fil bifogad. Skicka en CSV, Excel eller PDF." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { ok: false, error: `Filen är för stor (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await parseLoadFile(buffer, file.name, file.type);

    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[/api/load/upload] Error:", e);
    return NextResponse.json(
      { ok: false, error: `Serverfel: ${e.message}` },
      { status: 500 }
    );
  }
}
