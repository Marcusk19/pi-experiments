export { HubTransport, HubClientError, type HubTransportOptions } from "./transport.js";
export type { RuntimePaths, LegacyRuntimePaths } from "./paths.js";
export { resolveRuntimePaths, resolveLegacyRuntimePaths } from "./paths.js";
export { detectLegacyDaemon } from "./legacy-runtime.js";
export type { DiscoveryRecord, HealthCheck, ReadDiscoveryOptions } from "./discovery.js";
export { readHealthyDiscovery } from "./discovery.js";
export { ensureDaemon, type EnsureDaemonOptions } from "./daemon.js";
export { createSessionReporter, type SessionReporterOptions, type SessionReporter, type ReporterStatus } from "./reporter.js";
export { CoordinationTransport, type CoordinationTransportOptions } from "./coordination-transport.js";
export {
  createSourceCoordinationClient,
  SourceCoordinationClientError,
  type SourceCoordinationClient,
  type SourceCoordinationClientOptions,
  type SendSourceTaskRequest,
  type SourceTaskSnapshot,
  type SourceTaskState,
} from "./source-coordination-client.js";
