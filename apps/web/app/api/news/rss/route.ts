/**
 * GET /api/news/rss
 * Returns RSS 2.0 XML feed of curated news.
 * Subscribe at: https://elekto.eu/api/news/rss
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith("apps\\web") || cwd.endsWith("apps/web")) {
    return resolve(cwd, "../..");
  }
  return cwd;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const path = resolve(getProjectRoot(), "data", "canonical", "news", "curated_v1.json");
  if (!existsSync(path)) {
    return new Response("<rss version=\"2.0\"><channel><title>ELEKTO EU Nyheter</title></channel></rss>", {
      headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
    });
  }

  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const items = (raw.items ?? []).sort((a: any, b: any) => b.date.localeCompare(a.date));

  const SITE_URL = "https://elekto.eu";

  const rssItems = items.map((item: any) => {
    const link = item.source_url || (item.platform_link ? `${SITE_URL}${item.platform_link}` : SITE_URL);
    const pubDate = new Date(item.date + "T08:00:00+01:00").toUTCString();
    const platformNote = item.platform_context ? `\n\n💡 ${item.platform_context}` : "";
    const platformLink = item.platform_link ? `\n\n📊 Se data: ${SITE_URL}${item.platform_link}` : "";

    return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(item.id)}</guid>
      <pubDate>${pubDate}</pubDate>
      <category>${escapeXml(item.category)}</category>
      <source url="${escapeXml(SITE_URL)}">${escapeXml(item.source)}</source>
      <description>${escapeXml(item.summary + platformNote + platformLink)}</description>
    </item>`;
  });

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ELEKTO EU — Kuraterade energinyheter</title>
    <link>${SITE_URL}/nyheter</link>
    <description>Myndighetsnyheter kopplade till energidata. Nyheten + siffrorna. Witness mode.</description>
    <language>sv</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/api/news/rss" rel="self" type="application/rss+xml"/>
    <image>
      <url>${SITE_URL}/icon.png</url>
      <title>ELEKTO EU</title>
      <link>${SITE_URL}</link>
    </image>
${rssItems.join("\n")}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
