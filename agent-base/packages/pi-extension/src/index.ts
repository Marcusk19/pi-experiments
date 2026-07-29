import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPiAdapter } from "./adapter.js";

export * from "./normalize.js";
export { normalizeActivitySummary } from "./normalize.js";
export { registerPiAdapter } from "./adapter.js";
export { createQueryActiveSessionsTool } from "./tool.js";
export { createDelegatedTaskTool, type SourceCoordinationClientFactory } from "./delegation-tool.js";
export {
  COORDINATION_API_CHANNEL,
  registerPiCoordinationApi,
  type PiCoordinationApi,
  type PiCoordinationApiRequest,
  type SendToHarnessSessionRequest,
} from "./coordination-api.js";

export default function agentActivityHub(pi: ExtensionAPI): void {
  registerPiAdapter(pi);
}
