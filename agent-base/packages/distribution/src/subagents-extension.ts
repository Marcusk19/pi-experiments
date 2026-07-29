import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSubagentExtension } from "@agent-hub/subagents";

const bundledAgentsDir = fileURLToPath(new URL("./agents/", import.meta.url));

export default function subagentsExtension(pi: ExtensionAPI): void {
  registerSubagentExtension(pi, { bundledAgentsDir });
}
