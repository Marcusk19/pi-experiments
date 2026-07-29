import { Check } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  LOCAL_COORDINATION_EXTENSION,
  NormalizedEventSchema,
  QueryRequestSchema,
  RegisterSessionRequestSchema,
} from "../src/index.js";

const userEvent = {
  type: "message.user",
  eventId: "entry-a1",
  sequence: 1,
  timestamp: 1_784_748_000_000,
  text: "Investigate PROJQUAY-123",
};

it("uses the Agent Activity Hub coordination identity", () => {
  expect(LOCAL_COORDINATION_EXTENSION).toBe(
    "urn:agent-activity-hub:extension:local-coordination:v1",
  );
  expect(LOCAL_COORDINATION_EXTENSION).not.toContain("agent-session-registry");
});

describe("public schemas", () => {
  it("accepts a registration snapshot", () => {
    expect(Check(RegisterSessionRequestSchema, {
      metadata: {
        adapter: "pi",
        adapterVersion: "0.1.0",
        harnessSessionId: "pi-session-1",
        cwd: "/work/quay",
        processId: 42,
        startedAt: 1_784_748_000_000,
        state: "idle",
        acceptsTaskDelivery: false,
      },
      snapshot: { lastSequence: 1, events: [userEvent] },
    })).toBe(true);
  });

  it("rejects undeclared sensitive fields", () => {
    expect(Check(NormalizedEventSchema, {
      ...userEvent,
      thinking: "secret chain of thought",
    })).toBe(false);
  });

  it("bounds query limits", () => {
    expect(Check(QueryRequestSchema, {
      query: "what needs attention?",
      maxSessions: 51,
    })).toBe(false);
  });
});
