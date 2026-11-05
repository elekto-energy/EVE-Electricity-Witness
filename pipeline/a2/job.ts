/**
 * ELMONITOR A2 - one scheduled update, as run by the Vercel Cron route (apps/web/app/api/cron/a2/route.ts).
 * OWNER-GO 2026-11-05 option 1, moved from GitHub Actions to Vercel by owner choice (no keys on GitHub).
 *
 * Steps (each one leaves the previous published state live on failure):
 *   1. A2 run into the A2 store, newest days first, within a time budget; groups not started are deferred to the
 *      next run and recorded in the run report (plan.deferred_groups / deferred_days).
 *   2. ECB EUR/SEK reference rates: raw jsondata response, kept as evidence.
 *   3. Site snapshot from the verified current A2 version ("today" = local date of the export).
 *   4. Publish the snapshot to the site store (content-addressed + pointer log).
 */

import { exportSnapshot } from "./export_preview";
import { publishSite } from "./publish_site";
import { runA2, RunOptions } from "./run_a2";
import { sha256, StorageAdapter } from "./store";

export const ECB_SERIES_URL = "https://data-api.ecb.europa.eu/service/data/EXR/D.SEK.EUR.SP00.A";

export interface JobOptions {
  a2: StorageAdapter;
  site: StorageAdapter;
  token: string;
  workDir: string;
  /** Epoch ms after which no new ENTSO-E group is started. */
  acquireDeadlineMs: number;
  instrument?: Record<string, string>;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  /** Test hooks passed to runA2 (today, now, acquire sleep/clock). */
  a2Extra?: Partial<RunOptions>;
}

export interface JobResult {
  ok: boolean;
  stage: "A2" | "ECB" | "EXPORT" | "PUBLISH_SITE" | "DONE";
  error?: string;
  a2: { run_id: string; status: string; exit_code: number; plan_groups: number; deferred_groups: number; source_errors: number; revisions: number; version_id: string | null } | null;
  ecb_raw_sha256?: string;
  site?: { status: string; sha256: string; today: string; a2_version_id: string };
}

async function fetchEcb(f: typeof fetch, now: Date): Promise<Buffer> {
  const start = new Date(now.getTime() - 45 * 86400000).toISOString().slice(0, 10);
  const url = `${ECB_SERIES_URL}?format=jsondata&startPeriod=${start}`;
  let last = "";
  for (const wait of [0, 5000, 15000]) {
    if (wait) await new Promise(r => setTimeout(r, wait));
    try {
      const r = await f(url, { headers: { accept: "application/json" } });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      last = `HTTP ${r.status}`;
    } catch (e: any) { last = String(e?.message ?? e); }
  }
  throw new Error(`ECB request failed: ${last}`);
}

export async function runJob(o: JobOptions): Promise<JobResult> {
  const now = o.now ?? (() => new Date());
  let r;
  try {
    r = await runA2({
      store: o.a2, workDir: o.workDir, token: o.token, deadlineMs: o.acquireDeadlineMs, recentFirst: true, instrument: o.instrument,
      ...o.a2Extra,
    });
  } catch (e: any) {
    // Setup failure before a run report exists (e.g. store unreachable, published state fails verification).
    return { ok: false, stage: "A2", error: String(e?.message ?? e).split(o.token).join("[REDACTED]"), a2: null };
  }
  const rep = r.report;
  const a2 = {
    run_id: rep.run_id, status: rep.status, exit_code: r.exitCode, plan_groups: rep.plan.groups,
    deferred_groups: rep.plan.deferred_groups ?? 0, source_errors: rep.source_errors.length, revisions: rep.revisions.length,
    version_id: rep.publish.version_id ?? rep.publish.previous_version_id ?? null,
  };
  // 0 PUBLISHED / NO_CHANGE, 3 PUBLISHED_WITH_SOURCE_ERRORS (errors visible in register and run report).
  if (r.exitCode !== 0 && r.exitCode !== 3) return { ok: false, stage: "A2", error: rep.publish.error ?? rep.status, a2 };

  let ecb: Buffer;
  try { ecb = await fetchEcb(o.fetchImpl ?? fetch, now()); }
  catch (e: any) { return { ok: false, stage: "ECB", error: String(e?.message ?? e), a2 }; }

  let exp;
  try { exp = await exportSnapshot(o.a2, { asOf: "now", fxRaw: ecb, clock: now }); }
  catch (e: any) { return { ok: false, stage: "EXPORT", error: String(e?.message ?? e), a2, ecb_raw_sha256: sha256(ecb) }; }

  try {
    const p = await publishSite(o.site, exp.body, now, ecb);
    return {
      ok: true, stage: "DONE", a2, ecb_raw_sha256: sha256(ecb),
      site: { status: p.status, sha256: p.pointer.sha256, today: p.pointer.today, a2_version_id: p.pointer.a2_version_id },
    };
  } catch (e: any) {
    return { ok: false, stage: "PUBLISH_SITE", error: String(e?.message ?? e), a2, ecb_raw_sha256: sha256(ecb) };
  }
}
