/**
 * Backwards-compatible entry point for install targets.
 * New code should import from ./clients/index.js directly.
 */
export {
  CLIENT_IDS,
  PROJECT_CONFIG_FILE,
  applyTargets,
  capabilitiesReport,
  checkTargets,
  detectClients,
  getClientAdapter,
  getEntryTargets,
  isClientId,
  listClientAdapters,
  parseTargets,
  readProjectConfig,
  removeTargets,
  resolveTargets,
} from "./clients/index.js";

export type {
  ApplyTargetOptions,
  DetectedClient,
  RemoveTargetOptions,
  TargetIssue,
} from "./clients/index.js";
