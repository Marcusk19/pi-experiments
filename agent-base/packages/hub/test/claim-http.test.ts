import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDaemonRuntime, type DaemonRuntime } from "../src/daemon.js";

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

const runtimes: DaemonRuntime[] = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
});

describe("delivery claim HTTP lifetime", () => {
  it("does not claim work for an abandoned long poll", async () => {
    const runtime = await createDaemonRuntime({ token: "root" });
    runtimes.push(runtime);
    const source = runtime.register(registration("source", false));
    const target = runtime.register(registration("target", true));

    let enteredClaim!: () => void;
    let finishedClaim!: () => void;
    let claimSignal: AbortSignal | undefined;
    const claimEntered = new Promise<void>((resolve) => { enteredClaim = resolve; });
    const claimFinished = new Promise<void>((resolve) => { finishedClaim = resolve; });
    const originalClaim = runtime.router.claim.bind(runtime.router);
    vi.spyOn(runtime.router, "claim").mockImplementation((targetId, waitSeconds, signal) => {
      claimSignal = signal;
      enteredClaim();
      const result = originalClaim(targetId, waitSeconds, signal);
      void result.finally(finishedClaim);
      return result;
    });

    const body = JSON.stringify({ waitSeconds: 30 });
    const request = http.request(
      `${runtime.server.url}/v2/sessions/${target.sessionId}/deliveries:claim`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${target.taskCapability}`,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
    );
    const abandonedClaim = new Promise<never>((_resolve, reject) => {
      request.once("response", () => reject(new Error("abandoned claim unexpectedly received a response")));
      request.once("error", reject);
    });
    request.end(body);

    await claimEntered;
    const serverClaimSignal = claimSignal;
    expect(serverClaimSignal).toBeDefined();
    const serverObservedDisconnect = new Promise<void>((resolve) => {
      serverClaimSignal!.addEventListener("abort", () => resolve(), { once: true });
    });
    request.destroy(new Error("test disconnect"));
    await expect(abandonedClaim).rejects.toThrow();
    await serverObservedDisconnect;
    await claimFinished;

    const task = runtime.coordination.createExistingSessionTask(source.sessionId, {
      targetSessionId: target.sessionId,
      message: {
        messageId: "after-disconnect",
        role: "source",
        parts: [{ kind: "text", text: "still queued", mediaType: "text/plain" }],
        extensions: [],
      },
    });
    await vi.waitFor(() => {
      expect(runtime.tasks.getTask(task.id)?.state).toBe("submitted");
    });

    const liveClaim = await fetch(
      `${runtime.server.url}/v2/sessions/${target.sessionId}/deliveries:claim`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${target.taskCapability}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ waitSeconds: 0 }),
      },
    );
    expect(liveClaim.status).toBe(200);
    await expect(liveClaim.json()).resolves.toMatchObject({ taskId: task.id });
  });

  it("aborts and drains an active long poll before server shutdown completes", async () => {
    const runtime = await createDaemonRuntime({ token: "root" });
    runtimes.push(runtime);
    const target = runtime.register(registration("shutdown-target", true));

    let enteredClaim!: () => void;
    let claimSignal: AbortSignal | undefined;
    const claimEntered = new Promise<void>((resolve) => { enteredClaim = resolve; });
    const originalClaim = runtime.router.claim.bind(runtime.router);
    vi.spyOn(runtime.router, "claim").mockImplementation((targetId, waitSeconds, signal) => {
      claimSignal = signal;
      enteredClaim();
      return originalClaim(targetId, waitSeconds, signal);
    });

    const pendingClaim = fetch(
      `${runtime.server.url}/v2/sessions/${target.sessionId}/deliveries:claim`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${target.taskCapability}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ waitSeconds: 30 }),
      },
    );

    await claimEntered;
    const closed = runtime.close();
    await vi.waitFor(() => expect(claimSignal?.aborted).toBe(true));
    await closed;
    await expect(pendingClaim).rejects.toThrow();
  });

  it("requeues a delivery claimed just before the client disconnect is observed", async () => {
    const runtime = await createDaemonRuntime({ token: "root" });
    runtimes.push(runtime);
    const source = runtime.register(registration("source", false));
    const target = runtime.register(registration("target", true));
    const task = runtime.coordination.createExistingSessionTask(source.sessionId, {
      targetSessionId: target.sessionId,
      message: {
        messageId: "claimed-before-disconnect",
        role: "source",
        parts: [{ kind: "text", text: "return me to the queue", mediaType: "text/plain" }],
        extensions: [],
      },
    });

    let claimed!: () => void;
    let releaseClaim!: () => void;
    let claimSignal: AbortSignal | undefined;
    const deliveryClaimed = new Promise<void>((resolve) => { claimed = resolve; });
    const release = new Promise<void>((resolve) => { releaseClaim = resolve; });
    const originalClaim = runtime.router.claim.bind(runtime.router);
    vi.spyOn(runtime.router, "claim").mockImplementation(async (targetId, waitSeconds, signal) => {
      claimSignal = signal;
      const result = await originalClaim(targetId, waitSeconds, signal);
      claimed();
      await release;
      return result;
    });

    const abort = new AbortController();
    const abandonedClaim = fetch(
      `${runtime.server.url}/v2/sessions/${target.sessionId}/deliveries:claim`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${target.taskCapability}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ waitSeconds: 0 }),
        signal: abort.signal,
      },
    );

    await deliveryClaimed;
    expect(runtime.tasks.getTask(task.id)?.state).toBe("working");
    const serverObservedDisconnect = new Promise<void>((resolve) => {
      claimSignal!.addEventListener("abort", () => resolve(), { once: true });
    });
    abort.abort();
    await expect(abandonedClaim).rejects.toThrow();
    await serverObservedDisconnect;
    releaseClaim();

    await vi.waitFor(() => {
      expect(runtime.tasks.listDeliveries(task.id)[0]?.state).toBe("queued");
    });
    expect(runtime.tasks.getTask(task.id)?.state).toBe("submitted");

    const liveClaim = await fetch(
      `${runtime.server.url}/v2/sessions/${target.sessionId}/deliveries:claim`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${target.taskCapability}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ waitSeconds: 0 }),
      },
    );
    expect(liveClaim.status).toBe(200);
    await expect(liveClaim.json()).resolves.toMatchObject({ taskId: task.id });
  });
});
