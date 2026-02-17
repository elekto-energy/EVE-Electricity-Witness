/**
 * Query Hash — Deterministic identity for a computation request.
 *
 * query_hash = SHA256(zone + from + to + methodology_version)
 *
 * This proves: "This is exactly the computation that was performed."
 * Language is NOT part of query_hash — it's a document property, not computation.
 */

import { createHash } from "crypto";

export function computeQueryHash(
  zone: string,
  from: string,
  to: string,
  methodologyVersion: string,
): string {
  const input = [zone, from, to, methodologyVersion].join("|");
  return createHash("sha256").update(input, "utf-8").digest("hex");
}
