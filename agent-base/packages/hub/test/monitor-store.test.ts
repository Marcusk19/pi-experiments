import { describe, expect, it } from "vitest";
import { HubStore } from "../src/store.js";
import { TaskStore } from "../src/coordination/task-store.js";
import { MonitorIdentity } from "../src/monitor-identity.js";
import { createDatabase } from "../src/schema.js";
import { SystemClock } from "../src/clock.js";
import { randomUUID } from "node:crypto";

function makeStore() {
  const database = createDatabase();
  const clock = new SystemClock();
  const hub = new HubStore({ database, clock });
  const tasks = new TaskStore({ database, clock, instanceId: randomUUID() });
  return { hub, tasks, database };
}

function registerSession(hub: HubStore, text: string, summary?: string) {
  const events: Array<Record<string, unknown>> = [
    { type: "message.user", eventId: "e-1", sequence: 1, timestamp: 1000, text },
    { type: "message.assistant", eventId: "e-2", sequence: 2, timestamp: 2000, text: "assistant reply", stopStatus: "stop" },
  ];
  if (summary) {
    events.push({
      type: "activity.summary", eventId: "e-3", sequence: 3, timestamp: 3000,
      summary, safeForMonitor: true,
    });
  }
  events.push({
    type: "tool.activity", eventId: "e-tool", sequence: events.length + 1, timestamp: 4000,
    toolCallId: "tc-1", toolName: "bash", status: "running", startedAt: 3500,
  });
  const result = hub.register({
    metadata: {
      adapter: "pi", adapterVersion: "0.1.0", cwd: "/repo", processId: 42,
      startedAt: 1000, state: "running", acceptsTaskDelivery: false,
    },
    snapshot: { lastSequence: events.length, events: events as any },
  });
  return result.sessionId;
}

describe("monitor-safe store queries", () => {
  it("returns only the activity summary, not message text", () => {
    const { hub } = makeStore();
    const sessionId = registerSession(hub, "DO-NOT-EXPOSE", "Reviewing PR #42");
    const summary = hub.latestActivitySummary(sessionId);
    expect(summary).toBeDefined();
    expect(summary!.summary).toBe("Reviewing PR #42");
    expect(summary!.safeForMonitor).toBe(true);
    expect(JSON.stringify(summary)).not.toContain("DO-NOT-EXPOSE");
  });

  it("returns undefined when no summary exists", () => {
    const { hub } = makeStore();
    const sessionId = registerSession(hub, "secret text");
    expect(hub.latestActivitySummary(sessionId)).toBeUndefined();
  });

  it("returns bounded tool states with startedAt/endedAt", () => {
    const { hub } = makeStore();
    const sessionId = registerSession(hub, "secret", "Working");
    const tools = hub.monitorToolStates(sessionId, 50);
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      toolCallId: "tc-1", toolName: "bash", status: "running", startedAt: 3500,
    });
  });

  it("lists tasks for session with source and target roles", () => {
    const { hub, tasks } = makeStore();
    const sourceId = registerSession(hub, "src", "Source");
    const targetId = registerSession(hub, "tgt", "Target");
    tasks.createExistingTask({
      sourceSessionId: sourceId,
      targetSessionId: targetId,
      contextId: "ctx-1",
      message: { messageId: "m1", role: "source", parts: [{ kind: "text", text: "do work", mediaType: "text/plain" }], extensions: [] },
      deadlineAt: Date.now() + 60_000,
    });
    const sourceTasks = tasks.listTasksForSession(sourceId, 50);
    expect(sourceTasks).toHaveLength(1);
    expect(sourceTasks[0]!.role).toBe("source");
    const targetTasks = tasks.listTasksForSession(targetId, 50);
    expect(targetTasks).toHaveLength(1);
    expect(targetTasks[0]!.role).toBe("target");
  });
});

describe("MonitorIdentity", () => {
  it("produces deterministic opaque 32-hex IDs", () => {
    const identity = new MonitorIdentity(Buffer.alloc(32, 7));
    const sessionId = "test-session-id";
    const monitorId = identity.forSession(sessionId);
    expect(monitorId).toMatch(/^[0-9a-f]{32}$/);
    expect(monitorId).not.toContain(sessionId);
    expect(identity.forSession(sessionId)).toBe(monitorId);
  });

  it("resolves monitor ID back to session ID", () => {
    const identity = new MonitorIdentity(Buffer.alloc(32, 7));
    const sessionId = "test-session-id";
    const monitorId = identity.forSession(sessionId);
    expect(identity.resolve(monitorId, [sessionId, "other-id"])).toBe(sessionId);
    expect(identity.resolve("ffffffffffffffffffffffffffffffff", [sessionId])).toBeUndefined();
  });
});
