import { mkdir, rm, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { readHealthyDiscovery, type DiscoveryRecord, type HealthCheck } from "./discovery.js";
import { detectLegacyDaemon } from "./legacy-runtime.js";
import type { RuntimePaths } from "./paths.js";
import { resolveRuntimePaths, resolveLegacyRuntimePaths } from "./paths.js";
import { HubClientError } from "./transport.js";

// The daemon may spend up to four seconds proving a stale lifetime owner dead.
// Keep an explicit two-second margin for listener startup and authenticated health.
const START_TIMEOUT_MS = 6_000;
const LOCK_STALE_MS = 5_000;
const POLL_INTERVAL_MS = 25;

export interface EnsureDaemonOptions {
  paths?: RuntimePaths;
  resolvePaths?: () => Promise<RuntimePaths>;
  healthCheck?: HealthCheck;
  spawnDaemon?: (options: { token: string; paths: RuntimePaths }) => Promise<void>;
  daemonEntrypoint?: string;
  randomSource?: (size: number) => Buffer;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  random?: () => number;
  detectLegacy?: () => Promise<boolean>;
}

export async function ensureDaemon(options: EnsureDaemonOptions = {}): Promise<DiscoveryRecord> {
  const resolvePathsFn = options.resolvePaths ?? resolveRuntimePaths;
  const paths = options.paths ?? (await resolvePathsFn());
  const healthCheck = options.healthCheck;
  const spawnFn = options.spawnDaemon ?? ((spawnOptions) =>
    defaultSpawnDaemon(spawnOptions, options.daemonEntrypoint));
  const randomSource = options.randomSource ?? randomBytes;
  const now = options.now ?? Date.now;
  const wait = options.wait ?? ((ms: number) => sleep(ms));
  const random = options.random ?? Math.random;

  const detectLegacyFn = options.detectLegacy ?? (() => detectLegacyDaemon(resolveLegacyRuntimePaths()));
  if (await detectLegacyFn()) throw legacyRunning();

  const existing = await safeRead(paths, healthCheck);
  if (existing) return existing;

  const deadline = now() + START_TIMEOUT_MS;
  while (now() < deadline) {
    if (await tryAcquireLock(paths.lockDirectory, now)) {
      try {
        if (await detectLegacyFn()) throw legacyRunning();
        const record = await safeRead(paths, healthCheck);
        if (record) return record;

        const token = randomSource(32).toString("hex");
        await spawnFn({ token, paths });
        const discovered = await waitForDiscovery(paths, healthCheck, now, wait, random, deadline);
        if (discovered) return discovered;
        throw startFailed();
      } finally {
        await rm(paths.lockDirectory, { recursive: true, force: true }).catch(() => undefined);
      }
    } else {
      const record = await waitForDiscovery(paths, healthCheck, now, wait, random, deadline);
      if (record) return record;
    }
  }
  throw startFailed();
}

async function safeRead(
  paths: RuntimePaths,
  healthCheck?: HealthCheck,
): Promise<DiscoveryRecord | undefined> {
  try {
    return await readHealthyDiscovery(paths, healthCheck ? { healthCheck } : undefined);
  } catch (error) {
    if (error instanceof HubClientError && error.code === "INCOMPATIBLE_PROTOCOL") {
      throw error;
    }
    return undefined;
  }
}

async function tryAcquireLock(lockDirectory: string, now: () => number): Promise<boolean> {
  try {
    await mkdir(lockDirectory, { recursive: false, mode: 0o700 });
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "EEXIST" && !isRetryableWindowsRace(error)) throw error;
    if (await isLockStale(lockDirectory, now)) {
      try {
        await rm(lockDirectory, { recursive: true, force: true });
      } catch (removeError) {
        if (isRetryableFilesystemRace(removeError)) return false;
        throw removeError;
      }
      return tryAcquireLock(lockDirectory, now);
    }
    return false;
  }
}

async function isLockStale(lockDirectory: string, now: () => number): Promise<boolean> {
  try {
    const stats = await stat(lockDirectory);
    const age = now() - stats.mtimeMs;
    return age > LOCK_STALE_MS;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || isRetryableWindowsRace(error)) return false;
    throw error;
  }
}

function isRetryableWindowsRace(error: unknown): boolean {
  if (process.platform !== "win32") return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EPERM" || code === "EACCES" || code === "EBUSY";
}

function isRetryableFilesystemRace(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "EEXIST" || code === "ENOTEMPTY"
    || isRetryableWindowsRace(error);
}

async function waitForDiscovery(
  paths: RuntimePaths,
  healthCheck: HealthCheck | undefined,
  now: () => number,
  wait: (ms: number) => Promise<void>,
  random: () => number,
  deadline: number,
): Promise<DiscoveryRecord | undefined> {
  while (now() < deadline) {
    const record = await safeRead(paths, healthCheck);
    if (record) return record;
    const jitter = Math.floor(random() * POLL_INTERVAL_MS);
    const remaining = deadline - now();
    await wait(Math.min(POLL_INTERVAL_MS + jitter, Math.max(1, remaining)));
  }
  return undefined;
}

export async function resolveDaemonEntrypoint(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  return fileURLToPath(new URL("../../hub/dist/daemon.js", import.meta.url));
}

async function defaultSpawnDaemon(
  options: { token: string; paths: RuntimePaths },
  daemonEntrypoint?: string,
): Promise<void> {
  const daemonPath = await resolveDaemonEntrypoint(daemonEntrypoint);
  const child = spawn(process.execPath, [daemonPath], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      AGENT_HUB_TOKEN: options.token,
      AGENT_HUB_DISCOVERY_FILE: options.paths.discoveryFile,
    },
  });
  child.unref();
}

function startFailed(): HubClientError {
  return new HubClientError({
    code: "DAEMON_START_FAILED",
    message: "Agent Activity Hub daemon did not become healthy in time.",
    retryable: true,
  });
}

function legacyRunning(): HubClientError {
  return new HubClientError({
    code: "LEGACY_DAEMON_RUNNING",
    message: "A legacy active session registry daemon is running. Update the Agent Base package and restart active sessions before starting Agent Activity Hub.",
    retryable: false,
  });
}
