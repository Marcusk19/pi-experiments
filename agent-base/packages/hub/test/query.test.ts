import type { NormalizedEvent } from "@agent-hub/contracts";
import { describe, expect, it } from "vitest";
import { queryActiveSessions, resolveQueryMode, HubStore } from "../src/index.js";

const BASE_METADATA = {
  adapter: "pi",
  adapterVersion: "0.1.0",
  cwd: "/repo",
  processId: 42,
  startedAt: 1_000,
  state: "idle" as const,
  acceptsTaskDelivery: false,
};

const clock = { now: () => currentNow };
let currentNow = 1_000;

function createStore(): HubStore {
  currentNow = 1_000;
  return new HubStore({ clock });
}

describe("queryActiveSessions", () => {
  it("uses overview for a generic attention query and excludes the caller", () => {
    const store = createStore();
    const { callerId, failedId } = seedSessions(store);
    const result = queryActiveSessions(store, {
      query: "what needs my attention?",
      excludeSessionId: callerId,
      maxCharacters: 4_000,
    }, 120_000);
    expect(result.mode).toBe("overview");
    expect(result.sessions.map((s) => s.sessionId)).not.toContain(callerId);
    expect(result.sessions.find((s) => s.sessionId === failedId)?.signals).toContain("tool_failed:bash");
  });

  it("ranks lexical matches and supplies recent context", () => {
    const store = createStore();
    const { authSessionId } = seedSessions(store);
    const result = queryActiveSessions(store, {
      query: "PROJQUAY-123 authentication",
      mode: "search",
      maxExcerptsPerSession: 5,
    }, 200_000);
    expect(result.sessions[0]?.sessionId).toBe(authSessionId);
    const normalizedTexts = result.sessions[0]?.excerpts.map((excerpt) => excerpt.text.replaceAll("[", "").replaceAll("]", "")) ?? [];
    expect(normalizedTexts.some((text) => text.includes("PROJQUAY-123"))).toBe(true);
    expect(result.sessions[0]?.excerpts.length).toBeGreaterThan(0);
  });

  it("never exceeds the requested or absolute character budget", () => {
    const store = createStore();
    seedSessions(store);
    const result = queryActiveSessions(store, { query: "sessions", maxCharacters: 1_000 }, 200_000);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1_000);
    expect(result.truncated).toBe(true);
  });

  it("keeps default overviews compact and prefers the latest user request", () => {
    const store = createStore();
    const longUserRequest = `Investigate authentication ${"u".repeat(600)}`;
    registerSession(store, "compact", [
      userMessage("compact", 1, longUserRequest, 1_000),
      assistantMessage("compact", 2, `Long response ${"a".repeat(2_000)}`, 2_000, "stop"),
    ]);

    const result = queryActiveSessions(store, { query: "what's going on?" }, 3_000);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(6_000);
    expect(result.sessions[0]?.excerpts).toHaveLength(1);
    expect(result.sessions[0]?.excerpts[0]?.kind).toBe("message.user");
    expect(result.sessions[0]?.excerpts[0]?.text.length).toBeLessThanOrEqual(300);
    expect(result.sessions[0]?.excerpts[0]?.text).toContain("…");
  });

  it("limits targeted search to five sessions by default", () => {
    const store = createStore();
    for (let index = 0; index < 7; index += 1) {
      registerSession(store, `search-limit-${index}`, [
        userMessage(`search-limit-${index}`, 1, `sharedneedle task ${index}`, 1_000 + index),
      ]);
    }

    const result = queryActiveSessions(store, { query: "sharedneedle", mode: "search" }, 2_000);
    expect(result.sessions).toHaveLength(5);
  });

  it("caps targeted search evidence per excerpt", () => {
    const store = createStore();
    registerSession(store, "search-compact", [
      userMessage("search-compact", 1, `${"x".repeat(1_200)} needle`, 1_000),
    ]);

    const result = queryActiveSessions(store, { query: "needle", mode: "search" }, 2_000);
    expect(result.sessions[0]?.excerpts).toHaveLength(1);
    expect(result.sessions[0]?.excerpts[0]?.text.length).toBeLessThanOrEqual(800);
  });

  it("annotates assistant error, running tools, inactivity, and truncation signals", () => {
    const store = createStore();
    const { errorSessionId, runningSessionId, inactiveSessionId, truncatedId } = seedSessions(store);
    const result = queryActiveSessions(store, { query: "status" }, 500_000);
    const errorSignals = result.sessions.find((s) => s.sessionId === errorSessionId)?.signals ?? [];
    expect(errorSignals).toContain("assistant_error");
    const runningSignals = result.sessions.find((s) => s.sessionId === runningSessionId)?.signals ?? [];
    expect(runningSignals.some((signal) => signal.startsWith("tool_running:"))).toBe(true);
    const inactiveSignals = result.sessions.find((s) => s.sessionId === inactiveSessionId)?.signals ?? [];
    expect(inactiveSignals).toContain("inactive");
    const truncatedSignals = result.sessions.find((s) => s.sessionId === truncatedId)?.signals ?? [];
    expect(truncatedSignals).toContain("transcript_truncated");
  });
});

describe("resolveQueryMode", () => {
  it("falls back to overview for natural generic status questions", () => {
    expect(resolveQueryMode("what is going on with sessions?", undefined)).toBe("overview");
    expect(resolveQueryMode("What's going on in my other sessions?")).toBe("overview");
    expect(resolveQueryMode("what are we currently working on?")).toBe("overview");
    expect(resolveQueryMode("What's going on in my other sessions, and does anything need my attention?")).toBe("overview");
  });

  it("returns explicit mode when provided", () => {
    expect(resolveQueryMode("anything", "search")).toBe("search");
  });
});

function seedSessions(store: HubStore) {
  const callerId = registerSession(store, "caller", [userMessage("caller", 1, "triage documentation", 10_000)]);

  const failedId = registerSession(store, "failed", [
    userMessage("failed", 1, "Investigate failing smoke tests", 11_000),
    toolEvent("failed", 2, "bash", "running", 11_100, undefined),
  ]);
  store.appendEvents(failedId, {
    expectedSequence: 2,
    events: [toolEvent("failed", 3, "bash", "failed", 11_200, 11_250)],
  });

  const authSessionId = registerSession(store, "auth", [
    userMessage("auth", 1, "debug PROJQUAY-123 login", 12_000),
  ]);

  const errorSessionId = registerSession(store, "errors", [
    assistantMessage("errors", 1, "I hit an error", 12_500, "error"),
  ]);

  const runningSessionId = registerSession(store, "running", [
    userMessage("running", 1, "Waiting on long tool", 13_000),
    toolEvent("running", 2, "bash", "running", 13_050, undefined),
  ]);

  const inactiveSessionId = registerSession(store, "inactive", [
    userMessage("inactive", 1, "Old task", 100),
  ]);

  const truncatedId = registerSession(store, "truncated", [
    userMessage("truncated", 1, "Large output", 14_000),
  ]);
  store.markTruncated(truncatedId);

  return { callerId, failedId, authSessionId, errorSessionId, runningSessionId, inactiveSessionId, truncatedId };
}

function registerSession(store: HubStore, name: string, events: NormalizedEvent[]) {
  const response = store.register({
    metadata: { ...BASE_METADATA, harnessSessionId: name, cwd: `/repo/${name}` },
    snapshot: { lastSequence: events.length, events },
  });
  return response.sessionId;
}

function userMessage(session: string, sequence: number, text: string, timestamp: number): NormalizedEvent {
  return { type: "message.user", eventId: `${session}-u${sequence}`, sequence, timestamp, text };
}

function assistantMessage(session: string, sequence: number, text: string, timestamp: number, stopStatus: "stop" | "length" | "toolUse" | "error" | "aborted"): NormalizedEvent {
  return {
    type: "message.assistant",
    eventId: `${session}-a${sequence}`,
    sequence,
    timestamp,
    text,
    stopStatus,
    error: stopStatus === "error",
  };
}

function toolEvent(
  session: string,
  sequence: number,
  toolName: string,
  status: "running" | "succeeded" | "failed",
  startedAt: number,
  endedAt: number | undefined,
): NormalizedEvent {
  return {
    type: "tool.activity",
    eventId: `${session}-t${sequence}`,
    sequence,
    timestamp: startedAt,
    toolCallId: `${session}-call-${sequence}`,
    toolName,
    status,
    startedAt,
    endedAt,
  };
}
