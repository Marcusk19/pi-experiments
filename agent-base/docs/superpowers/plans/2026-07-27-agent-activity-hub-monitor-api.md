# Agent Activity Hub Monitor API Implementation Plan

> **For agentic workers:** This plan is documentation only. Do not automatically invoke implementation subskills. If the user explicitly requests execution, ask them to choose an execution skill first. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a versioned, least-privilege TypeScript monitor API that projects bounded live activity without exposing transcript or task content.

**Architecture:** The renamed hub daemon owns a monitor projection over `HubStore` and `TaskStore`. Store mutation hooks advance a daemon-lifetime revision and wake long-polls; a dedicated monitor capability authenticates three GET-only endpoints and is published in a separate protected discovery record.

**Tech Stack:** TypeScript 5.9, Node.js 22.19, TypeBox 1.1.38, JSON Schema, in-memory SQLite, Vitest, pnpm 10.15.1.

## Global Constraints

- This plan starts after `2026-07-27-agent-activity-hub-rename.md` is complete; paths use `packages/hub/` and `@agent-hub/*`.
- Monitor API version is `monitor/v1`; unknown response fields are allowed, required known fields remain validated.
- Snapshot limit is 500 sessions; activity summary 240 characters; display name 128; adapter label 64; workspace display 160; attention reasons 8 × 120.
- Detail limits are 50 tool records, 50 task records, and 100 timeline entries; cwd is at most 4,096 characters.
- TUI long-poll target is 25,000 ms; server maximum is 30,000 ms.
- Monitor responses exclude verbatim messages, thinking, tool arguments/output, task prompt/result text, provider payloads, capabilities, process IDs, and harness-private IDs.
- Monitor endpoints are loopback-only GET endpoints authenticated by a separate 64-hex-character capability.
- Monitor data, discovery credentials, sessions, and tasks remain ephemeral.

---

### Task 1: Define `activity.summary` and canonical monitor contracts

**Files:**
- Modify: `packages/contracts/src/events.ts`
- Create: `packages/contracts/src/monitor.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `schemas/monitor/v1/snapshot.schema.json`
- Create: `schemas/monitor/v1/detail.schema.json`
- Create: `schemas/monitor/v1/discovery.schema.json`
- Create: `schemas/monitor/v1/fixtures/valid-snapshot.json`
- Create: `schemas/monitor/v1/fixtures/valid-detail.json`
- Create: `schemas/monitor/v1/fixtures/valid-discovery.json`
- Create: `schemas/monitor/v1/fixtures/invalid-transcript-field.json`
- Create: `packages/contracts/test/monitor-contracts.test.ts`

**Interfaces:**
- Consumes: normalized event base and coordination task-state vocabulary.
- Produces: `MONITOR_API_VERSION`, `MonitorSnapshot`, `MonitorSessionDetail`, `MonitorDiscoveryRecord`, their TypeBox schemas, and `ActivitySummaryEvent`.

- [ ] **Step 1: Write failing event and fixture tests**

Create `packages/contracts/test/monitor-contracts.test.ts` with these core assertions:

```ts
import { readFile } from "node:fs/promises";
import { Check } from "typebox/value";
import {
  MonitorDiscoveryRecordSchema, MonitorSessionDetailSchema,
  MonitorSnapshotSchema, NormalizedEventSchema,
} from "../src/index.js";

const fixture = async (name: string) => JSON.parse(await readFile(
  new URL(`../../../schemas/monitor/v1/fixtures/${name}`, import.meta.url), "utf8",
));

it("accepts an explicitly monitor-safe activity summary", () => {
  expect(Check(NormalizedEventSchema, {
    type: "activity.summary", eventId: "summary-1", sequence: 1,
    timestamp: 1000, summary: "Reviewing PR #42", safeForMonitor: true,
  })).toBe(true);
  expect(Check(NormalizedEventSchema, {
    type: "activity.summary", eventId: "summary-1", sequence: 1,
    timestamp: 1000, summary: "Reviewing PR #42",
  })).toBe(false);
});

it("validates shared monitor fixtures", async () => {
  expect(Check(MonitorSnapshotSchema, await fixture("valid-snapshot.json"))).toBe(true);
  expect(Check(MonitorSessionDetailSchema, await fixture("valid-detail.json"))).toBe(true);
  expect(Check(MonitorDiscoveryRecordSchema, await fixture("valid-discovery.json"))).toBe(true);
});
```

- [ ] **Step 2: Run the tests and verify missing contracts**

Run: `pnpm vitest run packages/contracts/test/monitor-contracts.test.ts`
Expected: FAIL because monitor exports and fixtures do not exist.

- [ ] **Step 3: Add the normalized event member**

Add to `events.ts` and the `NormalizedEventSchema` union:

```ts
const ActivitySummaryEventSchema = Type.Object({
  ...eventBase,
  type: Type.Literal("activity.summary"),
  summary: Type.String({ minLength: 1, maxLength: 240 }),
  safeForMonitor: Type.Literal(true),
}, strict);
export type ActivitySummaryEvent = Static<typeof ActivitySummaryEventSchema>;
```

Do not return `summary` from `extractSearchableText()` in `packages/hub/src/store.ts`; its branch must return `undefined` for this event.

- [ ] **Step 4: Define TypeBox monitor schemas**

Create `packages/contracts/src/monitor.ts` with exported schemas/types using these exact shapes:

```ts
export const MONITOR_API_VERSION = "monitor/v1" as const;
export const MonitorStateSchema = Type.Union([
  Type.Literal("running"), Type.Literal("waiting"), Type.Literal("idle"),
]);
export const MonitorCompletenessSchema = Type.Union([
  Type.Literal("complete"), Type.Literal("unavailable"), Type.Literal("truncated"),
]);
export const MonitorSessionSummarySchema = Type.Object({
  monitorId: Type.String({ pattern: "^[0-9a-f]{32}$" }),
  displayName: Type.String({ minLength: 1, maxLength: 128 }),
  adapter: Type.String({ minLength: 1, maxLength: 64 }),
  workspace: Type.String({ minLength: 1, maxLength: 160 }),
  state: MonitorStateSchema,
  activitySummary: Type.String({ minLength: 1, maxLength: 240 }),
  activitySince: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  attentionReasons: Type.Array(Type.String({ minLength: 1, maxLength: 120 }), { maxItems: 8 }),
  activeToolCount: Type.Integer({ minimum: 0 }),
  activeTaskState: Type.Optional(Type.Union([Type.Literal("submitted"), Type.Literal("working")])),
  completeness: Type.Object({
    activity: MonitorCompletenessSchema, attention: MonitorCompletenessSchema,
    tools: MonitorCompletenessSchema, tasks: MonitorCompletenessSchema,
  }),
});
```

Define `MonitorSnapshotSchema`, `MonitorToolDetailSchema`, `MonitorTaskDetailSchema`, `MonitorTimelineEntrySchema`, `MonitorSessionDetailSchema`, and `MonitorDiscoveryRecordSchema` with the approved fields/bounds. Omit `{ additionalProperties: false }` so v1 tolerates unknown fields. Export `Static<>` types and re-export `./monitor.js` from `index.ts`.

- [ ] **Step 5: Add canonical JSON Schemas and concrete fixtures**

Make JSON schemas mirror TypeBox names, required fields, enums, limits, and `additionalProperties: true`. Valid fixtures must include one running session, one running tool, one working target task, and an `activity.summary` timeline item. The invalid fixture must add `userText: "secret"` to a session and be rejected by the privacy scan added in Task 8, not by forward-compatible schema validation.

- [ ] **Step 6: Run contract tests**

Run: `pnpm vitest run packages/contracts/test/monitor-contracts.test.ts packages/contracts/test/contracts.test.ts`
Expected: PASS.

### Task 2: Add monitor-safe store queries and opaque IDs

**Files:**
- Modify: `packages/hub/src/store.ts`
- Modify: `packages/hub/src/coordination/task-store.ts`
- Create: `packages/hub/src/monitor-identity.ts`
- Create: `packages/hub/test/monitor-store.test.ts`

**Interfaces:**
- Produces: `latestActivitySummary(sessionId)`, `monitorToolStates(sessionId, limit)`, `listTasksForSession(sessionId, limit)`, and `MonitorIdentity`.

- [ ] **Step 1: Write failing safe-query tests**

Test that a session containing user text `DO-NOT-EXPOSE`, an assistant reply, summary event, and tool events returns only the summary and tool metadata. Test source and target task roles. Test deterministic opaque IDs:

```ts
const identity = new MonitorIdentity(Buffer.alloc(32, 7));
expect(identity.forSession(sessionId)).toMatch(/^[0-9a-f]{32}$/);
expect(identity.forSession(sessionId)).not.toContain(sessionId);
expect(identity.resolve(identity.forSession(sessionId), [sessionId])).toBe(sessionId);
```

- [ ] **Step 2: Verify methods are missing**

Run: `pnpm vitest run packages/hub/test/monitor-store.test.ts`
Expected: FAIL on missing methods/classes.

- [ ] **Step 3: Implement monitor identity**

Create `monitor-identity.ts`:

```ts
import { createHmac } from "node:crypto";
export class MonitorIdentity {
  constructor(private readonly key: Buffer) {}
  forSession(sessionId: string): string {
    return createHmac("sha256", this.key).update(sessionId).digest("hex").slice(0, 32);
  }
  resolve(monitorId: string, sessionIds: string[]): string | undefined {
    return sessionIds.find((id) => this.forSession(id) === monitorId);
  }
}
```

- [ ] **Step 4: Implement bounded safe queries**

Add to `HubStore`:

```ts
latestActivitySummary(sessionId: string): ActivitySummaryEvent | undefined;
monitorToolStates(sessionId: string, limit: number): Array<{
  toolCallId: string; toolName: string; status: "running"|"succeeded"|"failed";
  startedAt: number; endedAt?: number;
}>;
```

Both query `events` by kind and parse only matching payload types. Add to `TaskStore`:

```ts
listTasksForSession(sessionId: string, limit: number): Array<{
  id: string; role: "source"|"target"; state: CoordinationTaskState;
  createdAt: number; updatedAt: number;
}>;
```

Use one SQL query with `source_session_id = ? OR target_session_id = ?`, order by `updated_at DESC, id DESC`, and never join `a2a_messages`.

- [ ] **Step 5: Run safe-query tests**

Run: `pnpm vitest run packages/hub/test/monitor-store.test.ts packages/hub/test/store.test.ts packages/hub/test/task-store.test.ts`
Expected: PASS.

### Task 3: Build snapshot and detail projections

**Files:**
- Create: `packages/hub/src/monitor-projection.ts`
- Create: `packages/hub/test/monitor-projection.test.ts`
- Modify: `packages/hub/src/index.ts`

**Interfaces:**
- Consumes: `HubStore`, `TaskStore`, `MonitorIdentity`, `Clock`.
- Produces: `MonitorProjection.snapshot()` and `.detail()`.

- [ ] **Step 1: Write projection tests before implementation**

Cover 501 sessions/truncation; default ordering; summary preference/fallback; no message text; waiting from active target task; failed/running tool attention; 50-tool/50-task/100-timeline limits; missing monitor ID. Assert serialized results do not contain seeded secrets or `processId`/`harnessSessionId`.

- [ ] **Step 2: Verify the projection module is absent**

Run: `pnpm vitest run packages/hub/test/monitor-projection.test.ts`
Expected: FAIL resolving `monitor-projection.js`.

- [ ] **Step 3: Implement the projection interface**

```ts
export class MonitorProjection {
  constructor(private readonly options: {
    hub: HubStore; tasks: TaskStore; clock: Clock; identity: MonitorIdentity;
    daemonId: string; startedAt: number; revision: () => number;
  }) {}
  snapshot(): MonitorSnapshot;
  detail(monitorId: string): MonitorSessionDetail | undefined;
}
```

Use constants `MAX_MONITOR_SESSIONS=500`, `MAX_MONITOR_TOOLS=50`, `MAX_MONITOR_TASKS=50`, `MAX_MONITOR_TIMELINE=100`. Build fallback activity only from session state, safe summary, tool names/statuses, and task states. Derive workspace with `basename(cwd)` and bounded string helpers. Never call `queryActiveSessions`, `searchEvents`, or inspect message payload text.

- [ ] **Step 4: Implement deterministic ordering and completeness**

Order attention first, then running, waiting, idle; tie-break by `lastActivityAt` descending then monitor ID. Set completeness to `truncated` when source bounds are exceeded, `unavailable` when adapters did not provide a safe semantic summary, otherwise `complete`.

- [ ] **Step 5: Run projection tests**

Run: `pnpm vitest run packages/hub/test/monitor-projection.test.ts`
Expected: PASS.

### Task 4: Add revision tracking and mutation notifications

**Files:**
- Create: `packages/hub/src/monitor-revision.ts`
- Create: `packages/hub/test/monitor-revision.test.ts`
- Modify: `packages/hub/src/store.ts`
- Modify: `packages/hub/src/coordination/task-store.ts`
- Modify: `packages/hub/src/daemon.ts`

**Interfaces:**
- Produces: `MonitorRevision.current()`, `.changed()`, `.waitForChange()`, `.close()` and optional `onProjectionChanged` store hooks.

- [ ] **Step 1: Write failing revision tests**

Test immediate return on changed revision, timeout, abort, close, and increments after register/append/state-changing heartbeat/delete/expiry/task mutation. Test a lease-only heartbeat does not increment.

- [ ] **Step 2: Verify revision behavior is absent**

Run: `pnpm vitest run packages/hub/test/monitor-revision.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement revision wrapper**

```ts
export class MonitorRevision {
  private revision = 0;
  private readonly notifier = new ChangeNotifier();
  current(): number { return this.revision; }
  changed(): number { this.revision += 1; this.notifier.notify("monitor"); return this.revision; }
  async waitForChange(observed: number, timeoutMs: number, signal?: AbortSignal): Promise<number> {
    await this.notifier.wait("monitor", observed, Math.min(Math.max(timeoutMs, 0), 30_000), signal);
    return this.revision;
  }
  close(): void { this.notifier.close(); }
}
```

- [ ] **Step 4: Notify only after committed projection changes**

Add `onProjectionChanged?: () => void` constructor options to both stores. Call after successful session registration, event append, snapshot replace, meaningful heartbeat, deletion/expiry, and task-state mutation. Do not call inside SQLite transactions or for idempotent no-ops.

- [ ] **Step 5: Run revision and regression tests**

Run: `pnpm vitest run packages/hub/test/monitor-revision.test.ts packages/hub/test/store.test.ts packages/hub/test/task-store.test.ts`
Expected: PASS.

### Task 5: Add monitor authentication and GET-only HTTP routes

**Files:**
- Create: `packages/hub/src/monitor-http.ts`
- Create: `packages/hub/test/monitor-http.test.ts`
- Modify: `packages/hub/src/http.ts`

**Interfaces:**
- Consumes: monitor capability, projection, revision, and request abort signal.
- Produces: `/monitor/v1/snapshot` and `/monitor/v1/sessions/:monitorId`.

- [ ] **Step 1: Write failing route/security tests**

Test unauthenticated/root/session capabilities get 401 on monitor routes; monitor capability gets snapshot/detail; monitor capability gets 401 on `/v2/query`, POST/DELETE/task endpoints; `wait=30001` clamps to 30,000; invalid `after`/`wait` gets 400; missing detail gets 404; aborted long-poll releases waiter.

- [ ] **Step 2: Verify routes return 404**

Run: `pnpm vitest run packages/hub/test/monitor-http.test.ts`
Expected: FAIL with monitor route 404 responses.

- [ ] **Step 3: Implement constant-time monitor authentication**

Create `monitor-http.ts` exporting:

```ts
export async function handleMonitorRequest(req: IncomingMessage, res: ServerResponse, context: {
  capabilityDigest: Buffer; projection: MonitorProjection;
  revision: MonitorRevision; signal?: AbortSignal;
}): Promise<boolean>;
```

Hash the bearer candidate with SHA-256 and compare equal-length buffers using `timingSafeEqual`. Authenticate every `/monitor/` route before parsing IDs/query. Reject non-GET monitor requests with 405.

- [ ] **Step 4: Implement snapshot long-poll and detail routes**

For snapshot, parse safe integers, clamp wait to 30,000, wait only when `after === revision.current()`, then project a fresh response. For detail, decode one path segment and return `NOT_FOUND` without revealing session IDs. Use existing `sendJson` and `HttpError`.

- [ ] **Step 5: Wire monitor routing before root routes**

Extend `createHubServer` options with `monitor?: { token: string; projection: MonitorProjection; revision: MonitorRevision }`; invoke monitor handling before `/v2/` root authentication. Existing A2A routes remain unchanged.

- [ ] **Step 6: Run HTTP tests**

Run: `pnpm vitest run packages/hub/test/monitor-http.test.ts packages/hub/test/http.test.ts packages/hub/test/a2a-e2e.test.ts`
Expected: PASS.

### Task 6: Publish separate protected monitor discovery

**Files:**
- Modify: `packages/client/src/paths.ts`
- Create: `packages/hub/src/monitor-discovery.ts`
- Create: `packages/hub/test/monitor-discovery.test.ts`
- Modify: `packages/hub/src/daemon.ts`
- Modify: `packages/hub/test/ownership.test.ts`

**Interfaces:**
- Produces: `monitor.json` containing `{ endpoint, apiVersion, daemonId, startedAt, capability }` with mode 0600.

- [ ] **Step 1: Write failing discovery lifecycle tests**

Test atomic write, 0700 directory, 0600 file, ownership-safe removal, no root token/PID/protocol fields, cleanup on shutdown, and rotation after restart.

- [ ] **Step 2: Verify monitor discovery is absent**

Run: `pnpm vitest run packages/hub/test/monitor-discovery.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add path and discovery functions**

Add `monitorDiscoveryFile: join(directory, "monitor.json")` to `RuntimePaths`. Implement `writeMonitorDiscoveryFile`, `ownsMonitorDiscoveryFile`, and `removeMonitorDiscoveryFile` by following existing atomic maintenance discovery behavior but using `MonitorDiscoveryRecord`.

- [ ] **Step 4: Construct monitor runtime in the daemon**

Generate `monitorToken=randomBytes(32).toString("hex")`, `monitorIdentityKey=randomBytes(32)`, and `daemonId=randomUUID()`. Construct revision, store hooks, identity, projection, and server monitor options. Publish:

```ts
{
  endpoint: runtime.server.url,
  apiVersion: MONITOR_API_VERSION,
  daemonId,
  startedAt,
  capability: monitorToken,
}
```

Remove `monitor.json` during orderly shutdown and discovery-ownership loss. Never place the root token in it.

- [ ] **Step 5: Run discovery and daemon tests**

Run: `pnpm vitest run packages/hub/test/monitor-discovery.test.ts packages/hub/test/ownership.test.ts packages/client/test/e2e.test.ts`
Expected: PASS.

### Task 7: Add real adapter support for safe activity summaries

**Files:**
- Modify: `packages/pi-extension/src/normalize.ts`
- Modify: `packages/pi-extension/test/normalize.test.ts`
- Modify: `packages/client/src/reporter.ts`
- Modify: `packages/client/test/reporter.test.ts`

**Interfaces:**
- Consumes: adapter lifecycle data that is already a display-safe session name/status.
- Produces: optional explicit `activity.summary` normalized events; never copies raw prompt/response text.

- [ ] **Step 1: Write privacy-first normalization tests**

Test a safe adapter status creates `{ type:"activity.summary", safeForMonitor:true }`; test user and assistant message text never becomes a summary; test 241 characters are rejected/truncated before enqueue according to the normalizer contract.

- [ ] **Step 2: Verify summary normalization is absent**

Run: `pnpm vitest run packages/pi-extension/test/normalize.test.ts packages/client/test/reporter.test.ts`
Expected: FAIL on missing summary support.

- [ ] **Step 3: Add an explicit summary normalizer**

Export:

```ts
export function normalizeActivitySummary(input: {
  eventId: string; sequence: number; timestamp: number; summary: string;
}): ActivitySummaryEvent {
  const summary = input.summary.trim().slice(0, 240);
  if (!summary) throw new Error("Activity summary must not be empty");
  return { ...input, summary, type: "activity.summary", safeForMonitor: true };
}
```

Only call it from adapter fields explicitly designated display-safe (session title/status), never from message hooks. Reporter batching already carries `NormalizedEvent` and needs only union/type regression coverage.

- [ ] **Step 4: Run adapter tests**

Run: `pnpm vitest run packages/pi-extension/test/normalize.test.ts packages/client/test/reporter.test.ts`
Expected: PASS.

### Task 8: Prove privacy, compatibility, and end-to-end behavior

**Files:**
- Create: `packages/hub/test/monitor-e2e.test.ts`
- Modify: `packages/contracts/test/monitor-contracts.test.ts`
- Modify: `docs/resources/architecture.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: complete monitor API.
- Produces: shared-contract/privacy gate for the Go plan.

- [ ] **Step 1: Add recursive forbidden-field fixture checks**

Add a helper that walks every key in valid snapshot/detail fixtures and fails on:

```ts
const forbidden = new Set([
  "text", "userText", "assistantText", "thinking", "arguments", "output",
  "prompt", "result", "processId", "harnessSessionId", "token", "capability",
]);
```

Explicitly assert `invalid-transcript-field.json` triggers this privacy checker.

- [ ] **Step 2: Add process-level monitor E2E coverage**

Start the real hub daemon with a temporary runtime, register two adapters, append safe summaries/tools and secret messages, authenticate through `monitor.json`, long-poll, mutate one session, verify wakeup/revision, fetch detail, expire/delete a session, and assert serialized responses contain none of the seeded secrets or forbidden fields.

- [ ] **Step 3: Run focused contract and E2E tests**

Run: `pnpm vitest run packages/contracts/test/monitor-contracts.test.ts packages/hub/test/monitor-e2e.test.ts`
Expected: PASS.

- [ ] **Step 4: Document the monitor seam**

Update architecture and README with endpoint roles, separate capability, response exclusions, long-poll revision lifecycle, adapter-safe summary rule, and the fact that no monitor client starts the daemon.

- [ ] **Step 5: Run complete project verification**

Run: `pnpm run check:release && git diff --check && git diff --exit-code -- release`
Expected: all TypeScript tests, release build, and tracked artifact smoke tests pass with no generated diff.
