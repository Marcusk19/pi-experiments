import { readFile } from "node:fs/promises";
import { Check } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  MONITOR_API_VERSION,
  MonitorDiscoveryRecordSchema,
  MonitorSessionDetailSchema,
  MonitorSnapshotSchema,
  NormalizedEventSchema,
} from "../src/index.js";

const fixture = async (name: string) =>
  JSON.parse(
    await readFile(
      new URL(`../../../schemas/monitor/v1/fixtures/${name}`, import.meta.url),
      "utf8",
    ),
  );

const FORBIDDEN_FIELDS = new Set([
  "text", "userText", "assistantText", "thinking", "arguments", "output",
  "prompt", "result", "processId", "harnessSessionId", "token", "capability",
]);

function assertNoForbiddenFields(value: unknown, path = ""): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertNoForbiddenFields(value[i], `${path}[${i}]`);
    }
    return;
  }
  if (typeof value === "object") {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_FIELDS.has(key)) {
        throw new Error(`Forbidden field "${key}" found at ${path}.${key}`);
      }
      assertNoForbiddenFields(val, `${path}.${key}`);
    }
  }
}

describe("monitor contracts", () => {
  it("uses the correct API version", () => {
    expect(MONITOR_API_VERSION).toBe("monitor/v1");
  });

  it("accepts an explicitly monitor-safe activity summary", () => {
    expect(
      Check(NormalizedEventSchema, {
        type: "activity.summary",
        eventId: "summary-1",
        sequence: 1,
        timestamp: 1000,
        summary: "Reviewing PR #42",
        safeForMonitor: true,
      }),
    ).toBe(true);
  });

  it("rejects activity summary without safeForMonitor flag", () => {
    expect(
      Check(NormalizedEventSchema, {
        type: "activity.summary",
        eventId: "summary-1",
        sequence: 1,
        timestamp: 1000,
        summary: "Reviewing PR #42",
      }),
    ).toBe(false);
  });

  it("validates shared monitor fixtures", async () => {
    expect(Check(MonitorSnapshotSchema, await fixture("valid-snapshot.json"))).toBe(true);
    expect(Check(MonitorSessionDetailSchema, await fixture("valid-detail.json"))).toBe(true);
    expect(Check(MonitorDiscoveryRecordSchema, await fixture("valid-discovery.json"))).toBe(true);
  });

  it("valid snapshot and detail fixtures contain no forbidden fields", async () => {
    assertNoForbiddenFields(await fixture("valid-snapshot.json"));
    assertNoForbiddenFields(await fixture("valid-detail.json"));
  });

  it("detects forbidden transcript field in invalid fixture", async () => {
    const invalid = await fixture("invalid-transcript-field.json");
    expect(() => assertNoForbiddenFields(invalid)).toThrow(/userText/);
  });

  it("tolerates unknown fields in snapshot (forward compat)", () => {
    const snapshot = {
      apiVersion: "monitor/v1",
      revision: 0,
      generatedAt: 1000,
      daemonId: "test",
      startedAt: 1000,
      totalSessions: 0,
      truncated: false,
      sessions: [],
      futureField: "allowed",
    };
    expect(Check(MonitorSnapshotSchema, snapshot)).toBe(true);
  });
});
