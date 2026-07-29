import { describe, expect, it, vi } from "vitest";
import type { SourceCoordinationClient } from "@agent-hub/client";
import {
  COORDINATION_API_CHANNEL,
  registerPiCoordinationApi,
  type PiCoordinationApi,
  type PiCoordinationApiRequest,
} from "../src/coordination-api.js";
import { createFakePiHarness, createFakeReporter } from "./helpers.js";

const task = {
  taskId: "task-1",
  contextId: "context-1",
  state: "submitted" as const,
  cancellationRequested: false,
};

function client(): SourceCoordinationClient {
  return {
    send: vi.fn().mockResolvedValue(task),
    watch: vi.fn().mockResolvedValue(task),
    cancel: vi.fn().mockResolvedValue({ ...task, state: "canceled", cancellationRequested: true }),
  };
}

describe("Pi extension coordination API", () => {
  it("resolves a launched harness session and sends through refreshed source credentials", async () => {
    const harness = createFakePiHarness();
    const reporter = createFakeReporter({
      sessionId: "source-registry-session",
      coordinationBaseUrl: "http://127.0.0.1:4321",
      taskCapability: "private-capability",
      query: vi.fn().mockResolvedValue({
        mode: "overview",
        truncated: false,
        sessions: [{
          sessionId: "target-registry-session",
          metadata: {
            adapter: "pi",
            adapterVersion: "0.1.0",
            harnessSessionId: "launched-pi-session",
            cwd: "/repo",
            processId: 123,
            startedAt: 1,
            state: "idle",
            acceptsTaskDelivery: true,
          },
          lastActivityAt: 1,
          transcriptCompleteness: "complete",
          signals: [],
          excerpts: [],
        }],
      }),
    });
    const sourceClient = client();
    const factory = vi.fn(() => sourceClient);
    registerPiCoordinationApi(harness.pi, () => reporter, factory, () => Date.parse("2026-07-24T00:00:00Z"));

    let api: PiCoordinationApi | undefined;
    harness.pi.events.emit(COORDINATION_API_CHANNEL, {
      version: 1,
      accept(value) { api = value; },
    } satisfies PiCoordinationApiRequest);

    const result = await api!.sendToHarnessSession({
      harnessSessionId: "launched-pi-session",
      instruction: "Inspect the code",
      deadlineMinutes: 30,
    });

    expect(reporter.query).toHaveBeenCalledWith(expect.objectContaining({
      mode: "overview",
      includeCurrentSession: true,
    }), expect.any(AbortSignal));
    expect(factory).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:4321",
      taskCapability: "private-capability",
    });
    expect(sourceClient.send).toHaveBeenCalledWith({
      targetId: "target-registry-session",
      instruction: "Inspect the code",
      deadline: "2026-07-24T00:30:00.000Z",
    }, undefined);
    expect(result).toEqual(task);
  });

  it("does not expose an API for malformed requests and can unregister", () => {
    const harness = createFakePiHarness();
    const unregister = registerPiCoordinationApi(harness.pi, () => createFakeReporter());
    const accept = vi.fn();

    harness.pi.events.emit(COORDINATION_API_CHANNEL, { version: 2, accept });
    expect(accept).not.toHaveBeenCalled();

    unregister();
    harness.pi.events.emit(COORDINATION_API_CHANNEL, { version: 1, accept });
    expect(accept).not.toHaveBeenCalled();
  });

  it("rejects when the launched worker is not delivery-capable", async () => {
    const harness = createFakePiHarness();
    const reporter = createFakeReporter({
      sessionId: "source",
      coordinationBaseUrl: "http://127.0.0.1:4321",
      taskCapability: "capability",
      query: vi.fn().mockResolvedValue({ mode: "overview", truncated: false, sessions: [] }),
    });
    registerPiCoordinationApi(harness.pi, () => reporter, () => client());
    let api: PiCoordinationApi | undefined;
    harness.pi.events.emit(COORDINATION_API_CHANNEL, {
      version: 1,
      accept(value) { api = value; },
    } satisfies PiCoordinationApiRequest);

    await expect(api!.sendToHarnessSession({
      harnessSessionId: "missing",
      instruction: "work",
      targetWaitMs: 1,
    })).rejects.toThrow(/did not register/i);
  });
});
