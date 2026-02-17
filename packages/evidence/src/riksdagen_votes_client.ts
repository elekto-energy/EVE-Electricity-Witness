/**
 * Riksdagen Votering API client.
 *
 * Fetches voting data from data.riksdagen.se/voteringlista.
 * Returns raw JSON for deterministic mapping.
 *
 * CODEFACTORY scope. No interpretation.
 */

import https from "https";

const BASE_URL = "https://data.riksdagen.se/voteringlista/";

export interface RiksdagenVoteringRaw {
  votering_id: string;       // GUID — same for all ledamöter on same punkt
  rm: string;                // "2024/25"
  beteckning: string;        // "NU12" — betänkande
  punkt: string;             // "1", "2", etc
  intressent_id: string;     // person ID
  namn: string;
  fornamn: string;
  efternamn: string;
  parti: string;
  rost: string;              // "Ja" | "Nej" | "Avstår" | "Frånvarande"
  avser: string;             // "sakfrågan" | "motivreservation"
  votering: string;          // "huvud"
  dok_id: string;            // links to betänkande dok_id
  valkrets: string;
  kon: string;
  fodd: string;
}

export interface VoteringListResponse {
  voteringlista: {
    "@antal": string;
    votering: RiksdagenVoteringRaw[] | RiksdagenVoteringRaw | null;
  };
}

export interface FetchVoteringOptions {
  rm: string;
  bet?: string;              // betänkande beteckning e.g. "NU12"
  sz?: number;
}

/**
 * Fetch voterings for a specific betänkande in a riksmöte.
 * Returns all individual votes (one per ledamot per punkt).
 */
export async function fetchVoteringar(opts: FetchVoteringOptions): Promise<RiksdagenVoteringRaw[]> {
  const params = new URLSearchParams();
  params.set("utformat", "json");
  params.set("rm", opts.rm);
  if (opts.bet) params.set("bet", opts.bet);
  params.set("sz", String(opts.sz ?? 500));

  const url = `${BASE_URL}?${params.toString()}`;
  console.log(`[riksdagen-vote] GET ${url}`);

  const body = await httpGet(url);

  let parsed: VoteringListResponse;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new Error(`[riksdagen-vote] Failed to parse JSON: ${e}`);
  }

  const lista = parsed?.voteringlista;
  if (!lista?.votering) return [];

  // API returns single object when count=1, array when >1
  return Array.isArray(lista.votering) ? lista.votering : [lista.votering];
}

/** Aggregated vote result per party per punkt */
export interface VoteAggregation {
  votering_id: string;
  rm: string;
  beteckning: string;
  punkt: string;
  dok_id: string;
  avser: string;
  parties: {
    party: string;
    ja: number;
    nej: number;
    avstar: number;
    franvarande: number;
  }[];
  total: { ja: number; nej: number; avstar: number; franvarande: number };
}

/**
 * Aggregate individual votes into per-party summary.
 */
export function aggregateVotes(rawVotes: RiksdagenVoteringRaw[]): VoteAggregation[] {
  // Group by votering_id + punkt
  const groups = new Map<string, RiksdagenVoteringRaw[]>();
  for (const v of rawVotes) {
    const key = `${v.votering_id}|${v.punkt}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }

  const aggregations: VoteAggregation[] = [];

  for (const [key, votes] of groups) {
    const first = votes[0];
    const partyMap = new Map<string, { ja: number; nej: number; avstar: number; franvarande: number }>();

    for (const v of votes) {
      if (!partyMap.has(v.parti)) {
        partyMap.set(v.parti, { ja: 0, nej: 0, avstar: 0, franvarande: 0 });
      }
      const p = partyMap.get(v.parti)!;
      switch (v.rost) {
        case "Ja": p.ja++; break;
        case "Nej": p.nej++; break;
        case "Avstår": p.avstar++; break;
        default: p.franvarande++; break;
      }
    }

    const parties = [...partyMap.entries()]
      .map(([party, counts]) => ({ party, ...counts }))
      .sort((a, b) => a.party.localeCompare(b.party));

    const total = { ja: 0, nej: 0, avstar: 0, franvarande: 0 };
    for (const p of parties) {
      total.ja += p.ja;
      total.nej += p.nej;
      total.avstar += p.avstar;
      total.franvarande += p.franvarande;
    }

    aggregations.push({
      votering_id: first.votering_id,
      rm: first.rm,
      beteckning: first.beteckning,
      punkt: first.punkt,
      dok_id: first.dok_id,
      avser: first.avser,
      parties,
      total,
    });
  }

  // Sort by beteckning, then punkt
  aggregations.sort((a, b) => {
    const betCompare = a.beteckning.localeCompare(b.beteckning);
    if (betCompare !== 0) return betCompare;
    return parseInt(a.punkt) - parseInt(b.punkt);
  });

  return aggregations;
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
          reject(new Error(`[riksdagen-vote] Rate limited (429)`));
        } else {
          reject(new Error(`[riksdagen-vote] HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error("[riksdagen-vote] Request timeout (30s)"));
    });
  });
}
