/**
 * GET /api/opinion/analysis/[slug]
 * Returns analysis data by slug: "ringhals-cost" | "bottleneck-solutions"
 */

import { NextResponse } from "next/server";
import { loadRinghalsTimeline, loadBottleneckSolutions, loadCapacityLayers } from "@/lib/opinion/readAnalyses";

const SLUG_MAP: Record<string, () => any> = {
  "ringhals-cost": loadRinghalsTimeline,
  "bottleneck-solutions": loadBottleneckSolutions,
  "capacity-layers": loadCapacityLayers,
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const loader = SLUG_MAP[slug];
  if (!loader) {
    return NextResponse.json({ error: `Unknown analysis: ${slug}` }, { status: 404 });
  }
  const data = loader();
  if (!data) {
    return NextResponse.json({ error: `Analysis data not found: ${slug}` }, { status: 404 });
  }
  return NextResponse.json(data);
}
