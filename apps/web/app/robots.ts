import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Crawling is allowed (search engines and AI crawlers alike); what may be indexed is decided per page with
// robots meta tags, so older routes are crawlable but carry noindex. API routes are not for crawlers.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
