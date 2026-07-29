import http from "node:http";
import { Task, TaskState } from "@a2a-js/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCAL_COORDINATION_EXTENSION } from "@agent-hub/contracts";
import { createDaemonRuntime, buildCoordinatorAgentCard } from "@agent-hub/hub";
import { CoordinationTransport } from "../src/coordination-transport.js";
import { createSourceCoordinationClient } from "../src/source-coordination-client.js";

const runtimes: Array<Awaited<ReturnType<typeof createDaemonRuntime>>> = [];
const servers: http.Server[] = [];

const registration = (id: string, acceptsTaskDelivery: boolean) => ({
  metadata: {
    adapter: "test",
    adapterVersion: "1",
    harnessSessionId: id,
    cwd: "/repo",
    processId: process.pid,
    startedAt: 1,
    state: "idle" as const,
    acceptsTaskDelivery,
  },
  snapshot: { lastSequence: 0, events: [] },
});

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  vi.restoreAllMocks();
});

describe("SourceCoordinationClient", () => {
  it("uses A2A 1.0, the required extension, one session selector, text, and returnImmediately", async () => {
    const requests: Array<{ method?: string; url?: string; headers: http.IncomingHttpHeaders; body: unknown }> = [];
    const { url } = await startWireServer(async (req, res, body, baseUrl) => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      if (req.url === "/.well-known/agent-card.json") {
        json(res, 200, TasklessCard(baseUrl));
        return;
      }
      json(res, 200, { task: taskJson("task-1", TaskState.TASK_STATE_SUBMITTED) });
    });
    const client = createSourceCoordinationClient({ baseUrl: url, taskCapability: "source-secret" });

    const result = await client.send({
      targetId: "018f0c9e-18d8-7a30-8d5d-0d66d65f13b5",
      instruction: "Inspect auth",
      deadline: "2026-07-24T01:00:00.000Z",
    });

    expect(result).toMatchObject({ taskId: "task-1", state: "submitted" });
    const send = requests.find((request) => request.url === "/message:send")!;
    expect(requests.filter((request) => request.url?.startsWith("/tasks/"))).toHaveLength(0);
    const cardRequest = requests.find((request) => request.url === "/.well-known/agent-card.json")!;
    expect(cardRequest.headers.authorization).toBeUndefined();
    expect(send.headers["a2a-version"]).toBe("1.0");
    expect(send.headers["a2a-extensions"]).toBe(LOCAL_COORDINATION_EXTENSION);
    expect(send.headers.authorization).toBe("Bearer source-secret");
    const payload = send.body as any;
    expect(payload.configuration.returnImmediately).toBe(true);
    expect(payload.metadata[LOCAL_COORDINATION_EXTENSION].deadline).toBe("2026-07-24T01:00:00.000Z");
    expect(payload.message.extensions).toEqual([LOCAL_COORDINATION_EXTENSION]);
    expect(payload.message.parts).toEqual([
      { data: { kind: "coordination.target", target: { type: "session", sessionId: "018f0c9e-18d8-7a30-8d5d-0d66d65f13b5" } }, mediaType: "application/json" },
      { text: "Inspect auth", mediaType: "text/plain" },
    ]);
  });

  it("performs exactly one bounded watch and explicit cancel request", async () => {
    const paths: string[] = [];
    const { url } = await startWireServer(async (req, res, _body, baseUrl) => {
      paths.push(req.url ?? "");
      if (req.url === "/.well-known/agent-card.json") return json(res, 200, TasklessCard(baseUrl));
      return json(res, 200, taskJson("task-1", req.url?.endsWith(":cancel") ? TaskState.TASK_STATE_CANCELED : TaskState.TASK_STATE_WORKING));
    });
    const client = createSourceCoordinationClient({ baseUrl: url, taskCapability: "source-secret", timeoutMs: 1_000 });

    await expect(client.watch("task-1")).resolves.toMatchObject({ state: "working" });
    await expect(client.cancel("task-1")).resolves.toMatchObject({ state: "canceled" });
    expect(paths.filter((path) => path === "/tasks/task-1?historyLength=10")).toHaveLength(1);
    expect(paths.filter((path) => path === "/tasks/task-1:cancel")).toHaveLength(1);
  });

  it("rejects unsafe endpoints and cards without exposing the credential", async () => {
    expect(() => createSourceCoordinationClient({ baseUrl: "https://example.com", taskCapability: "secret" })).toThrow(/loopback/i);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { url } = await startWireServer(async (req, res, _body, baseUrl) => {
      if (req.url === "/.well-known/agent-card.json") {
        const card = TasklessCard(baseUrl);
        card.capabilities!.extensions = [];
        return json(res, 200, card);
      }
      return json(res, 500, { error: { message: "source-secret" } });
    });
    const client = createSourceCoordinationClient({ baseUrl: url, taskCapability: "source-secret" });
    const error = await client.watch("task-1").catch((value: unknown) => value);
    expect(String(error)).toMatch(/coordination/i);
    expect(String(error)).not.toContain("source-secret");
    expect(JSON.stringify([log.mock.calls, warn.mock.calls, errorLog.mock.calls])).not.toContain("source-secret");
  });

  it("aborting watch aborts only that request and never sends cancellation", async () => {
    const paths: string[] = [];
    const { url } = await startWireServer(async (req, res, _body, baseUrl) => {
      paths.push(req.url ?? "");
      if (req.url === "/.well-known/agent-card.json") return json(res, 200, TasklessCard(baseUrl));
      await new Promise<void>((resolve) => req.once("close", resolve));
      if (!res.writableEnded) res.end();
    });
    const client = createSourceCoordinationClient({ baseUrl: url, taskCapability: "source-secret", timeoutMs: 5_000 });
    const controller = new AbortController();
    const watch = client.watch("task-1", controller.signal);
    await vi.waitFor(() => expect(paths).toContain("/tasks/task-1?historyLength=10"));
    controller.abort();
    await expect(watch).rejects.toThrow(/coordination/i);
    expect(paths.some((path) => path.endsWith(":cancel"))).toBe(false);
  });

  it("projects bounded visible target text without raw payloads or credentials", async () => {
    const secret = "source-secret";
    const { url } = await startWireServer(async (req, res, _body, baseUrl) => {
      if (req.url === "/.well-known/agent-card.json") return json(res, 200, TasklessCard(baseUrl));
      const task = Task.fromJSON(taskJson("task-1", TaskState.TASK_STATE_COMPLETED));
      task.metadata = { deadline: "2026-07-24T01:00:00.000Z", cancellationRequested: false, terminalCode: "DONE", secret };
      task.history = [{
        messageId: "target-message",
        contextId: "context-1",
        taskId: "task-1",
        role: 2,
        parts: [
          { content: { $case: "text", value: "x".repeat(20_000) }, metadata: undefined, filename: "", mediaType: "text/plain" },
          { content: { $case: "data", value: { secret } }, metadata: undefined, filename: "", mediaType: "application/json" },
        ],
        metadata: { secret },
        extensions: [],
        referenceTaskIds: [],
      }];
      return json(res, 200, Task.toJSON(task));
    });
    const client = createSourceCoordinationClient({ baseUrl: url, taskCapability: secret });

    const snapshot = await client.watch("task-1");
    expect(snapshot.targetText?.length).toBeLessThanOrEqual(8_000);
    expect(snapshot).toEqual(expect.objectContaining({
      taskId: "task-1",
      contextId: "context-1",
      state: "completed",
      deadline: "2026-07-24T01:00:00.000Z",
      cancellationRequested: false,
      terminalCode: "DONE",
    }));
    expect(JSON.stringify(snapshot)).not.toContain(secret);
  });

  it.each([
    ["task ID", "id"],
    ["context ID", "contextId"],
  ] as const)("rejects an oversized opaque %s instead of truncating it", async (_label, field) => {
    const { url } = await startWireServer(async (req, res, _body, baseUrl) => {
      if (req.url === "/.well-known/agent-card.json") return json(res, 200, TasklessCard(baseUrl));
      const task = taskJson("task-1", TaskState.TASK_STATE_WORKING) as Record<string, unknown>;
      task[field] = "x".repeat(257);
      return json(res, 200, task);
    });
    const client = createSourceCoordinationClient({ baseUrl: url, taskCapability: "source-secret" });

    await expect(client.watch("task-1")).rejects.toThrow(/coordination/i);
  });

  it("completes a real source client to inbound target path and enforces source ownership", async () => {
    const runtime = await createDaemonRuntime({ token: "root" });
    runtimes.push(runtime);
    const source = runtime.register(registration("source", false));
    const otherSource = runtime.register(registration("other-source", false));
    const target = runtime.register(registration("target", true));
    const sourceClient = createSourceCoordinationClient({ baseUrl: runtime.server.url, taskCapability: source.taskCapability });
    const sent = await sourceClient.send({ targetId: target.sessionId, instruction: "Inspect auth" });

    const inbound = new CoordinationTransport({
      baseUrl: runtime.server.url,
      sessionId: target.sessionId,
      taskCapability: target.taskCapability,
    });
    const claim = await inbound.claim({ waitSeconds: 0 });
    expect(claim?.taskId).toBe(sent.taskId);
    await inbound.complete(sent.taskId, claim!.deliveryId, {
      message: { messageId: "visible-result", parts: [{ kind: "text", text: "Auth is healthy", mediaType: "text/plain" }] },
    });

    await expect(sourceClient.watch(sent.taskId)).resolves.toMatchObject({ state: "completed", targetText: "Auth is healthy" });
    const isolated = createSourceCoordinationClient({ baseUrl: runtime.server.url, taskCapability: otherSource.taskCapability });
    await expect(isolated.watch(sent.taskId)).rejects.toThrow(/coordination/i);
  });
});

function TasklessCard(baseUrl: string): ReturnType<typeof buildCoordinatorAgentCard> {
  return buildCoordinatorAgentCard(baseUrl, []);
}

async function startWireServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse, body: unknown, baseUrl: string) => Promise<void> | void,
): Promise<{ url: string }> {
  let baseUrl = "";
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString("utf8");
    await handler(req, res, text ? JSON.parse(text) : undefined, baseUrl);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing address");
  baseUrl = `http://127.0.0.1:${address.port}`;
  return { url: baseUrl };
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/a2a+json");
  res.end(JSON.stringify(body));
}

function taskJson(id: string, state: TaskState): unknown {
  return Task.toJSON({
    id,
    contextId: "context-1",
    status: { state, message: undefined, timestamp: "2026-07-24T00:00:00.000Z" },
    artifacts: [],
    history: [],
    metadata: { deadline: "2026-07-24T01:00:00.000Z", cancellationRequested: false },
  });
}
