import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type {
  AppendEventsRequest,
  NormalizedEvent,
  SequenceResponse,
  SessionMetadata,
  Snapshot,
} from "@agent-hub/contracts";
import { createSessionReporter } from "../src/reporter.js";
import type { DiscoveryRecord } from "../src/discovery.js";
import type { HubTransport } from "../src/transport.js";
import { HubClientError } from "../src/transport.js";

const metadata: SessionMetadata = {
  adapter: "pi",
  adapterVersion: "0.1.0",
  cwd: "/repo",
  harnessSessionId: "session-1",
  processId: 1,
  startedAt: 0,
  state: "idle",
  acceptsTaskDelivery: false,
};

const snapshot: Snapshot = { lastSequence: 1, events: [eventAtSequence(1)] };
const discovery: DiscoveryRecord = { port: 4000, pid: 1, token: "token-1", protocolVersion: 2, startedAt: 1 };

type TransportMock = {
  register: ReturnType<typeof vi.fn<HubTransport["register"]>>;
  append: ReturnType<typeof vi.fn<HubTransport["append"]>>;
  heartbeat: ReturnType<typeof vi.fn<HubTransport["heartbeat"]>>;
  replaceSnapshot: ReturnType<typeof vi.fn<HubTransport["replaceSnapshot"]>>;
  deleteSession: ReturnType<typeof vi.fn<HubTransport["deleteSession"]>>;
  query: ReturnType<typeof vi.fn<HubTransport["query"]>>;
  health: ReturnType<typeof vi.fn<HubTransport["health"]>>;
};

function eventAtSequence(sequence: number): NormalizedEvent {
  return { type: "message.user", eventId: `event-${sequence}`, sequence, timestamp: sequence, text: `event-${sequence}` };
}

function fakeTransport(overrides: Partial<TransportMock> = {}): TransportMock & HubTransport {
  const append = vi.fn<HubTransport["append"]>().mockImplementation(async (_sessionId, request: AppendEventsRequest): Promise<SequenceResponse> => ({
    acceptedSequence: request.events[request.events.length - 1]!.sequence,
  }));
  const transport: TransportMock = {
    register: vi.fn<HubTransport["register"]>().mockResolvedValue({ sessionId: "session-remote", leaseExpiresAt: Date.now() + 1_000, taskCapability: "ab".repeat(32) }),
    append,
    heartbeat: vi.fn<HubTransport["heartbeat"]>().mockResolvedValue({ leaseExpiresAt: Date.now() + 1_000, taskCapability: "ab".repeat(32) }),
    replaceSnapshot: vi.fn<HubTransport["replaceSnapshot"]>().mockResolvedValue({ acceptedSequence: snapshot.lastSequence }),
    deleteSession: vi.fn<HubTransport["deleteSession"]>().mockResolvedValue(undefined),
    query: vi.fn<HubTransport["query"]>().mockResolvedValue({ mode: "overview", sessions: [], truncated: false }),
    health: vi.fn<HubTransport["health"]>().mockResolvedValue({ protocolVersion: 2, pid: 1, startedAt: 1 }),
    ...overrides,
  };
  return transport as TransportMock & HubTransport;
}

function setupReporter(overrides?: { transport?: TransportMock; ensure?: ReturnType<typeof vi.fn>; snapshotProvider?: () => Snapshot }) {
  const transport = overrides?.transport ?? fakeTransport();
  const ensure = overrides?.ensure ?? vi.fn().mockResolvedValue(discovery);
  const reporter = createSessionReporter({
    metadata,
    snapshotProvider: overrides?.snapshotProvider ?? (() => snapshot),
    ensureDaemon: ensure,
    transportFactory: () => transport,
  });
  return { reporter, transport, ensure };
}

async function startReporter(reporterReturn: ReturnType<typeof setupReporter>) {
  await reporterReturn.reporter.start();
  return reporterReturn;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SessionReporter", () => {
  it("exposes coordination connection details only after registration", async () => {
    const { reporter } = setupReporter();
    expect(reporter.coordinationBaseUrl).toBeUndefined();
    expect(reporter.taskCapability).toBeUndefined();

    await reporter.start();

    expect(reporter.coordinationBaseUrl).toBe("http://127.0.0.1:4000");
    expect(reporter.sessionId).toBe("session-remote");
    expect(reporter.taskCapability).toBe("ab".repeat(32));
  });

  it("enqueue stays synchronous while transport is blocked", async () => {
    const pending = Promise.withResolvers<SequenceResponse>();
    const transport = fakeTransport({ append: vi.fn().mockReturnValueOnce(pending.promise) });
    const { reporter } = await startReporter(setupReporter({ transport }));
    expect(() => reporter.enqueue(eventAtSequence(2))).not.toThrow();
    expect(transport.append).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(transport.append).toHaveBeenCalledTimes(1);
    pending.resolve({ acceptedSequence: 2 });
  });

  it("flushes at most 50 events per batch", async () => {
    const transport = fakeTransport();
    const { reporter } = await startReporter(setupReporter({ transport }));
    for (let i = 2; i <= 61; i += 1) reporter.enqueue(eventAtSequence(i));
    await vi.advanceTimersByTimeAsync(100);
    expect(transport.append).toHaveBeenCalledTimes(2);
    const firstCall = transport.append.mock.calls[0];
    const secondCall = transport.append.mock.calls[1];
    expect(firstCall?.[1].events).toHaveLength(50);
    expect(secondCall?.[1].events).toHaveLength(10);
  });

  it("sends heartbeat every 10 seconds", async () => {
    const transport = fakeTransport();
    const { reporter } = await startReporter(setupReporter({ transport }));
    await vi.advanceTimersByTimeAsync(9_000);
    expect(transport.heartbeat).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(transport.heartbeat).toHaveBeenCalledTimes(1);
  });

  it("runs snapshot recovery on sequence conflicts", async () => {
    const error = new HubClientError({ code: "SEQUENCE_GAP", message: "gap", retryable: false });
    const transport = fakeTransport({ append: vi.fn().mockRejectedValue(error) });
    const { reporter } = await startReporter(setupReporter({ transport }));
    reporter.enqueue(eventAtSequence(2));
    await vi.advanceTimersByTimeAsync(100);
    expect(transport.replaceSnapshot).toHaveBeenCalledTimes(1);
  });

  it("rediscoveries the daemon after transient failures", async () => {
    const error = new HubClientError({ code: "HUB_UNAVAILABLE", message: "offline", retryable: true });
    const transport = fakeTransport({ append: vi.fn().mockRejectedValueOnce(error).mockResolvedValue({ acceptedSequence: 2 }) });
    const ensure = vi.fn().mockResolvedValueOnce(discovery).mockResolvedValueOnce({ ...discovery, token: "token-2" });
    const { reporter } = await startReporter(setupReporter({ transport, ensure }));
    reporter.enqueue(eventAtSequence(2));
    await vi.advanceTimersByTimeAsync(100);
    expect(ensure).toHaveBeenCalledTimes(2);
  });

  it("degrades instead of rejecting its background pump on an incompatible daemon", async () => {
    const incompatible = new HubClientError({
      code: "INCOMPATIBLE_PROTOCOL",
      message: "protocol mismatch",
      retryable: false,
    });
    const transport = fakeTransport({ append: vi.fn().mockRejectedValue(incompatible) });
    const { reporter } = await startReporter(setupReporter({ transport }));

    reporter.enqueue(eventAtSequence(2));
    await vi.advanceTimersByTimeAsync(100);
    await vi.runAllTicks();

    expect(reporter.status).toBe("disconnected");
    expect(reporter.sessionId).toBeUndefined();
    expect(reporter.taskCapability).toBeUndefined();
    expect(reporter.coordinationBaseUrl).toBeUndefined();

    reporter.enqueue(eventAtSequence(3));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(transport.append).toHaveBeenCalledTimes(1);
  });

  it("rediscovers and re-registers after bearer token rotation", async () => {
    const unauthorized = new HubClientError({ code: "UNAUTHORIZED", message: "unauthorized", status: 401, retryable: false });
    const oldTransport = fakeTransport({ append: vi.fn().mockRejectedValue(unauthorized) });
    const newTransport = fakeTransport();
    const ensure = vi.fn()
      .mockResolvedValueOnce(discovery)
      .mockResolvedValueOnce({ ...discovery, token: "token-2" });
    const reporter = createSessionReporter({
      metadata,
      snapshotProvider: () => snapshot,
      ensureDaemon: ensure,
      transportFactory: (record) => record.token === "token-1" ? oldTransport : newTransport,
    });
    await reporter.start();
    reporter.enqueue(eventAtSequence(2));
    await vi.advanceTimersByTimeAsync(100);
    await vi.runAllTicks();
    expect(ensure).toHaveBeenCalledTimes(2);
    expect(newTransport.register).toHaveBeenCalledTimes(1);
  });

  it("drops oversized queues and replaces snapshot", async () => {
    const transport = fakeTransport();
    const { reporter } = await startReporter(setupReporter({ transport }));
    for (let i = 2; i <= 510; i += 1) reporter.enqueue(eventAtSequence(i));
    await vi.advanceTimersByTimeAsync(100);
    expect(transport.replaceSnapshot).toHaveBeenCalledTimes(1);
  });

  it("close waits and deletes the remote session", async () => {
    const deleteDeferred = Promise.withResolvers<void>();
    const transport = fakeTransport({ deleteSession: vi.fn().mockReturnValue(deleteDeferred.promise) });
    const { reporter } = await startReporter(setupReporter({ transport }));
    const closePromise = reporter.close();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(transport.deleteSession).toHaveBeenCalledTimes(1);
    deleteDeferred.resolve();
    await closePromise;
    expect(reporter.status).toBe("closed");
    expect(reporter.coordinationBaseUrl).toBeUndefined();
    expect(reporter.taskCapability).toBeUndefined();
  });

  it("marks status truncated on limit errors", async () => {
    const error = new HubClientError({ code: "LIMIT_EXCEEDED", message: "limit", retryable: false });
    const transport = fakeTransport({ append: vi.fn().mockRejectedValue(error) });
    const { reporter } = await startReporter(setupReporter({ transport }));
    reporter.enqueue(eventAtSequence(2));
    await vi.advanceTimersByTimeAsync(100);
    expect(reporter.status).toBe("truncated");
    reporter.enqueue(eventAtSequence(3));
    await vi.advanceTimersByTimeAsync(100);
    expect(transport.append).toHaveBeenCalledTimes(1);
  });

  it("excludes the current session from queries by default", async () => {
    const transport = fakeTransport();
    const { reporter } = await startReporter(setupReporter({ transport }));
    const response = await reporter.query({ query: "status" });
    expect(response).toEqual({ mode: "overview", sessions: [], truncated: false });
    expect(transport.query).toHaveBeenCalledWith({ query: "status", excludeSessionId: reporter.sessionId }, expect.any(AbortSignal));
  });
});
