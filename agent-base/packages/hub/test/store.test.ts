import { describe, expect, it } from "vitest";
import { HubError, HubStore } from "../src/index.js";

const clock = { now: () => 1_000 };
const registration = {
  metadata: {
    adapter: "pi",
    adapterVersion: "0.1.0",
    harnessSessionId: "h1",
    cwd: "/repo",
    processId: 7,
    startedAt: 900,
    state: "idle" as const,
    acceptsTaskDelivery: false,
  },
  snapshot: {
    lastSequence: 1,
    events: [{
      type: "message.user" as const,
      eventId: "u1",
      sequence: 1,
      timestamp: 950,
      text: "fix auth",
    }],
  },
};

describe("HubStore", () => {
  it("registers and deletes a complete session atomically", () => {
    const store = new HubStore({ clock });
    const { sessionId } = store.register(registration);
    expect(store.getSession(sessionId)?.latestSequence).toBe(1);
    expect(store.deleteSession(sessionId)).toBe(true);
    expect(store.getSession(sessionId)).toBeUndefined();
    expect(store.countSearchRows(sessionId)).toBe(0);
  });

  it("accepts an idempotent duplicate batch but rejects a gap", () => {
    const store = new HubStore({ clock });
    const { sessionId } = store.register(registration);
    const batch = {
      expectedSequence: 1,
      events: [{
        type: "session.state" as const,
        eventId: "s2",
        sequence: 2,
        timestamp: 1_000,
        state: "running" as const,
      }],
    };
    expect(store.appendEvents(sessionId, batch).acceptedSequence).toBe(2);
    expect(store.appendEvents(sessionId, batch).acceptedSequence).toBe(2);
    expect(() => store.appendEvents(sessionId, {
      expectedSequence: 4,
      events: [{ ...batch.events[0], eventId: "s5", sequence: 5 }],
    })).toThrowError(HubError);
  });

  it("expires a lease and all transcript rows", () => {
    let now = 1_000;
    const store = new HubStore({ clock: { now: () => now } });
    const { sessionId } = store.register(registration);
    now = 46_001;
    expect(store.expireLeases()).toEqual([sessionId]);
    expect(store.getSession(sessionId)).toBeUndefined();
  });
});
