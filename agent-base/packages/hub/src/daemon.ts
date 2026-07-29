import { createHash, randomBytes, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  PROTOCOL_VERSION,
  type RegisterSessionRequest,
  type RegisterSessionResponse,
} from "@agent-hub/contracts";
import { createDatabase } from "./schema.js";
import { HubStore, LEASE_MS } from "./store.js";
import { SystemClock, type Clock } from "./clock.js";
import { createHubServer, type HubServer, type SessionLifecycle } from "./http.js";
import {
  ownsDiscoveryFile,
  writeDiscoveryFile,
  removeDiscoveryFile,
  type DiscoveryRecord,
} from "./discovery.js";
import { acquireDaemonOwnership } from "./ownership.js";
import { TaskStore } from "./coordination/task-store.js";
import { ChangeNotifier } from "./coordination/notifier.js";
import { DeliveryRouter } from "./coordination/delivery-router.js";
import { CoordinationService } from "./coordination/task-service.js";
import { WorkerProviderCatalog, type WorkerProvider } from "./coordination/worker-providers.js";
import { MonitorIdentity } from "./monitor-identity.js";
import { MonitorProjection } from "./monitor-projection.js";
import { MonitorRevision } from "./monitor-revision.js";
import { writeMonitorDiscoveryFile, removeMonitorDiscoveryFile } from "./monitor-discovery.js";
import { MONITOR_API_VERSION } from "@agent-hub/contracts";

const SWEEP_MS = 5_000;
const OWNERSHIP_CHECK_MS = 100;
const DEFAULT_EMPTY_EXIT_MS = 30_000;

export interface DaemonRuntime {
  server: HubServer;
  registry: HubStore;
  tasks: TaskStore;
  coordination: CoordinationService;
  router: DeliveryRouter;
  providers: WorkerProviderCatalog;
  register(r: RegisterSessionRequest): RegisterSessionResponse;
  deleteSession(id: string): boolean;
  sweep(): void;
  isEmpty(): boolean;
  close(): Promise<void>;
}

export async function createDaemonRuntime(options: {
  token: string;
  clock?: Clock;
  leaseMs?: number;
  emptyExitMs?: number;
  providers?: WorkerProvider[];
  monitor?: {
    capabilityDigest: Buffer;
    identity: MonitorIdentity;
    daemonId: string;
    startedAt: number;
    revision: MonitorRevision;
  };
}): Promise<DaemonRuntime> {
  const clock = options.clock ?? new SystemClock();
  const database = createDatabase();
  const onProjectionChanged = options.monitor ? () => { options.monitor!.revision.changed(); } : undefined;
  const registry = new HubStore({
    database,
    clock,
    ...(options.leaseMs !== undefined ? { leaseMs: options.leaseMs } : {}),
    onProjectionChanged,
  });
  const tasks = new TaskStore({ database, clock, instanceId: randomUUID(), onProjectionChanged });
  const providers = new WorkerProviderCatalog(options.providers ?? []);
  const notifier = new ChangeNotifier();
  const router = new DeliveryRouter({ registry, tasks, clock, notifier });
  const coordination = new CoordinationService({ registry, tasks, router, providers, clock, notifier });
  const sessions: SessionLifecycle = {
    registerSession(request) {
      const result = registry.register(request);
      if (request.launchToken) {
        try {
          coordination.bindWorkerSession(request.launchToken, result.sessionId);
        } catch (error) {
          registry.deleteSession(result.sessionId);
          throw error;
        }
      }
      return result;
    },
    deleteSession(id) {
      const deleted = registry.deleteSession(id);
      if (deleted) coordination.onSessionClosed(id);
      return deleted;
    },
  };
  const monitor = options.monitor ? {
    capabilityDigest: options.monitor.capabilityDigest,
    projection: new MonitorProjection({
      hub: registry,
      tasks,
      clock,
      identity: options.monitor.identity,
      daemonId: options.monitor.daemonId,
      startedAt: options.monitor.startedAt,
      revision: () => options.monitor!.revision.current(),
    }),
    revision: options.monitor.revision,
  } : undefined;
  const server = await createHubServer({
    token: options.token,
    store: registry,
    coordination,
    router,
    providers,
    sessions,
    clock,
    ...(monitor ? { monitor } : {}),
  });
  let closed = false;
  return {
    server,
    registry,
    tasks,
    coordination,
    router,
    providers,
    register: (request) => sessions.registerSession(request),
    deleteSession: (id) => sessions.deleteSession(id),
    sweep() {
      for (const id of registry.expireLeases()) coordination.onSessionClosed(id);
      coordination.expireDeadlines();
      coordination.expireWorkerLaunches();
    },
    isEmpty() {
      return registry.countSessions() === 0 && coordination.countRetainedTasks() === 0;
    },
    async close() {
      if (closed) return;
      closed = true;
      await server.close();
      router.close();
      coordination.close();
      registry.close();
      database.close();
    },
  };
}

export function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

async function start(): Promise<void> {
  const token = process.env.AGENT_HUB_TOKEN;
  const file = process.env.AGENT_HUB_DISCOVERY_FILE;
  if (!token) throw new Error("AGENT_HUB_TOKEN is required");
  if (!file) throw new Error("AGENT_HUB_DISCOVERY_FILE is required");

  const emptyMs = positiveIntegerEnv("AGENT_HUB_EMPTY_EXIT_MS", DEFAULT_EMPTY_EXIT_MS);
  const startedAt = Date.now();
  const ownership = await acquireDaemonOwnership({
    discoveryFile: file,
    pid: process.pid,
    startedAt,
  });

  const daemonId = randomUUID();
  const monitorToken = randomBytes(32).toString("hex");
  const monitorCapabilityDigest = createHash("sha256").update(monitorToken, "utf8").digest();
  const monitorIdentityKey = randomBytes(32);
  const monitorRevision = new MonitorRevision();

  let runtime: DaemonRuntime;
  let record: DiscoveryRecord;
  const monitorDiscoveryFile = join(dirname(file), "monitor.json");
  try {
    runtime = await createDaemonRuntime({
      token,
      leaseMs: positiveIntegerEnv("AGENT_HUB_LEASE_MS", LEASE_MS),
      emptyExitMs: emptyMs,
      monitor: {
        capabilityDigest: monitorCapabilityDigest,
        identity: new MonitorIdentity(monitorIdentityKey),
        daemonId,
        startedAt,
        revision: monitorRevision,
      },
    });
    record = {
      port: runtime.server.port,
      pid: process.pid,
      token,
      protocolVersion: PROTOCOL_VERSION,
      startedAt,
    };
    await writeDiscoveryFile(file, record);
    await writeMonitorDiscoveryFile(monitorDiscoveryFile, {
      endpoint: runtime.server.url,
      apiVersion: MONITOR_API_VERSION,
      daemonId,
      startedAt,
      capability: monitorToken,
    });
  } catch (error) {
    monitorRevision.close();
    await ownership.release().catch(() => undefined);
    throw error;
  }

  let stopped = false;
  let stopPromise: Promise<void> | undefined;
  let emptySince = Date.now();
  let nextSweepAt = Date.now() + SWEEP_MS;
  const stop = (code = 0): Promise<void> => {
    if (stopPromise) return stopPromise;
    stopped = true;
    stopPromise = (async () => {
      monitorRevision.close();
      await runtime.close().catch(() => undefined);
      await removeMonitorDiscoveryFile(monitorDiscoveryFile).catch(() => undefined);
      await removeDiscoveryFile(file).catch(() => undefined);
      await ownership.release().catch(() => undefined);
      process.exit(code);
    })();
    return stopPromise;
  };

  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());

  while (!stopped) {
    await delay(OWNERSHIP_CHECK_MS).catch(() => undefined);
    if (stopped) break;
    try {
      const ownsDiscovery = await ownsDiscoveryFile(file, record);
      if (!ownsDiscovery || !(await ownership.refresh())) {
        await stop();
        return;
      }

      const now = Date.now();
      if (now < nextSweepAt) continue;
      nextSweepAt = now + SWEEP_MS;
      runtime.sweep();
      if (runtime.isEmpty()) {
        if (now - emptySince >= emptyMs) await stop();
      } else {
        emptySince = now;
      }
    } catch {
      await stop(1);
      return;
    }
  }
}

const invokedEntrypoint = process.argv[1];
if (invokedEntrypoint && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(invokedEntrypoint)) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
