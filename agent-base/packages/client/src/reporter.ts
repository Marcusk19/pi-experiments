import type {
  NormalizedEvent,
  QueryRequest,
  QueryResponse,
  SessionMetadata,
  SessionState,
  Snapshot,
} from "@agent-hub/contracts";
import { ensureDaemon as ensureDaemonProcess } from "./daemon.js";
import type { DiscoveryRecord } from "./discovery.js";
import { HubClientError, HubTransport } from "./transport.js";

const FLUSH_DELAY_MS = 100;
const MAX_BATCH_EVENTS = 50;
const MAX_QUEUE_EVENTS = 500;
const MAX_QUEUE_BYTES = 4 * 1024 * 1024;
const HEARTBEAT_MS = 10_000;
const RETRY_DELAYS_MS = [100, 250, 500, 1_000, 2_000] as const;
const CLOSE_TIMEOUT_MS = 1_000;
const QUERY_TIMEOUT_MS = 5_000;

export type ReporterStatus = "starting" | "connected" | "disconnected" | "truncated" | "closed";

export interface SessionReporterOptions {
  metadata: SessionMetadata;
  snapshotProvider: () => Snapshot;
  onStatus?: (status: ReporterStatus) => void;
  ensureDaemon?: typeof ensureDaemonProcess;
  transportFactory?: (record: DiscoveryRecord) => HubTransport;
  wait?: (ms: number) => Promise<void>;
}

export interface SessionReporter {
  start(): Promise<void>;
  enqueue(event: NormalizedEvent): void;
  replaceSnapshot(): void;
  updateMetadata(update: { state: SessionState; lastActivityAt: number; name?: string | null }): void;
  query(request: Omit<QueryRequest, "excludeSessionId"> & { includeCurrentSession?: boolean }, signal?: AbortSignal): Promise<QueryResponse>;
  close(): Promise<void>;
  readonly sessionId: string | undefined;
  readonly taskCapability: string | undefined;
  readonly coordinationBaseUrl: string | undefined;
  readonly status: ReporterStatus;
}

interface QueuedEvent {
  event: NormalizedEvent;
  size: number;
}

export function createSessionReporter(options: SessionReporterOptions): SessionReporter {
  return new SessionReporterImpl(options);
}

class SessionReporterImpl implements SessionReporter {
  private readonly snapshotProvider: () => Snapshot;
  private readonly ensureDaemon: typeof ensureDaemonProcess;
  private readonly transportFactory: (record: DiscoveryRecord) => HubTransport;
  private readonly onStatus: ((status: ReporterStatus) => void) | undefined;
  private readonly wait: (ms: number) => Promise<void>;
  private metadataState: SessionMetadata;
  private metadataName: string | null | undefined;
  private queue: QueuedEvent[] = [];
  private queueBytes = 0;
  private flushTimer: NodeJS.Timeout | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private pendingHeartbeat = false;
  private pendingSnapshot = false;
  private pumpPromise: Promise<void> | undefined;
  private pumpRequested = false;
  private transport: HubTransport | undefined;
  private discovery: DiscoveryRecord | undefined;
  private currentSessionId: string | undefined;
  private currentTaskCapability: string | undefined;
  private currentCoordinationBaseUrl: string | undefined;
  private statusState: ReporterStatus = "starting";
  private protocolIncompatible = false;
  private started = false;
  private closing = false;
  private ackSequence = 0;
  private retryIndex = 0;
  private lastActivityAt: number;

  constructor(options: SessionReporterOptions) {
    this.metadataState = { ...options.metadata };
    this.metadataName = options.metadata.name ?? undefined;
    this.snapshotProvider = options.snapshotProvider;
    this.ensureDaemon = options.ensureDaemon ?? ensureDaemonProcess;
    this.transportFactory = options.transportFactory ?? defaultTransportFactory;
    this.onStatus = options.onStatus;
    this.wait = options.wait ?? defaultWait;
    this.lastActivityAt = options.metadata.startedAt;
  }

  get sessionId(): string | undefined {
    return this.currentSessionId;
  }

  get taskCapability(): string | undefined {
    return this.currentTaskCapability;
  }

  get coordinationBaseUrl(): string | undefined {
    return this.currentCoordinationBaseUrl;
  }

  get status(): ReporterStatus {
    return this.statusState;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.setStatus("starting");
    try {
      await this.flushSnapshot();
    } catch (error) {
      await this.handlePumpError(error);
    }
    this.scheduleHeartbeat(true);
  }

  enqueue(event: NormalizedEvent): void {
    if (this.statusState === "closed" || this.statusState === "truncated") return;
    const size = Buffer.byteLength(JSON.stringify(event));
    this.queue.push({ event, size });
    this.queueBytes += size;
    if (this.queue.length > MAX_QUEUE_EVENTS || this.queueBytes > MAX_QUEUE_BYTES) {
      this.queue = [];
      this.queueBytes = 0;
      this.pendingSnapshot = true;
      this.enqueuePump();
      return;
    }
    if (this.queue.length >= MAX_BATCH_EVENTS) {
      this.triggerFlush();
    } else {
      this.scheduleFlush();
    }
  }

  replaceSnapshot(): void {
    if (this.statusState === "closed") return;
    this.pendingSnapshot = true;
    this.queue = [];
    this.queueBytes = 0;
    this.enqueuePump();
  }

  updateMetadata(update: { state: SessionState; lastActivityAt: number; name?: string | null }): void {
    this.metadataState.state = update.state;
    this.lastActivityAt = update.lastActivityAt;
    if (Object.prototype.hasOwnProperty.call(update, "name")) {
      if (update.name === null) {
        this.metadataName = null;
        delete this.metadataState.name;
      } else if (typeof update.name === "string") {
        this.metadataName = update.name;
        this.metadataState.name = update.name;
      } else {
        this.metadataName = undefined;
        delete this.metadataState.name;
      }
    }
    this.scheduleHeartbeat(true);
  }

  async query(
    request: Omit<QueryRequest, "excludeSessionId"> & { includeCurrentSession?: boolean },
    signal?: AbortSignal,
  ): Promise<QueryResponse> {
    const transport = await this.getTransport();
    const { includeCurrentSession, ...rest } = request;
    const payload: QueryRequest = { ...rest } as QueryRequest;
    if (!includeCurrentSession && this.currentSessionId) {
      payload.excludeSessionId = this.currentSessionId;
    }
    const querySignal = signal ?? AbortSignal.timeout(QUERY_TIMEOUT_MS);
    return transport.query(payload, querySignal);
  }

  async close(): Promise<void> {
    if (this.statusState === "closed") return;
    this.closing = true;
    this.clearFlushTimer();
    this.clearHeartbeatTimer();
    this.pendingHeartbeat = false;
    const deadline = Date.now() + CLOSE_TIMEOUT_MS;
    while (this.queue.length > 0 && Date.now() < deadline) {
      this.enqueuePump();
      await this.wait(10);
    }
    const pump = this.pumpPromise;
    if (pump) {
      await settleBeforeDeadline(pump, deadline);
    }
    if (this.currentSessionId && Date.now() < deadline) {
      try {
        const remaining = Math.max(1, deadline - Date.now());
        await settleBeforeDeadline(
          this.getTransport().then((transport) =>
            transport.deleteSession(this.currentSessionId!, AbortSignal.timeout(remaining)),
          ),
          deadline,
        );
      } catch {
        // ignore best-effort failures
      }
    }
    this.currentTaskCapability = undefined;
    this.currentCoordinationBaseUrl = undefined;
    this.setStatus("closed");
  }

  private async flushSnapshot(): Promise<void> {
    this.pendingSnapshot = true;
    const transport = await this.getTransport();
    const snapshot = this.snapshotProvider();
    if (this.currentSessionId) {
      try {
        await transport.replaceSnapshot(this.currentSessionId, snapshot);
        this.ackSequence = snapshot.lastSequence;
        this.queue = [];
        this.queueBytes = 0;
        this.pendingSnapshot = false;
        this.setStatus("connected");
        return;
      } catch (error) {
        if (error instanceof HubClientError && error.code === "NOT_FOUND") {
          this.currentSessionId = undefined;
          this.currentTaskCapability = undefined;
          this.currentCoordinationBaseUrl = undefined;
        } else {
          await this.handlePumpError(error);
          return;
        }
      }
    }
    const response = await transport.register({ metadata: this.metadataState, snapshot });
    this.currentSessionId = response.sessionId;
    this.currentTaskCapability = response.taskCapability;
    this.currentCoordinationBaseUrl = this.discovery
      ? `http://127.0.0.1:${this.discovery.port}`
      : undefined;
    this.ackSequence = snapshot.lastSequence;
    this.queue = [];
    this.queueBytes = 0;
    this.pendingSnapshot = false;
    this.retryIndex = 0;
    this.setStatus("connected");
  }

  private triggerFlush(): void {
    this.clearFlushTimer();
    this.enqueuePump();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.enqueuePump();
    }, FLUSH_DELAY_MS);
  }

  private enqueuePump(): void {
    if (this.statusState === "closed" || this.statusState === "truncated" || this.protocolIncompatible) return;
    if (this.pumpPromise) {
      this.pumpRequested = true;
      return;
    }
    this.pumpPromise = this.runPump().finally(() => {
      this.pumpPromise = undefined;
      if (this.pumpRequested) {
        this.pumpRequested = false;
        this.enqueuePump();
      }
    });
  }

  private async runPump(): Promise<void> {
    try {
      while (this.statusState !== "truncated") {
        if (!this.currentSessionId || this.pendingSnapshot) {
          await this.flushSnapshot();
          continue;
        }
        if (this.queue.length > 0) {
          await this.flushEvents();
          continue;
        }
        if (!this.closing && this.pendingHeartbeat) {
          await this.flushHeartbeat();
          continue;
        }
        break;
      }
      this.retryIndex = 0;
    } catch (error) {
      await this.handlePumpError(error);
    }
  }

  private async flushEvents(): Promise<void> {
    if (!this.currentSessionId) return;
    const batch = this.queue.slice(0, MAX_BATCH_EVENTS);
    const request = {
      expectedSequence: this.ackSequence,
      events: batch.map((item) => item.event),
    };
    const transport = await this.getTransport();
    const result = await transport.append(this.currentSessionId, request);
    this.queue.splice(0, batch.length);
    this.queueBytes -= batch.reduce((total, item) => total + item.size, 0);
    this.ackSequence = result.acceptedSequence;
  }

  private async flushHeartbeat(): Promise<void> {
    if (!this.currentSessionId) {
      this.pendingHeartbeat = false;
      return;
    }
    const transport = await this.getTransport();
    const payload: HeartbeatPayload = {
      state: this.metadataState.state,
      lastActivityAt: this.lastActivityAt,
    };
    if (this.metadataName !== undefined) {
      payload.name = this.metadataName;
    }
    await transport.heartbeat(this.currentSessionId, payload);
    this.pendingHeartbeat = false;
    this.scheduleHeartbeat(true);
  }

  private async handlePumpError(error: unknown): Promise<void> {
    if (!(error instanceof HubClientError)) {
      throw error;
    }
    if (error.code === "LIMIT_EXCEEDED") {
      this.setStatus("truncated");
      this.queue = [];
      this.queueBytes = 0;
      this.pendingSnapshot = false;
      return;
    }
    if (error.code === "NOT_FOUND" || error.code === "SEQUENCE_GAP" || error.code === "UNAUTHORIZED") {
      if (error.code === "NOT_FOUND" || error.code === "UNAUTHORIZED") {
        this.currentSessionId = undefined;
        this.currentTaskCapability = undefined;
        this.currentCoordinationBaseUrl = undefined;
      }
      if (error.code === "UNAUTHORIZED") {
        this.transport = undefined;
        this.discovery = undefined;
        this.setStatus("disconnected");
      }
      this.queue = [];
      this.queueBytes = 0;
      this.pendingSnapshot = true;
      this.enqueuePump();
      return;
    }
    if (error.code === "INCOMPATIBLE_PROTOCOL") {
      // A stale daemon from another private-protocol generation must disable
      // coordination without rejecting the background pump. An unhandled
      // rejection here would terminate the host Pi process.
      this.protocolIncompatible = true;
      this.transport = undefined;
      this.discovery = undefined;
      this.currentSessionId = undefined;
      this.currentTaskCapability = undefined;
      this.currentCoordinationBaseUrl = undefined;
      this.pendingSnapshot = true;
      this.setStatus("disconnected");
      return;
    }
    if (error.retryable) {
      this.transport = undefined;
      this.discovery = undefined;
      this.currentTaskCapability = undefined;
      this.currentCoordinationBaseUrl = undefined;
      this.setStatus("disconnected");
      try {
        const record = await this.ensureDaemon();
        this.discovery = record;
        this.transport = this.transportFactory(record);
      } catch {
        // fall through to retry timer
      }
      const delayIndex = Math.min(this.retryIndex, RETRY_DELAYS_MS.length - 1);
      const delay = (RETRY_DELAYS_MS[delayIndex] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]) as number;
      this.retryIndex = Math.min(this.retryIndex + 1, RETRY_DELAYS_MS.length - 1);
      await this.wait(delay);
      this.enqueuePump();
      return;
    }
    throw error;
  }

  private scheduleHeartbeat(force = false): void {
    if (this.statusState === "closed" || this.statusState === "truncated") return;
    if (this.heartbeatTimer) {
      if (!force) return;
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    this.heartbeatTimer = setTimeout(() => {
      this.pendingHeartbeat = true;
      this.heartbeatTimer = undefined;
      this.enqueuePump();
    }, HEARTBEAT_MS);
    this.heartbeatTimer.unref?.();
  }

  private clearFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private async getTransport(): Promise<HubTransport> {
    if (this.transport && this.discovery) {
      return this.transport;
    }
    const record = await this.ensureDaemon();
    this.discovery = record;
    this.transport = this.transportFactory(record);
    return this.transport;
  }

  private setStatus(status: ReporterStatus): void {
    if (this.statusState === status) return;
    this.statusState = status;
    this.onStatus?.(status);
  }
}

type HeartbeatPayload = {
  state: SessionState;
  lastActivityAt: number;
  name?: string | null;
};

function defaultTransportFactory(record: DiscoveryRecord): HubTransport {
  return new HubTransport({ baseUrl: `http://127.0.0.1:${record.port}`, token: record.token });
}

const defaultWait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function settleBeforeDeadline(promise: Promise<unknown>, deadline: number): Promise<void> {
  const remaining = Math.max(0, deadline - Date.now());
  if (remaining === 0) return;
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      promise.catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, remaining);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
