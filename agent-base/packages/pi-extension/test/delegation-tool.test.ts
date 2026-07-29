import { Check } from "typebox/value";
import { describe, expect, it, vi } from "vitest";
import type { SessionReporter, SourceCoordinationClient } from "@agent-hub/client";
import { createDelegatedTaskTool } from "../src/delegation-tool.js";
import { createFakePiHarness, createFakeReporter } from "./helpers.js";

const context = createFakePiHarness().context;
const snapshot = {
  taskId: "task-1",
  contextId: "context-1",
  state: "submitted" as const,
  deadline: "2026-07-24T01:00:00.000Z",
  cancellationRequested: false,
};

function fakeClient(overrides: Partial<SourceCoordinationClient> = {}): SourceCoordinationClient {
  return {
    send: vi.fn().mockResolvedValue(snapshot),
    watch: vi.fn().mockResolvedValue(snapshot),
    cancel: vi.fn().mockResolvedValue({ ...snapshot, state: "canceled", cancellationRequested: true }),
    ...overrides,
  };
}

describe("createDelegatedTaskTool", () => {
  it("has strict action-specific inputs and no caller-supplied URL", () => {
    const tool = createDelegatedTaskTool(() => createFakeReporter(), () => fakeClient());
    expect(Check(tool.parameters, { action: "send", targetId: "target", instruction: "work" })).toBe(true);
    expect(Check(tool.parameters, { action: "watch", taskId: "task-1" })).toBe(true);
    expect(Check(tool.parameters, { action: "cancel", taskId: "task-1" })).toBe(true);
    expect(Check(tool.parameters, { action: "send", targetId: "target", instruction: "work", taskId: "extra" })).toBe(false);
    expect(Check(tool.parameters, { action: "watch", taskId: "task-1", coordinatorUrl: "http://evil" })).toBe(false);
  });

  it("sends text to one selected target with a bounded deadline and compact output", async () => {
    const reporter = createFakeReporter({
      sessionId: "source-session",
      coordinationBaseUrl: "http://127.0.0.1:4000",
      taskCapability: "old-capability",
    });
    const client = fakeClient();
    const factory = vi.fn(() => client);
    const tool = createDelegatedTaskTool(() => reporter, factory, () => Date.parse("2026-07-24T00:00:00.000Z"));
    const signal = AbortSignal.timeout(1_000);

    const result = await tool.execute("call-send", {
      action: "send",
      targetId: "target-session",
      instruction: "Inspect auth",
      deadlineMinutes: 30,
    }, signal, undefined, context);

    expect(factory).toHaveBeenCalledWith({ baseUrl: "http://127.0.0.1:4000", taskCapability: "old-capability" });
    expect(client.send).toHaveBeenCalledWith({
      targetId: "target-session",
      instruction: "Inspect auth",
      deadline: "2026-07-24T00:30:00.000Z",
    }, signal);
    expect(result.details).toEqual(snapshot);
    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual(snapshot);
    expect(JSON.stringify(result)).not.toContain("old-capability");
    expect(JSON.stringify(result)).not.toContain("127.0.0.1");
  });

  it("watches once and cancels only for the explicit cancel action", async () => {
    const reporter = createFakeReporter({
      sessionId: "source-session",
      coordinationBaseUrl: "http://127.0.0.1:4000",
      taskCapability: "capability",
    });
    const client = fakeClient();
    const tool = createDelegatedTaskTool(() => reporter, () => client);
    const signal = new AbortController().signal;

    await tool.execute("call-watch", { action: "watch", taskId: "task-1" }, signal, undefined, context);
    expect(client.watch).toHaveBeenCalledTimes(1);
    expect(client.watch).toHaveBeenCalledWith("task-1", signal);
    expect(client.cancel).not.toHaveBeenCalled();

    await tool.execute("call-cancel", { action: "cancel", taskId: "task-1" }, signal, undefined, context);
    expect(client.cancel).toHaveBeenCalledTimes(1);
    expect(client.cancel).toHaveBeenCalledWith("task-1", signal);
  });

  it("resolves refreshed reporter credentials at every execution", async () => {
    let reporter: SessionReporter = createFakeReporter({
      sessionId: "source-old",
      coordinationBaseUrl: "http://127.0.0.1:4000",
      taskCapability: "old-capability",
    });
    const factory = vi.fn(() => fakeClient());
    const tool = createDelegatedTaskTool(() => reporter, factory);

    await tool.execute("call-old", { action: "watch", taskId: "task-1" }, undefined, undefined, context);
    reporter = createFakeReporter({
      sessionId: "source-new",
      coordinationBaseUrl: "http://127.0.0.1:5000",
      taskCapability: "new-capability",
    });
    await tool.execute("call-new", { action: "watch", taskId: "task-1" }, undefined, undefined, context);

    expect(factory).toHaveBeenNthCalledWith(1, { baseUrl: "http://127.0.0.1:4000", taskCapability: "old-capability" });
    expect(factory).toHaveBeenNthCalledWith(2, { baseUrl: "http://127.0.0.1:5000", taskCapability: "new-capability" });
  });

  it.each(["taskId", "contextId"] as const)("rejects an oversized opaque %s from the source client", async (field) => {
    const reporter = createFakeReporter({
      sessionId: "source-session",
      coordinationBaseUrl: "http://127.0.0.1:4000",
      taskCapability: "capability",
    });
    const client = fakeClient({ watch: vi.fn().mockResolvedValue({ ...snapshot, [field]: "x".repeat(257) }) });
    const tool = createDelegatedTaskTool(() => reporter, () => client);

    await expect(tool.execute("call-watch", { action: "watch", taskId: "task-1" }, undefined, undefined, context))
      .rejects.toThrow(/delegated task/i);
  });

  it("returns credential-safe errors and does not translate abort into cancellation", async () => {
    const secret = "never-expose-this-capability";
    const reporter = createFakeReporter({
      sessionId: "source-session",
      coordinationBaseUrl: "http://127.0.0.1:4000",
      taskCapability: secret,
    });
    const client = fakeClient({ watch: vi.fn().mockRejectedValue(new Error(`request failed: ${secret}`)) });
    const tool = createDelegatedTaskTool(() => reporter, () => client);
    const error = await tool.execute("call-watch", { action: "watch", taskId: "task-1" }, AbortSignal.abort(), undefined, context)
      .catch((value: unknown) => value);

    expect(String(error)).toMatch(/delegated task/i);
    expect(String(error)).not.toContain(secret);
    expect(client.cancel).not.toHaveBeenCalled();
  });

  it("requires a currently connected reporter", async () => {
    const tool = createDelegatedTaskTool(() => createFakeReporter(), () => fakeClient());
    await expect(tool.execute("call", { action: "watch", taskId: "task-1" }, undefined, undefined, context)).rejects.toThrow(
      /coordination unavailable/i,
    );
  });
});
