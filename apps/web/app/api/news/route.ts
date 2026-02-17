/**
 * GET /api/news
 * Returns curated news items. Optional ?category= filter.
 */

import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\web") || cwd.endsWith("apps/web")) {
    return resolve(cwd, "../..");
  }
  return cwd;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  const path = resolve(getProjectRoot(), "data", "canonical", "news", "curated_v1.json");
  if (!existsSync(path)) {
    return NextResponse.json({ items: [], categories: [] });
  }

  const raw = JSON.parse(readFileSync(path, "utf-8"));
  let items = raw.items ?? [];

  // Extract unique categories
  const categories: string[] = [...new Set(items.map((i: any) => i.category))] as string[];

  if (category && category !== "alla") {
    items = items.filter((i: any) => i.category === category);
  }

  // Sort by date descending
  items.sort((a: any, b: any) => b.date.localeCompare(a.date));

  return NextResponse.json({
    items,
    categories,
    total: items.length,
    sources: raw._meta?.sources ?? [],
  });
}
