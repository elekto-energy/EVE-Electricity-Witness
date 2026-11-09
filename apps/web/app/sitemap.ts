import type { MetadataRoute } from "next";
import { SITE_URL, INDEXABLE_PATHS } from "@/lib/site";
import { loadSnapshot } from "@/lib/preview/load";

export const revalidate = 3600;

/** Indexable pages only. lastModified = when the data shown on them was last published. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { snapshot } = await loadSnapshot();
  const lastModified = snapshot.source.published_at_utc;
  return INDEXABLE_PATHS.map(path => ({
    url: `${SITE_URL}${path === "/" ? "/" : path}`,
    lastModified,
    changeFrequency: path === "/data" ? "daily" : "hourly",
    priority: path === "/" ? 1 : path.startsWith("/elpris/") ? 0.9 : 0.6,
  }));
}
