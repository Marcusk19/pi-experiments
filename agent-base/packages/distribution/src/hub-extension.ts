import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createSessionReporter,
  ensureDaemon,
  type SessionReporterOptions,
} from "@agent-hub/client";
import { registerPiAdapter } from "@agent-hub/pi-extension";

const daemonEntrypoint = fileURLToPath(new URL("./hub-daemon.js", import.meta.url));

function createReleaseReporter(options: SessionReporterOptions) {
  return createSessionReporter({
    ...options,
    ensureDaemon: () => ensureDaemon({ daemonEntrypoint }),
  });
}

export default function hubExtension(pi: ExtensionAPI): void {
  registerPiAdapter(pi, { createReporter: createReleaseReporter });
}
