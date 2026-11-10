/** Canonical origin of the public site. The apex elmonitor.se redirects (308) to www. */
export const SITE_URL = "https://www.elmonitor.se";

/** Pages that are finished and may be indexed. Every other route keeps the noindex default from the root layout. */
export const INDEXABLE_PATHS = ["/", "/elpris/se1", "/elpris/se2", "/elpris/se3", "/elpris/se4", "/import-export", "/omraden", "/data"] as const;
// /methodology stays noindex: its text still describes the earlier platform (system price, tax and grid-fee
// decomposition), which the current pages do not show. Index it once it is rewritten for this site.
