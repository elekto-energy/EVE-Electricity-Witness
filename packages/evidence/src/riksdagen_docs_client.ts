/**
 * Riksdagen Dokumentlista API client (prop/bet).
 *
 * Fetches documents from data.riksdagen.se/dokumentlista.
 * Returns raw JSON for deterministic mapping.
 *
 * CODEFACTORY scope. No interpretation.
 */

import https from "https";

const BASE_URL = "https://data.riksdagen.se/dokumentlista/";

export interface RiksdagenDokumentRaw {
  dok_id: string;
  titel: string;
  datum: string;                // "2025-09-08"
  rm: string;                   // "2024/25"
  beteckning: string;           // "205" (prop) or "NU12" (bet)
  doktyp: string;               // "prop" | "bet"
  typ: string;
  subtyp: string;
  organ: string;                // Department/committee
  summary: string;
  publicerad: string;
  dokument_url_text: string;
  dokument_url_html: string;
  dokumentstatus_url_xml: string;
  relaterat_id: string;
  sokdata?: {
    titel?: string;
    undertitel?: string;
    statusrad?: string;         // HTML with bet link (for prop→bet relation)
  };
  filbilaga?: {
    fil?: Array<{
      typ: string;
      namn: string;
      storlek: string;
      url: string;
    }> | {
      typ: string;
      namn: string;
      storlek: string;
      url: string;
    };
  };
}

export interface DokumentListResponse {
  dokumentlista: {
    "@traffar": string;
    "@sidor": string;
    "@sida": string;
    "@nasta_sida"?: string;
    dokument: RiksdagenDokumentRaw[] | RiksdagenDokumentRaw | null;
  };
}

export interface FetchDokumentOptions {
  /** Document type: "prop", "bet", or "prop,bet" */
  doktyp: string;
  /** Free-text search */
  sok?: string;
  /** Riksmöte */
  rm?: string;
  /** From date */
  from?: string;
  /** To date */
  tom?: string;
  /** Page size */
  sz?: number;
  /** Page number (1-based) */
  p?: number;
}

/**
 * Fetch single page of documents.
 */
export async function fetchDokument(opts: FetchDokumentOptions): Promise<{
  items: RiksdagenDokumentRaw[];
  total: number;
  page: number;
  pages: number;
  nextUrl?: string;
}> {
  const params = new URLSearchParams();
  params.set("utformat", "json");
  params.set("doktyp", opts.doktyp);
  params.set("sort", "datum");
  params.set("sortorder", "desc");

  if (opts.sok) params.set("sok", opts.sok);
  if (opts.rm) params.set("rm", opts.rm);
  if (opts.from) params.set("from", opts.from);
  if (opts.tom) params.set("tom", opts.tom);
  params.set("sz", String(opts.sz ?? 50));
  if (opts.p) params.set("p", String(opts.p));

  const url = `${BASE_URL}?${params.toString()}`;
  console.log(`[riksdagen-docs] GET ${url}`);

  const body = await httpGet(url);

  let parsed: DokumentListResponse;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new Error(`[riksdagen-docs] Failed to parse JSON from ${url}: ${e}`);
  }

  const lista = parsed?.dokumentlista;
  if (!lista) {
    return { items: [], total: 0, page: 1, pages: 0 };
  }

  // API returns single object when count=1, array when >1, null when 0
  let rawItems: RiksdagenDokumentRaw[] = [];
  if (lista.dokument) {
    rawItems = Array.isArray(lista.dokument) ? lista.dokument : [lista.dokument];
  }

  return {
    items: rawItems,
    total: parseInt(lista["@traffar"] ?? "0", 10),
    page: parseInt(lista["@sida"] ?? "1", 10),
    pages: parseInt(lista["@sidor"] ?? "0", 10),
    nextUrl: lista["@nasta_sida"] || undefined,
  };
}

/**
 * Fetch all pages for given options.
 * Follows @nasta_sida pagination. Safety cap at maxPages.
 */
export async function fetchAllDokument(
  opts: FetchDokumentOptions,
  maxPages: number = 20
): Promise<RiksdagenDokumentRaw[]> {
  const all: RiksdagenDokumentRaw[] = [];
  let page = 1;

  while (page <= maxPages) {
    const result = await fetchDokument({ ...opts, p: page });
    all.push(...result.items);

    console.log(`[riksdagen-docs] Page ${page}/${result.pages}, cumulative: ${all.length}/${result.total}`);

    if (page >= result.pages || result.items.length === 0) break;
    page++;

    // Rate limit: 500ms between requests
    await sleep(500);
  }

  if (page > maxPages) {
    console.warn(`[riksdagen-docs] Hit maxPages cap (${maxPages}). ${all.length} items fetched, may be incomplete.`);
  }

  return all;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "Accept": "application/json" } }, (res) => {
      let data = "";
      res.setEncoding("utf-8");
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else if (res.statusCode === 429) {
          reject(new Error(`[riksdagen-docs] Rate limited (429). Retry after backoff.`));
        } else {
          reject(new Error(`[riksdagen-docs] HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error("[riksdagen-docs] Request timeout (15s)"));
    });
  });
}
