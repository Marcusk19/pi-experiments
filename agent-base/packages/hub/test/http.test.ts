import { afterEach, describe, expect, it } from "vitest";
import type { HubServer } from "../src/index.js";
import { HubStore, createHubServer } from "../src/index.js";

interface TestServer {
  server: HubServer;
  store: HubStore;
  token: string;
  logs: Array<{ method: string; path: string; status: number; durationMs: number; errorCode?: string }>;
}

const activeServers: TestServer[] = [];
const baseMetadata = {
  adapter: "pi",
  adapterVersion: "0.1.0",
  cwd: "/repo",
  processId: 99,
  startedAt: Date.now(),
  state: "idle" as const,
  acceptsTaskDelivery: false,
};

afterEach(async () => {
  await Promise.all(activeServers.map(async (ctx) => {
    await ctx.server.close();
    ctx.store.close();
  }));
  activeServers.splice(0, activeServers.length);
});

describe("registry HTTP server", () => {
  it("authenticates health and rejects malformed registration", async () => {
    const ctx = await startTestServer();
    const unauthenticated = await fetch(`${ctx.server.url}/v2/health`);
    expect(unauthenticated.status).toBe(401);

    const health = await authed(ctx, "/v2/health");
    expect(health.status).toBe(200);

    const bad = await authed(ctx, "/v2/sessions", {
      method: "POST",
      body: JSON.stringify({ metadata: { cwd: "/repo" } }),
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
  });

  it("performs the session lifecycle and logs no sensitive data", async () => {
    const ctx = await startTestServer();
    const registrationBody = {
      metadata: { ...baseMetadata, harnessSessionId: "alpha" },
      snapshot: {
        lastSequence: 1,
        events: [{ type: "message.user", eventId: "u1", sequence: 1, timestamp: Date.now(), text: "Investigate secrets" }],
      },
    };
    const register = await authed(ctx, "/v2/sessions", { method: "POST", body: JSON.stringify(registrationBody) });
    expect(register.status).toBe(200);
    const registration = await register.json();
    const sessionId = registration.sessionId;

    const append = await authed(ctx, `/v2/sessions/${sessionId}/events`, {
      method: "POST",
      body: JSON.stringify({
        expectedSequence: 1,
        events: [{ type: "session.state", eventId: "s2", sequence: 2, timestamp: Date.now(), state: "running" }],
      }),
    });
    expect(append.status).toBe(200);

    const heartbeat = await authed(ctx, `/v2/sessions/${sessionId}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ state: "running", lastActivityAt: Date.now(), name: "Alpha" }),
    });
    expect(heartbeat.status).toBe(200);

    const query = await authed(ctx, "/v2/query", {
      method: "POST",
      body: JSON.stringify({ query: "what's happening?" }),
    });
    expect(query.status).toBe(200);
    const queryPayload = await query.json();
    expect(queryPayload.sessions.length).toBeGreaterThan(0);

    const replace = await authed(ctx, `/v2/sessions/${sessionId}/snapshot`, {
      method: "PUT",
      body: JSON.stringify({
        lastSequence: 1,
        events: [{ type: "message.user", eventId: "u7", sequence: 1, timestamp: Date.now(), text: "Refreshed" }],
      }),
    });
    expect(replace.status).toBe(200);

    const firstDelete = await authed(ctx, `/v2/sessions/${sessionId}`, { method: "DELETE" });
    expect(firstDelete.status).toBe(204);
    const secondDelete = await authed(ctx, `/v2/sessions/${sessionId}`, { method: "DELETE" });
    expect(secondDelete.status).toBe(204);

    const serializedLogs = JSON.stringify(ctx.logs);
    expect(serializedLogs).not.toContain("Investigate secrets");
    expect(serializedLogs).not.toContain(ctx.token);
  });

  it("maps registry errors to HTTP status codes", async () => {
    const ctx = await startTestServer();
    const registrationBody = {
      metadata: { ...baseMetadata, harnessSessionId: "seq" },
      snapshot: {
        lastSequence: 1,
        events: [{ type: "message.user", eventId: "u1", sequence: 1, timestamp: Date.now(), text: "seq" }],
      },
    };
    const register = await authed(ctx, "/v2/sessions", { method: "POST", body: JSON.stringify(registrationBody) });
    const sessionId = (await register.json()).sessionId as string;

    const gap = await authed(ctx, `/v2/sessions/${sessionId}/events`, {
      method: "POST",
      body: JSON.stringify({
        expectedSequence: 99,
        events: [{ type: "session.state", eventId: "s2", sequence: 2, timestamp: Date.now(), state: "running" }],
      }),
    });
    expect(gap.status).toBe(409);
    const missing = await authed(ctx, "/v2/sessions/missing/heartbeat", {
      method: "POST",
      body: JSON.stringify({ state: "idle", lastActivityAt: Date.now() }),
    });
    expect(missing.status).toBe(404);
  });

  it("enforces a 1 MB request-body ceiling", async () => {
    const ctx = await startTestServer();
    const hugeQuery = "a".repeat(1_048_700);
    const response = await authed(ctx, "/v2/query", {
      method: "POST",
      body: JSON.stringify({ query: hugeQuery }),
    });
    expect(response.status).toBe(413);
    const payload = await response.json();
    expect(payload.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});

async function startTestServer(): Promise<TestServer> {
  const token = "test-token";
  const logs: TestServer["logs"] = [];
  const store = new HubStore();
  const server = await createHubServer({ token, store, logger: (entry) => logs.push(entry) });
  const ctx: TestServer = { server, store, token, logs };
  activeServers.push(ctx);
  return ctx;
}

function authed(ctx: TestServer, path: string, init: Parameters<typeof fetch>[1] = {}): ReturnType<typeof fetch> {
  const headers = new Headers(init?.headers);
  const bodyPresent = typeof init?.body !== "undefined";
  headers.set("authorization", `Bearer ${ctx.token}`);
  if (!headers.has("content-type") && bodyPresent) {
    headers.set("content-type", "application/json");
  }
  const options = init ? { ...init } : {};
  return fetch(`${ctx.server.url}${path}`, { ...options, headers });
}
