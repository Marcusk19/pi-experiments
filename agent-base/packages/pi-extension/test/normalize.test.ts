import type { AgentMessage, AssistantMessage, ToolResultMessage, UserMessage } from "@earendil-works/pi-ai";
import type { SessionEntry, SessionMessageEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { buildCurrentBranchSnapshot, normalizeActivitySummary, normalizeMessage } from "../src/normalize.js";

function createAssistantMessage(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
    timestamp: 1_000,
    ...overrides,
  };
}

function createUserMessage(content: string | UserMessage["content"], timestamp = 1_000): UserMessage {
  return { role: "user", content, timestamp };
}

describe("normalizeMessage", () => {
  it("keeps visible assistant text but excludes thinking and tool arguments", () => {
    const message = createAssistantMessage({
      content: [
        { type: "thinking", thinking: "private reasoning" },
        { type: "text", text: "I found the failure." },
        { type: "toolCall", id: "call-1", name: "bash", arguments: { command: "cat ~/.token" } },
      ],
      stopReason: "toolUse",
      timestamp: 1_000,
    });

    const events = normalizeMessage(message, { eventId: "entry-1", sequence: 1 });

    expect(events).toEqual([
      {
        type: "message.assistant",
        eventId: "entry-1",
        sequence: 1,
        timestamp: 1_000,
        text: "I found the failure.",
        stopStatus: "toolUse",
      },
    ]);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("private reasoning");
    expect(serialized).not.toContain("cat ~/.token");
  });

  it("drops user images", () => {
    const message = createUserMessage([{ type: "image", data: "abc", mimeType: "image/png" }]);
    expect(normalizeMessage(message, { eventId: "entry-2", sequence: 1 })).toEqual([]);
  });

  it("ignores tool result messages", () => {
    const message: ToolResultMessage = {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "bash",
      content: [{ type: "text", text: "stdout" }],
      isError: false,
      timestamp: 2_000,
    };
    expect(normalizeMessage(message as AgentMessage, { eventId: "entry-3", sequence: 1 })).toEqual([]);
  });
});

describe("buildCurrentBranchSnapshot", () => {
  const user = createUserMessage("Investigate PROJQUAY-123", 100);
  const assistant = createAssistantMessage({
    content: [{ type: "text", text: "Working on it." }],
    timestamp: 200,
  });

  const makeMessageEntry = (id: string, message: AgentMessage, parentId: string | null): SessionMessageEntry => ({
    type: "message",
    id,
    parentId,
    timestamp: new Date().toISOString(),
    message,
  });

  it("creates contiguous sequences and excludes custom entries", () => {
    const entries: SessionEntry[] = [
      makeMessageEntry("entry-1", user, null),
      { type: "custom", id: "custom-1", parentId: "entry-1", timestamp: new Date().toISOString(), customType: "pi", data: { secret: true } },
      makeMessageEntry("entry-2", assistant, "entry-1"),
    ];

    const snapshot = buildCurrentBranchSnapshot({ getBranch: () => entries } as any);
    expect(snapshot.events).toHaveLength(2);
    expect(snapshot.lastSequence).toBe(2);
    expect(snapshot.events[0]).toMatchObject({ eventId: "entry-1", sequence: 1, type: "message.user" });
    expect(snapshot.events[1]).toMatchObject({ eventId: "entry-2", sequence: 2, type: "message.assistant" });
  });

  it("omits entries that no longer exist after compaction", () => {
    const entries: SessionEntry[] = [
      {
        type: "compaction",
        id: "comp-1",
        parentId: null,
        timestamp: new Date().toISOString(),
        summary: "older events",
        firstKeptEntryId: "entry-3",
        tokensBefore: 0,
      },
      makeMessageEntry("entry-3", createUserMessage("Continue", 1_000), "comp-1"),
    ];

    const snapshot = buildCurrentBranchSnapshot({ getBranch: () => entries } as any);
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]?.eventId).toBe("entry-3");
  });
});

describe("normalizeActivitySummary", () => {
  it("creates a safe monitor summary event", () => {
    const event = normalizeActivitySummary({
      eventId: "s-1", sequence: 1, timestamp: 1000, summary: "Reviewing PR #42",
    });
    expect(event.type).toBe("activity.summary");
    expect(event.summary).toBe("Reviewing PR #42");
    expect(event.safeForMonitor).toBe(true);
  });

  it("truncates summary to 240 characters", () => {
    const long = "A".repeat(300);
    const event = normalizeActivitySummary({
      eventId: "s-1", sequence: 1, timestamp: 1000, summary: long,
    });
    expect(event.summary.length).toBe(240);
  });

  it("rejects empty summary", () => {
    expect(() => normalizeActivitySummary({
      eventId: "s-1", sequence: 1, timestamp: 1000, summary: "  ",
    })).toThrow(/empty/);
  });
});
