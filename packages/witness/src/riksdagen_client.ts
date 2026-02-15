/**
 * Riksdagen Open Data API Client
 *
 * Fetches document metadata from data.riksdagen.se.
 * Returns raw JSON responses — NO interpretation, NO filtering by content.
 *
 * TR1: No source, no number — every returned record traces to Riksdagen API.
 * TR6: This code fetches data; it NEVER invents values.
 * TR7: Witness mode — metadata only, no opinions.
 */

export interface RiksdagenSearchParams {
  sok: string;           // Search query
  doktyp?: string;       // Document type filter (mot, prop, bet, etc.)
  rm?: string;           // Riksmöte (e.g., "2025/26")
  sort?: string;         // Sort field (default: datum)
  sortorder?: string;    // asc | desc
  p?: number;            // Page number (1-based)
  a?: number;            // Results per page (default 20)
}

export interface RiksdagenDocument {
  dok_id: string;
  datum: string;
  titel: string;
  undertitel: string;
  doktyp: string;
  subtyp: string;
  rm: string;
  organ: string;
  beteckning: string;
  status: string;
  dokument_url_text: string;
  dokument_url_html: string;
  relaterat_id: string;
  score: string;
}

export interface RiksdagenSearchResult {
  total_hits: number;
  page: number;
  total_pages: number;
  documents: RiksdagenDocument[];
  query: string;
  fetched_at_utc: string;
}

const BASE_URL = "https://data.riksdagen.se/dokumentlista/";

export async function searchRiksdagen(
  params: RiksdagenSearchParams
): Promise<RiksdagenSearchResult> {
  const query = new URLSearchParams({
    sok: params.sok,
    utformat: "json",
    sort: params.sort ?? "datum",
    sortorder: params.sortorder ?? "desc",
    a: String(params.a ?? 20),
    ...(params.doktyp && { doktyp: params.doktyp }),
    ...(params.rm && { rm: params.rm }),
    ...(params.p && { p: String(params.p) }),
  });

  const url = `${BASE_URL}?${query.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Riksdagen API error: ${response.status} ${response.statusText} for ${url}`);
  }

  const data = await response.json();
  const lista = data.dokumentlista;

  const docs: RiksdagenDocument[] = (lista.dokument ?? []).map((d: any) => ({
    dok_id: d.dok_id ?? d.id ?? "",
    datum: d.datum ?? "",
    titel: d.titel ?? "",
    undertitel: d.undertitel ?? "",
    doktyp: d.doktyp ?? d.typ ?? "",
    subtyp: d.subtyp ?? "",
    rm: d.rm ?? "",
    organ: d.organ ?? "",
    beteckning: d.beteckning ?? "",
    status: d.status ?? "",
    dokument_url_text: d.dokument_url_text ?? "",
    dokument_url_html: d.dokument_url_html ?? "",
    relaterat_id: d.relaterat_id ?? "",
    score: d.score ?? "",
  }));

  return {
    total_hits: parseInt(lista["@traffar"] ?? "0", 10),
    page: parseInt(lista["@sida"] ?? "1", 10),
    total_pages: parseInt(lista["@sidor"] ?? "1", 10),
    documents: docs,
    query: params.sok,
    fetched_at_utc: new Date().toISOString(),
  };
}

/**
 * Paginate through all results for a query (up to maxPages).
 */
export async function searchAllPages(
  params: RiksdagenSearchParams,
  maxPages: number = 5
): Promise<RiksdagenDocument[]> {
  const all: RiksdagenDocument[] = [];
  let page = 1;

  while (page <= maxPages) {
    const result = await searchRiksdagen({ ...params, p: page });
    all.push(...result.documents);

    if (page >= result.total_pages) break;
    page++;
  }

  return all;
}
