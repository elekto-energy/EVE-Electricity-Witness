/** Canonical origin of the public site. The apex elmonitor.se redirects (308) to www. */
export const SITE_URL = "https://www.elmonitor.se";

/** Pages that are finished and may be indexed. Every other route keeps the noindex default from the root layout. */
export const INDEXABLE_PATHS = ["/", "/omraden", "/data", "/methodology", "/elpris/se1", "/elpris/se2", "/elpris/se3", "/elpris/se4"] as const;
