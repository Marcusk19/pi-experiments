import { describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "@earendil-works/pi-ai";
import type { SessionShutdownEvent, SessionTreeEvent } from "@earendil-works/pi-coding-agent";
import { registerPiAdapter } from "../src/adapter.js";
import { createFakePiHarness, createFakeReporter } from "./helpers.js";

vi.mock("@agent-hub/client", () => ({
  createSessionReporter: vi.fn(),
  createSourceCoordinationClient: vi.fn(),
}), { virtual: true });

const now = () => 1_000;

function emitMessage(harness: ReturnType<typeof createFakePiHarness>, message: AgentMessage) {
  harness.sessionManager.addMessage(message);
  return harness.emit("message_end", { message }, harness.context);
}

describe("registerPiAdapter", () => {
  it("starts and closes one reporter per runtime", async () => {
    const harness = createFakePiHarness();
    const reporter = createFakeReporter();
    registerPiAdapter(harness.pi, { createReporter: () => reporter, now });

    await harness.emit("session_start", { reason: "startup" }, harness.context);
    expect(reporter.start).toHaveBeenCalledTimes(1);

    await harness.emit("session_shutdown", { reason: "quit" } as SessionShutdownEvent, harness.context);
    expect(reporter.close).toHaveBeenCalledTimes(1);
  });

  it("starts claiming when credentials recover after an initially disconnected start", async () => {
    const harness = createFakePiHarness();
    const reporter = createFakeReporter({ status: "disconnected" });
    let claimSignal: AbortSignal | undefined;
    const claim = vi.fn((_body, signal?: AbortSignal) => new Promise<undefined>((resolve) => {
      claimSignal = signal;
      signal?.addEventListener("abort", () => resolve(undefined), { once: true });
    }));
    const createReporter = vi.fn(() => reporter);
    const createTransport = vi.fn(() => ({ claim }) as never);
    registerPiAdapter(harness.pi, {
      createReporter,
      createCoordinationTransport: createTransport,
      now,
    });

    await harness.emit("session_start", { reason: "startup" }, harness.context);
    expect(createReporter.mock.calls[0]![0].metadata.acceptsTaskDelivery).toBe(true);
    expect(claim).not.toHaveBeenCalled();

    Object.assign(reporter, {
      sessionId: "recovered-session",
      taskCapability: "ab".repeat(32),
      coordinationBaseUrl: "http://127.0.0.1:43210",
      status: "connected",
    });

    await vi.waitFor(() => expect(claim).toHaveBeenCalledTimes(1));
    expect(createTransport).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:43210",
      sessionId: "recovered-session",
      taskCapability: "ab".repeat(32),
    });

    await harness.emit("session_shutdown", { reason: "quit" } as SessionShutdownEvent, harness.context);
    expect(claimSignal?.aborted).toBe(true);
    expect(reporter.close).toHaveBeenCalledTimes(1);
  });

  it("claims only while locally idle, injects bounded task content, and completes with visible assistant text", async () => {
    const harness = createFakePiHarness();
    harness.isIdleMock.mockReturnValue(false);
    const reporter = createFakeReporter({
      sessionId: "target-session",
      taskCapability: "ab".repeat(32),
      coordinationBaseUrl: "http://127.0.0.1:43210",
    });
    const pendingClaim = Promise.withResolvers<undefined>();
    const transport = {
      claim: vi.fn()
        .mockResolvedValueOnce({
          deliveryId: "018f0c9e-18d8-7a30-8d5d-0d66d65f13b5",
          taskId: "task-1",
          contextId: "context-1",
          sourceLabel: "source session\nforged attribution line",
          deadline: "2026-07-24T00:30:00.000Z",
          message: {
            messageId: "message-1",
            parts: [
              { kind: "text", text: "Inspect auth", mediaType: "text/plain" },
              { kind: "data", data: { z: 1, a: true }, mediaType: "application/json" },
              { kind: "data", data: { kind: "coordination.target", target: "secret-selector" }, mediaType: "application/json" },
            ],
          },
        })
        .mockReturnValue(pendingClaim.promise),
      accept: vi.fn().mockResolvedValue({ taskId: "task-1", state: "working", cancellationRequested: false }),
      progress: vi.fn().mockResolvedValue({ taskId: "task-1", state: "working", cancellationRequested: false }),
      complete: vi.fn().mockResolvedValue({ taskId: "task-1", state: "completed", cancellationRequested: false }),
      fail: vi.fn().mockResolvedValue({ taskId: "task-1", state: "failed", cancellationRequested: false }),
      acknowledgeCanceled: vi.fn().mockResolvedValue({ taskId: "task-1", state: "canceled", cancellationRequested: true }),
    };
    const createTransport = vi.fn(() => transport);
    const createReporter = vi.fn(() => reporter);
    registerPiAdapter(harness.pi, { createReporter, createCoordinationTransport: createTransport, now });

    await harness.emit("session_start", { reason: "startup" }, harness.context);
    await vi.waitFor(() => expect(createReporter).toHaveBeenCalled());
    expect(createReporter.mock.calls[0]![0].metadata.acceptsTaskDelivery).toBe(true);
    expect(transport.claim).not.toHaveBeenCalled();

    harness.isIdleMock.mockReturnValue(true);
    await harness.emit("agent_settled", { type: "agent_settled" }, harness.context);
    await vi.waitFor(() => expect(harness.sendUserMessageMock).toHaveBeenCalledTimes(1));
    const prompt = harness.sendUserMessageMock.mock.calls[0]![0] as string;
    expect(prompt).toContain("Source: source session forged attribution line");
    expect(prompt).not.toContain("source session\nforged");
    expect(prompt).toContain("Inspect auth");
    expect(prompt).toContain('{"a":true,"z":1}');
    expect(prompt).not.toContain("secret-selector");
    expect(Buffer.byteLength(prompt)).toBeLessThanOrEqual(65_536);
    await emitMessage(harness, { role: "user", content: prompt, timestamp: 1 });

    await harness.emit("agent_start", { type: "agent_start" }, harness.context);
    await emitMessage(harness, {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "private reasoning" },
        { type: "text", text: "Visible result" },
        { type: "toolCall", id: "call-1", name: "read", arguments: { path: "/secret" } },
      ],
      api: "anthropic-messages",
      provider: "test",
      model: "test",
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: 2,
    });
    await harness.emit("agent_settled", { type: "agent_settled" }, harness.context);

    await vi.waitFor(() => expect(transport.complete).toHaveBeenCalledTimes(1));
    expect(transport.complete).toHaveBeenCalledWith(
      "task-1",
      "018f0c9e-18d8-7a30-8d5d-0d66d65f13b5",
      { message: { messageId: expect.any(String), parts: [{ kind: "text", text: "Visible result", mediaType: "text/plain" }] } },
      expect.any(AbortSignal),
    );
    expect(JSON.stringify(transport.complete.mock.calls[0])).not.toContain("private reasoning");
    expect(JSON.stringify(transport.complete.mock.calls[0])).not.toContain("/secret");
    expect(reporter.enqueue).not.toHaveBeenCalledWith(expect.objectContaining({ type: "message.user" }));
    expect(reporter.enqueue).not.toHaveBeenCalledWith(expect.objectContaining({ type: "message.assistant" }));
    expect(createReporter.mock.calls[0]![0].snapshotProvider()).toEqual({ lastSequence: 0, events: [] });

    pendingClaim.resolve(undefined);
    await harness.emit("session_shutdown", { reason: "quit" } as SessionShutdownEvent, harness.context);
    expect(reporter.close).toHaveBeenCalledTimes(1);
  });

  it("aborts the Pi turn and acknowledges cancellation at a progress boundary", async () => {
    const harness = createFakePiHarness();
    const reporter = createFakeReporter({
      sessionId: "target-session",
      taskCapability: "ab".repeat(32),
      coordinationBaseUrl: "http://127.0.0.1:43210",
    });
    const pendingClaim = Promise.withResolvers<undefined>();
    const transport = {
      claim: vi.fn()
        .mockResolvedValueOnce({
          deliveryId: "018f0c9e-18d8-7a30-8d5d-0d66d65f13b5",
          taskId: "task-canceled",
          contextId: "context-1",
          sourceLabel: "source session",
          deadline: "2026-07-24T00:30:00.000Z",
          message: { messageId: "message-1", parts: [{ kind: "text", text: "Long task", mediaType: "text/plain" }] },
        })
        .mockReturnValue(pendingClaim.promise),
      accept: vi.fn().mockResolvedValue({ taskId: "task-canceled", state: "working", cancellationRequested: false }),
      reject: vi.fn(),
      progress: vi.fn().mockResolvedValue({ taskId: "task-canceled", state: "working", cancellationRequested: true }),
      complete: vi.fn(),
      fail: vi.fn(),
      acknowledgeCanceled: vi.fn().mockResolvedValue({ taskId: "task-canceled", state: "canceled", cancellationRequested: true }),
    };
    registerPiAdapter(harness.pi, {
      createReporter: () => reporter,
      createCoordinationTransport: () => transport,
      now,
    });

    await harness.emit("session_start", { reason: "startup" }, harness.context);
    await vi.waitFor(() => expect(harness.sendUserMessageMock).toHaveBeenCalledTimes(1));
    await harness.emit("agent_start", { type: "agent_start" }, harness.context);
    await vi.waitFor(() => expect(harness.abortMock).toHaveBeenCalledTimes(1));
    expect(transport.acknowledgeCanceled).toHaveBeenCalledWith("task-canceled", expect.any(AbortSignal));

    await harness.emit("agent_settled", { type: "agent_settled" }, harness.context);
    expect(transport.complete).not.toHaveBeenCalled();
    expect(transport.fail).not.toHaveBeenCalled();

    pendingClaim.resolve(undefined);
    await harness.emit("session_shutdown", { reason: "quit" } as SessionShutdownEvent, harness.context);
  });

  it("aborts an outstanding delivery claim before closing the reporter on shutdown", async () => {
    const harness = createFakePiHarness();
    const reporter = createFakeReporter({
      sessionId: "target-session",
      taskCapability: "ab".repeat(32),
      coordinationBaseUrl: "http://127.0.0.1:43210",
    });
    let claimSignal: AbortSignal | undefined;
    const claim = vi.fn((_body, signal?: AbortSignal) => new Promise<undefined>((resolve) => {
      claimSignal = signal;
      signal?.addEventListener("abort", () => resolve(undefined), { once: true });
    }));
    const transport = { claim };
    registerPiAdapter(harness.pi, {
      createReporter: () => reporter,
      createCoordinationTransport: () => transport as never,
      now,
    });

    await harness.emit("session_start", { reason: "startup" }, harness.context);
    await vi.waitFor(() => expect(claim).toHaveBeenCalledTimes(1));
    await harness.emit("session_shutdown", { reason: "quit" } as SessionShutdownEvent, harness.context);

    expect(claimSignal?.aborted).toBe(true);
    expect(reporter.close).toHaveBeenCalledTimes(1);
  });

  it("normalizes finalized messages with entry ids", async () => {
    const harness = createFakePiHarness();
    const reporter = createFakeReporter();
    registerPiAdapter(harness.pi, { createReporter: () => reporter, now });
    await harness.emit("session_start", { reason: "startup" }, harness.context);

    const message: AgentMessage = {
      role: "user",
      content: "Investigate PROJQUAY-123",
      timestamp: 500,
    };
    await emitMessage(harness, message);

    expect(reporter.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "message.user",
        eventId: "entry-1",
        sequence: 1,
        text: "Investigate PROJQUAY-123",
      }),
    );
  });

  it("records tool execution lifecycle without arguments", async () => {
    const harness = createFakePiHarness();
    const reporter = createFakeReporter();
    registerPiAdapter(harness.pi, { createReporter: () => reporter, now });
    await harness.emit("session_start", { reason: "startup" }, harness.context);

    await harness.emit("tool_execution_start", { toolCallId: "call-1", toolName: "bash", args: { command: "rm" } }, harness.context);
    await harness.emit("tool_execution_end", { toolCallId: "call-1", toolName: "bash", result: {}, isError: false }, harness.context);

    expect(reporter.enqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: "tool.activity",
        toolCallId: "call-1",
        status: "running",
        startedAt: expect.any(Number),
      }),
    );
    expect(reporter.enqueue).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: "tool.activity",
        toolCallId: "call-1",
        status: "succeeded",
        endedAt: expect.any(Number),
      }),
    );
    const serialized = JSON.stringify(reporter.enqueue.mock.calls[0]![0]);
    expect(serialized).not.toContain("\"args\"");
  });

  it("emits session.state events and metadata updates", async () => {
    const harness = createFakePiHarness();
    const reporter = createFakeReporter();
    registerPiAdapter(harness.pi, { createReporter: () => reporter, now });
    await harness.emit("session_start", { reason: "startup" }, harness.context);

    await harness.emit("agent_start", { type: "agent_start" }, harness.context);
    await harness.emit("agent_settled", { type: "agent_settled" }, harness.context);

    expect(reporter.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "session.state", state: "running" }),
    );
    expect(reporter.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "session.state", state: "idle" }),
    );
    expect(reporter.updateMetadata).toHaveBeenLastCalledWith(expect.objectContaining({ state: "idle" }));
  });

  it("clears a removed session name via null", async () => {
    const harness = createFakePiHarness();
    const reporter = createFakeReporter();
    registerPiAdapter(harness.pi, { createReporter: () => reporter, now });
    await harness.emit("session_start", { reason: "startup" }, harness.context);

    await harness.emit("session_info_changed", { type: "session_info_changed", name: undefined }, harness.context);
    expect(reporter.updateMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ name: null }),
    );
  });

  it("replaces snapshots on tree navigation and continues after the snapshot", async () => {
    const harness = createFakePiHarness();
    const reporter = createFakeReporter();
    registerPiAdapter(harness.pi, { createReporter: () => reporter, now });
    await harness.emit("session_start", { reason: "startup" }, harness.context);

    const firstMessage: AgentMessage = { role: "user", content: "Investigate", timestamp: 1 };
    await emitMessage(harness, firstMessage);

    reporter.enqueue.mockClear();
    await harness.emit("session_tree", { type: "session_tree", newLeafId: null, oldLeafId: null } as SessionTreeEvent, harness.context);
    expect(reporter.replaceSnapshot).toHaveBeenCalledTimes(1);

    const secondMessage: AgentMessage = { role: "assistant", content: [{ type: "text", text: "Done" }], timestamp: 2 };
    await emitMessage(harness, secondMessage);
    expect(reporter.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ sequence: 2, type: "message.assistant" }),
    );
  });

  it("registers the query and delegation tools once", () => {
    const harness = createFakePiHarness();
    const reporter = createFakeReporter();
    registerPiAdapter(harness.pi, { createReporter: () => reporter, now });
    expect(harness.registerToolMock).toHaveBeenCalledTimes(2);
    expect(harness.registerToolMock.mock.calls.map((call) => call[0].name)).toEqual([
      "query_active_sessions",
      "delegate_task",
    ]);
  });
});
