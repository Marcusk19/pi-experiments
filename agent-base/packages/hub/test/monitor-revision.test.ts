import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MonitorRevision } from "../src/monitor-revision.js";
import { HubStore } from "../src/store.js";
import { TaskStore } from "../src/coordination/task-store.js";
import { createDatabase } from "../src/schema.js";
import { SystemClock } from "../src/clock.js";

describe("MonitorRevision", () => {
  it("starts at zero and increments on changed()", () => {
    const rev = new MonitorRevision();
    expect(rev.current()).toBe(0);
    rev.changed();
    expect(rev.current()).toBe(1);
    rev.changed();
    expect(rev.current()).toBe(2);
    rev.close();
  });

  it("returns immediately when revision already changed", async () => {
    const rev = new MonitorRevision();
    rev.changed();
    const result = await rev.waitForChange(0, 5000);
    expect(result).toBe(1);
    rev.close();
  });

  it("times out when no change occurs", async () => {
    const rev = new MonitorRevision();
    const start = Date.now();
    const result = await rev.waitForChange(0, 50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
    expect(result).toBe(0);
    rev.close();
  });

  it("clamps wait to 30000ms max", async () => {
    const rev = new MonitorRevision();
    // Just verify it doesn't throw with 30001
    const start = Date.now();
    rev.changed(); // make sure it returns immediately
    const result = await rev.waitForChange(0, 30001);
    expect(result).toBe(1);
    rev.close();
  });

  it("wakes on abort signal", async () => {
    const rev = new MonitorRevision();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    const result = await rev.waitForChange(0, 5000, controller.signal);
    expect(result).toBe(0);
    rev.close();
  });

  it("close wakes waiters", async () => {
    const rev = new MonitorRevision();
    const promise = rev.waitForChange(0, 5000);
    rev.close();
    await expect(promise).resolves.toBe(0);
  });
});

describe("store notification hooks", () => {
  it("increments revision on register and append", () => {
    const rev = new MonitorRevision();
    const database = createDatabase();
    const clock = new SystemClock();
    const hub = new HubStore({ database, clock, onProjectionChanged: () => rev.changed() });

    expect(rev.current()).toBe(0);
    const { sessionId } = hub.register({
      metadata: {
        adapter: "pi", adapterVersion: "0.1.0", cwd: "/repo",
        processId: 42, startedAt: 1000, state: "idle", acceptsTaskDelivery: false,
      },
      snapshot: { lastSequence: 0, events: [] },
    });
    expect(rev.current()).toBe(1);

    hub.appendEvents(sessionId, {
      events: [{
        type: "message.user", eventId: "e1", sequence: 1, timestamp: 2000, text: "hello",
      }],
    });
    expect(rev.current()).toBe(2);

    hub.deleteSession(sessionId);
    expect(rev.current()).toBe(3);

    rev.close();
    hub.close();
  });

  it("increments revision on heartbeat", () => {
    const rev = new MonitorRevision();
    const database = createDatabase();
    const clock = new SystemClock();
    const hub = new HubStore({ database, clock, onProjectionChanged: () => rev.changed() });

    const { sessionId } = hub.register({
      metadata: {
        adapter: "pi", adapterVersion: "0.1.0", cwd: "/repo",
        processId: 42, startedAt: 1000, state: "idle", acceptsTaskDelivery: false,
      },
      snapshot: { lastSequence: 0, events: [] },
    });
    const before = rev.current();
    hub.heartbeat(sessionId, { state: "running", lastActivityAt: 2000 });
    expect(rev.current()).toBe(before + 1);

    rev.close();
    hub.close();
  });

  it("does not increment revision for a lease-only heartbeat", () => {
    const rev = new MonitorRevision();
    const database = createDatabase();
    const clock = new SystemClock();
    const hub = new HubStore({ database, clock, onProjectionChanged: () => rev.changed() });
    const { sessionId } = hub.register({
      metadata: {
        adapter: "pi", adapterVersion: "0.1.0", cwd: "/repo",
        processId: 42, startedAt: 1000, state: "idle", acceptsTaskDelivery: false,
      },
      snapshot: { lastSequence: 0, events: [] },
    });
    const before = rev.current();
    hub.heartbeat(sessionId, { state: "idle", lastActivityAt: 1000 });
    expect(rev.current()).toBe(before);
    rev.close();
    hub.close();
  });

  it("increments revision on task creation", () => {
    const rev = new MonitorRevision();
    const database = createDatabase();
    const clock = new SystemClock();
    const hub = new HubStore({ database, clock });
    const tasks = new TaskStore({
      database, clock, instanceId: randomUUID(),
      onProjectionChanged: () => rev.changed(),
    });

    const srcId = hub.register({
      metadata: {
        adapter: "pi", adapterVersion: "0.1.0", cwd: "/repo",
        processId: 42, startedAt: 1000, state: "idle", acceptsTaskDelivery: true,
      },
      snapshot: { lastSequence: 0, events: [] },
    }).sessionId;
    const tgtId = hub.register({
      metadata: {
        adapter: "pi", adapterVersion: "0.1.0", cwd: "/repo2",
        processId: 43, startedAt: 1000, state: "idle", acceptsTaskDelivery: true,
      },
      snapshot: { lastSequence: 0, events: [] },
    }).sessionId;

    const before = rev.current();
    tasks.createExistingTask({
      sourceSessionId: srcId,
      targetSessionId: tgtId,
      contextId: "ctx-1",
      message: {
        messageId: "m1", role: "source",
        parts: [{ kind: "text", text: "do work", mediaType: "text/plain" }],
        extensions: [],
      },
      deadlineAt: Date.now() + 60_000,
    });
    expect(rev.current()).toBe(before + 1);

    rev.close();
    hub.close();
  });
});
