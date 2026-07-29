# Architecture of the Agent Activity Hub

This document is the implementation-oriented map of the project: its modules, runtime topology, data flows, trust model, state machines, and extension seams. For behavioral requirements and trade-offs, see the specifications under [`docs/superpowers/specs/`](../superpowers/specs/).

## 1. System purpose

The project gives local [Pi](https://pi.dev) sessions two related capabilities:

1. **Session awareness** — publish a privacy-filtered view of current work and query other active sessions.
2. **Task coordination** — send bounded A2A tasks to one explicitly selected local session, receive work while idle, watch results, and request cancellation.

All coordination is local and ephemeral. The hub binds only to `127.0.0.1`, keeps session and task data in an in-memory SQLite database, and writes only discovery/ownership metadata to the runtime directory.

## 2. Package topology

```text
@agent-hub/contracts
        ▲          ▲
        │          │
@agent-hub/client   @agent-hub/hub
        ▲
        │
@agent-hub/pi-extension ◀── in-process coordination API ── @agent-hub/subagents
```

| Package | Role | Main interface |
| --- | --- | --- |
| `packages/contracts` | Shared private-protocol schemas, normalized event types, delivery schemas, and A2A constants | TypeBox schemas and TypeScript types |
| `packages/client` | Daemon discovery, hub transport, resilient session reporting, target delivery transport, and source A2A client | `SessionReporter`, `HubTransport`, `CoordinationTransport`, `SourceCoordinationClient` |
| `packages/hub` | Loopback daemon, in-memory stores, query projection, A2A coordinator, delivery routing, and daemon ownership | HTTP server plus `HubStore`, `CoordinationService`, `DeliveryRouter`, `TaskStore` |
| `packages/pi-extension` | Pi lifecycle adapter, transcript normalization, session tools, inbound prompt injection, result correlation, and the trusted coordination API | `registerPiAdapter()` |
| `packages/subagents` | Agent discovery, persistent tmux worker launch/layout, and single/parallel/chained task orchestration | `subagent` Pi tool ([design](persistent-subagents.md)) |
| `packages/distribution` | Deterministic Git-installable bundle generation and tracked-artifact smoke testing | `release/` builder and archive test |
| `cmd/agent-hub`, `internal/*` | Standalone Go snapshot CLI and Charmbracelet Activity Monitor | `agent-hub`, monitor v1 client |

The dependency direction is deliberate: contracts contain wire facts shared by client and hub; neither contracts nor client depends on the hub implementation. The Pi extension depends on client interfaces rather than reaching into hub internals. The subagent extension uses only the versioned in-process coordination API; it does not import daemon internals or receive hub credentials.

### Git distribution boundary

```text
private TypeScript workspaces
           │ pnpm run build:release
           ▼
tracked release/
  ├─ hub-extension.js
  ├─ subagents-extension.js
  ├─ hub-daemon.js
  └─ agents/*.md
           │ Pi Git package loader
           ▼
installed private Git checkout
```

The root Pi manifest references only files in `release/`. Extension bundles contain all internal workspace and A2A implementation code; the detached daemon also bundles every runtime package it needs outside Pi's module loader. Generated JavaScript may not retain unresolved `@agent-hub/*` imports. CI rebuilds the directory, compares it with the tracked files, and runs Pi loading and daemon startup from `git archive HEAD`, preventing ignored workspace output or `node_modules` from masking a missing artifact.

Bundled agents are provider-neutral and live beside the release extension. Discovery merges definitions in the order bundled, user, then trusted project, so later definitions replace earlier ones by name.

## 3. Runtime topology

```text
┌──────────────────────── Pi process A ────────────────────────┐
│ Pi adapter                                                   │
│  ├─ SessionReporter ─ private hub v2 ───────┐           │
│  ├─ query_active_sessions                        │           │
│  └─ delegate_task ─ public A2A 1.0 ──────────┐   │           │
└───────────────────────────────────────────────│───│───────────┘
                                                │   │
                                      127.0.0.1 │   │
                                                ▼   ▼
┌──────────────────── hub daemon ─────────────────────────┐
│ HTTP routing                                                  │
│  ├─ private hub v2: sessions, events, heartbeat, query  │
│  ├─ public A2A 1.0: card, send, get, list, cancel            │
│  ├─ read-only monitor v1: snapshot, long-poll, detail         │
│  └─ private target delivery: claim, accept, progress, finish │
│                                                               │
│ HubStore + TaskStore + FTS5 (in-memory SQLite)           │
│ CoordinationService + DeliveryRouter + ChangeNotifier         │
└───────────────────────────────────────────────│───────────────┘
                                                │ private v2
                                                ▼
┌──────────────────────── Pi process B ────────────────────────┐
│ SessionReporter + PiInboundDelivery                          │
│  claim while idle → inject prompt → correlate visible result │
└───────────────────────────────────────────────────────────────┘
```

A user can run many Pi processes, but one runtime directory has at most one owning daemon. Each Pi process has its own hub session and ephemeral task capability.

## 4. Protocols and authentication

The daemon intentionally exposes two protocol surfaces.

### Private hub protocol v2

Used by adapters and reporters for:

- health and discovery verification;
- session registration and deletion;
- event append and snapshot replacement;
- heartbeat/state updates;
- bounded active-session queries;
- target delivery claim and mutation operations.

The root discovery token authenticates hub maintenance operations. Registration returns a different per-session task capability. The raw capability is never stored in SQLite; the hub stores a verifier/hash.

### Public A2A protocol 1.0

Used by source agents for:

- Agent Card discovery;
- `SendMessage`;
- `GetTask` and `ListTasks`;
- `CancelTask`.

The Agent Card is public on loopback and receives no bearer credential. Task operations use the source session's capability and require:

```text
urn:agent-activity-hub:extension:local-coordination:v1
```

That extension carries exactly one explicit target selector: an existing delivery-capable session or a named managed-worker provider. The coordinator never chooses a target implicitly.

### Why A2A does not replace the hub

A2A standardizes communication with a known A2A server; it does not enumerate arbitrary local Pi processes. Agent Cards are found through an already-known well-known URI, a registry/catalog, or direct configuration, and `ListTasks` lists tasks on one server rather than available agents or harness sessions.

This project therefore keeps one local session directory behind one loopback A2A coordinator. The hub owns process presence, heartbeat leases, bounded activity evidence, harness-session correlation, and explicit delivery-target resolution. The A2A surface owns the source-facing task lifecycle. Making every Pi process an independent A2A server would still require equivalent endpoint discovery and liveness tracking while multiplying listeners, credentials, and recovery paths.

See [`docs/research/active-session-registry-vs-a2a.md`](../research/active-session-registry-vs-a2a.md) for the detailed comparison and retained-hub decision.

## 5. Daemon discovery and ownership

`packages/client/src/paths.ts` resolves the runtime directory:

- `$XDG_RUNTIME_DIR/agent-activity-hub`, when available;
- otherwise a user-specific directory under the platform temporary directory.

The runtime directory contains:

```text
hub.json              # port, PID, root token, protocol, start time
hub.json.owner/       # immutable lifetime ownership generation
  owner.json               # PID, nonce, timestamps, process-birth identity
lock/                      # short-lived client startup lock
```

Discovery and ownership solve different problems:

- **Discovery** tells clients where and how to authenticate to the current daemon.
- **Startup lock** suppresses duplicate child creation by concurrent clients.
- **Lifetime ownership** prevents two daemons from serving one runtime directory.

The owner identity combines a nonce, PID, daemon start time, and an OS process-birth fingerprint. Stale takeover requires both stale metadata and proof that the recorded process identity is gone or has been replaced through PID reuse. Ambiguous liveness fails closed: temporary unavailability is safer than split-brain in-memory coordinators.

The daemon continuously verifies both ownership and discovery identity. If discovery is deleted, malformed, or replaced, the old daemon closes its listener and runtime before releasing ownership. Existing reporters then use their normal reconnect path and restore their authoritative snapshots into the successor.

## 6. Session capture and query flow

### Capture

```text
Pi event
  → adapter lifecycle handler
  → normalize.ts privacy projection
  → SessionReporter bounded queue
  → private v2 event append / snapshot replace
  → HubStore + FTS5
```

The Pi adapter captures only:

- user text;
- visible assistant text and stop/error status;
- tool name, lifecycle status, and timing;
- session state and basic metadata.

It excludes thinking, tool arguments, raw tool output, provider payloads, images, extension internals, and authentication material.

`SessionReporter` is the resilience module. It owns batching, sequence acknowledgement, snapshots, heartbeat scheduling, bounded retry, daemon rediscovery, capability rotation, queue overflow recovery, and shutdown cleanup. Pi callers only enqueue normalized events and request queries.

### Query

```text
query_active_sessions
  → SessionReporter.query()
  → POST /v2/query
  → queryActiveSessions()
  → bounded overview or FTS search projection
  → second compact Pi-tool projection
```

The hub projection computes excerpts, activity ordering, deterministic attention signals, completeness, and response budgets. The Pi tool removes internal metadata again before returning model-facing content. A `deliveryTargetId` is included only for a delivery-capable session other than the caller.

## 7. Outbound delegation flow

```text
Pi A: delegate_task(send)
  → resolve current reporter URL + capability
  → SourceCoordinationClient
  → validate public Agent Card
  → A2A SendMessage(returnImmediately=true)
  → CoordinationService.createExistingSessionTask()
  → TaskStore transaction: task + source message + queued delivery
  → notify target
```

`SourceCoordinationClient` hides A2A SDK construction and wire details behind three operations:

- `send` — create a text-only task for one target;
- `watch` — fetch one bounded task snapshot;
- `cancel` — explicitly request cancellation.

Credentials are resolved at every tool invocation because daemon recovery rotates the URL, hub session ID, and task capability. `watch` is intentionally one request rather than a hidden polling loop. Aborting a tool call aborts its HTTP request but does not cancel the task.

### Extension-local orchestration seam

`packages/pi-extension/src/coordination-api.ts` publishes a versioned request/response API through Pi's in-process event bus. A trusted extension can ask it to locate a newly launched Pi by an exact harness session ID and send work after that session becomes delivery-capable, then watch or cancel the resulting task. The API returns only bounded task snapshots and never hands another extension the reporter's root token or task capability.

This seam is intentionally above the wire client and below tmux/process UI. `packages/subagents` owns pane creation and persistent worker policy while reusing the current reporter, daemon recovery, explicit target routing, and A2A result contract. The generated harness session ID is correlation metadata, not a bearer credential, and remains absent from model-facing tool output.

## 8. Inbound delivery flow

```text
Pi B idle
  → PiInboundDelivery long-polls claim
  → claim atomically marks one delivery claimed
  → accept
  → sendUserMessage("[A2A delegated task] …")
  → collect visible assistant message_end text
  → complete/fail private task mutation
  → Pi A watches A2A task result
```

Important invariants:

- claims occur only while the local Pi context reports idle;
- at most one delivery is claimed or accepted per target;
- an inbound synthetic turn is excluded from normal hub transcript capture;
- only visible assistant text becomes a result;
- cancellation is checked at agent/tool progress boundaries and aborts the Pi turn cooperatively;
- reporter recovery does not disable inbound delivery—the loop waits until current credentials become available.

A claim is ownership of a delivery token, not merely a read. If the HTTP connection disappears before handoff, the hub atomically abandons and requeues an unaccepted claim. An accepted claim wins over abandonment. This prevents tasks from becoming permanently `working` without a target that knows the delivery ID.

## 9. Coordination domain model

### Session

An ephemeral registered adapter instance with metadata, lease, normalized events, state, and one task capability. A session may be a source, a delivery-capable target, or both.

### Task

A source-owned A2A unit of work. It contains a context, explicit target selector, bounded messages, deadline, cancellation flag, and terminal outcome.

```text
submitted → working → completed
                    ↘ failed
submitted/working → canceled
submitted         → rejected
```

Task IDs include the daemon instance identity. After restart, an old-looking ID can be reported as `coordinator_restarted` without reconstructing task content.

### Delivery

The target-side queue record connecting one task message to one target session.

```text
queued → claimed → accepted → resolved
             └──────────────→ rejected
             └─ abandon ────→ queued
```

`claimed` reserves work and returns a delivery ID. `accepted` confirms the target owns processing. `resolved` covers completion, failure, acknowledged cancellation, expiry, or session loss.

### Message

A bounded source or target message containing text or JSON data parts. File/media parts are unsupported.

### Worker launch

A one-time binding between a source-created worker task and a provider-started session. The launch token is stored only as a verifier and can bind once.

## 10. Hub internals

The hub uses one in-memory SQLite database with three groups of tables:

- Agent Activity Hub: `sessions`, `events`, and FTS5 `event_search`;
- coordination: `a2a_tasks`, `a2a_messages`, and `a2a_deliveries`;
- managed workers: `worker_launches`.

`HubStore` owns session/event persistence and capability authentication. `TaskStore` owns transactional task state. `CoordinationService` enforces source ownership and task-level rules. `DeliveryRouter` owns target claim/mutation semantics. `ChangeNotifier` provides bounded long-poll wakeups without becoming persisted state.

This separation keeps wire mapping out of storage and keeps task invariants transactional.

## 11. Failure and recovery behavior

| Failure | Behavior |
| --- | --- |
| Daemon unavailable | Reporter retains bounded state, rediscovers or starts a daemon, then replaces the authoritative snapshot |
| Protocol mismatch | Reporter becomes disconnected and stops retrying that incompatible generation without crashing Pi |
| Hub sequence gap | Reporter replaces the snapshot instead of guessing missing events |
| Reporter queue overflow | Queue is discarded and replaced by a fresh bounded snapshot |
| Pi starts normal work during claim | Client claim aborts; server claim is canceled or safely abandoned/requeued |
| Source closes | Unclaimed tasks are canceled/removed; active tasks receive cancellation intent |
| Target closes | Queued tasks fail unavailable; claimed/accepted tasks fail as delivery lost |
| Deadline expires | Delivery resolves and task fails with `DEADLINE_EXCEEDED` |
| Daemon restarts | Sessions re-register with new capabilities; old tasks are intentionally not reconstructed |
| Discovery ownership is lost | Old listener closes before successor ownership is published |

## 12. Security and privacy invariants

- Bind only to `127.0.0.1`; source clients reject caller-provided or non-loopback coordinator URLs.
- Keep private protocol at version `2` and A2A at version `1.0`.
- Authenticate every non-card operation.
- Never expose the root token or session capability to model-facing output, logs, snapshots, or errors.
- Keep transcript/task content in memory only.
- Protect runtime directories as `0700` and files as `0600` where supported.
- Bound event queues, excerpts, response sizes, message parts, task counts, deadlines, and database size.
- Treat target output as untrusted visible agent content.
- Use explicit target selection; do not infer or automatically route to a session.

## 13. Test architecture

Tests are organized around the seam that owns each invariant:

- contract validation: `packages/contracts/test/`;
- client transport, reporter recovery, clean daemon lifecycle: `packages/client/test/`;
- store transactions, query projection, ownership, HTTP and A2A routing: `packages/hub/test/`;
- Pi lifecycle, privacy normalization, tools, and inbound correlation: `packages/pi-extension/test/`;
- agent discovery, coordination API consumption, and tmux worker layout: `packages/subagents/test/`.

The highest-value integration tests exercise real seams rather than bypassing them:

- process-level daemon discovery loss and replacement;
- real HTTP claim disconnect/abandon races;
- official A2A SDK source requests;
- source client through `PiInboundDelivery` to visible completion;
- reporter restart and authoritative snapshot restoration.

## 14. Extension seams

### Add another harness adapter

Implement lifecycle capture that produces contract `NormalizedEvent` values, own a `SessionReporter`, and optionally consume `CoordinationTransport` for inbound work. Keep harness-specific private data out of normalized events.

### Add a managed-worker provider

Implement `WorkerProvider` with `start` and `cancel`, register it with `WorkerProviderRegistry`, and pass only bounded provider options. The coordinator handles launch-token binding and task ownership.

### Add protocol behavior

Start in `packages/contracts` for shared wire schemas, implement domain rules in hub stores/services, map them at the HTTP/A2A seam, then expose a deep client operation. Do not make Pi callers construct raw wire payloads.

## 15. Navigation guide

| Question | Start here |
| --- | --- |
| How does Pi hook into lifecycle events? | `packages/pi-extension/src/adapter.ts` |
| What is captured or excluded? | `packages/pi-extension/src/normalize.ts` |
| How are reporter retries and snapshots handled? | `packages/client/src/reporter.ts` |
| How is the daemon found or started? | `packages/client/src/daemon.ts`, `discovery.ts`, `paths.ts` |
| How is singleton ownership enforced? | `packages/hub/src/ownership.ts`, `daemon.ts` |
| How are sessions/events stored? | `packages/hub/src/store.ts`, `schema.ts` |
| How does query ranking work? | `packages/hub/src/query.ts` |
| How are A2A requests mapped? | `packages/hub/src/coordination/a2a-mapper.ts` |
| Where are task invariants enforced? | `packages/hub/src/coordination/task-service.ts`, `task-store.ts` |
| How are claims and completion routed? | `packages/hub/src/coordination/delivery-router.ts` |
| How does Pi receive work? | `packages/pi-extension/src/inbound-delivery.ts` |
| How does Pi send/watch/cancel work? | `packages/client/src/source-coordination-client.ts`, `packages/pi-extension/src/delegation-tool.ts` |
| How do trusted Pi extensions reuse coordination? | `packages/pi-extension/src/coordination-api.ts` |
| How are persistent worker panes launched and arranged? | `packages/subagents/src/tmux-worker.ts` |
| How does the `subagent` tool orchestrate tasks? | `packages/subagents/src/index.ts` |
