/**
 * Energy topic tagger (v1).
 *
 * Deterministic classification of Riksdagen documents as energy-related.
 * Rules loaded from data/canonical/decisions/topic_rules_energy_v1.json.
 *
 * CODEFACTORY scope. No LLM. No fuzzy matching.
 */

import type { RiksdagenDokumentRaw } from "./riksdagen_docs_client";

export interface TopicMatch {
  rule_id: string;
  matched_value: string;
  confidence: "high" | "medium" | "low";
  tag: string;
}

export interface TopicResult {
  is_energy: boolean;
  is_weak: boolean;     // only search_term_match, flagged as weak
  tags: string[];
  matches: TopicMatch[];
  rules_version: string;
}

// Primary keywords (case-insensitive match against title)
const PRIMARY_KEYWORDS = [
  "energi", "kärnkraft", "kärnkraftverk", "kärnavfall",
  "elnät", "elnätsavgift", "elmarknad", "elhandel", "elpris", "elförsörjning",
  "kraftvärme", "fjärrvärme", "vindkraft", "vindkraftverk", "solenergi", "solcell",
  "elcertifikat", "utsläppshandel", "utsläppsrätt",
  "stamnät", "transmissionsnät", "effektreserv",
  "elberedskap", "elsäkerhet", "ellag",
  "energiskatt", "effektskatt", "koldioxidskatt",
  "flaskhalsintäkt", "elområde", "prisområde",
  "strålsäkerhet", "uranbrytning", "slutförvar",
  "vätgas", "vätgasstrategi", "elektrobränsle",
  "energieffektivisering", "energiomställning",
  "fossilfri", "fossilfritt",
];

const EXTENDED_KEYWORDS = [
  "klimatmål", "klimatpolitisk", "klimatramverk",
  "nettonoll", "koldioxid",
  "biodrivmedel", "bioenergi", "biomassa",
  "reduktionsplikt",
];

const ENERGY_COMMITTEES = ["NU"];
const CONDITIONAL_COMMITTEES = ["MJU"];

const UO_PATTERN = /[Uu]tgiftsområde\s+(21|20)|UO\s*(21|20)/;

/**
 * Classify a document using energy topic rules v1.
 */
export function classifyEnergyTopic(doc: RiksdagenDokumentRaw): TopicResult {
  const matches: TopicMatch[] = [];
  const titleLower = (doc.titel ?? "").toLowerCase();
  const summaryLower = (doc.summary ?? "").toLowerCase();
  const betPrefix = (doc.beteckning ?? "").replace(/[0-9]/g, "").toUpperCase();

  // Rule 1: committee_match
  if (ENERGY_COMMITTEES.includes(betPrefix)) {
    matches.push({
      rule_id: "committee_match",
      matched_value: betPrefix,
      confidence: "high",
      tag: "ENERGY.COMMITTEE_MATCH",
    });
  }

  // Rule 2: utgiftsomrade_match
  const uoMatchTitle = doc.titel?.match(UO_PATTERN);
  const uoMatchSummary = doc.summary?.match(UO_PATTERN);
  const uoMatch = uoMatchTitle || uoMatchSummary;
  if (uoMatch) {
    matches.push({
      rule_id: "utgiftsomrade_match",
      matched_value: `UO${uoMatch[1] || uoMatch[2]}`,
      confidence: "high",
      tag: "ENERGY.BUDGET_AREA",
    });
  }

  // Rule 3: title_keyword_match (primary)
  let hasPrimaryKeyword = false;
  for (const kw of PRIMARY_KEYWORDS) {
    if (titleLower.includes(kw)) {
      hasPrimaryKeyword = true;
      matches.push({
        rule_id: "title_keyword_primary",
        matched_value: kw,
        confidence: "high",
        tag: `ENERGY.TITLE_KEYWORD`,
      });
      break; // one match is enough
    }
  }

  // Rule 3b: extended keywords (need secondary signal)
  const hasSecondary = matches.length > 0; // committee or UO or primary already matched
  if (!hasPrimaryKeyword) {
    for (const kw of EXTENDED_KEYWORDS) {
      if (titleLower.includes(kw)) {
        if (hasSecondary || CONDITIONAL_COMMITTEES.includes(betPrefix)) {
          matches.push({
            rule_id: "title_keyword_extended",
            matched_value: kw,
            confidence: "medium",
            tag: "ENERGY.TITLE_KEYWORD_EXT",
          });
          break;
        }
      }
    }
  }

  // Rule 1b: conditional committee (MJU) — only if keyword matched
  if (CONDITIONAL_COMMITTEES.includes(betPrefix) && matches.some(m => m.rule_id.startsWith("title_keyword"))) {
    matches.push({
      rule_id: "committee_conditional",
      matched_value: betPrefix,
      confidence: "medium",
      tag: "ENERGY.COMMITTEE_MATCH",
    });
  }

  // Determine result
  const tags = [...new Set(matches.map(m => m.tag))];
  const isEnergy = matches.length > 0;
  const isWeak = isEnergy && matches.every(m => m.rule_id === "search_term_match");

  return {
    is_energy: isEnergy,
    is_weak: isWeak,
    tags,
    matches,
    rules_version: "energy_v1",
  };
}

/**
 * Mark a document as found via search (lowest priority).
 * Call this for all docs fetched via sok= energy terms.
 */
export function addSearchOriginTag(result: TopicResult): TopicResult {
  if (!result.matches.some(m => m.rule_id === "search_term_match")) {
    result.matches.push({
      rule_id: "search_term_match",
      matched_value: "sok_origin",
      confidence: "low",
      tag: "ENERGY.SEARCH_MATCH",
    });
    result.tags = [...new Set([...result.tags, "ENERGY.SEARCH_MATCH"])];
  }
  // Re-evaluate weak
  result.is_weak = result.matches.every(m => m.rule_id === "search_term_match");
  return result;
}
