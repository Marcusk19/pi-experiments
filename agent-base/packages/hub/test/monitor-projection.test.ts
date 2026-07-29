import { randomUUID } from "node:crypto";
import { Check } from "typebox/value";
import { describe, expect, it } from "vitest";
import { MonitorSessionDetailSchema, MonitorSnapshotSchema } from "@agent-hub/contracts";
import { HubStore } from "../src/store.js";
import { TaskStore } from "../src/coordination/task-store.js";
import { MonitorIdentity } from "../src/monitor-identity.js";
import { MonitorProjection, MAX_MONITOR_SESSIONS } from "../src/monitor-projection.js";
import { createDatabase } from "../src/schema.js";
import { SystemClock } from "../src/clock.js";

const FORBIDDEN = new Set([
  "text", "userText", "assistantText", "thinking", "arguments", "output",
  "prompt", "result", "processId", "harnessSessionId", "token",
]);

function assertNoForbidden(value: unknown, path = ""): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) assertNoForbidden(value[i], `${path}[${i}]`);
    return;
  }
  if (typeof value === "object") {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN.has(key)) throw new Error(`Forbidden field "${key}" at ${path}.${key}`);
      assertNoForbidden(val, `${path}.${key}`);
    }
  }
}

function setup() {
  const database = createDatabase();
  const clock = new SystemClock();
  const hub = new HubStore({ database, clock });
  const tasks = new TaskStore({ database, clock, instanceId: randomUUID() });
  const identity = new MonitorIdentity(Buffer.alloc(32, 42));
  let rev = 0;
  const projection = new MonitorProjection({
    hub, tasks, clock, identity,
    daemonId: "test-daemon",
    startedAt: 1000,
    revision: () => rev,
  });
  const registerSession = (name: string, state: "idle" | "running" = "idle", secret = "SECRET") => {
    const events: Array<Record<string, unknown>> = [
      { type: "message.user", eventId: `${name}-e1`, sequence: 1, timestamp: 1000, text: secret },
      { type: "activity.summary", eventId: `${name}-e2`, sequence: 2, timestamp: 2000, summary: `Working on ${name}`, safeForMonitor: true },
    ];
    return hub.register({
      metadata: {
        adapter: "pi", adapterVersion: "0.1.0", harnessSessionId: `harness-${name}`,
        cwd: `/repo/${name}`, name, processId: 42, startedAt: 1000,
        state, acceptsTaskDelivery: false,
      },
      snapshot: { lastSequence: events.length, events: events as any },
    }).sessionId;
  };
  const bumpRevision = () => { rev += 1; };
  return { hub, tasks, identity, projection, registerSession, bumpRevision };
}

describe("MonitorProjection", () => {
  describe("snapshot", () => {
    it("returns a valid schema-conforming snapshot", () => {
      const { projection, registerSession } = setup();
      registerSession("session-1", "running");
      registerSession("session-2", "idle");
      const snap = projection.snapshot();
      expect(Check(MonitorSnapshotSchema, snap)).toBe(true);
      expect(snap.sessions).toHaveLength(2);
      expect(snap.totalSessions).toBe(2);
      expect(snap.truncated).toBe(false);
    });

    it("contains no forbidden or secret fields", () => {
      const { projection, registerSession } = setup();
      registerSession("session-1", "running", "DO-NOT-EXPOSE");
      const snap = projection.snapshot();
      const json = JSON.stringify(snap);
      expect(json).not.toContain("DO-NOT-EXPOSE");
      expect(json).not.toContain("harness-session-1");
      assertNoForbidden(snap);
    });

    it("truncates at MAX_MONITOR_SESSIONS", () => {
      const { hub, projection } = setup();
      for (let i = 0; i < MAX_MONITOR_SESSIONS + 5; i++) {
        hub.register({
          metadata: {
            adapter: "pi", adapterVersion: "0.1.0", cwd: `/repo/s${i}`,
            processId: 42, startedAt: 1000, state: "idle", acceptsTaskDelivery: false,
          },
          snapshot: { lastSequence: 0, events: [] },
        });
      }
      const snap = projection.snapshot();
      expect(snap.sessions).toHaveLength(MAX_MONITOR_SESSIONS);
      expect(snap.truncated).toBe(true);
      expect(snap.totalSessions).toBe(MAX_MONITOR_SESSIONS + 5);
    });

    it("orders attention first, then running, waiting, idle", () => {
      const { projection, registerSession, hub } = setup();
      registerSession("idle-session", "idle");
      const runningId = registerSession("running-session", "running");
      // Add a failed tool for attention
      hub.appendEvents(runningId, {
        events: [{
          type: "tool.activity", eventId: "fail-tool", sequence: 3, timestamp: 5000,
          toolCallId: "tc-fail", toolName: "test", status: "failed", startedAt: 4000, endedAt: 4500,
        }],
      });
      const snap = projection.snapshot();
      expect(snap.sessions[0]!.displayName).toBe("running-session");
      expect(snap.sessions[0]!.attentionReasons.length).toBeGreaterThan(0);
    });

    it("uses summary preference and falls back to operational text", () => {
      const { hub, projection } = setup();
      // Session with summary
      hub.register({
        metadata: {
          adapter: "pi", adapterVersion: "0.1.0", cwd: "/repo/a",
          processId: 42, startedAt: 1000, state: "idle", acceptsTaskDelivery: false,
        },
        snapshot: {
          lastSequence: 1, events: [{
            type: "activity.summary", eventId: "s1", sequence: 1, timestamp: 1000,
            summary: "Custom summary", safeForMonitor: true,
          }] as any,
        },
      });
      // Session without summary
      hub.register({
        metadata: {
          adapter: "pi", adapterVersion: "0.1.0", cwd: "/repo/b",
          processId: 42, startedAt: 1000, state: "idle", acceptsTaskDelivery: false,
        },
        snapshot: { lastSequence: 0, events: [] },
      });
      const snap = projection.snapshot();
      const withSummary = snap.sessions.find((s) => s.activitySummary === "Custom summary");
      const withFallback = snap.sessions.find((s) => s.activitySummary === "Idle");
      expect(withSummary).toBeDefined();
      expect(withFallback).toBeDefined();
      expect(withFallback!.completeness.activity).toBe("unavailable");
    });
  });

  describe("detail", () => {
    it("returns valid schema-conforming detail", () => {
      const { projection, registerSession, identity } = setup();
      const sessionId = registerSession("detail-test", "running");
      const monitorId = identity.forSession(sessionId);
      const detail = projection.detail(monitorId);
      expect(detail).toBeDefined();
      expect(Check(MonitorSessionDetailSchema, detail)).toBe(true);
    });

    it("returns undefined for unknown monitor ID", () => {
      const { projection } = setup();
      expect(projection.detail("ffffffffffffffffffffffffffffffff")).toBeUndefined();
    });

    it("contains no secrets in detail", () => {
      const { projection, registerSession, identity } = setup();
      const sessionId = registerSession("detail-sec", "running", "TOP-SECRET");
      const monitorId = identity.forSession(sessionId);
      const detail = projection.detail(monitorId)!;
      const json = JSON.stringify(detail);
      expect(json).not.toContain("TOP-SECRET");
      assertNoForbidden(detail);
    });
  });
});
