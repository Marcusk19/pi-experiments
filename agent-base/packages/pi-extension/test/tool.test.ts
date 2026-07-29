import { describe, expect, it, vi } from "vitest";
import type { QueryResponse } from "@agent-hub/contracts";
import type { SessionReporter } from "@agent-hub/client";
import { createQueryActiveSessionsTool } from "../src/tool.js";
import { createFakePiHarness, createFakeReporter } from "./helpers.js";

vi.mock("@agent-hub/client", () => ({
  createSessionReporter: vi.fn(),
}), { virtual: true });

const fakeResponse: QueryResponse = { mode: "overview", sessions: [], truncated: false };

const fakeContext = createFakePiHarness().context;

function buildTool(reporter: SessionReporter) {
  return createQueryActiveSessionsTool(() => reporter);
}

describe("createQueryActiveSessionsTool", () => {
  it("queries once and excludes current session by default", async () => {
    const reporter = createFakeReporter();
    reporter.query.mockResolvedValue(fakeResponse);
    const tool = buildTool(reporter);

    const result = await tool.execute(
      "call-1",
      { query: "what needs attention?" },
      AbortSignal.timeout(1_000),
      undefined,
      fakeContext,
    );

    expect(reporter.query).toHaveBeenCalledTimes(1);
    expect(reporter.query).toHaveBeenCalledWith({ query: "what needs attention?" }, expect.any(AbortSignal));
    expect(result.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("sessions") });
  });

  it("forwards optional filters and limits", async () => {
    const reporter = createFakeReporter();
    reporter.query.mockResolvedValue(fakeResponse);
    const tool = buildTool(reporter);

    const params = {
      query: "search",
      mode: "search" as const,
      cwd: "/repo",
      sessionIds: ["session-a"],
      includeCurrentSession: true,
      maxSessions: 5,
      maxExcerptsPerSession: 2,
      maxCharacters: 2_000,
    };

    await tool.execute("call-2", params, undefined, undefined, fakeContext);
    expect(reporter.query).toHaveBeenCalledWith(params, undefined);
  });

  it("exposes an opaque delivery target only for eligible sessions other than the caller", async () => {
    const reporter = createFakeReporter({ sessionId: "8b546bec-1d7d-4b3a-93d7-a17baaf92d01" });
    reporter.query.mockResolvedValue({
      mode: "overview",
      truncated: false,
      sessions: [
        {
          sessionId: "8b546bec-1d7d-4b3a-93d7-a17baaf92d01",
          metadata: { adapter: "pi", adapterVersion: "1", cwd: "/self", processId: 1, startedAt: 1, state: "idle", acceptsTaskDelivery: true },
          lastActivityAt: 1,
          transcriptCompleteness: "complete",
          signals: [],
          excerpts: [],
        },
        {
          sessionId: "2c970d15-c47d-48e1-9208-6f35b5bd7cb7",
          metadata: { adapter: "pi", adapterVersion: "1", cwd: "/target", processId: 2, startedAt: 1, state: "idle", acceptsTaskDelivery: true },
          lastActivityAt: 1,
          transcriptCompleteness: "complete",
          signals: [],
          excerpts: [],
        },
        {
          sessionId: "f756e795-dc9b-47e6-ad58-bfb50957eb6a",
          metadata: { adapter: "pi", adapterVersion: "1", cwd: "/observer", processId: 3, startedAt: 1, state: "idle", acceptsTaskDelivery: false },
          lastActivityAt: 1,
          transcriptCompleteness: "complete",
          signals: [],
          excerpts: [],
        },
      ],
    });
    const tool = buildTool(reporter);

    const result = await tool.execute("call-targets", { query: "targets", includeCurrentSession: true }, undefined, undefined, fakeContext);
    const content = JSON.parse(result.content[0]?.text ?? "") as { sessions: Array<Record<string, unknown>> };
    expect(content.sessions).toEqual([
      expect.not.objectContaining({ deliveryTargetId: expect.anything() }),
      expect.objectContaining({ deliveryTargetId: "2c970d15-c47d-48e1-9208-6f35b5bd7cb7" }),
      expect.not.objectContaining({ deliveryTargetId: expect.anything() }),
    ]);
    expect(JSON.stringify(content)).not.toContain("f756e795-dc9b-47e6-ad58-bfb50957eb6a");
  });

  it("formats compact model-facing content while retaining full diagnostic details", async () => {
    const reporter = createFakeReporter();
    const response: QueryResponse = {
      mode: "overview",
      truncated: false,
      sessions: [{
        sessionId: "8b546bec-1d7d-4b3a-93d7-a17baaf92d01",
        metadata: {
          adapter: "pi",
          adapterVersion: "0.1.0",
          harnessSessionId: "internal-harness-id",
          cwd: "/work/quay",
          processId: 12345,
          startedAt: 1_000,
          state: "running",
          acceptsTaskDelivery: true,
        },
        lastActivityAt: 2_000,
        transcriptCompleteness: "complete",
        signals: ["tool_failed:read"],
        excerpts: [{ eventId: "internal-event-id", kind: "message.user", text: "Investigate auth", timestamp: 1_500 }],
      }],
    };
    reporter.query.mockResolvedValue(response);
    const tool = buildTool(reporter);

    const result = await tool.execute("call-compact", { query: "status" }, undefined, undefined, fakeContext);
    const text = result.content[0]?.text ?? "";
    const content = JSON.parse(text) as { sessions: Array<Record<string, unknown>> };
    expect(content.sessions[0]).toEqual({
      deliveryTargetId: "8b546bec-1d7d-4b3a-93d7-a17baaf92d01",
      cwd: "/work/quay",
      state: "running",
      lastActivityAt: 2_000,
      attention: ["tool_failed:read"],
      evidence: [{ kind: "message.user", text: "Investigate auth", timestamp: 1_500 }],
    });
    expect(text).not.toContain("internal-harness-id");
    expect(text).not.toContain("internal-event-id");
    expect(text).not.toContain("processId");
    expect(result.details).toEqual(content);
    expect(JSON.stringify(result.details)).not.toContain("internal-harness-id");
  });

  it("clamps the JSON output to 40,000 characters", async () => {
    const reporter = createFakeReporter();
    const largeText = "x".repeat(45_000);
    reporter.query.mockResolvedValue({ mode: "overview", truncated: true, sessions: [
      { sessionId: "s1", metadata: { adapter: "pi", adapterVersion: "0.1", cwd: "/", processId: 1, startedAt: 0, state: "idle" }, lastActivityAt: 0, transcriptCompleteness: "complete", signals: [], excerpts: [
        { eventId: "e1", kind: "message", text: largeText, timestamp: 0 },
      ] },
    ] });
    const tool = buildTool(reporter);

    const result = await tool.execute("call-3", { query: "status" }, undefined, undefined, fakeContext);
    const text = result.content[0]?.text ?? "";
    expect(text.length).toBeLessThanOrEqual(40_000);
    expect(result.details).toMatchObject({ truncated: true });
  });

  it("maps known registry errors to friendly messages", async () => {
    const reporter = createFakeReporter();
    reporter.query.mockRejectedValue(Object.assign(new Error("unavailable"), { code: "HUB_UNAVAILABLE" }));
    const tool = buildTool(reporter);

    await expect(tool.execute("call-4", { query: "status" }, undefined, undefined, fakeContext)).rejects.toThrow(
      /Agent Activity Hub unavailable/i,
    );

    reporter.query.mockRejectedValue(Object.assign(new Error("protocol"), { code: "INCOMPATIBLE_PROTOCOL" }));
    await expect(tool.execute("call-5", { query: "status" }, undefined, undefined, fakeContext)).rejects.toThrow(
      /protocol is incompatible/i,
    );
  });

  it("throws when no reporter is connected", async () => {
    const tool = createQueryActiveSessionsTool(() => undefined);
    await expect(tool.execute("call-6", { query: "status" }, undefined, undefined, fakeContext)).rejects.toThrow(
      /Agent Activity Hub unavailable/i,
    );
  });
});
