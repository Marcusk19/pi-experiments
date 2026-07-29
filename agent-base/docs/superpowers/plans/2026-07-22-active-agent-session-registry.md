# Active Agent Session Registry Implementation Plan

> **For agentic workers:** This plan is documentation only. Do not automatically invoke implementation subskills. If the user explicitly requests execution, ask them to choose an execution skill first. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Pi extension and in-memory registry that automatically tracks active agent sessions and exposes their bounded transcript evidence through one read-only LLM tool.

**Architecture:** A TypeScript npm workspace separates harness-neutral contracts, a loopback HTTP registry backed by in-memory SQLite/FTS5, a reusable daemon client/session reporter, and a thin Pi adapter. The adapter captures finalized visible messages and tool status without blocking Pi; the registry owns leases, deletion, ranking, and output budgets.

**Tech Stack:** Node.js 22.19 or newer, TypeScript 5.9, npm workspaces, TypeBox 1.1, `node:http`, `node:sqlite`, Vitest 3, Pi extension API 0.81.

## Global Constraints

- Initial harness support is Pi only; no Claude Code adapter is part of this plan.
- Bind the registry only to `127.0.0.1` on a dynamic port and authenticate every `/v1` endpoint with a random bearer token.
- Keep all transcript content in an in-memory SQLite database; never write transcript text, query excerpts, retry queues, or tool-result spill files to disk.
- Capture user text, visible assistant text, assistant stop/error status, tool name/status/timing, and session state only.
- Exclude thinking blocks, images, tool arguments, raw tool output, provider payloads, and authentication material.
- Heartbeat every 10 seconds, expire leases after 45 seconds, and stop an empty daemon after a 30-second grace period.
- Explicit close and lease expiry must atomically delete session metadata, events, and FTS rows.
- Use `node:http`; do not add Express, NestJS, Fastify, an MCP server, vector search, or server-side LLM summarization.
- Default query behavior excludes the calling Pi session and enforces a 40,000-character absolute result ceiling.
- Event capture must not block prompts, model calls, or unrelated tools when the registry is unavailable.
- Use TDD for every behavioral task: red test, minimal implementation, green test, then the task-level suite.

---

## File Structure

The implementation will create the following focused files.

```text
.
├── package.json                         # npm workspace, Pi package manifest, root scripts
├── package-lock.json                    # reproducible dependency graph
├── tsconfig.base.json                   # strict shared compiler settings
├── vitest.config.ts                     # test discovery and process-pool defaults
├── README.md                            # local install, privacy model, manual verification
└── packages
    ├── contracts
    │   ├── package.json                 # harness-neutral package exports
    │   ├── tsconfig.json
    │   ├── src
    │   │   ├── events.ts               # normalized session/event schemas and types
    │   │   ├── api.ts                  # HTTP request/response/error schemas and types
    │   │   └── index.ts                # public contract exports and protocol constant
    │   └── test/contracts.test.ts       # schema acceptance/rejection fixtures
    ├── registry
    │   ├── package.json                 # registry library plus daemon export
    │   ├── tsconfig.json
    │   ├── src
    │   │   ├── clock.ts                # real and injectable clock abstraction
    │   │   ├── errors.ts               # typed domain/HTTP-safe registry errors
    │   │   ├── schema.ts               # in-memory SQLite DDL
    │   │   ├── store.ts                # transactional lifecycle and event ingestion
    │   │   ├── query.ts                # overview/search ranking and result budgets
    │   │   ├── http.ts                 # authenticated validated HTTP routing
    │   │   ├── discovery.ts            # atomic protected discovery-file publication
    │   │   ├── daemon.ts               # process entry point, timers, graceful shutdown
    │   │   └── index.ts                # testable public registry exports
    │   └── test
    │       ├── store.test.ts            # registration, sequence, deletion, lease tests
    │       ├── query.test.ts            # FTS, overview signals, exclusion, budget tests
    │       └── http.test.ts             # auth, validation, size, and redacted-log tests
    ├── client
    │   ├── package.json                 # reusable adapter-side client exports
    │   ├── tsconfig.json
    │   ├── src
    │   │   ├── paths.ts                # protected runtime paths
    │   │   ├── discovery.ts            # health validation and startup lock
    │   │   ├── transport.ts            # typed bounded HTTP transport
    │   │   ├── daemon.ts               # detached spawn and readiness orchestration
    │   │   ├── reporter.ts             # queue, batching, heartbeat, recovery, close
    │   │   └── index.ts                # client public exports
    │   └── test
    │       ├── discovery.test.ts        # stale file and concurrent startup behavior
    │       ├── transport.test.ts        # protocol/error/timeout mapping
    │       └── reporter.test.ts         # non-blocking queue and snapshot recovery
    └── pi-extension
        ├── package.json                 # Pi peer dependencies and extension export
        ├── tsconfig.json
        ├── src
        │   ├── normalize.ts             # Pi messages/entries to normalized snapshots
        │   ├── tool.ts                  # query_active_sessions definition/formatting
        │   ├── adapter.ts               # Pi lifecycle wiring with injectable reporter
        │   └── index.ts                 # default Pi extension factory
        └── test
            ├── normalize.test.ts        # capture-policy fixtures
            ├── adapter.test.ts          # lifecycle event wiring with fakes
            └── tool.test.ts             # query defaults, limits, and failures
```

The four packages form one vertical slice rather than independent subprojects: `contracts` is consumed by all later tasks, `registry` implements the contract, `client` connects adapters to it, and `pi-extension` proves the harness boundary.

---

### Task 1: Workspace and Harness-Neutral Contracts

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/events.ts`
- Create: `packages/contracts/src/api.ts`
- Create: `packages/contracts/src/index.ts`
- Test: `packages/contracts/test/contracts.test.ts`

**Interfaces:**
- Consumes: no project code.
- Produces: `PROTOCOL_VERSION`, `SessionMetadataSchema`, `NormalizedEventSchema`, `SnapshotSchema`, all `/v1` request/response schemas, `ApiErrorSchema`, and their `Static<>` types from `@agent-session/contracts`.

- [ ] **Step 1: Add the workspace and strict TypeScript configuration**

Create `package.json` with a local Pi package manifest and reproducible scripts:

```json
{
  "name": "agent-session-registry",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.19.0" },
  "workspaces": ["packages/*"],
  "files": ["packages/*/dist", "packages/*/package.json", "README.md"],
  "scripts": {
    "build": "tsc -b packages/*",
    "typecheck": "tsc -b packages/* --pretty false",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepare": "npm run build"
  },
  "pi": { "extensions": ["./packages/pi-extension/dist/index.js"] },
  "peerDependencies": {
    "@earendil-works/pi-ai": "*",
    "@earendil-works/pi-coding-agent": "*",
    "typebox": "*"
  },
  "devDependencies": {
    "@earendil-works/pi-ai": "^0.81.1",
    "@earendil-works/pi-coding-agent": "^0.81.1",
    "@types/node": "^22.15.0",
    "typebox": "^1.1.38",
    "typescript": "^5.9.3",
    "vitest": "^3.2.4"
  }
}
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true
  }
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    pool: "forks",
    testTimeout: 5_000,
    restoreMocks: true,
  },
});
```

Run `npm install --ignore-scripts`. Expected: `package-lock.json` is created and installation finishes without peer-dependency errors; the root `prepare` build is intentionally deferred until the package sources exist.

- [ ] **Step 2: Write failing contract validation tests**

Create `packages/contracts/test/contracts.test.ts` with concrete positive and privacy-boundary fixtures:

```ts
import { Check } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
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
```

- [ ] **Step 3: Run the contract test to verify it fails**

Run: `npx vitest run packages/contracts/test/contracts.test.ts`

Expected: FAIL because `packages/contracts/src/index.ts` and exported schemas do not exist.

- [ ] **Step 4: Implement normalized event schemas**

Create `packages/contracts/src/events.ts`. Use `additionalProperties: false` on every externally supplied object. Define:

```ts
import { Type, type Static } from "typebox";

const strict = { additionalProperties: false } as const;
const eventBase = {
  eventId: Type.String({ minLength: 1, maxLength: 128 }),
  sequence: Type.Integer({ minimum: 1 }),
  timestamp: Type.Integer({ minimum: 0 }),
};

export const SessionStateSchema = Type.Union([
  Type.Literal("idle"),
  Type.Literal("running"),
]);
export type SessionState = Static<typeof SessionStateSchema>;

export const SessionMetadataSchema = Type.Object({
  adapter: Type.String({ minLength: 1, maxLength: 64 }),
  adapterVersion: Type.String({ minLength: 1, maxLength: 64 }),
  harnessSessionId: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
  cwd: Type.String({ minLength: 1, maxLength: 4096 }),
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
  processId: Type.Integer({ minimum: 1 }),
  startedAt: Type.Integer({ minimum: 0 }),
  state: SessionStateSchema,
}, strict);
export type SessionMetadata = Static<typeof SessionMetadataSchema>;

const UserMessageEvent = Type.Object({
  ...eventBase,
  type: Type.Literal("message.user"),
  text: Type.String({ maxLength: 65_536 }),
}, strict);
const AssistantMessageEvent = Type.Object({
  ...eventBase,
  type: Type.Literal("message.assistant"),
  text: Type.String({ maxLength: 65_536 }),
  stopStatus: Type.Union([
    Type.Literal("stop"), Type.Literal("length"), Type.Literal("toolUse"),
    Type.Literal("error"), Type.Literal("aborted"),
  ]),
  error: Type.Optional(Type.Boolean()),
}, strict);
const ToolActivityEvent = Type.Object({
  ...eventBase,
  type: Type.Literal("tool.activity"),
  toolCallId: Type.String({ minLength: 1, maxLength: 256 }),
  toolName: Type.String({ minLength: 1, maxLength: 256 }),
  status: Type.Union([
    Type.Literal("running"), Type.Literal("succeeded"), Type.Literal("failed"),
  ]),
  startedAt: Type.Integer({ minimum: 0 }),
  endedAt: Type.Optional(Type.Integer({ minimum: 0 })),
}, strict);
const SessionStateEvent = Type.Object({
  ...eventBase,
  type: Type.Literal("session.state"),
  state: SessionStateSchema,
}, strict);

export const NormalizedEventSchema = Type.Union([
  UserMessageEvent, AssistantMessageEvent, ToolActivityEvent, SessionStateEvent,
]);
export type NormalizedEvent = Static<typeof NormalizedEventSchema>;

export const SnapshotSchema = Type.Object({
  lastSequence: Type.Integer({ minimum: 0 }),
  events: Type.Array(NormalizedEventSchema, { maxItems: 10_000 }),
}, strict);
export type Snapshot = Static<typeof SnapshotSchema>;
```

- [ ] **Step 5: Implement API schemas and exports**

Create `packages/contracts/src/api.ts` with strict schemas for the seven endpoints. The exact public shapes are:

```ts
import { Type, type Static } from "typebox";
import { NormalizedEventSchema, SessionMetadataSchema, SessionStateSchema, SnapshotSchema } from "./events.js";

const strict = { additionalProperties: false } as const;
export const UuidSchema = Type.String({ pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" });
export const RegisterSessionRequestSchema = Type.Object({ metadata: SessionMetadataSchema, snapshot: SnapshotSchema }, strict);
export const RegisterSessionResponseSchema = Type.Object({ sessionId: UuidSchema, leaseExpiresAt: Type.Integer() }, strict);
export const AppendEventsRequestSchema = Type.Object({ expectedSequence: Type.Integer({ minimum: 0 }), events: Type.Array(NormalizedEventSchema, { minItems: 1, maxItems: 100 }) }, strict);
export const SequenceResponseSchema = Type.Object({ acceptedSequence: Type.Integer({ minimum: 0 }) }, strict);
export const HeartbeatRequestSchema = Type.Object({ state: SessionStateSchema, lastActivityAt: Type.Integer({ minimum: 0 }), name: Type.Optional(Type.Union([Type.String({ minLength: 1, maxLength: 512 }), Type.Null()])) }, strict);
export const ReplaceSnapshotRequestSchema = SnapshotSchema;
export const QueryRequestSchema = Type.Object({
  query: Type.String({ minLength: 1, maxLength: 2_000 }),
  mode: Type.Optional(Type.Union([Type.Literal("overview"), Type.Literal("search")])),
  excludeSessionId: Type.Optional(UuidSchema),
  cwd: Type.Optional(Type.String({ maxLength: 4096 })),
  sessionIds: Type.Optional(Type.Array(UuidSchema, { maxItems: 50 })),
  maxSessions: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
  maxExcerptsPerSession: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
  maxCharacters: Type.Optional(Type.Integer({ minimum: 1_000, maximum: 40_000 })),
}, strict);
export const ExcerptSchema = Type.Object({ eventId: Type.String(), kind: Type.String(), text: Type.String(), timestamp: Type.Integer(), score: Type.Optional(Type.Number()) }, strict);
export const QuerySessionSchema = Type.Object({ sessionId: UuidSchema, metadata: SessionMetadataSchema, lastActivityAt: Type.Integer(), transcriptCompleteness: Type.Union([Type.Literal("complete"), Type.Literal("truncated")]), signals: Type.Array(Type.String()), excerpts: Type.Array(ExcerptSchema) }, strict);
export const QueryResponseSchema = Type.Object({ mode: Type.Union([Type.Literal("overview"), Type.Literal("search")]), sessions: Type.Array(QuerySessionSchema), truncated: Type.Boolean() }, strict);
export const HealthResponseSchema = Type.Object({ protocolVersion: Type.Literal(1), pid: Type.Integer(), startedAt: Type.Integer() }, strict);
export const ApiErrorSchema = Type.Object({ error: Type.Object({ code: Type.String(), message: Type.String() }, strict) }, strict);

export type RegisterSessionRequest = Static<typeof RegisterSessionRequestSchema>;
export type RegisterSessionResponse = Static<typeof RegisterSessionResponseSchema>;
export type AppendEventsRequest = Static<typeof AppendEventsRequestSchema>;
export type SequenceResponse = Static<typeof SequenceResponseSchema>;
export type HeartbeatRequest = Static<typeof HeartbeatRequestSchema>;
export type ReplaceSnapshotRequest = Static<typeof ReplaceSnapshotRequestSchema>;
export type QueryRequest = Static<typeof QueryRequestSchema>;
export type QueryResponse = Static<typeof QueryResponseSchema>;
export type HealthResponse = Static<typeof HealthResponseSchema>;
export type ApiError = Static<typeof ApiErrorSchema>;
```

Create `packages/contracts/src/index.ts`:

```ts
export const PROTOCOL_VERSION = 1 as const;
export * from "./events.js";
export * from "./api.js";
```

Add the package manifest and project reference:

```json
{
  "name": "@agent-session/contracts",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "peerDependencies": { "typebox": "*" }
}
```

`packages/contracts/tsconfig.json` must extend `../../tsconfig.base.json`, set `rootDir` to `src`, `outDir` to `dist`, and include `src/**/*.ts`.

- [ ] **Step 6: Run contract and type checks**

Run: `npm install --ignore-scripts && npx vitest run packages/contracts/test/contracts.test.ts && npm run typecheck`

Expected: the three contract tests PASS and TypeScript exits with code 0.

---

### Task 2: Transactional Registry Lifecycle and Event Ingestion

**Files:**
- Create: `packages/registry/package.json`
- Create: `packages/registry/tsconfig.json`
- Create: `packages/registry/src/clock.ts`
- Create: `packages/registry/src/errors.ts`
- Create: `packages/registry/src/schema.ts`
- Create: `packages/registry/src/store.ts`
- Create: `packages/registry/src/index.ts`
- Test: `packages/registry/test/store.test.ts`

**Interfaces:**
- Consumes: `RegisterSessionRequest`, `AppendEventsRequest`, `HeartbeatRequest`, `Snapshot`, and response types from `@agent-session/contracts`.
- Produces: `RegistryStore`, `RegistryError`, `Clock`, `SystemClock`, `SessionRow`, and constants `LEASE_MS = 45_000`, `MAX_SESSION_TEXT_BYTES = 10_485_760`, `MAX_DATABASE_BYTES = 268_435_456`.

- [ ] **Step 1: Write failing lifecycle tests with an injectable clock**

Create `packages/registry/test/store.test.ts` covering one behavior per test:

```ts
import { describe, expect, it } from "vitest";
import { RegistryError, RegistryStore } from "../src/index.js";

const clock = { now: () => 1_000 };
const registration = {
  metadata: { adapter: "pi", adapterVersion: "0.1.0", harnessSessionId: "h1", cwd: "/repo", processId: 7, startedAt: 900, state: "idle" as const },
  snapshot: { lastSequence: 1, events: [{ type: "message.user" as const, eventId: "u1", sequence: 1, timestamp: 950, text: "fix auth" }] },
};

describe("RegistryStore", () => {
  it("registers and deletes a complete session atomically", () => {
    const store = new RegistryStore({ clock });
    const { sessionId } = store.register(registration);
    expect(store.getSession(sessionId)?.latestSequence).toBe(1);
    expect(store.deleteSession(sessionId)).toBe(true);
    expect(store.getSession(sessionId)).toBeUndefined();
    expect(store.countSearchRows(sessionId)).toBe(0);
  });

  it("accepts an idempotent duplicate batch but rejects a gap", () => {
    const store = new RegistryStore({ clock });
    const { sessionId } = store.register(registration);
    const batch = { expectedSequence: 1, events: [{ type: "session.state" as const, eventId: "s2", sequence: 2, timestamp: 1_000, state: "running" as const }] };
    expect(store.appendEvents(sessionId, batch).acceptedSequence).toBe(2);
    expect(store.appendEvents(sessionId, batch).acceptedSequence).toBe(2);
    expect(() => store.appendEvents(sessionId, { expectedSequence: 4, events: [{ ...batch.events[0], eventId: "s5", sequence: 5 }] })).toThrowError(RegistryError);
  });

  it("expires a lease and all transcript rows", () => {
    let now = 1_000;
    const store = new RegistryStore({ clock: { now: () => now } });
    const { sessionId } = store.register(registration);
    now = 46_001;
    expect(store.expireLeases()).toEqual([sessionId]);
    expect(store.getSession(sessionId)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the store tests to verify they fail**

Run: `npx vitest run packages/registry/test/store.test.ts`

Expected: FAIL because `RegistryStore` is not defined.

- [ ] **Step 3: Define the clock, domain errors, and in-memory schema**

Create `clock.ts` with `Clock { now(): number }` and `SystemClock`. Create `errors.ts` with a `RegistryError` carrying one of `NOT_FOUND`, `SEQUENCE_GAP`, `LIMIT_EXCEEDED`, or `INVALID_EVENT_SEQUENCE` plus an HTTP status.

Create `schema.ts` exporting `createDatabase(): DatabaseSync`. It must open only `":memory:"`, enable foreign keys, and create:

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  metadata_json TEXT NOT NULL,
  state TEXT NOT NULL,
  latest_sequence INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  lease_expires_at INTEGER NOT NULL,
  completeness TEXT NOT NULL DEFAULT 'complete',
  text_bytes INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE events (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  searchable_text TEXT,
  text_bytes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, event_id),
  UNIQUE (session_id, sequence)
);
CREATE VIRTUAL TABLE event_search USING fts5(session_id UNINDEXED, event_id UNINDEXED, body);
CREATE INDEX events_session_sequence ON events(session_id, sequence);
```

Do not enable WAL or create a filename-backed database.

- [ ] **Step 4: Implement registration, ingestion, heartbeat, snapshot replacement, and deletion**

Implement `RegistryStore` with explicit `BEGIN IMMEDIATE`/`COMMIT` transactions and rollback on errors. Its public signatures must be:

```ts
export class RegistryStore {
  constructor(options?: { clock?: Clock; database?: DatabaseSync; leaseMs?: number });
  register(request: RegisterSessionRequest): RegisterSessionResponse;
  appendEvents(sessionId: string, request: AppendEventsRequest): SequenceResponse;
  heartbeat(sessionId: string, request: HeartbeatRequest): { leaseExpiresAt: number };
  replaceSnapshot(sessionId: string, snapshot: Snapshot): SequenceResponse;
  markTruncated(sessionId: string): void;
  deleteSession(sessionId: string): boolean;
  expireLeases(): string[];
  getSession(sessionId: string): SessionRow | undefined;
  countSessions(): number;
  countSearchRows(sessionId: string): number;
  close(): void;
}
```

Centralize event insertion in one private method. It must verify snapshot sequences are unique and contiguous from 1 through `lastSequence`; append batches must start at `expectedSequence + 1`. Insert only user/assistant text into `event_search`. Before commit, enforce 10 MiB searchable text per session using UTF-8 byte counts and a 256 MiB total SQLite ceiling using `PRAGMA page_count * PRAGMA page_size`. On a limit violation, roll back, update the session completeness to `truncated` in a separate transaction, and throw `LIMIT_EXCEEDED`.

For duplicate retries where `expectedSequence < latest_sequence`, return success only when every supplied `(event_id, sequence)` already exists unchanged. Otherwise throw `SEQUENCE_GAP`. Heartbeat must update the separate state/activity columns and `metadata_json`; a `name: null` value removes the name while an omitted name leaves it unchanged. Every deletion path must explicitly remove matching `event_search` rows because FTS virtual tables do not participate in foreign-key cascades.

- [ ] **Step 5: Add registry package exports and build references**

Set `@agent-session/registry` dependencies to `@agent-session/contracts: "0.1.0"` and peer `typebox: "*"`. Export `.` from `dist/index.js` and `./daemon` from `dist/daemon.js`. Add a TypeScript project reference to `../contracts`, export the lifecycle symbols from `src/index.ts`, then run `npm install --ignore-scripts` to record the new workspace in `package-lock.json`.

- [ ] **Step 6: Run lifecycle tests and inspect the database path invariant**

Run: `npx vitest run packages/registry/test/store.test.ts && rg -n "new DatabaseSync" packages/registry/src`

Expected: all lifecycle tests PASS; the only production constructor argument shown by `rg` is `":memory:"`.

---

### Task 3: Bounded Overview and FTS5 Query Engine

**Files:**
- Create: `packages/registry/src/query.ts`
- Modify: `packages/registry/src/store.ts`
- Modify: `packages/registry/src/index.ts`
- Test: `packages/registry/test/query.test.ts`

**Interfaces:**
- Consumes: `RegistryStore` read access and `QueryRequest`/`QueryResponse`.
- Produces: `queryActiveSessions(store, request, now): QueryResponse`, `resolveQueryMode(query, explicitMode)`, and store read methods `listSessionRows`, `recentEvents`, `searchEvents`, and `latestToolStates`.

- [ ] **Step 1: Write failing query tests**

Create fixtures for three sessions and assert these exact behaviors:

```ts
it("uses overview for a generic attention query and excludes the caller", () => {
  const result = queryActiveSessions(store, {
    query: "what needs my attention?",
    excludeSessionId: callerId,
    maxCharacters: 4_000,
  }, 100_000);
  expect(result.mode).toBe("overview");
  expect(result.sessions.map((s) => s.sessionId)).not.toContain(callerId);
  expect(result.sessions.find((s) => s.sessionId === failedId)?.signals).toContain("tool_failed:bash");
});

it("ranks lexical matches and supplies recent context", () => {
  const result = queryActiveSessions(store, { query: "PROJQUAY-123 authentication", mode: "search" }, 100_000);
  expect(result.sessions[0]?.sessionId).toBe(authSessionId);
  expect(result.sessions[0]?.excerpts.some((e) => e.text.includes("PROJQUAY-123"))).toBe(true);
});

it("never exceeds the requested or absolute character budget", () => {
  const result = queryActiveSessions(store, { query: "sessions", maxCharacters: 1_000 }, 100_000);
  expect(JSON.stringify(result).length).toBeLessThanOrEqual(1_000);
  expect(result.truncated).toBe(true);
});
```

Also test `assistant_error`, `tool_running`, inactivity over five minutes, and `transcript_truncated` signals.

- [ ] **Step 2: Run query tests to verify they fail**

Run: `npx vitest run packages/registry/test/query.test.ts`

Expected: FAIL because `queryActiveSessions` and store read methods do not exist.

- [ ] **Step 3: Add read-only store projections**

Add typed read methods without exposing `DatabaseSync`:

```ts
listSessionRows(filters: { excludeSessionId?: string; cwd?: string; sessionIds?: string[]; limit: number }): SessionRow[];
recentEvents(sessionId: string, limit: number): StoredEvent[];
searchEvents(sessionId: string, ftsQuery: string, limit: number): SearchHit[];
latestToolStates(sessionId: string): Array<{ toolCallId: string; toolName: string; status: "running" | "succeeded" | "failed" }>;
```

`searchEvents` must use a parameterized FTS query and `snippet(event_search, 2, '[', ']', '…', 24)` plus `bm25(event_search)`. Never interpolate user query text into SQL.

- [ ] **Step 4: Implement deterministic mode selection, signals, ranking, and budgeting**

Create `query.ts` with:

- lower-case Unicode tokenization;
- a fixed stop-word set containing generic terms such as `what`, `which`, `session`, `sessions`, `going`, `attention`, `other`, `needs`, `status`, and `currently`;
- overview when no meaningful token remains;
- FTS token quoting and `OR` combination for search;
- BM25 as primary search order and event timestamp as the tie-breaker;
- overview order: error/running signals first, then latest activity;
- defaults of 10 sessions, 3 excerpts per session, and 20,000 characters;
- absolute maxima from the contract: 50 sessions, 10 excerpts, and 40,000 characters.

Use explicit helpers so mode and budget behavior are independently testable:

```ts
export function resolveQueryMode(query: string, explicit?: "overview" | "search"): "overview" | "search";
export function queryActiveSessions(store: RegistryStore, request: QueryRequest, now: number): QueryResponse;

function fitsBudget(response: QueryResponse, maxCharacters: number): boolean {
  return JSON.stringify(response).length <= maxCharacters;
}
```

Build the response incrementally. Measure `JSON.stringify(candidate).length` before accepting each excerpt/session. If an addition would exceed the budget, set `truncated: true` and stop; do not return a response larger than the budget.

- [ ] **Step 5: Run query tests and the registry suite**

Run: `npx vitest run packages/registry/test/query.test.ts packages/registry/test/store.test.ts`

Expected: all registry tests PASS, including exact budget assertions.

---

### Task 4: Authenticated HTTP Service and Daemon Process

**Files:**
- Create: `packages/registry/src/http.ts`
- Create: `packages/registry/src/discovery.ts`
- Create: `packages/registry/src/daemon.ts`
- Modify: `packages/registry/src/index.ts`
- Test: `packages/registry/test/http.test.ts`

**Interfaces:**
- Consumes: all contract schemas, `RegistryStore`, and `queryActiveSessions`.
- Produces: `createRegistryServer(options): RegistryServer`, `writeDiscoveryFile(path, value)`, and executable `@agent-session/registry/daemon`.

- [ ] **Step 1: Write failing HTTP boundary tests**

Start the server on port 0 in each test and assert:

```ts
it("authenticates health and rejects malformed registration", async () => {
  const server = await startTestServer({ token: "test-token" });
  expect((await fetch(`${server.url}/v1/health`)).status).toBe(401);
  expect((await fetch(`${server.url}/v1/health`, { headers: { authorization: "Bearer test-token" } })).status).toBe(200);
  const bad = await fetch(`${server.url}/v1/sessions`, {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify({ metadata: { cwd: "/repo" } }),
  });
  expect(bad.status).toBe(400);
  expect(await bad.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
});
```

Add tests for all seven routes, a 1,048,576-byte request-body ceiling, `SEQUENCE_GAP` as HTTP 409, `NOT_FOUND` as 404, idempotent DELETE as 204, and captured logs that do not contain fixture transcript text or bearer tokens.

- [ ] **Step 2: Run HTTP tests to verify they fail**

Run: `npx vitest run packages/registry/test/http.test.ts`

Expected: FAIL because `createRegistryServer` does not exist.

- [ ] **Step 3: Implement the small authenticated router**

Create `http.ts` using `node:http`. Define:

```ts
export interface RegistryServer {
  url: string;
  port: number;
  close(): Promise<void>;
}
export async function createRegistryServer(options: {
  token: string;
  store: RegistryStore;
  clock?: Clock;
  logger?: (event: { method: string; path: string; status: number; durationMs: number; errorCode?: string }) => void;
}): Promise<RegistryServer>;
```

Before route matching, compare `Authorization` using `timingSafeEqual` on equal-length buffers. Read JSON through a helper that destroys the request and returns 413 after 1 MiB. Validate with `Check(schema, value)` from `typebox/value`; return `INVALID_REQUEST` without echoing invalid data.

Route only the exact methods/paths from the spec. Map `RegistryError` codes to stable HTTP statuses. Logger payloads must contain method, pathname, status, duration, and optional error code only.

- [ ] **Step 4: Implement protected atomic discovery publication**

Create `discovery.ts` with:

```ts
export interface DiscoveryRecord { port: number; pid: number; token: string; protocolVersion: 1; startedAt: number }
export async function writeDiscoveryFile(path: string, record: DiscoveryRecord): Promise<void>;
export async function removeDiscoveryFile(path: string): Promise<void>;
```

Create the parent directory with mode `0o700`, write JSON to a same-directory random temporary file with mode `0o600`, `fsync` it, rename atomically, and remove it on shutdown only if its PID/token still match this daemon.

- [ ] **Step 5: Implement the daemon entry point and timers**

`daemon.ts` must require `AGENT_SESSION_TOKEN` and `AGENT_SESSION_DISCOVERY_FILE`, start on `127.0.0.1:0`, publish discovery only after listening, and install timers:

```ts
const LEASE_SWEEP_MS = 5_000;
const EMPTY_EXIT_MS = 30_000;
```

Every sweep calls `store.expireLeases()`. Start the empty timer only when `store.countSessions() === 0`; cancel it as soon as a session exists. On `SIGINT`, `SIGTERM`, or idle exit: stop timers, close HTTP, close SQLite, remove only this daemon’s discovery record, then exit 0.

- [ ] **Step 6: Run HTTP tests and a real daemon smoke test**

Run: `npx vitest run packages/registry/test/http.test.ts && npm run build`

Then launch the built daemon with a temporary discovery path and token, wait for the file, perform authenticated health, terminate the PID, and assert the discovery file disappears:

```bash
runtime="$(mktemp -d)"
AGENT_SESSION_TOKEN=test-token AGENT_SESSION_DISCOVERY_FILE="$runtime/discovery.json" \
  node packages/registry/dist/daemon.js &
launcher_pid=$!
for _ in $(seq 1 40); do test -f "$runtime/discovery.json" && break; sleep 0.05; done
port="$(node -p "JSON.parse(require('fs').readFileSync('$runtime/discovery.json','utf8')).port")"
curl --fail --silent -H 'Authorization: Bearer test-token' "http://127.0.0.1:$port/v1/health"
kill "$launcher_pid"
for _ in $(seq 1 40); do test ! -f "$runtime/discovery.json" && break; sleep 0.05; done
test ! -f "$runtime/discovery.json"
```

Expected: HTTP 200 with `protocolVersion: 1`, then clean removal without transcript files.

---

### Task 5: Typed Transport, Discovery, Startup Lock, and Detached Spawn

**Files:**
- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/src/paths.ts`
- Create: `packages/client/src/transport.ts`
- Create: `packages/client/src/discovery.ts`
- Create: `packages/client/src/daemon.ts`
- Create: `packages/client/src/index.ts`
- Test: `packages/client/test/transport.test.ts`
- Test: `packages/client/test/discovery.test.ts`

**Interfaces:**
- Consumes: contract request/response types and the registry daemon export.
- Produces: `RegistryTransport`, `RegistryClientError`, `RuntimePaths`, `resolveRuntimePaths`, `readHealthyDiscovery`, and `ensureDaemon`.

- [ ] **Step 1: Write failing transport and concurrent-discovery tests**

Use a temporary HTTP server to test status mapping and `AbortSignal.timeout(500)`. In `discovery.test.ts`, include this concurrency assertion and companion stale-file/mode cases:

```ts
it("spawns exactly one daemon for concurrent callers", async () => {
  let spawnCount = 0;
  const spawnDaemon = async () => {
    spawnCount += 1;
    await publishHealthyDiscovery(testPaths.discoveryFile, healthyRecord);
  };
  const records = await Promise.all(Array.from({ length: 20 }, () =>
    ensureDaemon({ paths: testPaths, spawnDaemon, healthCheck: fakeHealthCheck }),
  ));
  expect(spawnCount).toBe(1);
  expect(new Set(records.map((record) => record.token))).toEqual(new Set([healthyRecord.token]));
});
```

Also assert stale malformed discovery is replaced and runtime directory/file modes are `0o700`/`0o600` on POSIX.

- [ ] **Step 2: Run client boundary tests to verify they fail**

Run: `npx vitest run packages/client/test/transport.test.ts packages/client/test/discovery.test.ts`

Expected: FAIL because client modules do not exist.

- [ ] **Step 3: Implement typed bounded HTTP transport**

Create `transport.ts` with a `RegistryTransport` class whose public methods mirror the service:

```ts
register(request: RegisterSessionRequest, signal?: AbortSignal): Promise<RegisterSessionResponse>;
append(sessionId: string, request: AppendEventsRequest, signal?: AbortSignal): Promise<SequenceResponse>;
heartbeat(sessionId: string, request: HeartbeatRequest, signal?: AbortSignal): Promise<{ leaseExpiresAt: number }>;
replaceSnapshot(sessionId: string, request: ReplaceSnapshotRequest, signal?: AbortSignal): Promise<SequenceResponse>;
deleteSession(sessionId: string, signal?: AbortSignal): Promise<void>;
query(request: QueryRequest, signal?: AbortSignal): Promise<QueryResponse>;
health(signal?: AbortSignal): Promise<HealthResponse>;
```

The constructor takes `{ baseUrl, token, timeoutMs?: 500 }`. Combine caller cancellation with the timeout using `AbortSignal.any`. Validate successful JSON responses with contract schemas. Convert HTTP/API failures into `RegistryClientError` retaining `code`, `status`, and retryability; never include response request bodies, tokens, or transcript text in messages.

- [ ] **Step 4: Implement secure runtime paths and healthy discovery checks**

`resolveRuntimePaths()` returns:

```ts
interface RuntimePaths {
  directory: string;
  discoveryFile: string;
  lockDirectory: string;
}
```

Use `$XDG_RUNTIME_DIR/agent-session-registry` when set; otherwise use `${tmpdir()}/agent-session-registry-${process.getuid()}`. Create mode `0o700`. `readHealthyDiscovery` must parse the record, require protocol version 1, then authenticate `/v1/health`; a PID alone is never proof of health.

- [ ] **Step 5: Implement startup locking and detached spawn**

`ensureDaemon(options)` must:

1. return healthy discovery immediately;
2. acquire a lock via atomic `mkdir(lockDirectory)`;
3. recheck discovery under lock;
4. generate `randomBytes(32).toString("hex")`;
5. spawn `process.execPath` with `fileURLToPath(import.meta.resolve("@agent-session/registry/daemon"))`, `detached: true`, `stdio: "ignore"`, and only the required token/discovery environment additions;
6. call `child.unref()`;
7. poll authenticated discovery for at most 2 seconds;
8. always remove the lock directory in `finally`.

The spawn core must be explicit and detached:

```ts
const daemonUrl = import.meta.resolve("@agent-session/registry/daemon");
const child = spawn(process.execPath, [fileURLToPath(daemonUrl)], {
  detached: true,
  stdio: "ignore",
  env: {
    ...process.env,
    AGENT_SESSION_TOKEN: token,
    AGENT_SESSION_DISCOVERY_FILE: paths.discoveryFile,
  },
});
child.unref();
```

A lock older than 5 seconds is stale and may be removed once. Other contenders poll for discovery with 25 ms jitter rather than spawning. Return `DAEMON_START_FAILED` after the bounded deadline.

- [ ] **Step 6: Run client boundary tests and build**

Run: `npm install --ignore-scripts && npx vitest run packages/client/test/transport.test.ts packages/client/test/discovery.test.ts && npm run build`

Expected: all tests PASS and workspace references build in dependency order.

---

### Task 6: Non-Blocking Session Reporter and Recovery

**Files:**
- Create: `packages/client/src/reporter.ts`
- Modify: `packages/client/src/index.ts`
- Test: `packages/client/test/reporter.test.ts`

**Interfaces:**
- Consumes: `ensureDaemon`, `RegistryTransport`, `SessionMetadata`, `NormalizedEvent`, and `Snapshot`.
- Produces: `SessionReporter`, `ReporterStatus`, and `createSessionReporter(options)` for harness adapters.

- [ ] **Step 1: Write failing reporter tests with a fake transport**

Use deferred promises and fake timers. Start with this red test:

```ts
it("enqueue stays synchronous while transport is blocked", async () => {
  const pending = Promise.withResolvers<SequenceResponse>();
  const transport = fakeTransport({ append: () => pending.promise });
  const reporter = createSessionReporter({
    metadata,
    snapshotProvider: () => snapshot,
    ensureDaemon: async () => discovery,
    transportFactory: () => transport,
  });
  await reporter.start();
  expect(() => reporter.enqueue(eventAtSequence(2))).not.toThrow();
  expect(transport.append).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(100);
  expect(transport.append).toHaveBeenCalledTimes(1);
  pending.resolve({ acceptedSequence: 2 });
});
```

Add cases proving:

- `enqueue(event)` returns synchronously while transport is blocked;
- at most 50 events flush every 100 ms;
- heartbeat occurs at 10 seconds;
- 404 and sequence conflict trigger one authoritative snapshot replacement;
- transport loss causes bounded backoff and daemon rediscovery;
- a queue over 500 events or 4 MiB is discarded and replaced by a snapshot;
- `close()` stops capture, waits at most 1 second, and calls DELETE;
- limit errors set status `truncated` and stop incremental capture without disk writes.

- [ ] **Step 2: Run reporter tests to verify they fail**

Run: `npx vitest run packages/client/test/reporter.test.ts`

Expected: FAIL because `SessionReporter` does not exist.

- [ ] **Step 3: Implement reporter state and non-blocking enqueue**

Define:

```ts
export type ReporterStatus = "starting" | "connected" | "disconnected" | "truncated" | "closed";
export interface SessionReporterOptions {
  metadata: SessionMetadata;
  snapshotProvider: () => Snapshot;
  onStatus?: (status: ReporterStatus) => void;
  ensureDaemon?: typeof ensureDaemon;
  transportFactory?: (record: DiscoveryRecord) => RegistryTransport;
}
export interface SessionReporter {
  start(): Promise<void>;
  enqueue(event: NormalizedEvent): void;
  replaceSnapshot(): void;
  updateMetadata(update: { state: SessionState; lastActivityAt: number; name?: string | null }): void;
  query(request: Omit<QueryRequest, "excludeSessionId"> & { includeCurrentSession?: boolean }, signal?: AbortSignal): Promise<QueryResponse>;
  close(): Promise<void>;
  readonly sessionId: string | undefined;
  readonly status: ReporterStatus;
}
```

Keep queue state in memory only. `enqueue` may compute UTF-8 size and schedule work, but must not await, perform file I/O, or perform network I/O.

- [ ] **Step 4: Implement batching, heartbeat, and snapshot recovery**

Use one serialized async pump with named constants:

```ts
const FLUSH_DELAY_MS = 100;
const MAX_BATCH_EVENTS = 50;
const MAX_QUEUE_EVENTS = 500;
const MAX_QUEUE_BYTES = 4 * 1024 * 1024;
const HEARTBEAT_MS = 10_000;
const RETRY_DELAYS_MS = [100, 250, 500, 1_000, 2_000] as const;
```

Flush after 100 ms or 50 queued events. Retry transient failures with the listed jittered delays. On `NOT_FOUND`, `SEQUENCE_GAP`, daemon identity change, or queue overflow, re-run discovery, register if needed, and send `snapshotProvider()` as the authoritative state.

Heartbeat every 10 seconds with the latest state/activity/name. If heartbeat gets 404, re-register. `query()` must add the current `sessionId` as `excludeSessionId` unless `includeCurrentSession === true`; remove that adapter-only flag before sending the contract request.

`close()` must use an internal one-second deadline, stop all timers, best-effort flush contiguous events, issue DELETE, and settle even if transport fails.

- [ ] **Step 5: Run reporter and all client tests**

Run: `npx vitest run packages/client/test`

Expected: all client tests PASS under fake timers with no open-handle warning.

---

### Task 7: Pi Normalization and Lifecycle Adapter

**Files:**
- Create: `packages/pi-extension/package.json`
- Create: `packages/pi-extension/tsconfig.json`
- Create: `packages/pi-extension/src/normalize.ts`
- Create: `packages/pi-extension/src/adapter.ts`
- Create: `packages/pi-extension/src/index.ts`
- Test: `packages/pi-extension/test/normalize.test.ts`
- Test: `packages/pi-extension/test/adapter.test.ts`

**Interfaces:**
- Consumes: Pi `ExtensionAPI`/session entry types, contracts, and `createSessionReporter`.
- Produces: `normalizeMessage`, `buildCurrentBranchSnapshot`, `registerPiAdapter`, and the package’s default Pi extension factory.

- [ ] **Step 1: Write failing capture-policy tests**

Create Pi-shaped fixtures containing text, thinking, image, and tool-call blocks. Assert:

```ts
it("keeps visible assistant text but excludes thinking and tool arguments", () => {
  const events = normalizeMessage({
    role: "assistant",
    content: [
      { type: "thinking", thinking: "private reasoning" },
      { type: "text", text: "I found the failure." },
      { type: "toolCall", id: "call-1", name: "bash", arguments: { command: "cat ~/.token" } },
    ],
    stopReason: "toolUse",
    timestamp: 1_000,
  }, { eventId: "entry-1", sequence: 1 });
  expect(events).toEqual([{ type: "message.assistant", eventId: "entry-1", sequence: 1, timestamp: 1_000, text: "I found the failure.", stopStatus: "toolUse" }]);
  expect(JSON.stringify(events)).not.toContain("private reasoning");
  expect(JSON.stringify(events)).not.toContain("cat ~/.token");
});
```

Also assert user images are dropped, tool result messages produce no transcript event, branch snapshots are contiguous, and compaction/custom messages do not leak excluded payloads.

- [ ] **Step 2: Run normalization tests to verify they fail**

Run: `npx vitest run packages/pi-extension/test/normalize.test.ts`

Expected: FAIL because normalizer functions do not exist.

- [ ] **Step 3: Implement finalized-message and branch-snapshot normalization**

`normalizeMessage(message, identity): NormalizedEvent[]` returns an array containing zero or one user/assistant normalized event. Join only `text` blocks with newlines using:

```ts
function visibleText(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === "string") return content;
  return content
    .filter((block): block is { type: "text"; text: string } => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}
```

A string user message is accepted directly. Ignore `thinking`, `image`, `toolCall`, `toolResult`, `bashExecution`, and extension detail fields.

`buildCurrentBranchSnapshot(sessionManager)` must iterate `sessionManager.getBranch()` directly (Pi already returns root-to-leaf chronological order), include only `type === "message"` user/assistant entries, use Pi entry IDs as stable event IDs, and assign contiguous sequences from 1. It returns `{ lastSequence, events }`.

- [ ] **Step 4: Write failing lifecycle wiring tests**

Create a fake `ExtensionAPI` that records event handlers and tool definitions plus a fake reporter. Include this lifecycle assertion:

```ts
it("starts and closes one reporter per Pi session runtime", async () => {
  const harness = createFakePiHarness();
  const reporter = createFakeReporter();
  registerPiAdapter(harness.pi, { createReporter: () => reporter, now: () => 1_000 });
  await harness.emit("session_start", { reason: "startup" }, harness.context);
  expect(reporter.start).toHaveBeenCalledOnce();
  await harness.emit("session_shutdown", { reason: "quit" }, harness.context);
  expect(reporter.close).toHaveBeenCalledOnce();
});
```

The same test file defines `createFakePiHarness` as a map-backed `on(event, handler)` recorder and `createFakeReporter` as a Vitest mock implementing every `SessionReporter` method. Assert wiring for:

- `session_start` to reporter creation/start with current snapshot;
- `message_end` to finalized user/assistant enqueue;
- `tool_execution_start/end` to metadata-only tool events;
- `agent_start` to `running` and `agent_settled` to `idle`;
- `session_info_changed` to heartbeat metadata name update, using `null` to clear a removed name;
- `session_tree` to snapshot replacement;
- `session_shutdown` to reporter close and reference clearing.

Assert tool events contain name, ID, status, and timestamps but not args/results.

- [ ] **Step 5: Implement lifecycle wiring with injectable construction**

Define:

```ts
export function registerPiAdapter(
  pi: ExtensionAPI,
  dependencies: { createReporter?: typeof createSessionReporter; now?: () => number } = {},
): void;
```

Register handlers during factory execution, but create long-lived reporter resources only from `session_start`. Keep `reporter` and next sequence in the extension instance. Use `ctx.sessionManager.getSessionId()`, `getCwd()`, `getSessionName()`, `process.pid`, and package version for metadata.

Generate tool event IDs as `${toolCallId}:start` and `${toolCallId}:end`. Keep a map of tool start timestamps. Status is `failed` when `tool_execution_end.isError`, otherwise `succeeded`. Do not copy `args`, partial results, final results, or `details`.

`src/index.ts` must export the default factory:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPiAdapter } from "./adapter.js";

export default function activeSessionRegistry(pi: ExtensionAPI): void {
  registerPiAdapter(pi);
}
```

- [ ] **Step 6: Add Pi package metadata and run adapter tests**

The package depends on `@agent-session/contracts` and `@agent-session/client`, and declares `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `typebox` as `"*"` peer dependencies. Its TypeScript project references `contracts` and `client`.

Run: `npm install --ignore-scripts && npx vitest run packages/pi-extension/test/normalize.test.ts packages/pi-extension/test/adapter.test.ts`

Expected: all Pi capture/lifecycle tests PASS and fixture secrets are absent from serialized events.

---

### Task 8: Read-Only Pi Query Tool

**Files:**
- Create: `packages/pi-extension/src/tool.ts`
- Modify: `packages/pi-extension/src/adapter.ts`
- Test: `packages/pi-extension/test/tool.test.ts`

**Interfaces:**
- Consumes: current `SessionReporter.query`, Pi `registerTool`, and `QueryRequest` semantics.
- Produces: one active tool named `query_active_sessions` with bounded text output and no mutation capability.

- [ ] **Step 1: Write failing query-tool tests**

Start with a concrete fake-reporter execution test:

```ts
it("queries once and excludes the current session by default", async () => {
  const reporter = createFakeReporter();
  reporter.query.mockResolvedValue({ mode: "overview", sessions: [], truncated: false });
  const tool = createQueryActiveSessionsTool(() => reporter);
  const result = await tool.execute("call-1", { query: "what needs attention?" }, AbortSignal.timeout(1_000), undefined, fakeExtensionContext);
  expect(reporter.query).toHaveBeenCalledOnce();
  expect(reporter.query).toHaveBeenCalledWith({ query: "what needs attention?" }, expect.any(AbortSignal));
  expect(result.content[0]).toMatchObject({ type: "text" });
});
```

Add assertions that the tool:

- requires a natural-language query;
- exposes optional `overview|search`, cwd/session filters, include-current flag, and limits within contract maxima;
- calls reporter query once;
- excludes current session by default through the reporter;
- returns compact JSON no longer than 40,000 characters;
- reports `REGISTRY_UNAVAILABLE` and `INCOMPATIBLE_PROTOCOL` concisely without retries inside tool execution;
- has no endpoint or parameter capable of mutation.

- [ ] **Step 2: Run tool tests to verify they fail**

Run: `npx vitest run packages/pi-extension/test/tool.test.ts`

Expected: FAIL because `createQueryActiveSessionsTool` does not exist.

- [ ] **Step 3: Implement and register the tool**

Create `tool.ts` exporting a Pi tool definition with this schema:

```ts
parameters: Type.Object({
  query: Type.String({ description: "The user's natural-language question about active agent sessions" }),
  mode: Type.Optional(StringEnum(["overview", "search"] as const)),
  cwd: Type.Optional(Type.String()),
  sessionIds: Type.Optional(Type.Array(Type.String())),
  includeCurrentSession: Type.Optional(Type.Boolean({ default: false })),
  maxSessions: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
  maxExcerptsPerSession: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
  maxCharacters: Type.Optional(Type.Integer({ minimum: 1_000, maximum: 40_000 })),
})
```

Use name `query_active_sessions`, label `Query Active Sessions`, and a description that says to use it for free-form questions about other active agent sessions, current work, duplication, blockers, errors, or attention. Add a `promptSnippet` naming the same capability. Execute exactly one reporter query with Pi’s abort signal. Return pretty JSON in one text content block and structured response in `details`; the registry has already bounded it, so do not spill to a file.

When no reporter is connected, throw `Registry unavailable; active session capture will retry in the background.` Map protocol mismatch to `Active session registry protocol is incompatible; reload or update the package.` Do not expose tokens, URLs, or raw response bodies.

Register this tool once during extension factory setup. Resolve the current reporter lazily through `() => reporter`, so session replacement uses the new reporter without re-registering the tool.

- [ ] **Step 4: Run the full Pi extension suite**

Run: `npx vitest run packages/pi-extension/test`

Expected: all normalizer, adapter, and tool tests PASS.

---

### Task 9: End-to-End Recovery, Concurrency, Packaging, and Documentation

**Files:**
- Create: `packages/client/test/e2e.test.ts`
- Create: `README.md`
- Modify: `package.json`
- Modify: `.gitignore`
- Verify: `package-lock.json`

**Interfaces:**
- Consumes: complete registry, client, reporter, and Pi package manifest.
- Produces: tested local package installation and documented manual acceptance workflow.

- [ ] **Step 1: Write failing end-to-end tests against a real daemon**

Create `e2e.test.ts` that uses a temporary runtime directory and built daemon. Begin with the real two-reporter slice:

```ts
it("registers two reporters and excludes the caller", async () => {
  const runtime = await mkdtemp(join(tmpdir(), "agent-session-e2e-"));
  const previousRuntime = process.env.XDG_RUNTIME_DIR;
  process.env.XDG_RUNTIME_DIR = runtime;
  const makeReporter = (id: string, text: string) => createSessionReporter({
    metadata: { adapter: "pi", adapterVersion: "0.1.0", harnessSessionId: id, cwd: `/repo/${id}`, processId: process.pid, startedAt: Date.now(), state: "idle" },
    snapshotProvider: () => ({ lastSequence: 1, events: [{ type: "message.user", eventId: `${id}-1`, sequence: 1, timestamp: Date.now(), text }] }),
  });
  const first = makeReporter("one", "review authentication");
  const second = makeReporter("two", "debug PROJQUAY-123");
  try {
    await Promise.all([first.start(), second.start()]);
    const result = await first.query({ query: "what are my other sessions doing?", mode: "overview" });
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.metadata.harnessSessionId).toBe("two");
  } finally {
    await Promise.all([first.close(), second.close()]);
    if (previousRuntime === undefined) delete process.env.XDG_RUNTIME_DIR;
    else process.env.XDG_RUNTIME_DIR = previousRuntime;
    await rm(runtime, { recursive: true, force: true });
  }
});
```

Add cases covering:

1. two reporters register and one overview query returns only the other by default;
2. a topic search returns a matching FTS excerpt;
3. reporter close removes the session before `close()` resolves;
4. forced adapter disappearance is removed after an injected short lease in the test daemon;
5. daemon termination followed by reporter activity starts a new daemon and restores snapshots;
6. 50 reporters concurrently register, append one event, query, and close without errors;
7. a recursive scan of the runtime directory finds no transcript fixture string.

Use test-only daemon timing environment variables validated as positive integers; production defaults remain 10/45/30 seconds.

- [ ] **Step 2: Run end-to-end tests to verify the uncovered behavior fails**

Run: `npm run build && npx vitest run packages/client/test/e2e.test.ts`

Expected: at least one recovery/load assertion FAIL until daemon timing injection and cleanup orchestration are completed.

- [ ] **Step 3: Add only the testability hooks required by the end-to-end suite**

Add daemon environment parsing for `AGENT_SESSION_LEASE_MS` and `AGENT_SESSION_EMPTY_EXIT_MS` with one strict helper:

```ts
function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
```

Use it only to override defaults when present and valid. Thread lease duration into `RegistryStore` construction rather than reading environment variables in domain code; heartbeat scheduling remains adapter-side and is tested with fake timers. Ensure all test subprocesses are terminated in `afterEach`, even on assertion failure.

Do not add persistence, history, semantic search, a dashboard, or a second harness.

- [ ] **Step 4: Document local installation, operation, and privacy**

Create `README.md` with exact commands:

```bash
npm install
npm test
npm run typecheck
npm run build
pi install /absolute/path/to/agent-base
```

Document:

- what is and is not captured;
- that active transcript data is in memory only;
- 10-second heartbeat, 45-second lease, and 30-second empty-daemon exit;
- the `query_active_sessions` tool and example free-form questions;
- local uninstall with `pi remove /absolute/path/to/agent-base`;
- troubleshooting for disconnected status and protocol mismatch;
- the two-terminal manual acceptance procedure from the approved spec.

- [ ] **Step 5: Ignore generated and sensitive runtime artifacts**

Create or update `.gitignore` with:

```gitignore
node_modules/
dist/
coverage/
.superpowers/
*.log
```

Do not ignore `package-lock.json`, source files, tests, the approved spec, or this plan.

- [ ] **Step 6: Run all automated quality gates**

Run:

```bash
npm test
npm run typecheck
npm run build
npm pack --dry-run
```

Expected:

- all unit, integration, concurrency, and end-to-end tests PASS;
- TypeScript exits with no diagnostics;
- all four packages build;
- the dry-run tarball includes `packages/pi-extension/dist/index.js`, registry/client/contracts `dist` files, and package metadata;
- the dry-run tarball does not include `.superpowers`, test fixtures, coverage, logs, or transcript content.

- [ ] **Step 7: Perform the real two-Pi manual acceptance**

Install from the absolute repository path, open two Pi sessions in different terminals, and verify:

1. asking one agent “What’s going on in my other sessions?” produces one `query_active_sessions` call;
2. a topic-specific question returns evidence from the other session;
3. a failed tool appears as deterministic attention evidence;
4. closing the second Pi removes it immediately from the first session’s next query;
5. killing a Pi process removes it within 45 seconds;
6. killing the daemon causes the surviving adapter to recreate it and restore its current branch;
7. no thinking, tool arguments, tool output, bearer token, or transcript text appears in runtime files or logs.

Expected: all seven checks pass. Record defects as failing automated regression tests before changing implementation.
