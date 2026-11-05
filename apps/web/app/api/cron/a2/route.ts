/**
 * Elmonitor data update, called by Vercel Cron (apps/web/vercel.json). OWNER-GO 2026-11-05 option 1, run on Vercel.
 *
 * Needs in the Vercel project (Settings -> Environment Variables):
 *   CRON_SECRET            any long random string; Vercel Cron sends it as "Authorization: Bearer <value>"
 *   ENTSOE_TOKEN           ENTSO-E Transparency Platform token
 *   ELMONITOR_BLOB_ACCESS  "public" or "private", as the Blob store was created (no default)
 * Blob credentials come from the store connected to the project (OIDC or BLOB_READ_WRITE_TOKEN, resolved by the SDK).
 *
 * Fails closed: without CRON_SECRET every call is 401. Nothing secret is logged or returned.
 */

import { timingSafeEqual } from "crypto";
import { revalidatePath } from "next/cache";
import * as blob from "@vercel/blob";
import { BlobAdapter, type BlobSdk } from "../../../../../../pipeline/a2/store";
import { runJob } from "../../../../../../pipeline/a2/job";
import instrument from "@/lib/a2/instrument.generated.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;          // Pro maximum without the extended-duration beta
export const preferredRegion = "arn1";   // Stockholm, next to the Blob store and closer to ENTSO-E

const ACQUIRE_BUDGET_MS = 540_000;       // no new ENTSO-E request after 9 min; the rest is merge, publish, export

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    // Logged so a refused call is visible in Runtime Logs; nothing from the request headers is written.
    console.warn(`[elmonitor-a2] refused: ${process.env.CRON_SECRET ? "authorization header does not match CRON_SECRET" : "CRON_SECRET is not set"}`);
    return new Response("Unauthorized", { status: 401 });
  }
  const started = Date.now();
  console.log(`[elmonitor-a2] start ${new Date(started).toISOString()}`);
  const token = (process.env.ENTSOE_TOKEN ?? "").trim();
  const access = process.env.ELMONITOR_BLOB_ACCESS ?? "";
  if (!token) return Response.json({ ok: false, stage: "SETUP", error: "ENTSOE_TOKEN is not set" }, { status: 500 });
  if (access !== "public" && access !== "private") {
    return Response.json({ ok: false, stage: "SETUP", error: `ELMONITOR_BLOB_ACCESS must be "public" or "private", got "${access}"` }, { status: 500 });
  }
  const sdk = async () => blob as unknown as BlobSdk;
  const result = await runJob({
    a2: new BlobAdapter("elmonitor/a2", access, sdk),
    site: new BlobAdapter("elmonitor/site", access, sdk),
    token,
    workDir: `/tmp/a2_work_${started}`,
    acquireDeadlineMs: started + ACQUIRE_BUDGET_MS,
    instrument: instrument as Record<string, string>,
  });
  if (result.ok && result.site?.status === "PUBLISHED") {
    for (const p of ["/", "/omraden", "/data"]) revalidatePath(p);
  }
  const body = { ...result, duration_ms: Date.now() - started };
  console.log(`[elmonitor-a2] ${JSON.stringify(body)}`);
  return Response.json(body, { status: result.ok ? 200 : 500 });
}
