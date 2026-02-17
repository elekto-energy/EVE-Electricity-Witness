/**
 * Map Riksdagen documents (prop/bet) → DecisionNode canonical format.
 *
 * Deterministic. No interpretation.
 * CODEFACTORY scope.
 */

import { createHash } from "crypto";
import type { RiksdagenDokumentRaw } from "./riksdagen_docs_client";
import { classifyEnergyTopic, addSearchOriginTag, type TopicResult } from "./energy_topic_tagger";

export interface DecisionNode {
  node_id: string;
  node_type: "prop" | "bet" | "vote" | "sfs_ref";
  title: string;
  published_at_utc: string;
  riksmote: string;
  number: string;
  responsible_organ: string;
  dok_id: string;
  source_url_html: string;
  source_url_pdf: string | null;
  excerpt: string;
  topic_tags: string[];
  topic_rules_version: string;
  topic_matches: TopicResult["matches"];
  relations: {
    bet_dok_id?: string;   // For prop → bet link (parsed from statusrad)
  };
  evidence_ref: {
    manifest_id: string;
    root_hash: string;
    files_sha256_path: string;
  };
}

/**
 * Parse bet dok_id from prop's sokdata.statusrad HTML.
 * Pattern: data-dokumentid="HD01FöU4"
 */
function parseBetFromStatusrad(statusrad?: string): string | undefined {
  if (!statusrad) return undefined;
  const match = statusrad.match(/data-dokumentid="([^"]+)"/);
  return match ? match[1] : undefined;
}

/**
 * Normalize URL to https://
 */
function normalizeUrl(url: string): string {
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

/**
 * Map raw Riksdagen documents to DecisionNode canonical format.
 * Applies energy topic tagging.
 * @param markSearchOrigin - if true, adds SEARCH_MATCH tag (for sok= results)
 */
export function mapDokumentToDecisionNodes(
  docs: RiksdagenDokumentRaw[],
  manifestId: string,
  markSearchOrigin: boolean = false
): DecisionNode[] {
  const nodes: DecisionNode[] = [];

  for (const doc of docs) {
    const nodeType = doc.doktyp === "prop" ? "prop" : doc.doktyp === "bet" ? "bet" : "prop";

    // Topic classification
    let topicResult = classifyEnergyTopic(doc);
    if (markSearchOrigin) {
      topicResult = addSearchOriginTag(topicResult);
    }

    // Skip non-energy docs (unless weak — include but flag)
    if (!topicResult.is_energy) continue;

    // Stable node_id
    const nodeId = `se-riksdagen:${nodeType}:${doc.dok_id}`;

    // Parse PDF URL
    let pdfUrl: string | null = null;
    if (doc.filbilaga?.fil) {
      const fils = Array.isArray(doc.filbilaga.fil) ? doc.filbilaga.fil : [doc.filbilaga.fil];
      const pdf = fils.find(f => f.typ === "pdf");
      if (pdf?.url) pdfUrl = normalizeUrl(pdf.url);
    }

    // Parse bet relation from statusrad (prop only)
    const betDokId = nodeType === "prop"
      ? parseBetFromStatusrad(doc.sokdata?.statusrad)
      : undefined;

    // Excerpt: first 500 chars of summary
    const excerpt = (doc.summary ?? "").slice(0, 500).trim();

    nodes.push({
      node_id: nodeId,
      node_type: nodeType,
      title: doc.titel,
      published_at_utc: `${doc.datum.slice(0, 10)}T00:00:00Z`,
      riksmote: doc.rm,
      number: doc.beteckning,
      responsible_organ: doc.organ ?? "",
      dok_id: doc.dok_id,
      source_url_html: normalizeUrl(doc.dokument_url_html || `//data.riksdagen.se/dokument/${doc.dok_id}.html`),
      source_url_pdf: pdfUrl,
      excerpt,
      topic_tags: topicResult.tags,
      topic_rules_version: topicResult.rules_version,
      topic_matches: topicResult.matches,
      relations: {
        ...(betDokId ? { bet_dok_id: betDokId } : {}),
      },
      evidence_ref: {
        manifest_id: manifestId,
        root_hash: "pending",
        files_sha256_path: "pending",
      },
    });
  }

  return nodes;
}
