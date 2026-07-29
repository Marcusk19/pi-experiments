import type { AssistantMessage } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoordinationTransport, createSourceCoordinationClient } from "@agent-hub/client";
import { createDaemonRuntime } from "@agent-hub/hub";
import { PiInboundDelivery } from "../src/inbound-delivery.js";
import { createFakePiHarness } from "./helpers.js";

const runtimes: Array<Awaited<ReturnType<typeof createDaemonRuntime>>> = [];

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
});

describe("PiInboundDelivery integration", () => {
  it("makes visible inbound Pi completion available to the source client without a model", async () => {
    const runtime = await createDaemonRuntime({ token: "root" });
    runtimes.push(runtime);
    const source = runtime.register(registration("source", false));
    const target = runtime.register(registration("target-pi", true));
    const sourceClient = createSourceCoordinationClient({
      baseUrl: runtime.server.url,
      taskCapability: source.taskCapability,
    });
    const targetClient = new CoordinationTransport({
      baseUrl: runtime.server.url,
      sessionId: target.sessionId,
      taskCapability: target.taskCapability,
    });
    const harness = createFakePiHarness();
    const inbound = new PiInboundDelivery(harness.pi, harness.context, () => targetClient);
    inbound.start();

    try {
      const sent = await sourceClient.send({ targetId: target.sessionId, instruction: "Inspect auth" });
      await vi.waitFor(() => expect(harness.sendUserMessageMock).toHaveBeenCalledWith(expect.stringContaining("Inspect auth")));

      inbound.onMessage(assistantMessage("Auth is healthy"), harness.context);
      await inbound.onAgentSettled(harness.context);

      await expect(sourceClient.watch(sent.taskId)).resolves.toMatchObject({
        state: "completed",
        targetText: "Auth is healthy",
      });
    } finally {
      await inbound.stop();
    }
  });
});

function assistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "test",
    model: "test",
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}
