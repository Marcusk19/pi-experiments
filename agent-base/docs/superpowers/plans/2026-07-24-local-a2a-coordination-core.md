# Local A2A Coordination Core Implementation Plan

> **For agentic workers:** This plan is documentation only. Do not automatically invoke implementation subskills. If the user explicitly requests execution, ask them to choose an execution skill first. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the active-session registry daemon into a local A2A 1.0 coordination service that routes ephemeral tasks to explicitly selected active sessions or pluggable managed workers without changing current Pi capture behavior.

**Architecture:** Keep one loopback daemon but split its internals into an unchanged observability plane and a new collaboration plane. A focused `CoordinationService` owns A2A task state, a `DeliveryRouter` owns FIFO at-most-once claims, worker providers own harness-specific launch, and thin HTTP adapters expose the standard A2A REST binding plus a private v2 adapter API.

**Tech Stack:** Node.js 22.19+, TypeScript 5.9, npm workspaces, TypeBox 1.1, `node:http`, `node:sqlite`, `@a2a-js/sdk` 1.0.0, Vitest 3.

## Global Constraints

- Target A2A protocol version 1.0 and declare only the `HTTP+JSON` REST binding.
- Bind only to `127.0.0.1` on a dynamic port; remote/LAN transport and TLS are out of scope.
- Keep all task, message, delivery, launch, capability, and result data in memory only.
- Keep registry transcript/event tables separate from A2A task/message tables; never insert A2A content directly into FTS.
- Support TextPart and DataPart only: 64 KiB per part and 1 MiB cumulative content per task.
- Reject FilePart, raw bytes, URLs, images, audio, video, streaming, subscriptions, push notifications, and extended Agent Cards.
- Allow at most 50 active tasks per source session and 500 active tasks globally.
- Allow one claimed inbound task per target session and preserve FIFO ordering behind it.
- Default task deadline is 30 minutes; maximum caller-selected deadline is 2 hours.
- Queue an existing-session task until its target is idle; never interrupt a running turn.
- Treat claim as the at-most-once boundary; target loss after claim fails with `DELIVERY_LOST` and never auto-replays.
- Cancellation after claim is cooperative; first terminal state wins and late updates cannot overwrite it.
- Daemon restart loses active tasks; old instance-prefixed task IDs return `TaskNotFoundError` with `coordinator_restarted` metadata.
- The public Agent Card must contain no active-session names, cwd values, process IDs, harness IDs, or task content.
- Logs must not contain message/result text, DataPart values, bearer tokens, launch tokens, worker options, or private session metadata.
- No SQLite transaction may include long-poll waiting, network I/O, process spawning, or worker-provider calls.
- Protocol v2 is a coordinated cutover: private routes use `/v2`, discovery reports protocol version 2, and no mixed v1/v2 private API is served.
- Existing Pi capture and query behavior remains operational and advertises `acceptsTaskDelivery: false`.
- Use TDD for every task: write a focused failing test, run it red, implement the smallest behavior, then run the task suite green.

---

## File Structure

```text
packages/contracts
├── src/events.ts                  # add delivery-capability session metadata
├── src/api.ts                     # protocol-v2 registration and health schemas
├── src/coordination.ts            # private adapter request/response schemas
├── src/index.ts                   # protocol constant and exports
└── test/contracts.test.ts         # v2 and private-contract validation

packages/registry
├── src/schema.ts                  # shared in-memory registry + coordination DDL
├── src/store.ts                   # registry lifecycle and scoped task-capability auth
├── src/http.ts                    # HTTP server shell and route delegation
├── src/http-utils.ts              # bounded body, auth, JSON, and error helpers
├── src/registry-http.ts           # existing private registry routes moved to /v2
├── src/daemon.ts                  # daemon composition, sweeps, and empty shutdown
├── src/coordination
│   ├── types.ts                   # internal task/message/delivery target model
│   ├── errors.ts                  # stable coordination errors
│   ├── content.ts                 # TextPart/DataPart limits and routing validation
│   ├── notifier.ts                # abortable keyed change notification
│   ├── task-store.ts              # synchronous transactional SQLite persistence
│   ├── task-service.ts            # task lifecycle facade
│   ├── delivery-router.ts         # FIFO claims and target-side mutations
│   ├── worker-providers.ts        # provider registry and launch lifecycle
│   ├── agent-card.ts              # stable coordinator Agent Card
│   ├── a2a-mapper.ts              # SDK wire objects ↔ internal model
│   ├── a2a-http.ts                # standard A2A REST routes
│   └── adapter-http.ts            # private long-poll/delivery routes
└── test
    ├── task-store.test.ts
    ├── task-service.test.ts
    ├── delivery-router.test.ts
    ├── worker-providers.test.ts
    ├── a2a-mapper.test.ts
    ├── a2a-http.test.ts
    ├── adapter-http.test.ts
    └── a2a-e2e.test.ts

packages/client
├── src/transport.ts               # private registry v2 transport
├── src/coordination-transport.ts  # reusable target-adapter API client
├── src/reporter.ts                # retain current task capability in memory
├── src/discovery.ts               # protocol-v2 discovery validation
├── src/index.ts                   # public client exports
└── test
    ├── transport.test.ts
    ├── coordination-transport.test.ts
    ├── reporter.test.ts
    └── e2e.test.ts

packages/pi-extension
├── src/adapter.ts                 # explicitly advertise no inbound delivery
└── test/adapter.test.ts           # preserve existing Pi behavior

README.md                           # local A2A behavior, privacy, and deferred adapters
package.json                        # exact SDK development dependency for protocol tests
package-lock.json                   # reproducible SDK dependency graph
```

The new collaboration files remain inside `@agent-session/registry`: they share its process and database but expose only the `CoordinationService` facade to HTTP and daemon code. The existing 595-line `RegistryStore` is not expanded with task methods.

---

### Task 1: Coordinated Private Protocol v2 Migration

**Files:**
- Modify: `packages/contracts/src/events.ts`
- Modify: `packages/contracts/src/api.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/test/contracts.test.ts`
- Modify: `packages/registry/src/schema.ts`
- Modify: `packages/registry/src/store.ts`
- Modify: `packages/registry/src/http.ts`
- Modify: `packages/registry/src/daemon.ts`
- Modify: `packages/registry/src/discovery.ts`
- Modify: `packages/registry/test/store.test.ts`
- Modify: `packages/registry/test/http.test.ts`
- Modify: `packages/client/src/transport.ts`
- Modify: `packages/client/src/discovery.ts`
- Modify: `packages/client/src/reporter.ts`
- Modify: `packages/client/test/transport.test.ts`
- Modify: `packages/client/test/discovery.test.ts`
- Modify: `packages/client/test/reporter.test.ts`
- Modify: `packages/client/test/e2e.test.ts`
- Modify: `packages/pi-extension/src/adapter.ts`
- Modify: `packages/pi-extension/test/adapter.test.ts`
- Modify: all existing test fixtures constructing `SessionMetadata`

**Interfaces:**
- Consumes: current `RegistryStore`, `RegistryTransport`, `SessionReporter`, discovery record, and strict TypeBox contracts.
- Produces: `PROTOCOL_VERSION = 2`, required `SessionMetadata.acceptsTaskDelivery`, `RegisterSessionResponse.taskCapability`, `RegistryStore.authenticateTaskCapability(token)`, and v2 private HTTP routes. Later tasks rely on these names exactly.

- [ ] **Step 0: Establish a green baseline before the breaking protocol cutover**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: the current registry suite passes, TypeScript exits 0, and the build succeeds. If this baseline is red, stop and diagnose it before attributing failures to protocol v2.

- [ ] **Step 0b: Complete the outstanding real-Pi payload acceptance**

Start a fresh Pi process and ask:

```text
What's going on in my other sessions, and does anything need my attention?
```

Expected: the actual `query_active_sessions` tool result contains compact fields only and exposes no internal registry/harness/event IDs, adapter metadata, process IDs, or start time. If it still returns the old full shape, diagnose that existing Pi adapter boundary before changing protocol code.

- [ ] **Step 1: Write failing protocol-v2 contract tests**

Replace the registration assertions in `packages/contracts/test/contracts.test.ts` with fixtures that require delivery capability and reject missing capability fields:

```ts
import { Check } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  HealthResponseSchema,
  RegisterSessionRequestSchema,
  RegisterSessionResponseSchema,
  SessionMetadataSchema,
} from "../src/index.js";

const metadata = {
  adapter: "pi",
  adapterVersion: "0.1.0",
  harnessSessionId: "pi-session-1",
  cwd: "/work/quay",
  processId: 42,
  startedAt: 1_784_748_000_000,
  state: "idle",
  acceptsTaskDelivery: false,
} as const;

describe("protocol v2 contracts", () => {
  it("requires explicit delivery capability metadata", () => {
    expect(Check(SessionMetadataSchema, metadata)).toBe(true);
    const { acceptsTaskDelivery: _removed, ...oldMetadata } = metadata;
    expect(Check(SessionMetadataSchema, oldMetadata)).toBe(false);
  });

  it("requires a 256-bit task capability in registration responses", () => {
    expect(Check(RegisterSessionResponseSchema, {
      sessionId: "018f0c9e-18d8-7a30-8d5d-0d66d65f13b5",
      leaseExpiresAt: 1_784_748_045_000,
      taskCapability: "ab".repeat(32),
    })).toBe(true);
    expect(Check(RegisterSessionResponseSchema, {
      sessionId: "018f0c9e-18d8-7a30-8d5d-0d66d65f13b5",
      leaseExpiresAt: 1_784_748_045_000,
    })).toBe(false);
  });

  it("accepts only protocol version 2 health", () => {
    expect(Check(HealthResponseSchema, { protocolVersion: 2, pid: 42, startedAt: 1 })).toBe(true);
    expect(Check(HealthResponseSchema, { protocolVersion: 1, pid: 42, startedAt: 1 })).toBe(false);
  });

  it("keeps launch correlation outside session metadata", () => {
    expect(Check(RegisterSessionRequestSchema, {
      metadata,
      snapshot: { lastSequence: 0, events: [] },
    })).toBe(true);
    expect(Check(SessionMetadataSchema, { ...metadata, launchToken: "secret" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the contract test and verify it is red**

Run:

```bash
npx vitest run packages/contracts/test/contracts.test.ts
```

Expected: FAIL because `acceptsTaskDelivery` is not required, the registration response has no `taskCapability`, and health still accepts protocol version 1.

- [ ] **Step 3: Implement the exact v2 contract changes**

In `packages/contracts/src/events.ts`, add the required field to `SessionMetadataSchema`:

```ts
acceptsTaskDelivery: Type.Boolean(),
```

In `packages/contracts/src/api.ts`, define the capability and update response/health schemas:

```ts
export const TaskCapabilitySchema = Type.String({ pattern: "^[0-9a-f]{64}$" });

export const RegisterSessionRequestSchema = Type.Object({
  metadata: SessionMetadataSchema,
  snapshot: SnapshotSchema,
}, strict);

export const RegisterSessionResponseSchema = Type.Object({
  sessionId: UuidSchema,
  leaseExpiresAt: Type.Integer(),
  taskCapability: TaskCapabilitySchema,
}, strict);

export const HealthResponseSchema = Type.Object({
  protocolVersion: Type.Literal(2),
  pid: Type.Integer(),
  startedAt: Type.Integer(),
}, strict);
```

In `packages/contracts/src/index.ts`, make the version exact:

```ts
export const PROTOCOL_VERSION = 2 as const;
export * from "./events.js";
export * from "./api.js";
```

- [ ] **Step 4: Run the contract test green**

Run:

```bash
npx vitest run packages/contracts/test/contracts.test.ts
```

Expected: all protocol-v2 contract tests PASS.

- [ ] **Step 5: Write failing store tests for scoped capability authentication**

Add to `packages/registry/test/store.test.ts`:

```ts
it("issues a unique scoped task capability and authenticates it", () => {
  const store = new RegistryStore({ clock });
  const first = store.register(registration);
  const second = store.register({
    ...registration,
    metadata: { ...registration.metadata, harnessSessionId: "h2" },
  });

  expect(first.taskCapability).toMatch(/^[0-9a-f]{64}$/);
  expect(second.taskCapability).not.toBe(first.taskCapability);
  expect(store.authenticateTaskCapability(first.taskCapability)?.id).toBe(first.sessionId);
  expect(store.authenticateTaskCapability("ff".repeat(32))).toBeUndefined();

  store.deleteSession(first.sessionId);
  expect(store.authenticateTaskCapability(first.taskCapability)).toBeUndefined();
});
```

Update the test's base metadata once:

```ts
acceptsTaskDelivery: false,
```

- [ ] **Step 6: Run the store test red**

Run:

```bash
npx vitest run packages/registry/test/store.test.ts
```

Expected: FAIL because registration does not issue a capability and `authenticateTaskCapability` does not exist.

- [ ] **Step 7: Store only capability verifiers and authenticate with timing-safe comparison**

Add this column to the `sessions` DDL in `packages/registry/src/schema.ts`:

```sql
task_capability_hash BLOB NOT NULL UNIQUE,
```

In `packages/registry/src/store.ts`, import the crypto helpers and define these focused helpers:

```ts
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

function capabilityDigest(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

function createTaskCapability(): { token: string; digest: Buffer } {
  const token = randomBytes(32).toString("hex");
  return { token, digest: capabilityDigest(token) };
}
```

Generate the token before the registration transaction, insert `digest` into `task_capability_hash`, and return the raw token only in the response:

```ts
const capability = createTaskCapability();
// Include task_capability_hash in the INSERT columns and capability.digest in values.
return { sessionId, leaseExpiresAt, taskCapability: capability.token };
```

Add the public authentication method:

```ts
authenticateTaskCapability(token: string): SessionRow | undefined {
  if (!/^[0-9a-f]{64}$/.test(token)) return undefined;
  const candidate = capabilityDigest(token);
  const rows = this.database.prepare(`
    SELECT id, task_capability_hash
    FROM sessions
  `).all() as Array<{ id: string; task_capability_hash: Uint8Array }>;

  for (const row of rows) {
    const stored = Buffer.from(row.task_capability_hash);
    if (stored.length === candidate.length && timingSafeEqual(stored, candidate)) {
      return this.getSession(row.id);
    }
  }
  return undefined;
}
```

- [ ] **Step 8: Run store tests green**

Run:

```bash
npx vitest run packages/registry/test/store.test.ts
```

Expected: all store tests PASS, including capability deletion with session deletion.

- [ ] **Step 9: Write failing transport/discovery tests for the coordinated route cutover**

In `packages/client/test/transport.test.ts`, make the fake server record paths and return protocol-v2 responses:

```ts
expect(request.method).toBe("POST");
expect(request.url).toBe("/v2/sessions");
respondJson(response, 200, {
  sessionId: "018f0c9e-18d8-7a30-8d5d-0d66d65f13b5",
  leaseExpiresAt: 46_000,
  taskCapability: "ab".repeat(32),
});
```

Add a route table assertion covering every current transport method:

```ts
expect(observedPaths).toEqual([
  "POST /v2/sessions",
  `POST /v2/sessions/${sessionId}/events`,
  `POST /v2/sessions/${sessionId}/heartbeat`,
  `PUT /v2/sessions/${sessionId}/snapshot`,
  `DELETE /v2/sessions/${sessionId}`,
  "POST /v2/query",
  "GET /v2/health",
]);
```

In `packages/client/test/discovery.test.ts`, use:

```ts
const healthyRecord = {
  port: 43210,
  pid: process.pid,
  token: "test-token",
  protocolVersion: 2 as const,
  startedAt: 1_000,
};
```

and assert a record with `protocolVersion: 1` is rejected.

- [ ] **Step 10: Run client transport/discovery tests red**

Run:

```bash
npx vitest run packages/client/test/transport.test.ts packages/client/test/discovery.test.ts
```

Expected: FAIL because the transport still requests `/v1/*` and discovery types still require protocol version 1.

- [ ] **Step 11: Move all private transport and HTTP routes to `/v2`**

In `packages/client/src/transport.ts`, replace every `/v1` prefix with `/v2`. Keep method names unchanged.

In `packages/registry/src/http.ts`, route only these private paths:

```text
GET    /v2/health
POST   /v2/sessions
POST   /v2/sessions/{id}/events
POST   /v2/sessions/{id}/heartbeat
PUT    /v2/sessions/{id}/snapshot
DELETE /v2/sessions/{id}
POST   /v2/query
```

In both registry and client discovery record types, replace `protocolVersion: 1` with:

```ts
protocolVersion: typeof PROTOCOL_VERSION;
```

In `packages/registry/src/daemon.ts`, publish:

```ts
protocolVersion: PROTOCOL_VERSION,
```

Import `PROTOCOL_VERSION` from `@agent-session/contracts`; do not duplicate the literal.

- [ ] **Step 12: Retain the capability in `SessionReporter` memory**

Add this public read-only property to `SessionReporter`:

```ts
readonly taskCapability: string | undefined;
```

Add state and getter to `SessionReporterImpl`:

```ts
private currentTaskCapability: string | undefined;

get taskCapability(): string | undefined {
  return this.currentTaskCapability;
}
```

Where registration succeeds, assign both values from one response:

```ts
const registration = await transport.register({
  metadata: this.metadataState,
  snapshot: this.snapshotProvider(),
});
this.currentSessionId = registration.sessionId;
this.currentTaskCapability = registration.taskCapability;
```

Clear `currentTaskCapability` whenever daemon identity changes, re-registration begins, or `close()` settles. Never include it in status callbacks or errors.

- [ ] **Step 13: Explicitly mark every Pi session as non-delivery-capable**

In `packages/pi-extension/src/adapter.ts`, add this field to the metadata passed to `createSessionReporter`:

```ts
acceptsTaskDelivery: false,
```

Update every existing metadata fixture under these paths with the same explicit field:

```text
packages/contracts/test/contracts.test.ts
packages/registry/test/store.test.ts
packages/registry/test/query.test.ts
packages/registry/test/http.test.ts
packages/client/test/transport.test.ts
packages/client/test/reporter.test.ts
packages/client/test/e2e.test.ts
packages/pi-extension/test/helpers.ts
packages/pi-extension/test/adapter.test.ts
packages/pi-extension/test/tool.test.ts
```

Do not use a schema default; the v2 contract intentionally requires adapters to declare capability.

- [ ] **Step 14: Run the complete migration suite**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all existing tests PASS, TypeScript exits 0, built private clients use only `/v2`, discovery reports version 2, and Pi behavior remains otherwise unchanged.

---

### Task 2: In-Memory Coordination Schema and Existing-Session Task Service

**Files:**
- Create: `packages/registry/src/coordination/types.ts`
- Create: `packages/registry/src/coordination/errors.ts`
- Create: `packages/registry/src/coordination/content.ts`
- Create: `packages/registry/src/coordination/task-store.ts`
- Create: `packages/registry/src/coordination/task-service.ts`
- Create: `packages/registry/test/task-store.test.ts`
- Create: `packages/registry/test/task-service.test.ts`
- Modify: `packages/registry/src/schema.ts`
- Modify: `packages/registry/src/store.ts`
- Modify: `packages/registry/src/index.ts`

**Interfaces:**
- Consumes: `RegistryStore.getSession`, protocol-v2 session metadata, shared `DatabaseSync`, and injectable `Clock`.
- Produces: `CoordinationTask`, `CoordinationMessage`, `TaskTarget`, `SupportedPart`, `CoordinationError`, `TaskStore`, and `CoordinationService.createExistingSessionTask/getTask/listTasks/appendMessage`. Delivery and HTTP tasks depend on these exact exports.

- [ ] **Step 1: Define failing domain fixtures and store tests**

Create `packages/registry/test/task-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/schema.js";
import { TaskStore } from "../src/coordination/task-store.js";

const clock = { now: () => 10_000 };

describe("TaskStore", () => {
  it("creates a task, message, and queued delivery atomically", () => {
    const database = createDatabase();
    const store = new TaskStore({ database, clock, instanceId: "instance-a" });
    const created = store.createExistingTask({
      sourceSessionId: "source",
      targetSessionId: "target",
      contextId: "context-1",
      deadlineAt: 20_000,
      message: {
        messageId: "message-1",
        role: "source",
        parts: [{ kind: "text", text: "inspect auth", mediaType: "text/plain" }],
        extensions: ["urn:agent-session-registry:extension:local-coordination:v1"],
      },
    });

    expect(created.task.id).toMatch(/^instance-a:/);
    expect(created.task.state).toBe("submitted");
    expect(store.listMessages(created.task.id)).toHaveLength(1);
    expect(store.listDeliveries(created.task.id)).toMatchObject([
      { state: "queued", targetSessionId: "target", sequence: 1 },
    ]);
  });

  it("rolls back every row when cumulative content exceeds one MiB", () => {
    const database = createDatabase();
    const store = new TaskStore({ database, clock, instanceId: "instance-a" });
    expect(() => store.createExistingTask({
      sourceSessionId: "source",
      targetSessionId: "target",
      contextId: "context-1",
      deadlineAt: 20_000,
      message: {
        messageId: "large",
        role: "source",
        parts: Array.from({ length: 17 }, (_, index) => ({
          kind: "text" as const,
          text: `${index}:${"x".repeat(65_530)}`,
          mediaType: "text/plain",
        })),
        extensions: [],
      },
    })).toThrowError(/TASK_CONTENT_LIMIT/);
    expect(store.countTasks()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the task-store test red**

Run:

```bash
npx vitest run packages/registry/test/task-store.test.ts
```

Expected: FAIL because the coordination model and `TaskStore` do not exist.

- [ ] **Step 3: Define the complete internal model and stable errors**

Create `packages/registry/src/coordination/types.ts`:

```ts
export const LOCAL_COORDINATION_EXTENSION =
  "urn:agent-session-registry:extension:local-coordination:v1" as const;

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type SupportedPart =
  | { kind: "text"; text: string; mediaType: "text/plain" }
  | { kind: "data"; data: JsonValue; mediaType: "application/json" };

export interface CoordinationMessage {
  messageId: string;
  role: "source" | "target";
  parts: SupportedPart[];
  extensions: string[];
}

export type TaskTarget =
  | { type: "session"; sessionId: string }
  | { type: "worker"; provider: string; cwd: string; options: Record<string, JsonValue> };

export type CoordinationTaskState =
  | "submitted"
  | "working"
  | "completed"
  | "failed"
  | "canceled"
  | "rejected";

export interface CoordinationTask {
  id: string;
  instanceId: string;
  contextId: string;
  sourceSessionId: string;
  target: TaskTarget;
  targetSessionId?: string;
  state: CoordinationTaskState;
  cancellationRequested: boolean;
  sourceClosed: boolean;
  deadlineAt: number;
  createdAt: number;
  updatedAt: number;
  terminalCode?: string;
  contentBytes: number;
}

export interface DeliveryRecord {
  id: string;
  taskId: string;
  messageId: string;
  targetSessionId: string;
  sequence: number;
  state: "queued" | "claimed" | "accepted" | "rejected" | "resolved";
  claimedAt?: number;
  acknowledgedAt?: number;
}

export interface ClaimedDelivery {
  task: CoordinationTask;
  delivery: DeliveryRecord;
  message: CoordinationMessage;
  sourceLabel: string;
}

export interface TaskMutationResult {
  task: CoordinationTask;
  cancellationRequested: boolean;
}

export interface TaskListFilters {
  contextId?: string;
  state?: CoordinationTaskState;
  pageSize?: number;
  pageToken?: string;
  historyLength?: number;
  statusTimestampAfter?: number;
}

export interface TaskPage {
  tasks: CoordinationTask[];
  nextPageToken?: string;
  pageSize: number;
  totalSize: number;
}

export interface CreateExistingTaskInput {
  sourceSessionId: string;
  targetSessionId: string;
  contextId: string;
  deadlineAt: number;
  message: CoordinationMessage;
}
```

Create `packages/registry/src/coordination/errors.ts`:

```ts
export type CoordinationErrorCode =
  | "TASK_NOT_FOUND"
  | "TASK_NOT_CANCELABLE"
  | "TARGET_REJECTED"
  | "TARGET_UNAVAILABLE"
  | "DELIVERY_LOST"
  | "DELIVERY_NOT_FOUND"
  | "DELIVERY_NOT_OWNED"
  | "DEADLINE_EXCEEDED"
  | "TASK_CONTENT_LIMIT"
  | "TASK_COUNT_LIMIT"
  | "DATABASE_LIMIT"
  | "UNSUPPORTED_CONTENT"
  | "INVALID_ROUTING_EXTENSION"
  | "WORKER_PROVIDER_NOT_FOUND"
  | "WORKER_START_FAILED"
  | "LAUNCH_TOKEN_INVALID";

export class CoordinationError extends Error {
  constructor(
    readonly code: CoordinationErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CoordinationError";
  }
}
```

- [ ] **Step 4: Add exact task/message/delivery DDL**

Append to `packages/registry/src/schema.ts`:

```sql
CREATE TABLE a2a_tasks (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  context_id TEXT NOT NULL,
  source_session_id TEXT NOT NULL,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('session', 'worker')),
  target_selector_json TEXT NOT NULL,
  target_session_id TEXT,
  state TEXT NOT NULL CHECK (state IN ('submitted', 'working', 'completed', 'failed', 'canceled', 'rejected')),
  cancellation_requested INTEGER NOT NULL DEFAULT 0,
  source_closed INTEGER NOT NULL DEFAULT 0,
  deadline_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  terminal_code TEXT,
  content_bytes INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE a2a_messages (
  task_id TEXT NOT NULL REFERENCES a2a_tasks(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('source', 'target')),
  parts_json TEXT NOT NULL,
  extensions_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  content_bytes INTEGER NOT NULL,
  PRIMARY KEY (task_id, message_id),
  UNIQUE (task_id, sequence)
);

CREATE TABLE a2a_deliveries (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES a2a_tasks(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  target_session_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued', 'claimed', 'accepted', 'rejected', 'resolved')),
  claimed_at INTEGER,
  acknowledged_at INTEGER,
  UNIQUE (target_session_id, sequence)
);

CREATE INDEX a2a_tasks_source_updated ON a2a_tasks(source_session_id, updated_at DESC, id DESC);
CREATE INDEX a2a_deliveries_target_queue ON a2a_deliveries(target_session_id, state, sequence);
CREATE UNIQUE INDEX a2a_one_active_claim_per_target
  ON a2a_deliveries(target_session_id)
  WHERE state IN ('claimed', 'accepted');
```

Do not add foreign keys from task source/target IDs to `sessions`: source-close cleanup intentionally outlives session-row deletion for cooperative cancellation.

Also export one shared size helper from `schema.ts`:

```ts
export function databaseSizeBytes(database: DatabaseSync): number {
  const pages = database.prepare("PRAGMA page_count").get() as { page_count: number };
  const pageSize = database.prepare("PRAGMA page_size").get() as { page_size: number };
  return pages.page_count * pageSize.page_size;
}
```

Refactor `RegistryStore.enforceLimits` to call this helper. Every `TaskStore` write checks `databaseSizeBytes(database) <= MAX_DATABASE_BYTES` before commit and rolls back with `CoordinationError("DATABASE_LIMIT", "Coordination database budget exceeded", 429)` when exceeded.

- [ ] **Step 5: Implement content byte accounting and part validation**

Create `packages/registry/src/coordination/content.ts`:

```ts
import type { CoordinationMessage, JsonValue, SupportedPart } from "./types.js";
import { CoordinationError } from "./errors.js";

export const MAX_PART_BYTES = 65_536;
export const MAX_TASK_CONTENT_BYTES = 1_048_576;

export function partBytes(part: SupportedPart): number {
  return Buffer.byteLength(part.kind === "text" ? part.text : JSON.stringify(part.data), "utf8");
}

export function validateMessage(message: CoordinationMessage): number {
  if (!message.messageId || message.messageId.length > 128 || message.parts.length === 0) {
    throw new CoordinationError("UNSUPPORTED_CONTENT", "Message shape is invalid", 400);
  }
  let total = 0;
  for (const part of message.parts) {
    const size = partBytes(part);
    if (size > MAX_PART_BYTES) {
      throw new CoordinationError("TASK_CONTENT_LIMIT", "A message part exceeds 64 KiB", 413);
    }
    total += size;
  }
  return total;
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).every(isJsonValue);
  return false;
}
```

- [ ] **Step 6: Implement `TaskStore` transactionally**

Create `packages/registry/src/coordination/task-store.ts` with this public surface:

```ts
export class TaskStore {
  readonly instanceId: string;
  constructor(options: { database: DatabaseSync; clock: Clock; instanceId: string; maxDatabaseBytes?: number });
  isTaskFromCurrentInstance(taskId: string): boolean;
  createExistingTask(input: CreateExistingTaskInput): { task: CoordinationTask; delivery: DeliveryRecord };
  createRejectedTask(input: CreateExistingTaskInput, code: "TARGET_REJECTED"): CoordinationTask;
  appendSourceMessage(taskId: string, message: CoordinationMessage): DeliveryRecord;
  getTask(taskId: string): CoordinationTask | undefined;
  listTasks(sourceSessionId: string, filters: TaskListFilters): TaskPage;
  listMessages(taskId: string, historyLength?: number): CoordinationMessage[];
  listDeliveries(taskId: string): DeliveryRecord[];
  countTasks(): number;
  countActiveTasks(sourceSessionId?: string): number;
  close(): void;
}
```

Use explicit `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` around `createExistingTask`, `createRejectedTask`, and `appendSourceMessage`. `createRejectedTask` stores the validated initial message and terminal task but no delivery. The complete routable creation transaction is:

```ts
const contentBytes = validateMessage(input.message);
if (contentBytes > MAX_TASK_CONTENT_BYTES) {
  throw new CoordinationError("TASK_CONTENT_LIMIT", "Task content exceeds one MiB", 413);
}
if (this.countActiveTasks(input.sourceSessionId) >= 50 || this.countActiveTasks() >= 500) {
  throw new CoordinationError("TASK_COUNT_LIMIT", "Active task limit exceeded", 429);
}
const taskId = `${this.instanceId}:${randomUUID()}`;
const deliveryId = randomUUID();
// Insert task, message sequence 1, and target delivery sequence 1 in the same transaction.
```

`appendSourceMessage` must lock the task, reject terminal state, reject a changed target selector before insertion, compute the next message and target-delivery sequences, and check `task.contentBytes + messageBytes <= MAX_TASK_CONTENT_BYTES` before writing either row.

The constructor defaults `maxDatabaseBytes` to `MAX_DATABASE_BYTES`; tests may inject a smaller positive value. Add a rollback test with `maxDatabaseBytes: 1` and assert task/message/delivery counts remain zero after `DATABASE_LIMIT`.

`listTasks` orders by `updated_at DESC, id DESC`. Encode page tokens as base64url JSON `{ "updatedAt": number, "id": string }`; validate both fields and reject malformed tokens. The next-page predicate is `updated_at < ? OR (updated_at = ? AND id < ?)`. Apply source ownership, optional context/state/time filters to both the page query and `totalSize` count.

- [ ] **Step 7: Run task-store tests green**

Run:

```bash
npx vitest run packages/registry/test/task-store.test.ts
```

Expected: all task-store creation, rollback, ordering, and limit tests PASS.

- [ ] **Step 8: Write failing existing-session service tests**

Create `packages/registry/test/task-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/schema.js";
import { RegistryStore } from "../src/store.js";
import { TaskStore } from "../src/coordination/task-store.js";
import { CoordinationService } from "../src/coordination/task-service.js";

function register(registry: RegistryStore, id: string, acceptsTaskDelivery: boolean) {
  return registry.register({
    metadata: {
      adapter: "test",
      adapterVersion: "1",
      harnessSessionId: id,
      cwd: `/repo/${id}`,
      processId: process.pid,
      startedAt: 1_000,
      state: "idle",
      acceptsTaskDelivery,
    },
    snapshot: { lastSequence: 0, events: [] },
  });
}

describe("CoordinationService existing-session routing", () => {
  it("creates only source-owned work for a delivery-capable target", () => {
    const database = createDatabase();
    const registry = new RegistryStore({ database, clock: { now: () => 1_000 } });
    const tasks = new TaskStore({ database, clock: { now: () => 1_000 }, instanceId: "i1" });
    const service = new CoordinationService({ registry, tasks, clock: { now: () => 1_000 } });
    const source = register(registry, "source", false);
    const target = register(registry, "target", true);

    const task = service.createExistingSessionTask(source.sessionId, {
      targetSessionId: target.sessionId,
      contextId: "context-1",
      deadlineAt: 31_000,
      message: {
        messageId: "m1",
        role: "source",
        parts: [{ kind: "text", text: "inspect auth", mediaType: "text/plain" }],
        extensions: [],
      },
    });

    expect(service.getTask(source.sessionId, task.id)?.id).toBe(task.id);
    expect(service.getTask(target.sessionId, task.id)).toBeUndefined();
  });

  it("returns indistinguishable rejected tasks for missing and non-capable targets", () => {
    const database = createDatabase();
    const registry = new RegistryStore({ database, clock: { now: () => 1_000 } });
    const tasks = new TaskStore({ database, clock: { now: () => 1_000 }, instanceId: "i1" });
    const service = new CoordinationService({ registry, tasks, clock: { now: () => 1_000 } });
    const source = register(registry, "source", false);
    const incapable = register(registry, "incapable", false);
    const input = (targetSessionId: string) => ({
      targetSessionId,
      contextId: "context-1",
      deadlineAt: 31_000,
      message: {
        messageId: `m-${targetSessionId}`,
        role: "source" as const,
        parts: [{ kind: "text" as const, text: "inspect auth", mediaType: "text/plain" as const }],
        extensions: [],
      },
    });

    const missing = service.createExistingSessionTask(source.sessionId, input("missing"));
    const disabled = service.createExistingSessionTask(source.sessionId, input(incapable.sessionId));
    expect(missing).toMatchObject({ state: "rejected", terminalCode: "TARGET_REJECTED" });
    expect(disabled).toMatchObject({ state: "rejected", terminalCode: "TARGET_REJECTED" });
    expect(tasks.listDeliveries(missing.id)).toEqual([]);
    expect(tasks.listDeliveries(disabled.id)).toEqual([]);
  });
});
```

- [ ] **Step 9: Run task-service tests red**

Run:

```bash
npx vitest run packages/registry/test/task-service.test.ts
```

Expected: FAIL because `CoordinationService` does not exist.

- [ ] **Step 10: Implement the existing-session `CoordinationService` facade**

Create `packages/registry/src/coordination/task-service.ts` with this initial public surface:

```ts
export class CoordinationService {
  constructor(options: { registry: RegistryStore; tasks: TaskStore; clock: Clock });

  createExistingSessionTask(
    sourceSessionId: string,
    input: { targetSessionId: string; contextId?: string; deadlineAt?: number; message: CoordinationMessage },
  ): CoordinationTask;

  appendMessage(sourceSessionId: string, taskId: string, message: CoordinationMessage): CoordinationTask;
  getTask(sourceSessionId: string, taskId: string): CoordinationTask | undefined;
  listTasks(sourceSessionId: string, filters: TaskListFilters): TaskPage;
  taskNotFoundMetadata(taskId: string): Record<string, string> | undefined;
}
```

Use these deadline rules exactly:

```ts
const DEFAULT_TASK_DEADLINE_MS = 30 * 60 * 1_000;
const MAX_TASK_DEADLINE_MS = 2 * 60 * 60 * 1_000;
const now = this.clock.now();
const deadlineAt = input.deadlineAt ?? now + DEFAULT_TASK_DEADLINE_MS;
if (deadlineAt <= now || deadlineAt > now + MAX_TASK_DEADLINE_MS) {
  throw new CoordinationError("DEADLINE_EXCEEDED", "Task deadline is outside the allowed range", 400);
}
```

Before creating, require an active source session. For a missing or non-delivery-capable target, call `TaskStore.createRejectedTask` to atomically store the source message and a terminal task with `state: "rejected"`, `terminalCode: "TARGET_REJECTED"`, and no delivery row. Both cases return the same public status message, `Target cannot accept delegated work`, without revealing which lookup failed.

`getTask` and `appendMessage` first check `task.sourceSessionId === sourceSessionId`; otherwise behave exactly as task-not-found. `taskNotFoundMetadata(taskId)` returns `{ reason: "coordinator_restarted" }` only when the ID has a syntactically valid instance prefix different from `TaskStore.instanceId`; malformed/current-instance unknown IDs return `undefined`.

- [ ] **Step 11: Export the coordination domain and run the task suite**

Add focused exports to `packages/registry/src/index.ts`:

```ts
export { CoordinationService } from "./coordination/task-service.js";
export { TaskStore } from "./coordination/task-store.js";
export { CoordinationError } from "./coordination/errors.js";
export type {
  CoordinationTask,
  CoordinationMessage,
  SupportedPart,
  TaskTarget,
  DeliveryRecord,
} from "./coordination/types.js";
```

Run:

```bash
npx vitest run packages/registry/test/task-store.test.ts packages/registry/test/task-service.test.ts
npm run typecheck
```

Expected: both new suites PASS and TypeScript exits 0.

---

### Task 3: FIFO Delivery Router, Cancellation, Deadlines, and Session Loss

**Files:**
- Create: `packages/registry/src/coordination/notifier.ts`
- Create: `packages/registry/src/coordination/delivery-router.ts`
- Create: `packages/registry/test/delivery-router.test.ts`
- Modify: `packages/registry/src/coordination/task-store.ts`
- Modify: `packages/registry/src/coordination/task-service.ts`
- Modify: `packages/registry/src/coordination/types.ts`
- Modify: `packages/registry/src/index.ts`

**Interfaces:**
- Consumes: `TaskStore`, `RegistryStore`, `Clock`, and task/domain types from Task 2.
- Produces: `ChangeNotifier`, `DeliveryRouter.claim/accept/reject/progress/complete/fail/ackCanceled`, and `CoordinationService.cancelTask/onSessionClosed/expireDeadlines/waitForTerminal/countRetainedTasks`. HTTP and daemon tasks consume these signatures.

- [ ] **Step 1: Write failing FIFO and at-most-once tests**

Create `packages/registry/test/delivery-router.test.ts` with a fixture that registers one idle delivery-capable target and two sources. Add:

```ts
it("claims FIFO and never gives a target two active deliveries", async () => {
  const { router, service, sourceA, sourceB, target } = fixture();
  const first = service.createExistingSessionTask(sourceA, taskInput(target, "first"));
  const second = service.createExistingSessionTask(sourceB, taskInput(target, "second"));

  const claimed = await router.claim(target, 0);
  expect(claimed?.task.id).toBe(first.id);
  expect(await router.claim(target, 0)).toBeUndefined();

  router.complete(target, claimed!.delivery.id, resultMessage("done first"));
  expect((await router.claim(target, 0))?.task.id).toBe(second.id);
});

it("does not claim work while the target is running", async () => {
  const { router, service, registry, sourceA, target } = fixture();
  service.createExistingSessionTask(sourceA, taskInput(target, "queued"));
  registry.heartbeat(target, { state: "running", lastActivityAt: 2_000 });
  expect(await router.claim(target, 0)).toBeUndefined();
  registry.heartbeat(target, { state: "idle", lastActivityAt: 3_000 });
  expect(await router.claim(target, 0)).toBeDefined();
});
```

- [ ] **Step 2: Run delivery tests red**

Run:

```bash
npx vitest run packages/registry/test/delivery-router.test.ts
```

Expected: FAIL because the notifier/router APIs do not exist.

- [ ] **Step 3: Implement abortable keyed notification without storing payloads**

Create `packages/registry/src/coordination/notifier.ts`:

```ts
export class ChangeNotifier {
  private readonly generations = new Map<string, number>();
  private readonly waiters = new Map<string, Set<() => void>>();

  generation(key: string): number {
    return this.generations.get(key) ?? 0;
  }

  notify(key: string): void {
    this.generations.set(key, this.generation(key) + 1);
    for (const wake of this.waiters.get(key) ?? []) wake();
    this.waiters.delete(key);
  }

  async wait(key: string, observed: number, timeoutMs: number, signal?: AbortSignal): Promise<void> {
    if (this.generation(key) !== observed || timeoutMs <= 0 || signal?.aborted) return;
    await new Promise<void>((resolve) => {
      const set = this.waiters.get(key) ?? new Set<() => void>();
      let timer: NodeJS.Timeout | undefined;
      const done = () => {
        if (timer) clearTimeout(timer);
        set.delete(done);
        signal?.removeEventListener("abort", done);
        resolve();
      };
      set.add(done);
      this.waiters.set(key, set);
      timer = setTimeout(done, timeoutMs);
      timer.unref?.();
      signal?.addEventListener("abort", done, { once: true });
    });
  }

  close(): void {
    for (const key of this.waiters.keys()) this.notify(key);
  }
}
```

The notifier stores only keys and callbacks, never messages or task results.

- [ ] **Step 4: Add atomic delivery mutations to `TaskStore`**

Add these exact methods:

```ts
claimNext(targetSessionId: string, now: number): ClaimedDelivery | undefined;
acceptDelivery(targetSessionId: string, deliveryId: string, now: number): TaskMutationResult;
rejectDelivery(targetSessionId: string, deliveryId: string, code: string, now: number): TaskMutationResult;
appendTargetMessage(taskId: string, message: CoordinationMessage): void;
resolveDelivery(targetSessionId: string, deliveryId: string, now: number): void;
completeDelivery(targetSessionId: string, deliveryId: string, message: CoordinationMessage, now: number): TaskMutationResult;
failDelivery(targetSessionId: string, deliveryId: string, code: string, message: CoordinationMessage | undefined, now: number): TaskMutationResult;
requestCancellation(sourceSessionId: string, taskId: string, now: number): CoordinationTask;
acknowledgeCanceled(targetSessionId: string, taskId: string, now: number): TaskMutationResult;
expireDeadlines(now: number): string[];
closeSourceSession(sessionId: string, now: number): string[];
closeTargetSession(sessionId: string, now: number): string[];
countRetainedTasks(): number;
```

`claimNext` must execute this ordering inside one `BEGIN IMMEDIATE` transaction:

```sql
SELECT d.id
FROM a2a_deliveries d
JOIN a2a_tasks t ON t.id = d.task_id
WHERE d.target_session_id = ?
  AND d.state = 'queued'
  AND t.state IN ('submitted', 'working')
  AND t.cancellation_requested = 0
  AND t.deadline_at > ?
ORDER BY d.sequence ASC
LIMIT 1;
```

Then update that delivery to `claimed` and task to `working` before commit. The partial unique index is the final guard against duplicate active claims.

`appendTargetMessage`, `completeDelivery`, and `failDelivery` run `validateMessage` and enforce the same 64 KiB part / 1 MiB cumulative task limits before writing. `completeDelivery` appends the target result and resolves the current delivery. If another queued delivery already exists for the same task, keep the task `working`; otherwise atomically set it `completed`. A follow-up racing after terminal state is rejected by `appendSourceMessage`.

- [ ] **Step 5: Implement `DeliveryRouter` long polling and ownership checks**

Create `packages/registry/src/coordination/delivery-router.ts`:

```ts
export class DeliveryRouter {
  constructor(options: {
    registry: RegistryStore;
    tasks: TaskStore;
    clock: Clock;
    notifier?: ChangeNotifier;
  });

  async claim(targetSessionId: string, waitSeconds: number, signal?: AbortSignal): Promise<ClaimedDelivery | undefined>;
  accept(targetSessionId: string, deliveryId: string): TaskMutationResult;
  reject(targetSessionId: string, deliveryId: string, code: string): TaskMutationResult;
  progress(targetSessionId: string, taskId: string, message?: CoordinationMessage): TaskMutationResult;
  complete(targetSessionId: string, deliveryId: string, message: CoordinationMessage): TaskMutationResult;
  fail(targetSessionId: string, deliveryId: string, code: string, message?: CoordinationMessage): TaskMutationResult;
  acknowledgeCanceled(targetSessionId: string, taskId: string): TaskMutationResult;
  notifyTarget(targetSessionId: string): void;
  notifyTask(taskId: string): void;
  close(): void;
}
```

`claim` validates `waitSeconds` as an integer from 0 through 30, checks the session is active, idle, and delivery-capable, then loops until the deadline:

```ts
const deadline = this.clock.now() + waitSeconds * 1_000;
while (!signal?.aborted) {
  const generation = this.notifier.generation(targetSessionId);
  const claimed = this.tasks.claimNext(targetSessionId, this.clock.now());
  if (claimed) return claimed;
  const remaining = deadline - this.clock.now();
  if (remaining <= 0) return undefined;
  await this.notifier.wait(targetSessionId, generation, remaining, signal);
}
return undefined;
```

Each mutation notifies both the task ID and target ID after the transaction commits. A claimed response derives the label with:

```ts
const sourceLabel = source.metadata.name ?? `${source.metadata.adapter} session`;
```

It never includes cwd, process ID, harness session ID, registry session ID, or capability data.

- [ ] **Step 6: Run FIFO delivery tests green**

Run:

```bash
npx vitest run packages/registry/test/delivery-router.test.ts
```

Expected: FIFO, busy-target, and one-active-claim tests PASS.

- [ ] **Step 7: Add cancellation, deadline, and session-loss race tests**

Add concrete tests to `delivery-router.test.ts`:

```ts
it("cancels queued work immediately but requests cooperative cancellation after claim", async () => {
  const first = fixture();
  const queued = first.service.createExistingSessionTask(first.sourceA, taskInput(first.target, "queued"));
  expect(first.service.cancelTask(first.sourceA, queued.id).state).toBe("canceled");
  expect(await first.router.claim(first.target, 0)).toBeUndefined();

  const second = fixture();
  const working = second.service.createExistingSessionTask(second.sourceA, taskInput(second.target, "working"));
  await second.router.claim(second.target, 0);
  const pending = second.service.cancelTask(second.sourceA, working.id);
  expect(pending.state).toBe("working");
  expect(pending.cancellationRequested).toBe(true);
  expect(second.router.acknowledgeCanceled(second.target, working.id).task.state).toBe("canceled");
});

it("fails claimed work on target loss and never requeues it", async () => {
  const f = fixture();
  const task = f.service.createExistingSessionTask(f.sourceA, taskInput(f.target, "once"));
  await f.router.claim(f.target, 0);
  f.service.onSessionClosed(f.target);
  expect(f.service.getTask(f.sourceA, task.id)).toMatchObject({ state: "failed", terminalCode: "DELIVERY_LOST" });
  expect(await f.router.claim(f.target, 0)).toBeUndefined();
});

it("makes the first terminal transition win a completion/deadline race", async () => {
  let now = 1_000;
  const f = fixture({ clock: { now: () => now } });
  const task = f.service.createExistingSessionTask(f.sourceA, {
    ...taskInput(f.target, "deadline"),
    deadlineAt: 2_000,
  });
  const claim = await f.router.claim(f.target, 0);
  expect(claim?.task.id).toBe(task.id);

  now = 2_001;
  f.service.expireDeadlines();
  const late = f.router.complete(
    f.target,
    claim!.delivery.id,
    resultMessage("too late"),
  );

  expect(late.task.state).toBe("failed");
  expect(late.task.terminalCode).toBe("DEADLINE_EXCEEDED");
  expect(f.service.getTask(f.sourceA, task.id)?.state).toBe("failed");
});
```

- [ ] **Step 8: Extend `CoordinationService` with lifecycle methods**

Replace its constructor options with:

```ts
constructor(options: {
  registry: RegistryStore;
  tasks: TaskStore;
  router: DeliveryRouter;
  clock: Clock;
  notifier?: ChangeNotifier;
});
```

Add:

```ts
cancelTask(sourceSessionId: string, taskId: string): CoordinationTask;
waitForTerminal(sourceSessionId: string, taskId: string, signal?: AbortSignal): Promise<CoordinationTask>;
onSessionClosed(sessionId: string): void;
expireDeadlines(): string[];
countRetainedTasks(): number;
close(): void;
```

`onSessionClosed` calls both source and target cleanup because a session may have both roles. Source-close behavior marks `sourceClosed`, cancels queued tasks, requests cancellation for claimed work, and deletes terminal rows. Target-close behavior maps unclaimed work to `TARGET_UNAVAILABLE` and claimed work to `DELIVERY_LOST`. When source-closed active work later becomes terminal, delete it immediately.

`waitForTerminal` rechecks ownership and state before and after each keyed notifier wait; it returns terminal state, stops on caller abort without changing the task, and never stores a waiter payload.

- [ ] **Step 9: Run lifecycle and concurrency tests**

Run:

```bash
npx vitest run packages/registry/test/task-store.test.ts packages/registry/test/task-service.test.ts packages/registry/test/delivery-router.test.ts
npm run typecheck
```

Expected: all coordination domain tests PASS, including race tests, and TypeScript exits 0.

---

### Task 4: Pluggable Managed-Worker Launch and One-Time Binding

**Files:**
- Create: `packages/registry/src/coordination/worker-providers.ts`
- Create: `packages/registry/test/worker-providers.test.ts`
- Modify: `packages/contracts/src/api.ts`
- Modify: `packages/contracts/test/contracts.test.ts`
- Modify: `packages/registry/src/schema.ts`
- Modify: `packages/registry/src/coordination/types.ts`
- Modify: `packages/registry/src/coordination/task-store.ts`
- Modify: `packages/registry/src/coordination/task-service.ts`
- Modify: `packages/registry/src/index.ts`

**Interfaces:**
- Consumes: task lifecycle, notifier, session registration, and limits from Tasks 1–3.
- Produces: `WorkerProvider`, `WorkerProviderRegistry`, `WorkerStartRequest`, `CoordinationService.createWorkerTask/bindWorkerSession/expireWorkerLaunches`, and optional top-level `RegisterSessionRequest.launchToken`.

- [ ] **Step 1: Write failing worker-provider and launch-token tests**

Create `packages/registry/test/worker-providers.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { WorkerProviderRegistry } from "../src/coordination/worker-providers.js";

it("starts the selected provider without exposing other providers", async () => {
  const start = vi.fn(async () => ({ launchId: "launch-1" }));
  const registry = new WorkerProviderRegistry([{ name: "test", start, cancel: vi.fn(async () => undefined) }]);
  const result = await registry.start("test", {
    taskId: "task-1",
    launchToken: "aa".repeat(32),
    cwd: "/repo",
    options: {},
    deadlineAt: 31_000,
  });
  expect(result).toEqual({ launchId: "launch-1" });
  expect(start).toHaveBeenCalledOnce();
  expect(registry.names()).toEqual(["test"]);
});

it("consumes a launch token exactly once", async () => {
  const f = workerFixture();
  const task = f.service.createWorkerTask(f.sourceSessionId, {
    provider: "test",
    cwd: "/repo",
    options: {},
    message: sourceMessage("run tests"),
  });
  const token = f.provider.lastRequest!.launchToken;
  const workerSessionId = f.registerWorker(token);
  expect(f.service.getTask(f.sourceSessionId, task.id)?.targetSessionId).toBe(workerSessionId);
  expect(() => f.registerWorker(token)).toThrowError(/LAUNCH_TOKEN_INVALID/);
});
```

Define `workerFixture`, `registerWorker`, and `sourceMessage` in the test file with the same explicit v2 metadata used in Task 2; use a fake provider that records its last request.

- [ ] **Step 2: Run worker tests red**

Run:

```bash
npx vitest run packages/registry/test/worker-providers.test.ts
```

Expected: FAIL because worker-provider and worker-task APIs do not exist.

- [ ] **Step 3: Add launch correlation to the strict registration contract**

In `packages/contracts/src/api.ts`, update only the top-level registration request:

```ts
export const RegisterSessionRequestSchema = Type.Object({
  metadata: SessionMetadataSchema,
  snapshot: SnapshotSchema,
  launchToken: Type.Optional(TaskCapabilitySchema),
}, strict);
```

Add a contract test proving `launchToken` is accepted at request top level and still rejected inside `metadata`.

- [ ] **Step 4: Add exact worker-launch DDL**

Append to `packages/registry/src/schema.ts`:

```sql
CREATE TABLE worker_launches (
  task_id TEXT PRIMARY KEY REFERENCES a2a_tasks(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  launch_id TEXT,
  token_hash BLOB NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('starting', 'started', 'bound', 'failed', 'canceled')),
  deadline_at INTEGER NOT NULL,
  bound_session_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX worker_launches_deadline ON worker_launches(state, deadline_at);
```

- [ ] **Step 5: Implement the worker-provider registry**

Create `packages/registry/src/coordination/worker-providers.ts`:

```ts
import type { JsonValue } from "./types.js";
import { CoordinationError } from "./errors.js";

export interface WorkerStartRequest {
  taskId: string;
  launchToken: string;
  cwd: string;
  options: Record<string, JsonValue>;
  deadlineAt: number;
}

export interface WorkerProvider {
  readonly name: string;
  start(request: WorkerStartRequest): Promise<{ launchId: string }>;
  cancel(launchId: string): Promise<void>;
}

export class WorkerProviderRegistry {
  private readonly providers: Map<string, WorkerProvider>;

  constructor(providers: WorkerProvider[] = []) {
    this.providers = new Map(providers.map((provider) => [provider.name, provider]));
    if (this.providers.size !== providers.length) throw new Error("Duplicate worker provider name");
  }

  names(): string[] {
    return [...this.providers.keys()].sort();
  }

  async start(name: string, request: WorkerStartRequest): Promise<{ launchId: string }> {
    const provider = this.providers.get(name);
    if (!provider) throw new CoordinationError("WORKER_PROVIDER_NOT_FOUND", "Worker provider is unavailable", 400);
    return provider.start(request);
  }

  async cancel(name: string, launchId: string): Promise<void> {
    const provider = this.providers.get(name);
    if (provider) await provider.cancel(launchId);
  }
}
```

Validate provider names as 1–64 lowercase ASCII letters, digits, `_`, or `-`; validate cwd as an absolute path up to 4096 characters; serialize options and reject more than 16 KiB before creating a task.

- [ ] **Step 6: Add launch records and constant-time one-time token consumption**

Add these types to `coordination/types.ts`:

```ts
export interface CreateWorkerTaskInput {
  sourceSessionId: string;
  provider: string;
  cwd: string;
  options: Record<string, JsonValue>;
  contextId: string;
  deadlineAt: number;
  message: CoordinationMessage;
}

export interface WorkerLaunchRecord {
  taskId: string;
  provider: string;
  launchId?: string;
  state: "starting" | "started" | "bound" | "failed" | "canceled";
  deadlineAt: number;
  boundSessionId?: string;
}
```

Add `TaskStore` methods:

```ts
createWorkerTask(input: CreateWorkerTaskInput): { task: CoordinationTask; launchToken: string };
recordWorkerStarted(taskId: string, launchId: string): void;
recordWorkerStartFailed(taskId: string, code: string): void;
bindWorkerSession(launchToken: string, sessionId: string): CoordinationTask;
listExpiredWorkerLaunches(now: number): WorkerLaunchRecord[];
```

`createWorkerTask` inserts the submitted task and `worker_launches` row in one transaction. Generate `launchToken` with `randomBytes(32).toString("hex")`, store only its SHA-256 verifier, and return the raw token to the provider call. `bindWorkerSession` scans active verifier rows with timing-safe comparison, requires the new session to advertise task delivery, marks the launch bound, sets `target_session_id`, and inserts delivery sequence 1 in one transaction.

- [ ] **Step 7: Orchestrate provider calls outside transactions**

Add `providers: WorkerProviderRegistry` to the `CoordinationService` constructor options from Task 3, then add:

```ts
createWorkerTask(sourceSessionId: string, input: {
  provider: string;
  cwd: string;
  options: Record<string, JsonValue>;
  contextId?: string;
  deadlineAt?: number;
  message: CoordinationMessage;
}): CoordinationTask;

bindWorkerSession(launchToken: string, sessionId: string): CoordinationTask;
expireWorkerLaunches(): string[];
```

Creation performs the database write first, then starts the provider asynchronously:

```ts
const { task, launchToken } = this.tasks.createWorkerTask(validated);
void (async () => {
  try {
    const { launchId } = await this.providers.start(input.provider, {
      taskId: task.id,
      launchToken,
      cwd: input.cwd,
      options: input.options,
      deadlineAt: task.deadlineAt,
    });
    this.tasks.recordWorkerStarted(task.id, launchId);
  } catch (error) {
    const code = error instanceof CoordinationError && error.code === "WORKER_PROVIDER_NOT_FOUND"
      ? "WORKER_PROVIDER_NOT_FOUND"
      : "WORKER_START_FAILED";
    this.tasks.recordWorkerStartFailed(task.id, code);
    this.notifier.notify(task.id);
  }
})().catch(() => undefined);
return task;
```

Attach the outer catch immediately so shutdown racing a provider callback cannot become an unhandled promise rejection. Do not await provider startup in a return-immediately A2A request.

- [ ] **Step 8: Test provider cancellation and launch expiry**

Add these tests to `worker-providers.test.ts`:

```ts
it("asks the provider to stop after cooperative cancellation is requested", async () => {
  const f = workerFixture();
  const task = f.service.createWorkerTask(f.sourceSessionId, {
    provider: "test",
    cwd: "/repo",
    options: {},
    message: sourceMessage("run tests"),
  });
  await f.provider.started;
  const workerSessionId = f.registerWorker(f.provider.lastRequest!.launchToken);
  await f.router.claim(workerSessionId, 0);

  const canceled = f.service.cancelTask(f.sourceSessionId, task.id);
  expect(canceled.cancellationRequested).toBe(true);
  await f.provider.cancelSettled;
  expect(f.provider.cancel).toHaveBeenCalledWith("launch-1");
});

it("fails an unbound launch at its deadline", () => {
  let now = 1_000;
  const f = workerFixture({ clock: { now: () => now } });
  const task = f.service.createWorkerTask(f.sourceSessionId, {
    provider: "test",
    cwd: "/repo",
    options: {},
    deadlineAt: 2_000,
    message: sourceMessage("run tests"),
  });
  now = 2_001;
  f.service.expireWorkerLaunches();
  expect(f.service.getTask(f.sourceSessionId, task.id)).toMatchObject({
    state: "failed",
    terminalCode: "WORKER_START_FAILED",
  });
});

it("does not revive a launch when provider resolution loses the expiry race", async () => {
  let now = 1_000;
  const deferred = Promise.withResolvers<{ launchId: string }>();
  const f = workerFixture({ clock: { now: () => now }, startPromise: deferred.promise });
  const task = f.service.createWorkerTask(f.sourceSessionId, {
    provider: "test",
    cwd: "/repo",
    options: {},
    deadlineAt: 2_000,
    message: sourceMessage("run tests"),
  });
  now = 2_001;
  f.service.expireWorkerLaunches();
  deferred.resolve({ launchId: "late-launch" });
  await deferred.promise;
  await Promise.resolve();
  expect(f.service.getTask(f.sourceSessionId, task.id)?.state).toBe("failed");
});

it("fails an unknown provider without listing installed names", async () => {
  const f = workerFixture();
  const task = f.service.createWorkerTask(f.sourceSessionId, {
    provider: "missing",
    cwd: "/repo",
    options: {},
    message: sourceMessage("run tests"),
  });
  await Promise.resolve();
  expect(f.service.getTask(f.sourceSessionId, task.id)).toMatchObject({
    state: "failed",
    terminalCode: "WORKER_PROVIDER_NOT_FOUND",
  });
});
```

When `cancelTask` marks a claimed managed-worker task, look up its started launch and call `providers.cancel(provider, launchId)` outside the transaction with an attached rejection handler.

Run:

```bash
npx vitest run packages/registry/test/worker-providers.test.ts packages/contracts/test/contracts.test.ts
npm run typecheck
```

Expected: all worker and contract tests PASS with no unhandled-rejection warning.

---

### Task 5: A2A 1.0 Agent Card, Wire Mapping, and Error Projection

**Files:**
- Create: `packages/registry/src/coordination/agent-card.ts`
- Create: `packages/registry/src/coordination/a2a-mapper.ts`
- Create: `packages/registry/test/a2a-mapper.test.ts`
- Modify: `packages/registry/package.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `packages/registry/src/index.ts`

**Interfaces:**
- Consumes: internal coordination types/service, provider names, and `@a2a-js/sdk` 1.0 wire types/codecs.
- Produces: `buildCoordinatorAgentCard`, `parseA2ASendMessage`, `toA2ATask`, `parseA2AListFilters`, `toA2AError`, constants `A2A_VERSION = "1.0"`, `A2A_CONTENT_TYPE`, and `LOCAL_COORDINATION_EXTENSION`.

- [ ] **Step 1: Pin the official SDK and install reproducibly**

Add to `packages/registry/package.json` dependencies:

```json
"@a2a-js/sdk": "1.0.0"
```

Add to root `devDependencies` so protocol tests can instantiate the official client:

```json
"@a2a-js/sdk": "1.0.0"
```

Run:

```bash
npm install --ignore-scripts
```

Expected: `package-lock.json` records exactly `@a2a-js/sdk@1.0.0`; no Express or alternate HTTP framework is added.

- [ ] **Step 2: Write failing Agent Card and request-mapping tests**

Create `packages/registry/test/a2a-mapper.test.ts`:

```ts
import {
  AgentCard as AgentCardCodec,
  SendMessageRequest as SendMessageRequestCodec,
  TaskState,
} from "@a2a-js/sdk";
import { describe, expect, it } from "vitest";
import {
  parseA2ASendMessage,
  toA2ATask,
} from "../src/coordination/a2a-mapper.js";
import { buildCoordinatorAgentCard } from "../src/coordination/agent-card.js";
import { LOCAL_COORDINATION_EXTENSION } from "../src/coordination/types.js";

it("publishes a private-metadata-free A2A 1.0 REST Agent Card", () => {
  const card = buildCoordinatorAgentCard("http://127.0.0.1:43210", ["test"]);
  const json = AgentCardCodec.toJSON(card);
  expect(json).toMatchObject({
    name: "Local Agent Coordinator",
    supportedInterfaces: [{
      url: "http://127.0.0.1:43210",
      protocolBinding: "HTTP+JSON",
      protocolVersion: "1.0",
    }],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
      extensions: [{ uri: LOCAL_COORDINATION_EXTENSION, required: true }],
    },
  });
  expect(JSON.stringify(json)).not.toMatch(/cwd|processId|harnessSessionId|sessionId/);
});

it("parses one session target DataPart and ordinary TextPart", () => {
  const request = SendMessageRequestCodec.fromJSON({
    message: {
      messageId: "m1",
      role: "ROLE_USER",
      extensions: [LOCAL_COORDINATION_EXTENSION],
      parts: [
        { data: { kind: "coordination.target", target: { type: "session", sessionId: "s1" } } },
        { text: "inspect auth" },
      ],
    },
    configuration: { returnImmediately: true, acceptedOutputModes: ["text/plain", "application/json"] },
  });
  expect(parseA2ASendMessage(request, [LOCAL_COORDINATION_EXTENSION])).toMatchObject({
    target: { type: "session", sessionId: "s1" },
    message: { parts: [{ kind: "text", text: "inspect auth" }] },
    returnImmediately: true,
  });
});

it("maps internal terminal state and UTC timestamp to the official Task shape", () => {
  const task = toA2ATask(completedTaskFixture(), [targetResult("done")]);
  expect(task.status?.state).toBe(TaskState.TASK_STATE_COMPLETED);
  expect(task.status?.timestamp).toBe("2026-07-24T00:00:01.000Z");
});
```

Define `completedTaskFixture` and `targetResult` as complete local helpers using the `CoordinationTask` and `CoordinationMessage` interfaces.

- [ ] **Step 3: Run mapper tests red**

Run:

```bash
npx vitest run packages/registry/test/a2a-mapper.test.ts
```

Expected: FAIL because mapper and Agent Card functions do not exist.

- [ ] **Step 4: Build the exact coordinator Agent Card**

Create `packages/registry/src/coordination/agent-card.ts`. Construct an SDK `AgentCard` with:

```ts
import type { AgentCard, AgentSkill, SecurityRequirement } from "@a2a-js/sdk";
import { LOCAL_COORDINATION_EXTENSION } from "./types.js";

export const A2A_VERSION = "1.0" as const;
export const A2A_CONTENT_TYPE = "application/a2a+json" as const;

export function buildCoordinatorAgentCard(baseUrl: string, providerNames: string[]): AgentCard {
  const taskSecurity: SecurityRequirement[] = [{
    schemes: { sessionBearer: { list: [] } },
  }];
  const skills: AgentSkill[] = [{
    id: "route-active-session",
    name: "Route work to an active local agent session",
    description: "Queues an attributed task for one explicitly selected delivery-capable local session.",
    tags: ["local", "session", "delegation"],
    examples: ["Ask session <id> to inspect the failing test"],
    inputModes: ["text/plain", "application/json"],
    outputModes: ["text/plain", "application/json"],
    securityRequirements: taskSecurity,
  }];
  if (providerNames.length > 0) {
    skills.push({
      id: "start-managed-worker",
      name: "Start a managed local agent worker",
      description: "Starts a worker through one explicitly named installed provider.",
      tags: ["local", "worker", "delegation"],
      examples: ["Start a worker in /workspace/repo to run tests"],
      inputModes: ["text/plain", "application/json"],
      outputModes: ["text/plain", "application/json"],
      securityRequirements: taskSecurity,
    });
  }
  return {
    name: "Local Agent Coordinator",
    description: "Routes ephemeral tasks to explicitly selected local agent sessions or managed workers.",
    supportedInterfaces: [{ url: baseUrl, protocolBinding: "HTTP+JSON", tenant: "", protocolVersion: A2A_VERSION }],
    provider: undefined,
    version: "0.1.0",
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
      extensions: [{
        uri: LOCAL_COORDINATION_EXTENSION,
        description: "Selects one local session or managed-worker target.",
        required: true,
        params: undefined,
      }],
    },
    securitySchemes: {
      sessionBearer: {
        scheme: {
          $case: "httpAuthSecurityScheme",
          value: {
            description: "Ephemeral per-session task capability",
            scheme: "Bearer",
            bearerFormat: "opaque-256-bit",
          },
        },
      },
    },
    securityRequirements: taskSecurity,
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills,
    signatures: [],
  };
}
```

Do not include `providerNames` themselves in the public card; their presence only controls whether the managed-worker skill is advertised.

- [ ] **Step 5: Parse the required routing extension and supported parts**

Create `packages/registry/src/coordination/a2a-mapper.ts`. Use SDK codecs/types rather than inventing A2A names. `parseA2ASendMessage` must:

1. require `ROLE_USER`, one message, and a nonempty message ID;
2. require `LOCAL_COORDINATION_EXTENSION` in both the `A2A-Extensions` service header list and `message.extensions`;
3. on an initial message, require exactly one DataPart with `kind: "coordination.target"`;
4. remove only that target-selector part from the internal instruction message;
5. accept remaining text/data parts after `isJsonValue` and byte validation;
6. reject raw/url parts with `UNSUPPORTED_CONTENT`;
7. read an optional ISO deadline from request metadata under the extension URI:

```json
{
  "urn:agent-session-registry:extension:local-coordination:v1": {
    "deadline": "2026-07-24T00:30:00.000Z"
  }
}
```

Return this exact shape:

```ts
export interface ParsedA2ASendMessage {
  taskId?: string;
  contextId?: string;
  target?: TaskTarget;
  message: CoordinationMessage;
  returnImmediately: boolean;
  historyLength?: number;
  deadlineAt?: number;
}
```

- [ ] **Step 6: Project internal tasks into official A2A objects**

Implement:

```ts
export function toA2ATask(
  task: CoordinationTask,
  history: CoordinationMessage[],
  historyLength?: number,
): Task;
```

Map states exactly:

```ts
const taskStates: Record<CoordinationTaskState, TaskState> = {
  submitted: TaskState.TASK_STATE_SUBMITTED,
  working: TaskState.TASK_STATE_WORKING,
  completed: TaskState.TASK_STATE_COMPLETED,
  failed: TaskState.TASK_STATE_FAILED,
  canceled: TaskState.TASK_STATE_CANCELED,
  rejected: TaskState.TASK_STATE_REJECTED,
};
```

Map source messages to `ROLE_USER`, target messages to `ROLE_AGENT`, use `new Date(task.updatedAt).toISOString()`, and return `artifacts: []`. Use the latest target message as `status.message`; when a rejected/failed task has no target message, synthesize one bounded `ROLE_AGENT` status message from a fixed terminal-code-to-message table (for example, `TARGET_REJECTED` → `Target cannot accept delegated work`) without target details. Include only bounded task metadata:

```ts
metadata: {
  cancellationRequested: task.cancellationRequested,
  deadline: new Date(task.deadlineAt).toISOString(),
  ...(task.terminalCode ? { terminalCode: task.terminalCode } : {}),
},
```

Never project source/target registry IDs, cwd, provider options, launch IDs, or capability values.

Also implement query parsing for `GET /tasks`:

```ts
export function parseA2AListFilters(url: URL): TaskListFilters {
  const pageSizeText = url.searchParams.get("pageSize");
  const historyText = url.searchParams.get("historyLength");
  const afterText = url.searchParams.get("statusTimestampAfter");
  const stateText = url.searchParams.get("status");
  const pageSize = pageSizeText === null ? 50 : Number(pageSizeText);
  const historyLength = historyText === null ? undefined : Number(historyText);
  const statusTimestampAfter = afterText === null ? undefined : Date.parse(afterText);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new CoordinationError("UNSUPPORTED_CONTENT", "pageSize must be from 1 through 100", 400);
  }
  if (historyLength !== undefined && (!Number.isInteger(historyLength) || historyLength < 0 || historyLength > 100)) {
    throw new CoordinationError("UNSUPPORTED_CONTENT", "historyLength must be from 0 through 100", 400);
  }
  if (afterText !== null && !Number.isFinite(statusTimestampAfter)) {
    throw new CoordinationError("UNSUPPORTED_CONTENT", "statusTimestampAfter must be ISO 8601", 400);
  }
  return {
    contextId: url.searchParams.get("contextId") ?? undefined,
    state: stateText === null ? undefined : fromA2ATaskState(taskStateFromJSON(stateText)),
    pageSize,
    pageToken: url.searchParams.get("pageToken") ?? undefined,
    historyLength,
    statusTimestampAfter,
  };
}
```

`fromA2ATaskState` accepts only the six states represented by `CoordinationTaskState`; unspecified, input-required, auth-required, and unrecognized values produce a binding-level invalid-argument error rather than silently broadening the query.

- [ ] **Step 7: Implement standard A2A error bodies**

Add:

```ts
export interface A2AHttpError {
  status: number;
  body: {
    error: {
      code: number;
      status: string;
      message: string;
      details: Array<{
        "@type": "type.googleapis.com/google.rpc.ErrorInfo";
        reason: string;
        domain: "a2a-protocol.org";
        metadata?: Record<string, string>;
      }>;
    };
  };
}
```

Export:

```ts
export function toA2AError(
  error: CoordinationError,
  metadata?: Record<string, string>,
): A2AHttpError;
```

Map `TASK_NOT_FOUND` to 404/`NOT_FOUND`/`TASK_NOT_FOUND`, `TASK_NOT_CANCELABLE` to 400/`FAILED_PRECONDITION`/`TASK_NOT_CANCELABLE`, unsupported content to 400/`INVALID_ARGUMENT`/`CONTENT_TYPE_NOT_SUPPORTED`, and unknown required extension to 400/`FAILED_PRECONDITION`/`EXTENSION_SUPPORT_REQUIRED`. Map count/content/database limits to 429 or 413 with `RESOURCE_EXHAUSTED` and a local `RESOURCE_LIMIT` ErrorInfo reason. `TARGET_REJECTED`, target loss, deadlines after creation, and worker failures are terminal Task projections rather than HTTP errors. For an instance-mismatched task ID, pass only `{ reason: "coordinator_restarted" }` under ErrorInfo metadata.

- [ ] **Step 8: Run mapper and type tests green**

Run:

```bash
npx vitest run packages/registry/test/a2a-mapper.test.ts
npm run typecheck
```

Expected: mapper tests PASS against SDK codecs and TypeScript exits 0.

---

### Task 6: Private Adapter Contracts and Reusable Coordination Transport

**Files:**
- Create: `packages/contracts/src/coordination.ts`
- Create: `packages/client/src/coordination-transport.ts`
- Create: `packages/client/test/coordination-transport.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/test/contracts.test.ts`
- Modify: `packages/client/src/index.ts`

**Interfaces:**
- Consumes: internal delivery/task semantics and session capability from Tasks 1–3.
- Produces: strict TypeBox schemas and `CoordinationTransport` methods matching the private `/v2/sessions/*` API. Task 7's HTTP handlers must return these exact shapes.

- [ ] **Step 1: Write failing strict private-contract tests**

Add to `packages/contracts/test/contracts.test.ts`:

```ts
it("accepts a bounded long-poll claim and rejects out-of-range waits", () => {
  expect(Check(ClaimDeliveryRequestSchema, { waitSeconds: 30 })).toBe(true);
  expect(Check(ClaimDeliveryRequestSchema, { waitSeconds: 31 })).toBe(false);
});

it("accepts only text/data completion parts", () => {
  expect(Check(CompleteTaskRequestSchema, {
    deliveryId: "018f0c9e-18d8-7a30-8d5d-0d66d65f13b5",
    message: {
      messageId: "result-1",
      parts: [
        { kind: "text", text: "done", mediaType: "text/plain" },
        { kind: "data", data: { tests: 10 }, mediaType: "application/json" },
      ],
    },
  })).toBe(true);
  expect(Check(CompleteTaskRequestSchema, {
    deliveryId: "018f0c9e-18d8-7a30-8d5d-0d66d65f13b5",
    message: { messageId: "bad", parts: [{ kind: "file", url: "file:///tmp/x" }] },
  })).toBe(false);
});
```

- [ ] **Step 2: Run contract tests red**

Run:

```bash
npx vitest run packages/contracts/test/contracts.test.ts
```

Expected: FAIL because private coordination schemas do not exist.

- [ ] **Step 3: Define the strict private adapter schemas**

Create `packages/contracts/src/coordination.ts` with `additionalProperties: false` for every object and these exports:

```ts
export const ClaimDeliveryRequestSchema = Type.Object({
  waitSeconds: Type.Integer({ minimum: 0, maximum: 30 }),
}, strict);

export const SupportedPartSchema = Type.Union([
  Type.Object({
    kind: Type.Literal("text"),
    text: Type.String({ maxLength: 65_536 }),
    mediaType: Type.Literal("text/plain"),
  }, strict),
  Type.Object({
    kind: Type.Literal("data"),
    data: Type.Any(),
    mediaType: Type.Literal("application/json"),
  }, strict),
]);

export const AdapterMessageSchema = Type.Object({
  messageId: Type.String({ minLength: 1, maxLength: 128 }),
  parts: Type.Array(SupportedPartSchema, { minItems: 1, maxItems: 100 }),
}, strict);

export const ClaimedDeliverySchema = Type.Object({
  deliveryId: UuidSchema,
  taskId: Type.String({ minLength: 1, maxLength: 256 }),
  contextId: Type.String({ minLength: 1, maxLength: 256 }),
  sourceLabel: Type.String({ minLength: 1, maxLength: 512 }),
  message: AdapterMessageSchema,
  deadline: Type.String({ format: "date-time" }),
}, strict);

export const RejectDeliveryRequestSchema = Type.Object({
  code: Type.String({ minLength: 1, maxLength: 64 }),
  message: Type.Optional(Type.String({ maxLength: 2_000 })),
}, strict);

export const ProgressTaskRequestSchema = Type.Object({
  message: Type.Optional(AdapterMessageSchema),
}, strict);

export const CompleteTaskRequestSchema = Type.Object({
  deliveryId: UuidSchema,
  message: AdapterMessageSchema,
}, strict);
export const FailTaskRequestSchema = Type.Object({
  deliveryId: UuidSchema,
  code: Type.String({ minLength: 1, maxLength: 64 }),
  message: Type.Optional(Type.String({ maxLength: 2_000 })),
}, strict);
export const TaskMutationResponseSchema = Type.Object({
  taskId: Type.String(),
  state: Type.Union([
    Type.Literal("submitted"), Type.Literal("working"), Type.Literal("completed"),
    Type.Literal("failed"), Type.Literal("canceled"), Type.Literal("rejected"),
  ]),
  cancellationRequested: Type.Boolean(),
}, strict);
```

Export inferred types and re-export the file from `packages/contracts/src/index.ts`.

- [ ] **Step 4: Run private-contract tests green**

Run:

```bash
npx vitest run packages/contracts/test/contracts.test.ts
```

Expected: all contract tests PASS.

- [ ] **Step 5: Write failing reusable transport tests**

Create `packages/client/test/coordination-transport.test.ts` with a small authenticated fake server. Assert these calls exactly:

```ts
await transport.claim({ waitSeconds: 0 });
expect(requests[0]).toMatchObject({
  method: "POST",
  path: `/v2/sessions/${sessionId}/deliveries:claim`,
  authorization: `Bearer ${taskCapability}`,
});

await transport.accept(deliveryId);
await transport.complete(taskId, deliveryId, {
  message: { messageId: "r1", parts: [{ kind: "text", text: "done", mediaType: "text/plain" }] },
});
expect(requests.map((request) => request.path)).toContain(
  `/v2/sessions/${sessionId}/tasks/${taskId}:complete`,
);
```

Return HTTP 204 for one claim and assert `transport.claim()` resolves `undefined` rather than parsing JSON.

- [ ] **Step 6: Run coordination transport tests red**

Run:

```bash
npx vitest run packages/client/test/coordination-transport.test.ts
```

Expected: FAIL because `CoordinationTransport` does not exist.

- [ ] **Step 7: Implement the scoped `CoordinationTransport`**

Create `packages/client/src/coordination-transport.ts`:

```ts
export interface CoordinationTransportOptions {
  baseUrl: string;
  sessionId: string;
  taskCapability: string;
  timeoutMs?: number;
}

export class CoordinationTransport {
  constructor(options: CoordinationTransportOptions);

  claim(request: ClaimDeliveryRequest, signal?: AbortSignal): Promise<ClaimedDelivery | undefined>;
  accept(deliveryId: string, signal?: AbortSignal): Promise<TaskMutationResponse>;
  reject(deliveryId: string, request: RejectDeliveryRequest, signal?: AbortSignal): Promise<TaskMutationResponse>;
  progress(taskId: string, request: ProgressTaskRequest, signal?: AbortSignal): Promise<TaskMutationResponse>;
  complete(taskId: string, deliveryId: string, request: Omit<CompleteTaskRequest, "deliveryId">, signal?: AbortSignal): Promise<TaskMutationResponse>;
  fail(taskId: string, deliveryId: string, request: Omit<FailTaskRequest, "deliveryId">, signal?: AbortSignal): Promise<TaskMutationResponse>;
  acknowledgeCanceled(taskId: string, signal?: AbortSignal): Promise<TaskMutationResponse>;
}
```

Use `Authorization: Bearer <taskCapability>`, `Accept: application/json`, and the strict response schemas. Give `claim` a 31-second default transport timeout so the server's 30-second long poll can complete; all other methods default to 500 ms. Reuse `RegistryClientError` and never put request bodies or tokens in error messages.

For complete/fail, merge the method's `deliveryId` argument into the validated wire body before sending. The URL remains task-oriented exactly as approved.

- [ ] **Step 8: Export and run the client contract suite**

Export `CoordinationTransport` and its options from `packages/client/src/index.ts`.

Run:

```bash
npx vitest run packages/contracts/test/contracts.test.ts packages/client/test/coordination-transport.test.ts packages/client/test/transport.test.ts
npm run typecheck
```

Expected: all targeted tests PASS and TypeScript exits 0.

---

### Task 7: HTTP Server Decomposition, A2A REST Binding, and Adapter Routes

**Files:**
- Create: `packages/registry/src/http-utils.ts`
- Create: `packages/registry/src/registry-http.ts`
- Create: `packages/registry/src/coordination/a2a-http.ts`
- Create: `packages/registry/src/coordination/adapter-http.ts`
- Create: `packages/registry/test/a2a-http.test.ts`
- Create: `packages/registry/test/adapter-http.test.ts`
- Modify: `packages/registry/src/http.ts`
- Modify: `packages/registry/test/http.test.ts`
- Modify: `packages/registry/src/index.ts`

**Interfaces:**
- Consumes: `CoordinationService`, `DeliveryRouter`, Agent Card/mapper functions, private schemas, `RegistryStore.authenticateTaskCapability`, and provider names.
- Produces: one `createRegistryServer` that serves public Agent Card, authenticated standard A2A routes, scoped private adapter routes, and root-authenticated registry v2 routes without mixing authorization domains.

- [ ] **Step 1: Write failing Agent Card and standard A2A route tests**

Create `packages/registry/test/a2a-http.test.ts` using `createRegistryServer` with a real in-memory registry/service fixture. Add:

```ts
it("serves the Agent Card without auth but requires A2A version and session bearer for tasks", async () => {
  const f = await serverFixture();
  const card = await fetch(`${f.url}/.well-known/agent-card.json`);
  expect(card.status).toBe(200);
  expect(card.headers.get("content-type")).toContain("application/a2a+json");

  const missing = await fetch(`${f.url}/message:send`, {
    method: "POST",
    headers: { "content-type": "application/a2a+json" },
    body: JSON.stringify(f.sendBody),
  });
  expect(missing.status).toBe(401);

  const wrongVersion = await f.a2aFetch("/message:send", {
    method: "POST",
    headers: { "A2A-Version": "0.3" },
    body: JSON.stringify(f.sendBody),
  });
  expect(wrongVersion.status).toBe(400);
  expect(await wrongVersion.json()).toMatchObject({
    error: { details: [{ reason: "VERSION_NOT_SUPPORTED" }] },
  });
});

it("sends, gets, lists, follows up, and cancels only source-owned tasks", async () => {
  const f = await serverFixture();
  const sentResponse = await f.a2aFetch("/message:send", {
    method: "POST",
    body: JSON.stringify(f.sendBody),
  });
  expect(sentResponse.status).toBe(200);
  const sent = await sentResponse.json() as { task: { id: string; contextId: string; status: { state: string } } };
  expect(sent.task.status.state).toBe("TASK_STATE_SUBMITTED");

  const getResponse = await f.a2aFetch(`/tasks/${sent.task.id}`, { method: "GET" });
  expect((await getResponse.json() as { status: { state: string } }).status.state)
    .toBe("TASK_STATE_SUBMITTED");

  const listResponse = await f.a2aFetch("/tasks?pageSize=10", { method: "GET" });
  const list = await listResponse.json() as { tasks: Array<{ id: string }> };
  expect(list.tasks.map((task) => task.id)).toContain(sent.task.id);

  const followUp = {
    message: {
      messageId: "follow-up-1",
      taskId: sent.task.id,
      contextId: sent.task.contextId,
      role: "ROLE_USER",
      extensions: [LOCAL_COORDINATION_EXTENSION],
      parts: [{ text: "also inspect token refresh" }],
    },
    configuration: { returnImmediately: true, acceptedOutputModes: ["text/plain"] },
  };
  expect((await f.a2aFetch("/message:send", {
    method: "POST",
    body: JSON.stringify(followUp),
  })).status).toBe(200);

  const canceledResponse = await f.a2aFetch(`/tasks/${sent.task.id}:cancel`, {
    method: "POST",
    body: "{}",
  });
  expect((await canceledResponse.json() as { status: { state: string } }).status.state)
    .toBe("TASK_STATE_CANCELED");

  const forbidden = await f.otherSourceFetch(`/tasks/${sent.task.id}`, { method: "GET" });
  const unknown = await f.otherSourceFetch("/tasks/unknown-task", { method: "GET" });
  expect(forbidden.status).toBe(404);
  expect(await forbidden.json()).toEqual(await unknown.json());
});
```

- [ ] **Step 2: Run A2A HTTP tests red**

Run:

```bash
npx vitest run packages/registry/test/a2a-http.test.ts
```

Expected: FAIL because no Agent Card or A2A routes exist.

- [ ] **Step 3: Extract shared HTTP utilities without changing behavior**

Move bounded body reading, JSON parsing, safe pathname, and response helpers from `http.ts` into `packages/registry/src/http-utils.ts` with exports:

```ts
export const MAX_BODY_BYTES = 1_048_576;
export async function readJsonBody(req: IncomingMessage): Promise<unknown>;
export function validateBody<T>(schema: TSchema, value: unknown): void;
export function sendJson(res: ServerResponse, status: number, payload: unknown, contentType?: string): void;
export function bearerToken(req: IncomingMessage): string | undefined;
export function authenticateRoot(req: IncomingMessage, expected: Buffer): void;
export function safePathname(url?: string): string;
export function safeLogPath(method: string, url?: string): string;
```

`readJsonBody` destroys the request and throws 413 after one MiB. `authenticateRoot` retains equal-length `timingSafeEqual`. `safeLogPath` returns static templates such as `/tasks/:taskId`, `/v2/sessions/:sessionId/tasks/:taskId:complete`, or `/unmatched`; it never returns raw path segments containing session, task, delivery, launch, or capability identifiers. Run existing HTTP tests immediately:

```bash
npx vitest run packages/registry/test/http.test.ts
```

Expected: existing tests remain PASS before adding routes.

- [ ] **Step 4: Move current private routing into `registry-http.ts`**

Create:

```ts
export interface SessionLifecycle {
  registerSession(request: RegisterSessionRequest): RegisterSessionResponse;
  deleteSession(sessionId: string): boolean;
}

export async function handleRegistryRequest(
  req: IncomingMessage,
  res: ServerResponse,
  context: {
    rootToken: Buffer;
    store: RegistryStore;
    sessions: SessionLifecycle;
    clock: Clock;
    startedAt: number;
  },
): Promise<boolean>;
```

Return `true` only for the exact `/v2` private routes from Task 1, authenticating root before reading bodies. Registration calls `sessions.registerSession`; DELETE calls `sessions.deleteSession`; event, heartbeat, snapshot, query, and health operations use `store`. Return `false` for every other path so A2A handlers can run. Preserve current error/status behavior and no-content DELETE.

- [ ] **Step 5: Implement scoped A2A authentication and standard REST routes**

Create `packages/registry/src/coordination/a2a-http.ts`:

```ts
export async function handleA2ARequest(
  req: IncomingMessage,
  res: ServerResponse,
  context: {
    baseUrl: string;
    registry: RegistryStore;
    coordination: CoordinationService;
    providers: WorkerProviderRegistry;
  },
): Promise<boolean>;
```

Behavior:

- `GET /.well-known/agent-card.json` returns `AgentCardCodec.toJSON(buildCoordinatorAgentCard(...))` without auth.
- Every other A2A route requires `A2A-Version: 1.0`, `Content-Type: application/a2a+json` for bodies, and a bearer token resolving through `registry.authenticateTaskCapability`.
- `POST /message:send` parses SDK request JSON, extension headers, and target; initial session/worker targets call the corresponding service method; follow-ups call `appendMessage`.
- When `returnImmediately` is true, return the current task. Otherwise call `waitForTerminal(sourceId, task.id, requestAbortSignal)` and return the terminal task if the socket remains writable.
- Serialize send responses with `SendMessageResponseCodec.toJSON({ payload: { $case: "task", value: toA2ATask(...) } })`, which produces the REST `{ "task": ... }` wrapper expected by the SDK.
- `GET /tasks/{id}` returns `TaskCodec.toJSON(...)` directly and parses optional `historyLength` from 0 through 100. On task-not-found, pass `coordination.taskNotFoundMetadata(id)` to `toA2AError`; authorization still returns the same 404 status/reason.
- `GET /tasks` parses `contextId`, A2A state, `pageSize` 1–100, `pageToken`, `historyLength`, and `statusTimestampAfter`.
- `POST /tasks/{id}:cancel` performs cooperative cancellation.
- Known streaming/subscription/push/extended-card paths return standard unsupported A2A errors.
- All A2A success and error bodies use `application/a2a+json`.

Use `req.once("close", ...)` only to stop the HTTP waiter; never cancel the task because a blocking caller disconnected.

- [ ] **Step 6: Run A2A route tests green**

Run:

```bash
npx vitest run packages/registry/test/a2a-http.test.ts
```

Expected: Agent Card, send/get/list/follow-up/cancel, authorization, version, and unsupported-operation tests PASS.

- [ ] **Step 7: Write failing private adapter route tests**

Create `packages/registry/test/adapter-http.test.ts`:

```ts
it("long-polls with the target capability and returns 204 on timeout", async () => {
  const f = await adapterServerFixture();
  const response = await f.targetFetch(`/v2/sessions/${f.targetId}/deliveries:claim`, {
    method: "POST",
    body: JSON.stringify({ waitSeconds: 0 }),
  });
  expect(response.status).toBe(204);
});

it("claims, accepts, reports progress, and completes only the owned delivery", async () => {
  const f = await adapterServerFixture({ withTask: true });
  const claim = await f.targetJson(`/v2/sessions/${f.targetId}/deliveries:claim`, {
    method: "POST",
    body: JSON.stringify({ waitSeconds: 0 }),
  });
  expect(claim).toMatchObject({ sourceLabel: expect.any(String), message: { parts: [{ kind: "text" }] } });
  await f.targetJson(`/v2/sessions/${f.targetId}/deliveries/${claim.deliveryId}:accept`, { method: "POST", body: "{}" });
  const completed = await f.targetJson(`/v2/sessions/${f.targetId}/tasks/${claim.taskId}:complete`, {
    method: "POST",
    body: JSON.stringify({
      deliveryId: claim.deliveryId,
      message: { messageId: "result", parts: [{ kind: "text", text: "done", mediaType: "text/plain" }] },
    }),
  });
  expect(completed.state).toBe("completed");
});
```

Add a second target and assert its capability gets the same 404 response for this delivery as an unknown delivery.

- [ ] **Step 8: Run adapter route tests red**

Run:

```bash
npx vitest run packages/registry/test/adapter-http.test.ts
```

Expected: FAIL because private adapter routes do not exist.

- [ ] **Step 9: Implement private adapter routes with session-scoped auth**

Create `packages/registry/src/coordination/adapter-http.ts`:

```ts
export async function handleAdapterRequest(
  req: IncomingMessage,
  res: ServerResponse,
  context: { registry: RegistryStore; router: DeliveryRouter },
): Promise<boolean>;
```

Match only the seven exact `/v2/sessions/{sessionId}/...` routes from the spec. For each request:

1. extract bearer token;
2. authenticate to a session;
3. require authenticated session ID equals the path session ID;
4. validate the strict contract body;
5. call the router;
6. serialize the strict response.

For claim timeout, return 204. For all unknown/not-owned deliveries and tasks, return the same 404 body without revealing whether the ID exists.

- [ ] **Step 10: Compose the HTTP shell in a fixed route order**

Refactor `packages/registry/src/http.ts` so each request runs:

```ts
if (await handleA2ARequest(req, res, context.a2a)) return;
if (await handleAdapterRequest(req, res, context.adapter)) return;
if (await handleRegistryRequest(req, res, context.registry)) return;
throw new HttpError(404, "NOT_FOUND", "Route not found");
```

The Agent Card must be checked before root auth; adapter and A2A handlers perform their own scoped auth; registry routes perform root auth. Extend `createRegistryServer` options with `coordination`, `router`, `providers`, and `sessions: SessionLifecycle` rather than constructing domain modules inside HTTP.

- [ ] **Step 11: Run all HTTP suites and secret-redaction checks**

Run:

```bash
npx vitest run packages/registry/test/http.test.ts packages/registry/test/a2a-http.test.ts packages/registry/test/adapter-http.test.ts
npm run typecheck
```

Expected: all HTTP tests PASS. Captured logger entries contain method, path template, status, duration, and error code only; fixture task text, DataPart values, session capabilities, and target IDs are absent.

---

### Task 8: Daemon Composition, Session Lifecycle Integration, Sweeps, and Shutdown

**Files:**
- Modify: `packages/registry/src/store.ts`
- Modify: `packages/registry/src/daemon.ts`
- Modify: `packages/registry/src/http.ts`
- Modify: `packages/registry/src/index.ts`
- Modify: `packages/registry/test/store.test.ts`
- Create: `packages/registry/test/daemon-coordination.test.ts`
- Modify: `packages/client/test/e2e.test.ts`

**Interfaces:**
- Consumes: shared database, registry store, coordination service/router, worker providers, HTTP handlers, and existing daemon discovery/lifecycle.
- Produces: one composed daemon where explicit/expired session deletion triggers coordination cleanup, sweeps expire tasks/launches, active work delays empty shutdown, and database/notifiers close exactly once.

- [ ] **Step 1: Write failing shared-database ownership tests**

Add to `packages/registry/test/store.test.ts`:

```ts
it("does not close a database injected by the daemon owner", () => {
  const database = createDatabase();
  const store = new RegistryStore({ database, clock });
  store.close();
  expect(database.prepare("SELECT 1 AS ok").get()).toEqual({ ok: 1 });
  database.close();
});

it("closes a database it created itself", () => {
  const store = new RegistryStore({ clock });
  store.close();
  expect(() => store.countSessions()).toThrow();
});
```

- [ ] **Step 2: Run ownership tests red**

Run:

```bash
npx vitest run packages/registry/test/store.test.ts
```

Expected: the injected-database test FAILS because `RegistryStore.close()` currently always closes SQLite.

- [ ] **Step 3: Make database ownership explicit**

In `RegistryStore`:

```ts
private readonly ownsDatabase: boolean;

constructor(options?: { clock?: Clock; database?: DatabaseSync; leaseMs?: number }) {
  this.clock = options?.clock ?? new SystemClock();
  this.ownsDatabase = options?.database === undefined;
  this.database = options?.database ?? createDatabase();
  this.leaseMs = options?.leaseMs ?? LEASE_MS;
}

close(): void {
  if (this.ownsDatabase) this.database.close();
}
```

`TaskStore.close()` follows the same ownership rule. The daemon creates one database and closes it directly after HTTP and notifiers stop.

- [ ] **Step 4: Write failing daemon lifecycle integration tests**

Create `packages/registry/test/daemon-coordination.test.ts` around an exported injectable `createDaemonRuntime`:

```ts
it("turns target lease expiry into task failure before empty shutdown", async () => {
  let now = 1_000;
  const runtime = await createDaemonRuntime({
    token: "root-token",
    clock: { now: () => now },
    leaseMs: 100,
    emptyExitMs: 1_000,
    providers: [],
  });
  const source = runtime.register(testRegistration("source", false));
  const target = runtime.register(testRegistration("target", true));
  const task = runtime.coordination.createExistingSessionTask(source.sessionId, taskInput(target.sessionId));
  await runtime.router.claim(target.sessionId, 0);

  now = 1_101;
  runtime.sweep();
  expect(runtime.coordination.getTask(source.sessionId, task.id)).toMatchObject({
    state: "failed",
    terminalCode: "DELIVERY_LOST",
  });
  await runtime.close();
});

it("retains a terminal result until its source closes", async () => {
  const runtime = await createDaemonRuntime(testOptions());
  const source = runtime.register(testRegistration("source", false));
  const target = runtime.register(testRegistration("target", true));
  const task = runtime.coordination.createExistingSessionTask(
    source.sessionId,
    taskInput(target.sessionId),
  );
  const claim = await runtime.router.claim(target.sessionId, 0);
  runtime.router.complete(
    target.sessionId,
    claim!.delivery.id,
    resultMessage("done"),
  );

  expect(runtime.coordination.getTask(source.sessionId, task.id)?.state).toBe("completed");
  expect(runtime.coordination.countRetainedTasks()).toBe(1);
  expect(runtime.isEmpty()).toBe(false);

  runtime.deleteSession(source.sessionId);
  expect(runtime.coordination.countRetainedTasks()).toBe(0);
  runtime.deleteSession(target.sessionId);
  expect(runtime.isEmpty()).toBe(true);
  await runtime.close();
});
```

- [ ] **Step 5: Run daemon coordination tests red**

Run:

```bash
npx vitest run packages/registry/test/daemon-coordination.test.ts
```

Expected: FAIL because `createDaemonRuntime`, coordinated registration, and sweep do not exist.

- [ ] **Step 6: Introduce an injectable daemon runtime composition root**

Refactor `packages/registry/src/daemon.ts` to export:

```ts
export interface DaemonRuntime {
  server: RegistryServer;
  registry: RegistryStore;
  tasks: TaskStore;
  coordination: CoordinationService;
  router: DeliveryRouter;
  providers: WorkerProviderRegistry;
  register(request: RegisterSessionRequest): RegisterSessionResponse;
  deleteSession(sessionId: string): boolean;
  sweep(): void;
  isEmpty(): boolean;
  close(): Promise<void>;
}

export async function createDaemonRuntime(options: {
  token: string;
  clock?: Clock;
  leaseMs?: number;
  emptyExitMs?: number;
  providers?: WorkerProvider[];
}): Promise<DaemonRuntime>;
```

Composition order is exact:

```ts
const database = createDatabase();
const registry = new RegistryStore({ database, clock, leaseMs });
const tasks = new TaskStore({ database, clock, instanceId: randomUUID() });
const providers = new WorkerProviderRegistry(options.providers ?? []);
const notifier = new ChangeNotifier();
const router = new DeliveryRouter({ registry, tasks, clock, notifier });
const coordination = new CoordinationService({ registry, tasks, router, providers, clock, notifier });
const sessions: SessionLifecycle = {
  registerSession(request) {
    const result = registry.register(request);
    if (!request.launchToken) return result;
    try {
      coordination.bindWorkerSession(request.launchToken, result.sessionId);
      return result;
    } catch (error) {
      registry.deleteSession(result.sessionId);
      throw error;
    }
  },
  deleteSession(sessionId) {
    const deleted = registry.deleteSession(sessionId);
    if (deleted) coordination.onSessionClosed(sessionId);
    return deleted;
  },
};
const server = await createRegistryServer({
  token,
  store: registry,
  coordination,
  router,
  providers,
  sessions,
  clock,
});
```

- [ ] **Step 7: Coordinate registration and session deletion**

`runtime.register` delegates to `sessions.registerSession`; `runtime.deleteSession` delegates to `sessions.deleteSession`. Registration and deletion therefore use exactly the same lifecycle path whether invoked in tests or through HTTP. No `await` occurs between registry mutation and coordination binding/cleanup, so another request cannot observe a partially coordinated close.

`runtime.sweep` must:

```ts
const expiredSessions = registry.expireLeases();
for (const sessionId of expiredSessions) coordination.onSessionClosed(sessionId);
coordination.expireDeadlines();
coordination.expireWorkerLaunches();
```

Notify waiters only after each synchronous database transition commits.

- [ ] **Step 8: Define empty shutdown and close order**

Use:

```ts
isEmpty(): boolean {
  return registry.countSessions() === 0 && coordination.countRetainedTasks() === 0;
}
```

The existing 30-second grace timer starts only when `isEmpty()` is true. Close in this order:

1. stop sweep and empty timers;
2. stop accepting HTTP and await open request closure;
3. close router/notifier waiters;
4. close coordination/task store without closing injected database;
5. close registry without closing injected database;
6. close the database once;
7. remove this daemon's discovery record.

- [ ] **Step 9: Publish protocol-v2 discovery and preserve detached startup recovery**

Keep `ensureDaemon` behavior unchanged except protocol version 2. Add an E2E assertion to `packages/client/test/e2e.test.ts`:

```ts
const record = JSON.parse(await readFile(harness.paths.discoveryFile, "utf8"));
expect(record.protocolVersion).toBe(2);
```

Kill/restart recovery must produce a new reporter `sessionId` and a new `taskCapability`, while restoring only the registry snapshot. Do not reconstruct A2A tasks.

- [ ] **Step 10: Run daemon and existing real-process tests**

Run:

```bash
npx vitest run packages/registry/test/daemon-coordination.test.ts packages/client/test/e2e.test.ts
npm run typecheck
npm run build
```

Expected: lifecycle tests PASS, detached daemon recovery still passes, protocol-v2 discovery is published, and no open-handle warning appears.

---

### Task 9: Official SDK End-to-End, Concurrency, Privacy, and Documentation

**Files:**
- Create: `packages/registry/test/a2a-e2e.test.ts`
- Modify: `packages/client/test/e2e.test.ts`
- Modify: `packages/registry/test/a2a-http.test.ts`
- Modify: `packages/registry/test/adapter-http.test.ts`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: the complete daemon core, official SDK REST client, fake delivery adapters, fake WorkerProvider, and existing runtime privacy checks.
- Produces: acceptance-level proof that A2A 1.0 clients interoperate, claims are exactly once under load, restart is explicit, task content stays off disk, and deferred Pi/Claude scope is documented.

- [ ] **Step 1: Write a real HTTP vertical-slice test using the official SDK client**

Create `packages/registry/test/a2a-e2e.test.ts`. Build an authenticated SDK client:

```ts
import {
  ClientFactory,
  ClientFactoryOptions,
  DefaultAgentCardResolver,
  RestTransportFactory,
  ServiceParameters,
  createAuthenticatingFetchWithRetry,
  withA2AExtensions,
} from "@a2a-js/sdk/client";
import { Role, TaskState, type SendMessageRequest, type Task } from "@a2a-js/sdk";

function authenticatedFetch(token: string): typeof fetch {
  return createAuthenticatingFetchWithRetry(fetch, {
    headers: async () => ({ Authorization: `Bearer ${token}` }),
    shouldRetryWithHeaders: async () => undefined,
  });
}

const factory = new ClientFactory(ClientFactoryOptions.createFrom(
  ClientFactoryOptions.default,
  {
    transports: [new RestTransportFactory({ fetchImpl: authenticatedFetch(source.taskCapability) })],
    cardResolver: new DefaultAgentCardResolver({ fetchImpl: authenticatedFetch(source.taskCapability) }),
  },
));
const client = await factory.createFromUrl(runtime.server.url);
const options = {
  serviceParameters: ServiceParameters.create(
    withA2AExtensions(LOCAL_COORDINATION_EXTENSION),
  ),
};
const request: SendMessageRequest = {
  tenant: "",
  message: {
    messageId: "source-message-1",
    contextId: "",
    taskId: "",
    role: Role.ROLE_USER,
    parts: [
      {
        content: {
          $case: "data",
          value: {
            kind: "coordination.target",
            target: { type: "session", sessionId: target.sessionId },
          },
        },
        metadata: undefined,
        filename: "",
        mediaType: "application/json",
      },
      {
        content: { $case: "text", value: "private-a2a-fixture" },
        metadata: undefined,
        filename: "",
        mediaType: "text/plain",
      },
    ],
    metadata: undefined,
    extensions: [LOCAL_COORDINATION_EXTENSION],
    referenceTaskIds: [],
  },
  configuration: {
    acceptedOutputModes: ["text/plain", "application/json"],
    taskPushNotificationConfig: undefined,
    historyLength: 10,
    returnImmediately: true,
  },
  metadata: undefined,
};

const sent = await client.sendMessage(request, options) as Task;
expect(sent.status?.state).toBe(TaskState.TASK_STATE_SUBMITTED);

const targetTransport = new CoordinationTransport({
  baseUrl: runtime.server.url,
  sessionId: target.sessionId,
  taskCapability: target.taskCapability,
});
const claim = await targetTransport.claim({ waitSeconds: 0 });
expect(claim?.taskId).toBe(sent.id);
await targetTransport.accept(claim!.deliveryId);
await targetTransport.complete(sent.id, claim!.deliveryId, {
  message: {
    messageId: "target-result-1",
    parts: [{ kind: "text", text: "done", mediaType: "text/plain" }],
  },
});

const completed = await client.getTask({ tenant: "", id: sent.id }, options);
expect(completed.status?.state).toBe(TaskState.TASK_STATE_COMPLETED);
expect(completed.history.at(-1)?.parts[0]?.content).toEqual({
  $case: "text",
  value: "done",
});
```

- [ ] **Step 2: Run the SDK E2E test red, then fix only protocol mismatches**

Run:

```bash
npx vitest run packages/registry/test/a2a-e2e.test.ts
```

Expected initially: FAIL on any mismatch between hand-built REST JSON/headers and SDK 1.0 behavior. Fix serialization, query names, content type, Agent Card shape, or ErrorInfo mapping in the mapper/HTTP files; do not weaken ownership, privacy, or size checks.

Re-run until PASS.

- [ ] **Step 3: Add blocking-send and disconnect tests**

Add these tests using the Step 1 fixture and request builder:

```ts
it("holds a blocking SendMessage until the target completes", async () => {
  const f = await sdkFixture();
  const pending = f.client.sendMessage(
    { ...f.request, configuration: { ...f.request.configuration!, returnImmediately: false } },
    f.options,
  );
  const claim = await f.targetTransport.claim({ waitSeconds: 1 });
  await f.targetTransport.accept(claim!.deliveryId);
  await f.targetTransport.complete(claim!.taskId, claim!.deliveryId, {
    message: {
      messageId: "blocking-result",
      parts: [{ kind: "text", text: "finished", mediaType: "text/plain" }],
    },
  });
  const result = await pending as Task;
  expect(result.status?.state).toBe(TaskState.TASK_STATE_COMPLETED);
});

it("aborting a blocking HTTP waiter does not cancel its task", async () => {
  const f = await sdkFixture();
  const abort = new AbortController();
  const pending = f.client.sendMessage(
    { ...f.request, configuration: { ...f.request.configuration!, returnImmediately: false } },
    { ...f.options, signal: abort.signal },
  );
  const claim = await f.targetTransport.claim({ waitSeconds: 1 });
  abort.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });

  const current = await f.client.getTask({ tenant: "", id: claim!.taskId }, f.options);
  expect(current.status?.state).toBe(TaskState.TASK_STATE_WORKING);
  await f.targetTransport.fail(claim!.taskId, claim!.deliveryId, {
    code: "TEST_CLEANUP",
    message: "end aborted waiter fixture",
  });
});
```

The abort handler must remove only the HTTP waiter; task cancellation still requires `CancelTask`.

Run:

```bash
npx vitest run packages/registry/test/a2a-e2e.test.ts -t "blocking|disconnect"
```

Expected: both tests PASS without leaked waiters.

- [ ] **Step 4: Add exact concurrent-claim stress coverage**

Register one idle target and queue 50 tasks from 50 sources. Use this exact stress shape:

```ts
const expectedTaskIds: string[] = [];
for (let index = 0; index < 50; index += 1) {
  const source = runtime.register(testRegistration(`source-${index}`, false));
  const task = runtime.coordination.createExistingSessionTask(
    source.sessionId,
    taskInput(target.sessionId, `message-${index}`),
  );
  expectedTaskIds.push(task.id);
}

const firstWave = (await Promise.all(
  Array.from({ length: 50 }, () => targetTransport.claim({ waitSeconds: 1 })),
)).filter((claim): claim is ClaimedDelivery => claim !== undefined);
expect(firstWave).toHaveLength(1);
expect(new Set(firstWave.map((claim) => claim.deliveryId)).size).toBe(1);

const observedTaskIds = [firstWave[0]!.taskId];
await targetTransport.complete(firstWave[0]!.taskId, firstWave[0]!.deliveryId, {
  message: resultAdapterMessage("result-0"),
});
for (let index = 1; index < 50; index += 1) {
  const claim = await targetTransport.claim({ waitSeconds: 1 });
  observedTaskIds.push(claim!.taskId);
  await targetTransport.complete(claim!.taskId, claim!.deliveryId, {
    message: resultAdapterMessage(`result-${index}`),
  });
}
expect(observedTaskIds).toEqual(expectedTaskIds);
expect(new Set(observedTaskIds).size).toBe(50);
```

Add a cancellation/claim race loop:

```ts
for (let index = 0; index < 100; index += 1) {
  const source = runtime.register(testRegistration(`race-${index}`, false));
  const task = runtime.coordination.createExistingSessionTask(
    source.sessionId,
    taskInput(target.sessionId, `race-message-${index}`),
  );
  await Promise.allSettled([
    targetTransport.claim({ waitSeconds: 0 }),
    Promise.resolve().then(() => runtime.coordination.cancelTask(source.sessionId, task.id)),
  ]);
  const final = runtime.coordination.getTask(source.sessionId, task.id)!;
  expect(["working", "canceled"]).toContain(final.state);
  expect(runtime.tasks.listMessages(task.id).filter((message) => message.role === "target")).toHaveLength(0);
  if (final.state === "working") await targetTransport.acknowledgeCanceled(task.id);
}
```

Expose `tasks: TaskStore` on the injectable `DaemonRuntime` composition object for diagnostics and tests; it is never serialized through HTTP or the Agent Card.

- [ ] **Step 5: Add managed-worker HTTP acceptance with a fake provider**

Add this vertical slice with a fake provider that records `lastRequest`:

```ts
const runtime = await createDaemonRuntime({
  ...testOptions(),
  providers: [fakeProvider],
});
const source = runtime.register(testRegistration("worker-source", false));
const { client, options } = await sdkClient(runtime.server.url, source.taskCapability);
const sent = await client.sendMessage(workerRequest({
  provider: "test-provider",
  cwd: "/repo",
  options: { model: "test" },
}), options) as Task;
await fakeProvider.started;

const launchToken = fakeProvider.lastRequest!.launchToken;
const worker = runtime.register({
  ...testRegistration("managed-worker", true),
  launchToken,
});
const workerTransport = new CoordinationTransport({
  baseUrl: runtime.server.url,
  sessionId: worker.sessionId,
  taskCapability: worker.taskCapability,
});
const claim = await workerTransport.claim({ waitSeconds: 1 });
await workerTransport.complete(sent.id, claim!.deliveryId, {
  message: resultAdapterMessage("worker-result"),
});
expect((await client.getTask({ tenant: "", id: sent.id }, options)).status?.state)
  .toBe(TaskState.TASK_STATE_COMPLETED);
expect(() => runtime.register({
  ...testRegistration("token-reuse", true),
  launchToken,
})).toThrowError("Launch token is invalid or expired");

const cardText = await (await fetch(`${runtime.server.url}/.well-known/agent-card.json`)).text();
expect(cardText).toContain("start-managed-worker");
expect(cardText).not.toContain("test-provider");
expect(JSON.stringify(await client.getTask({ tenant: "", id: sent.id }, options)))
  .not.toContain("model");
```

Add a second fake provider whose `start` rejects; poll `GetTask` until it returns `TASK_STATE_FAILED` and assert task metadata contains only `terminalCode: "WORKER_START_FAILED"`.

- [ ] **Step 6: Add restart/stale-ID and filesystem privacy tests**

Add the stale-instance test:

```ts
const runtimeA = await createDaemonRuntime(testOptions());
const sourceA = runtimeA.register(testRegistration("source-a", false));
const targetA = runtimeA.register(testRegistration("target-a", true));
const oldTask = runtimeA.coordination.createExistingSessionTask(
  sourceA.sessionId,
  taskInput(targetA.sessionId, "private-a2a-fixture"),
);
await runtimeA.close();

const runtimeB = await createDaemonRuntime(testOptions());
const sourceB = runtimeB.register(testRegistration("source-b", false));
const stale = await fetch(`${runtimeB.server.url}/tasks/${encodeURIComponent(oldTask.id)}`, {
  headers: {
    authorization: `Bearer ${sourceB.taskCapability}`,
    "A2A-Version": "1.0",
    accept: "application/a2a+json",
  },
});
expect(stale.status).toBe(404);
expect(await stale.json()).toMatchObject({
  error: {
    details: [{
      reason: "TASK_NOT_FOUND",
      domain: "a2a-protocol.org",
      metadata: { reason: "coordinator_restarted" },
    }],
  },
});
await runtimeB.close();
```

In the detached-daemon fixture, use task text `private-a2a-fixture` and DataPart value `private-data-fixture`, then inspect all runtime files:

```ts
const fileContents = await Promise.all(
  (await readdir(paths.directory)).map((name) => readFile(join(paths.directory, name), "utf8")),
);
const serialized = fileContents.join("\n");
expect(serialized).not.toContain("private-a2a-fixture");
expect(serialized).not.toContain("private-data-fixture");
expect(serialized).not.toContain(source.taskCapability);
expect(serialized).not.toContain(target.taskCapability);
```

Before the fake target emits a visible harness event, assert:

```ts
expect(runtime.registry.searchEvents(target.sessionId, '"private-a2a-fixture"', 10)).toEqual([]);
```

Then append one normal `message.user` event containing that text and assert the existing search API finds it. This proves only the adapter's visible transcript event, not the task service, enters FTS.

- [ ] **Step 7: Add regression assertions for existing Pi behavior**

In `packages/pi-extension/test/adapter.test.ts`, assert reporter construction metadata contains:

```ts
acceptsTaskDelivery: false,
```

In `packages/client/test/e2e.test.ts`, retain all existing two-session query, close deletion, daemon recovery, 50-reporter load, and runtime privacy assertions. Add no A2A tool to Pi in this phase.

- [ ] **Step 8: Document the local coordination core and its boundaries**

Add these README sections:

```markdown
## Local A2A coordination core

The daemon publishes an A2A 1.0 HTTP+JSON Agent Card on loopback and supports
SendMessage, GetTask, ListTasks, and CancelTask for authenticated local sessions.
Tasks and results are ephemeral and disappear with their source session or a
daemon restart.

The required `urn:agent-session-registry:extension:local-coordination:v1`
extension selects either an explicitly named delivery-capable session or an
installed managed-worker provider. The coordinator never chooses a target
implicitly.

## Current delivery support

The coordination core and private adapter API are available, but the Pi adapter
continues to advertise `acceptsTaskDelivery: false`. Real Pi prompt injection,
Pi worker launch, Claude Code hooks, Claude MCP tools, and Claude worker launch
require their separately approved adapter designs.

## A2A privacy and limits

Only TextPart and bounded structured DataPart content are accepted. File/media
parts, remote transport, persistence, streaming, push notifications, and
extended Agent Cards are not supported. Task content, capabilities, and queues
remain in the daemon's in-memory SQLite database and are never written to the
runtime directory.
```

Update troubleshooting to state that daemon restart intentionally invalidates active A2A task IDs and callers must resubmit.

- [ ] **Step 9: Run final quality gates and inspect invariants**

Run:

```bash
npm test
npm run typecheck
npm run build
rg -n 'new DatabaseSync' packages/registry/src
rg -n 'listen\(' packages/registry/src
rg -n '/v1/' packages --glob '!**/dist/**'
```

Expected:

- all tests PASS with no open handles;
- typecheck and build exit 0;
- the only production SQLite filename is `":memory:"`;
- the daemon still listens only on `127.0.0.1`;
- no production private route contains `/v1/`;
- official SDK E2E, 50-task FIFO stress, restart, redaction, and existing registry/Pi regressions all pass.

- [ ] **Step 10: Review the final working tree against the approved scope**

Run:

```bash
git status --short
git diff --stat
git diff -- README.md packages docs/superpowers/specs/2026-07-24-local-a2a-coordination-core-design.md
```

Expected: changes are limited to protocol-v2 migration, coordination core, tests, dependency lockfile, and README. There is no Pi inbound delivery, Claude Code integration, MCP server, remote binding, disk persistence, vector search, dashboard, or file-transfer implementation.
