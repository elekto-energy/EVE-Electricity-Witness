/**
 * X-Vault TypeScript — Public API
 *
 * Append-only WORM log with SHA-256 hash chain.
 * ELEKTO-local implementation of EVE X-Vault semantics.
 *
 * Patent: Organiq Sweden AB — witness-mode AI architecture.
 */

export {
  publishToVault,
  readVault,
  datasetExists,
  generateDatasetEveId,
  parseDatasetEveId,
  getLatestChainHash,
  stableStringify,
  METHODOLOGY_VERSION,
  EMISSION_SCOPE,
} from "./worm";

export { verifyVault, findDataset } from "./verify";

export type {
  VaultEventPayload,
  WormRecord,
  VaultVerifyResult,
  ParsedDatasetEveId,
} from "./types";
