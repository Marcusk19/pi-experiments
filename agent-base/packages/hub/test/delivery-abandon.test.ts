import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/schema.js";
import { HubStore } from "../src/store.js";
import { TaskStore } from "../src/coordination/task-store.js";
import { CoordinationService } from "../src/coordination/task-service.js";
import { DeliveryRouter } from "../src/coordination/delivery-router.js";

function fixture() {
  let now = 1_000;
  const clock = { now: () => now };
  const database = createDatabase();
  const registry = new HubStore({ database, clock });
  const tasks = new TaskStore({ database, clock, instanceId: "i" });
  const router = new DeliveryRouter({ registry, tasks, clock });
  const service = new CoordinationService({ registry, tasks, router, clock });
  const register = (id: string, acceptsTaskDelivery: boolean) => registry.register({
    metadata: {
      adapter: "test",
      adapterVersion: "1",
      harnessSessionId: id,
      cwd: "/repo",
      processId: 1,
      startedAt: 1,
      state: "idle",
      acceptsTaskDelivery,
    },
    snapshot: { lastSequence: 0, events: [] },
  });
  return {
    database,
    tasks,
    router,
    service,
    source: register("source", false).sessionId,
    target: register("target", true).sessionId,
    setNow(value: number) { now = value; },
  };
}

function input(targetSessionId: string, deadlineAt = 20_000) {
  return {
    targetSessionId,
    deadlineAt,
    message: {
      messageId: "message-1",
      role: "source" as const,
      parts: [{ kind: "text" as const, text: "inspect auth", mediaType: "text/plain" as const }],
      extensions: [],
    },
  };
}

describe("abandoning delivery claims", () => {
  it("idempotently requeues only a delivery that has not been accepted", async () => {
    const f = fixture();
    const task = f.service.createExistingSessionTask(f.source, input(f.target));
    const first = await f.router.claim(f.target, 0);

    expect(f.router.abandon(f.target, first!.delivery.id)).toBe(true);
    expect(f.router.abandon(f.target, first!.delivery.id)).toBe(false);
    expect(f.tasks.getTask(task.id)?.state).toBe("submitted");
    expect(f.tasks.listDeliveries(task.id)[0]).toMatchObject({ state: "queued" });
    expect(() => f.router.accept(f.target, first!.delivery.id)).toThrow(/Delivery not found/i);
    expect((await f.router.claim(f.target, 0))?.delivery.id).toBe(first!.delivery.id);
    f.database.close();
  });

  it("does not steal an accepted delivery when accept wins the transaction race", async () => {
    const f = fixture();
    const task = f.service.createExistingSessionTask(f.source, input(f.target));
    const claim = await f.router.claim(f.target, 0);

    f.router.accept(f.target, claim!.delivery.id);
    expect(f.router.abandon(f.target, claim!.delivery.id)).toBe(false);
    expect(f.tasks.listDeliveries(task.id)[0]?.state).toBe("accepted");
    expect(await f.router.claim(f.target, 0)).toBeUndefined();
    f.database.close();
  });

  it("finishes cancellation instead of requeueing an unaccepted claim", async () => {
    const f = fixture();
    const task = f.service.createExistingSessionTask(f.source, input(f.target));
    const claim = await f.router.claim(f.target, 0);

    f.service.cancelTask(f.source, task.id);
    expect(f.router.abandon(f.target, claim!.delivery.id)).toBe(true);
    expect(f.tasks.getTask(task.id)).toMatchObject({ state: "canceled", cancellationRequested: true });
    expect(f.tasks.listDeliveries(task.id)[0]?.state).toBe("resolved");
    expect(await f.router.claim(f.target, 0)).toBeUndefined();
    f.database.close();
  });

  it("fails an expired unaccepted claim instead of requeueing it", async () => {
    const f = fixture();
    const task = f.service.createExistingSessionTask(f.source, input(f.target, 2_000));
    const claim = await f.router.claim(f.target, 0);

    f.setNow(2_000);
    expect(f.router.abandon(f.target, claim!.delivery.id)).toBe(true);
    expect(f.tasks.getTask(task.id)).toMatchObject({ state: "failed", terminalCode: "DEADLINE_EXCEEDED" });
    expect(f.tasks.listDeliveries(task.id)[0]?.state).toBe("resolved");
    expect(await f.router.claim(f.target, 0)).toBeUndefined();
    f.database.close();
  });
});
