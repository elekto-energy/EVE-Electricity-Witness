/**
 * Riksdagen Anföranden API client.
 *
 * Fetches speech data from data.riksdagen.se/anforandelista.
 * Returns raw JSON response for deterministic mapping.
 *
 * CODEFACTORY scope. No interpretation.
 */

import https from "https";

const BASE_URL = "https://data.riksdagen.se/anforandelista/";

export interface RiksdagenAnforandeRaw {
  dok_id: string;
  dok_rm: string;         // riksmöte, e.g. "2024/25"
  dok_nummer: string;
  dok_datum: string;       // "2025-02-10"
  avsnittsrubrik: string;
  kammaraktivitet: string;
  anforande_nummer: string;
  talare: string;          // full name
  parti: string;           // party abbreviation
  intressent_id: string;   // person ID
  rel_dok_id: string;
  replik: string;          // "N" or "Y"
  anforandetext: string;   // HTML text of speech
  systemdatum: string;
}

export interface AnforandeListResponse {
  anforandelista: {
    anforande: RiksdagenAnforandeRaw[] | RiksdagenAnforandeRaw;
    "@antal": string;
    "@sida": string;
    "@sidor": string;
  };
}

export interface FetchAnforandenOptions {
  /** Riksmöte, e.g. "2024/25" */
  rm?: string;
  /** From date YYYY-MM-DD */
  from?: string;
  /** To date YYYY-MM-DD */
  to?: string;
  /** intressent_id (speaker person ID) */
  iid?: string;
  /** Page number (1-based) */
  page?: number;
  /** Page size (default 20, max 500) */
  sz?: number;
}

/**
 * Fetch anföranden from Riksdagen Open Data API.
 * Returns raw JSON parsed as typed objects.
 */
export async function fetchAnforanden(opts: FetchAnforandenOptions): Promise<{
  items: RiksdagenAnforandeRaw[];
  total: number;
  page: number;
  pages: number;
}> {
  const params = new URLSearchParams();
  params.set("utformat", "json");

  if (opts.rm) params.set("rm", opts.rm);
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);
  if (opts.iid) params.set("iid", opts.iid);
  if (opts.page) params.set("p", String(opts.page));
  params.set("sz", String(opts.sz ?? 20));

  const url = `${BASE_URL}?${params.toString()}`;
  console.log(`[riksdagen] GET ${url}`);

  const body = await httpGet(url);

  let parsed: AnforandeListResponse;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new Error(`[riksdagen] Failed to parse JSON from ${url}: ${e}`);
  }

  const lista = parsed?.anforandelista;
  if (!lista) {
    return { items: [], total: 0, page: 1, pages: 0 };
  }

  // API returns single object when count=1, array when >1
  const rawItems = lista.anforande
    ? Array.isArray(lista.anforande)
      ? lista.anforande
      : [lista.anforande]
    : [];

  return {
    items: rawItems,
    total: parseInt(lista["@antal"] ?? "0", 10),
    page: parseInt(lista["@sida"] ?? "1", 10),
    pages: parseInt(lista["@sidor"] ?? "0", 10),
  };
}

/**
 * Fetch all pages for given options (paginated).
 */
export async function fetchAllAnforanden(opts: FetchAnforandenOptions): Promise<RiksdagenAnforandeRaw[]> {
  const all: RiksdagenAnforandeRaw[] = [];
  const sz = opts.sz ?? 100;
  let page = 1;

  while (true) {
    const result = await fetchAnforanden({ ...opts, page, sz });
    all.push(...result.items);

    if (page >= result.pages || result.items.length === 0) break;
    page++;

    // Polite delay
    await sleep(500);
  }

  return all;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "Accept": "application/json" } }, (res) => {
      let data = "";
      res.setEncoding("utf-8");
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
      res.on("error", reject);
    }).on("error", reject);
  });
}
