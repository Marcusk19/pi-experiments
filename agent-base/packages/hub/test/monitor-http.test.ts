import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { HubServer } from "../src/index.js";
import { HubStore, createHubServer, MonitorIdentity, MonitorProjection, MonitorRevision } from "../src/index.js";
import { TaskStore } from "../src/coordination/task-store.js";
import { createDatabase } from "../src/schema.js";
import { SystemClock } from "../src/clock.js";

interface TestServer {
  server: HubServer;
  store: HubStore;
  rootToken: string;
  monitorToken: string;
  monitorCapability: string;
  identity: MonitorIdentity;
  revision: MonitorRevision;
}

const activeServers: TestServer[] = [];

afterEach(async () => {
  for (const ctx of activeServers) {
    ctx.revision.close();
    await ctx.server.close();
    ctx.store.close();
  }
  activeServers.splice(0, activeServers.length);
});

async function createTestServer(): Promise<TestServer> {
  const database = createDatabase();
  const clock = new SystemClock();
  const rootToken = randomBytes(32).toString("hex");
  const monitorToken = randomBytes(32).toString("hex");
  const monitorCapability = monitorToken;
  const capabilityDigest = createHash("sha256").update(monitorToken, "utf8").digest();
  const revision = new MonitorRevision();
  const store = new HubStore({ database, clock, onProjectionChanged: () => revision.changed() });
  const tasks = new TaskStore({ database, clock, instanceId: randomUUID(), onProjectionChanged: () => revision.changed() });
  const identity = new MonitorIdentity(randomBytes(32));
  const projection = new MonitorProjection({
    hub: store, tasks, clock, identity,
    daemonId: "test-daemon", startedAt: 1000,
    revision: () => revision.current(),
  });
  const server = await createHubServer({
    token: rootToken, store, clock,
    monitor: { capabilityDigest, projection, revision },
  });
  const ctx: TestServer = { server, store, rootToken, monitorToken, monitorCapability, identity, revision };
  activeServers.push(ctx);
  return ctx;
}

async function fetchMonitor(ctx: TestServer, path: string, options: RequestInit = {}) {
  return fetch(`${ctx.server.url}${path}`, {
    headers: { authorization: `Bearer ${ctx.monitorCapability}`, ...options.headers },
    ...options,
  });
}

describe("monitor HTTP routes", () => {
  it("rejects unauthenticated monitor requests", async () => {
    const ctx = await createTestServer();
    const res = await fetch(`${ctx.server.url}/monitor/v1/snapshot`);
    expect(res.status).toBe(401);
  });

  it("rejects root token on monitor routes", async () => {
    const ctx = await createTestServer();
    const res = await fetch(`${ctx.server.url}/monitor/v1/snapshot`, {
      headers: { authorization: `Bearer ${ctx.rootToken}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects monitor capability on root routes", async () => {
    const ctx = await createTestServer();
    const res = await fetchMonitor(ctx, "/v2/query", {
      method: "POST",
      body: JSON.stringify({ query: "test" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects POST on monitor routes", async () => {
    const ctx = await createTestServer();
    const res = await fetchMonitor(ctx, "/monitor/v1/snapshot", { method: "POST" });
    expect(res.status).toBe(405);
  });

  it("returns a valid snapshot", async () => {
    const ctx = await createTestServer();
    ctx.store.register({
      metadata: {
        adapter: "pi", adapterVersion: "0.1.0", cwd: "/repo",
        processId: 42, startedAt: 1000, state: "running", acceptsTaskDelivery: false,
      },
      snapshot: { lastSequence: 0, events: [] },
    });
    const res = await fetchMonitor(ctx, "/monitor/v1/snapshot");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apiVersion).toBe("monitor/v1");
    expect(body.sessions).toHaveLength(1);
  });

  it("supports long-poll with after/wait", async () => {
    const ctx = await createTestServer();
    const snap1 = await (await fetchMonitor(ctx, "/monitor/v1/snapshot")).json();
    const rev = snap1.revision;
    // Trigger a change in 50ms
    setTimeout(() => {
      ctx.store.register({
        metadata: {
          adapter: "pi", adapterVersion: "0.1.0", cwd: "/repo",
          processId: 42, startedAt: 1000, state: "idle", acceptsTaskDelivery: false,
        },
        snapshot: { lastSequence: 0, events: [] },
      });
    }, 50);
    const snap2 = await (await fetchMonitor(ctx, `/monitor/v1/snapshot?after=${rev}&wait=5000`)).json();
    expect(snap2.revision).toBeGreaterThan(rev);
    expect(snap2.sessions).toHaveLength(1);
  });

  it("clamps wait to 30000ms", async () => {
    const ctx = await createTestServer();
    // after != current revision, so returns immediately
    const res = await fetchMonitor(ctx, "/monitor/v1/snapshot?after=999&wait=30001");
    expect(res.status).toBe(200);
  });

  it("rejects invalid after parameter", async () => {
    const ctx = await createTestServer();
    const res = await fetchMonitor(ctx, "/monitor/v1/snapshot?after=-1");
    expect(res.status).toBe(400);
  });

  it("returns session detail", async () => {
    const ctx = await createTestServer();
    const { sessionId } = ctx.store.register({
      metadata: {
        adapter: "pi", adapterVersion: "0.1.0", cwd: "/repo",
        processId: 42, startedAt: 1000, state: "running", acceptsTaskDelivery: false,
      },
      snapshot: { lastSequence: 0, events: [] },
    });
    const monitorId = ctx.identity.forSession(sessionId);
    const res = await fetchMonitor(ctx, `/monitor/v1/sessions/${monitorId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.monitorId).toBe(monitorId);
    expect(body.apiVersion).toBe("monitor/v1");
  });

  it("returns 404 for unknown monitor ID", async () => {
    const ctx = await createTestServer();
    const res = await fetchMonitor(ctx, "/monitor/v1/sessions/ffffffffffffffffffffffffffffffff");
    expect(res.status).toBe(404);
  });

  it("releases waiter on abort", async () => {
    const ctx = await createTestServer();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    try {
      await fetchMonitor(ctx, "/monitor/v1/snapshot?after=0&wait=10000", { signal: controller.signal });
    } catch {
      // Expected abort
    }
    // Just verify the server is still responding
    const res = await fetchMonitor(ctx, "/monitor/v1/snapshot");
    expect(res.status).toBe(200);
  });
});
