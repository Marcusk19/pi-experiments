import { chmod, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface RuntimePaths {
  directory: string;
  discoveryFile: string;
  monitorDiscoveryFile: string;
  lockDirectory: string;
}

export interface LegacyRuntimePaths {
  directory: string;
  discoveryFile: string;
}

export async function resolveRuntimePaths(): Promise<RuntimePaths> {
  const directory = resolveDirectory("agent-activity-hub");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    await chmod(directory, 0o700).catch(() => undefined);
  }
  return {
    directory,
    discoveryFile: join(directory, "hub.json"),
    monitorDiscoveryFile: join(directory, "monitor.json"),
    lockDirectory: join(directory, "lock"),
  };
}

export function resolveLegacyRuntimePaths(): LegacyRuntimePaths {
  const directory = resolveDirectory("agent-session-registry");
  return {
    directory,
    discoveryFile: join(directory, "registry.json"),
  };
}

function resolveDirectory(name: string): string {
  const override = process.env.XDG_RUNTIME_DIR;
  if (override && override.length > 0) {
    return join(override, name);
  }
  const uid = typeof process.getuid === "function" ? String(process.getuid()) : "shared";
  return join(tmpdir(), `${name}-${uid}`);
}
