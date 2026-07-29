import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Check } from "typebox/value";
import { afterEach, describe, expect, it } from "vitest";
import {
  MonitorSessionDetailSchema,
  MonitorSnapshotSchema,
} from "@agent-hub/contracts";
import type { HubServer } from "../src/index.js";
import { HubStore, createHubServer, MonitorIdentity, MonitorProjection, MonitorRevision } from "../src/index.js";
import { TaskStore } from "../src/coordination/task-store.js";
import { createDatabase } from "../src/schema.js";
import { SystemClock } from "../src/clock.js";

const FORBIDDEN = new Set([
  "text", "userText", "assistantText", "thinking", "arguments", "output",
  "prompt", "result", "processId", "harnessSessionId", "token", "capability",
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

interface TestEnv {
  server: HubServer;
  store: HubStore;
  tasks: TaskStore;
  identity: MonitorIdentity;
  revision: MonitorRevision;
  monitorToken: string;
  rootToken: string;
}

const activeEnvs: TestEnv[] = [];

afterEach(async () => {
  for (const env of activeEnvs) {
    env.revision.close();
    await env.server.close();
    env.store.close();
  }
  activeEnvs.splice(0, activeEnvs.length);
});

async function createTestEnv(): Promise<TestEnv> {
  const database = createDatabase();
  const clock = new SystemClock();
  const rootToken = randomBytes(32).toString("hex");
  const monitorToken = randomBytes(32).toString("hex");
  const capabilityDigest = createHash("sha256").update(monitorToken, "utf8").digest();
  const revision = new MonitorRevision();
  const store = new HubStore({ database, clock, onProjectionChanged: () => { revision.changed(); } });
  const tasks = new TaskStore({ database, clock, instanceId: randomUUID(), onProjectionChanged: () => { revision.changed(); } });
  const identity = new MonitorIdentity(randomBytes(32));
  const projection = new MonitorProjection({
    hub: store, tasks, clock, identity,
    daemonId: "e2e-daemon", startedAt: 1000,
    revision: () => revision.current(),
  });
  const server = await createHubServer({
    token: rootToken, store, clock,
    monitor: { capabilityDigest, projection, revision },
  });
  const env: TestEnv = { server, store, tasks, identity, revision, monitorToken, rootToken };
  activeEnvs.push(env);
  return env;
}

describe("monitor E2E", () => {
  it("projects sessions with secrets excluded from snapshot and detail", async () => {
    const env = await createTestEnv();

    // Register sessions with secrets in user text
    const sessionId1 = env.store.register({
      metadata: {
        adapter: "Pi", adapterVersion: "0.82.0", harnessSessionId: "SECRET-HARNESS-ID",
        cwd: "/workspace/quay", name: "fix-auth", processId: 99999,
        startedAt: 1000, state: "running", acceptsTaskDelivery: false,
      },
      snapshot: {
        lastSequence: 2,
        events: [
          { type: "message.user", eventId: "u1", sequence: 1, timestamp: 1000, text: "TOP-SECRET-PROMPT" },
          { type: "activity.summary", eventId: "s1", sequence: 2, timestamp: 2000, summary: "Running auth tests", safeForMonitor: true },
        ] as any,
      },
    }).sessionId;

    env.store.register({
      metadata: {
        adapter: "Claude", adapterVersion: "1.0.0", cwd: "/workspace/docs",
        processId: 88888, startedAt: 1000, state: "idle", acceptsTaskDelivery: false,
      },
      snapshot: { lastSequence: 0, events: [] },
    });

    // Fetch snapshot
    const snapRes = await fetch(`${env.server.url}/monitor/v1/snapshot`, {
      headers: { authorization: `Bearer ${env.monitorToken}` },
    });
    expect(snapRes.status).toBe(200);
    const snapshot = await snapRes.json();
    expect(Check(MonitorSnapshotSchema, snapshot)).toBe(true);
    expect(snapshot.sessions).toHaveLength(2);

    // Verify secrets are excluded
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain("TOP-SECRET-PROMPT");
    expect(json).not.toContain("SECRET-HARNESS-ID");
    expect(json).not.toContain("99999");
    assertNoForbidden(snapshot);

    // Fetch detail
    const monitorId = env.identity.forSession(sessionId1);
    const detailRes = await fetch(`${env.server.url}/monitor/v1/sessions/${monitorId}`, {
      headers: { authorization: `Bearer ${env.monitorToken}` },
    });
    expect(detailRes.status).toBe(200);
    const detail = await detailRes.json();
    expect(Check(MonitorSessionDetailSchema, detail)).toBe(true);

    const detailJson = JSON.stringify(detail);
    expect(detailJson).not.toContain("TOP-SECRET-PROMPT");
    expect(detailJson).not.toContain("SECRET-HARNESS-ID");
    assertNoForbidden(detail);
  });

  it("long-poll wakes on mutation", async () => {
    const env = await createTestEnv();
    const snap1 = await (await fetch(`${env.server.url}/monitor/v1/snapshot`, {
      headers: { authorization: `Bearer ${env.monitorToken}` },
    })).json();

    // Mutate after 50ms
    setTimeout(() => {
      env.store.register({
        metadata: {
          adapter: "Pi", adapterVersion: "0.1.0", cwd: "/repo",
          processId: 42, startedAt: 1000, state: "idle", acceptsTaskDelivery: false,
        },
        snapshot: { lastSequence: 0, events: [] },
      });
    }, 50);

    const snap2 = await (await fetch(
      `${env.server.url}/monitor/v1/snapshot?after=${snap1.revision}&wait=5000`,
      { headers: { authorization: `Bearer ${env.monitorToken}` } },
    )).json();

    expect(snap2.revision).toBeGreaterThan(snap1.revision);
    expect(snap2.sessions).toHaveLength(1);
  });

  it("deleted session disappears from snapshot and detail", async () => {
    const env = await createTestEnv();
    const { sessionId } = env.store.register({
      metadata: {
        adapter: "Pi", adapterVersion: "0.1.0", cwd: "/repo",
        processId: 42, startedAt: 1000, state: "idle", acceptsTaskDelivery: false,
      },
      snapshot: { lastSequence: 0, events: [] },
    });
    const monitorId = env.identity.forSession(sessionId);

    // Verify present
    let snap = await (await fetch(`${env.server.url}/monitor/v1/snapshot`, {
      headers: { authorization: `Bearer ${env.monitorToken}` },
    })).json();
    expect(snap.sessions).toHaveLength(1);

    // Delete
    env.store.deleteSession(sessionId);

    // Verify gone
    snap = await (await fetch(`${env.server.url}/monitor/v1/snapshot`, {
      headers: { authorization: `Bearer ${env.monitorToken}` },
    })).json();
    expect(snap.sessions).toHaveLength(0);

    const detailRes = await fetch(`${env.server.url}/monitor/v1/sessions/${monitorId}`, {
      headers: { authorization: `Bearer ${env.monitorToken}` },
    });
    expect(detailRes.status).toBe(404);
  });

  it("monitor capability cannot access root routes", async () => {
    const env = await createTestEnv();
    const res = await fetch(`${env.server.url}/v2/query`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.monitorToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: "test" }),
    });
    expect(res.status).toBe(401);
  });
});
