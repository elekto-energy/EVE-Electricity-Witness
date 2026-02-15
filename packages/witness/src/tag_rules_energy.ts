/**
 * Deterministic Energy Taxonomy Tagger
 *
 * Rule-based only — NO LLM. Matches keywords from taxonomy_energy
 * against document title + undertitel.
 *
 * TR6: Claude generates code — never data values.
 * TR7: Witness mode = no interpretation. Tags are mechanical keyword matches.
 */

export const TAXONOMY_ENERGY = {
  "ENERGY.NUCLEAR": ["kärnkraft", "reaktor", "effektskatt", "strålsäkerhet", "avveckling"],
  "ENERGY.TAXES_FEES": ["energiskatt", "skatt på energi", "moms", "avgift", "elcertifikat"],
  "ENERGY.GRID_TRANSMISSION": ["nätavgift", "stamnät", "överföring", "kapacitet", "flaskhals"],
  "ENERGY.MARKET_DESIGN": ["elmarknad", "elområde", "prisområde", "kapacitetsmekanism", "balansmarknad"],
  "ENERGY.BUILDING_ENERGY_RULES": ["boverket", "bbr", "energihushållning", "primärenergital", "isolering", "u-värde"],
  "ENERGY.EU_IMPLEMENTATION": ["direktiv", "förordning", "epbd", "eu-direktiv"],
} as const;

export type EnergyTag = keyof typeof TAXONOMY_ENERGY;

/**
 * Tag a document based on title + undertitel keyword matching.
 * Returns all matching tags. Empty array if no match.
 *
 * Matching is case-insensitive, whole-word-ish (lowercased includes).
 */
export function tagDocument(title: string, undertitel: string = ""): EnergyTag[] {
  const text = `${title} ${undertitel}`.toLowerCase();
  const matched: EnergyTag[] = [];

  for (const [tag, keywords] of Object.entries(TAXONOMY_ENERGY)) {
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) {
        matched.push(tag as EnergyTag);
        break; // One keyword match is enough for this tag
      }
    }
  }

  return matched;
}
