# Local A2A Coordination Core Design

**Date:** 2026-07-24  
**Status:** Approved for planning  
**Protocol target:** A2A 1.0 HTTP/REST binding  
**Scope:** Local daemon core and adapter-facing delivery contract

## 1. Purpose

Evolve the active agent session registry into a local agent coordination daemon. The daemon will retain its existing observability behavior and add an A2A-compatible collaboration plane that can:

- accept work from an authenticated local agent session;
- route work to an explicitly selected active session;
- request a new managed worker from a pluggable provider;
- queue work until an existing target is idle;
- expose task status, results, follow-up messages, deadlines, and cancellation;
- keep all task content ephemeral and local to the current machine.

This phase builds the coordination core and proves it with fake adapters and fake worker providers. It does not inject prompts into real Pi or Claude Code sessions.

## 2. Relationship to the Existing Registry

The existing registry answers questions such as “What are my other sessions doing?” It captures active-session metadata, selected visible transcript text, tool status, and deterministic attention signals.

A2A adds a separate concern: “Ask another agent to do this work and report the result.” A2A tasks are not registry sessions, transcript events, or queue entries. They have their own ownership, messages, state, deadlines, and cancellation semantics.

The system becomes one local process with two deep modules:

```text
Local Agent Coordination Daemon
|
|-- Session Registry
|   |-- registration and heartbeat
|   |-- normalized transcript events
|   |-- search and attention signals
|   `-- lease expiry
|
|-- A2A Task Service
|   |-- Agent Card and REST binding
|   |-- task and message lifecycle
|   |-- delivery routing and claims
|   `-- worker provider orchestration
|
`-- Shared Infrastructure
    |-- loopback HTTP and discovery
    |-- authentication primitives
    |-- session identity and activity state
    |-- in-memory SQLite connection
    `-- daemon lifecycle
```

The modules share infrastructure, not domain models. Registry events are not reinterpreted as A2A messages, and A2A task rows are not inserted directly into transcript search.

## 3. Goals

- Publish one stable local coordinator Agent Card.
- Implement a minimal useful A2A 1.0 REST surface.
- Route initial work and follow-up messages to an explicitly selected session.
- Support new-worker requests through a harness-neutral provider interface.
- Guarantee FIFO, at-most-once delivery claims per target session.
- Authenticate task actions with per-session capabilities.
- Keep A2A content in memory only.
- Preserve all existing registry privacy, availability, and bounded-output behavior.
- Make real Pi and Claude Code delivery adapters straightforward follow-on projects.

## 4. Non-goals

This phase does not include:

- real Pi prompt injection or Pi worker launch;
- a Claude Code plugin, hooks, MCP server, or Claude worker launch;
- automatic target selection or skill-based scheduling;
- direct Agent Cards for individual live sessions;
- remote or LAN access, TLS termination, OAuth, or multi-user authorization;
- retained task history or recovery after daemon restart;
- A2A streaming, task subscription, or push notifications;
- extended Agent Cards;
- FilePart, media, embedded binary, or remote URI handling;
- a web dashboard;
- semantic routing or server-side LLM decisions.

## 5. Architectural Boundaries

### 5.1 Daemon shell

The daemon shell owns:

- loopback-only listener startup;
- protected discovery publication;
- root bearer authentication for registration and existing registry operations;
- request body and connection limits;
- process signals and idle shutdown;
- construction of the registry, A2A task service, delivery router, and worker provider registry.

It contains no task-state decisions.

### 5.2 Session registry

The session registry retains its current responsibilities. Session registration gains only the coordination metadata needed by other modules:

- whether this adapter can accept A2A deliveries;
- a server-issued task capability;
- the session's current idle/running state;
- optional correlation to a managed-worker launch.

A session that does not advertise task delivery is observable but cannot be selected as an existing-session target.

### 5.3 A2A protocol adapter

The protocol adapter translates between A2A 1.0 HTTP/REST objects and the internal task service. It owns:

- Agent Card serialization;
- A2A request validation;
- TextPart and DataPart conversion;
- routing-extension validation;
- canonical A2A state and error mapping;
- source-session authentication and task visibility filtering.

It does not access SQLite directly.

### 5.4 Task service

The task service is the authoritative lifecycle module. It owns:

- task creation and follow-up messages;
- task ownership and target immutability;
- deadlines;
- cancellation requests;
- terminal-state arbitration;
- status and result projections;
- source and target session close behavior.

### 5.5 Delivery router

The delivery router owns:

- creation of ordered delivery records;
- one active claim per target session;
- atomic FIFO claims;
- target-idle checks;
- claim acknowledgement;
- at-most-once behavior after claim;
- target loss and cancellation notification.

A task and a delivery remain separate: a claimed delivery means that an adapter owns an injection attempt, not that the task has completed.

### 5.6 Worker provider registry

Managed-worker launching is hidden behind a harness-neutral interface. The core knows provider names and launch state but no Pi or Claude commands.

Conceptually:

```ts
interface WorkerProvider {
  readonly name: string;
  validate(request: WorkerRequest): void;
  start(request: WorkerStartRequest): Promise<{ launchId: string }>;
  cancel(launchId: string): Promise<void>;
}
```

Provider calls occur outside SQLite transactions. A successful start receives a one-time launch token. The launched worker presents that token during normal session registration, which binds the resulting session to the waiting task.

No concrete provider is enabled by this phase; tests use a fake provider.

## 6. A2A Identity and Discovery

### 6.1 Coordinator identity

The daemon publishes one stable Agent Card representing a **Local Agent Coordinator**. It is an A2A gateway/orchestrator without its own LLM. Actual reasoning is performed by the selected live session or managed worker behind it.

The card does not enumerate active sessions, cwd values, process IDs, session names, or harness identifiers.

### 6.2 Agent Card location

The card is available at:

```text
GET /.well-known/agent-card.json
```

It declares:

- A2A protocol version 1.0;
- one HTTP/REST interface on the loopback daemon;
- bearer authentication for task operations;
- TextPart and structured DataPart support;
- no streaming or push-notification capability;
- a route-to-active-session skill;
- a start-managed-worker skill only when at least one provider is installed;
- the required local-coordination extension URI.

The Agent Card itself requires no bearer token because it contains no dynamic session information and is reachable only on loopback.

### 6.3 Local coordination extension

A2A defines task and message lifecycle but does not define selection of an ephemeral local terminal session. The coordinator therefore advertises this versioned extension:

```text
urn:agent-session-registry:extension:local-coordination:v1
```

The first message for a task must contain exactly one bounded DataPart whose data selects one target:

```json
{
  "kind": "coordination.target",
  "target": {
    "type": "session",
    "sessionId": "registry-session-id"
  }
}
```

or:

```json
{
  "kind": "coordination.target",
  "target": {
    "type": "worker",
    "provider": "claude-code",
    "cwd": "/absolute/workspace/path",
    "options": {}
  }
}
```

Ordinary task instructions remain in TextPart. The target is immutable after task creation. Follow-up messages reference the existing task/context and omit the target selector.

Unknown required extensions and malformed or multiple target selectors are rejected without creating a task.

## 7. Protocol Surface

The first version implements one A2A binding: HTTP/REST.

### 7.1 Supported operations

```text
POST /message:send
GET  /tasks/{id}
GET  /tasks
POST /tasks/{id}:cancel
```

`SendMessage` supports both initial messages and follow-up messages on non-terminal tasks. It follows A2A blocking semantics unless the request asks to return immediately. If a blocking client disconnects, the task continues and remains available through `GetTask`.

`ListTasks` is cursor-paginated, sorted by last update descending, and restricted to tasks owned by the authenticated source session.

`CancelTask` is idempotent for a task that is already canceled. Other terminal tasks return the standard not-cancelable error.

### 7.2 Unsupported operations

The Agent Card declares streaming and push notifications as unsupported. Calls for streaming, subscriptions, push notification configuration, or an extended Agent Card return the corresponding A2A unsupported-operation error.

### 7.3 Supported content

The core accepts:

- TextPart up to 64 KiB per part;
- DataPart whose serialized JSON is up to 64 KiB per part;
- multiple supported parts within the total task-content limit.

It rejects FilePart, remote URIs, embedded bytes, images, audio, video, and unknown content types with `ContentTypeNotSupportedError`.

## 8. Private Adapter Delivery Contract

The A2A surface is for task callers. Harness adapters use a separate private v2 API authenticated by their session capability:

```text
POST /v2/sessions/{sessionId}/deliveries:claim
POST /v2/sessions/{sessionId}/deliveries/{deliveryId}:accept
POST /v2/sessions/{sessionId}/deliveries/{deliveryId}:reject
POST /v2/sessions/{sessionId}/tasks/{taskId}:progress
POST /v2/sessions/{sessionId}/tasks/{taskId}:complete
POST /v2/sessions/{sessionId}/tasks/{taskId}:fail
POST /v2/sessions/{sessionId}/tasks/{taskId}:canceled
```

These operations mean:

1. **Claim next delivery** — long-poll for up to 30 seconds while the session is idle. The request body may choose any whole-second wait from 0 through 30. A timeout returns HTTP 204.
2. **Acknowledge accepted** — report that the attributed prompt was injected.
3. **Reject delivery** — report a harness-level inability to inject it.
4. **Report progress** — update bounded visible status. The response states whether cancellation has been requested.
5. **Complete task** — submit bounded TextPart/DataPart results.
6. **Fail task** — submit a stable failure code and bounded visible explanation.
7. **Acknowledge canceled** — confirm cooperative cancellation.

All task mutation endpoints return the current canonical task state and cancellation flag. They reject updates from a session that does not own the active claim.

### 8.1 Claim behavior

A claim is allowed only when:

- the session is registered and its lease is valid;
- it advertised task-delivery capability;
- its latest state is idle;
- it has no other active claim;
- the delivery is queued, not canceled, and before its deadline.

The claim transaction selects the oldest eligible delivery and marks it claimed. Claim is the at-most-once ownership boundary. If the adapter disappears after claim, the coordinator fails the task rather than replaying the prompt.

Long polling waits without holding a SQLite transaction. A notification wakes waiters when eligible work appears or session state changes.

### 8.2 Visible prompt provenance

Future adapters must inject an attributed prompt, conceptually:

```text
From agent <source display label>, task <short task ID>:
<message text>
```

Structured source and task metadata remain outside transcript search. If the harness records the visibly injected prompt as a normal user message, existing registry capture may index that visible text. The task service itself does not copy A2A messages into registry events or FTS rows.

### 8.3 Follow-up delivery

A task may have only one claimed delivery at a time. Follow-up messages append to the task and create later FIFO delivery records. They wait until the target completes the current attributed turn and becomes idle.

## 9. Authentication and Authorization

### 9.1 Root daemon token

The protected discovery-file bearer token continues to authenticate daemon health, session registration, and existing registry operations. It is effectively a local administrator capability and never appears in logs or model-facing output.

### 9.2 Per-session task capability

Protocol version 2 registration returns a random per-session task capability in addition to the registry session ID and lease expiry. The capability:

- is generated from cryptographically secure random bytes;
- exists only in daemon and adapter memory;
- is compared using timing-safe logic;
- is deleted with the session;
- authorizes source or target task actions only for that session.

A source capability may create tasks, list/read its own tasks, append follow-ups, and cancel its own tasks. A target capability may claim deliveries assigned to that target and update only the currently claimed task.

Possession of one session capability cannot list another source's tasks, claim another target's deliveries, or infer whether an unauthorized task/session identifier exists.

### 9.3 Managed-worker launch token

A worker provider receives a one-time, short-lived launch token. Registration with that token:

- consumes it atomically;
- binds the new session to the waiting task;
- requires the session to advertise delivery capability;
- rejects reuse or expiry.

## 10. Data Model

Registry tables remain unchanged except for coordination-capability metadata associated with sessions. New domain tables are separate.

### 10.1 `a2a_tasks`

Stores:

- task ID;
- daemon instance ID;
- A2A context ID;
- source session ID;
- target kind and immutable selector;
- bound target session ID when available;
- canonical A2A state;
- cancellation-requested flag;
- deadline;
- created and updated timestamps;
- stable terminal error code when applicable.

### 10.2 `a2a_messages`

Stores ordered source/target messages and their validated TextPart/DataPart payloads. It does not store thinking, tool arguments, raw tool output, provider payloads, or authentication material.

### 10.3 `a2a_deliveries`

Stores:

- delivery ID;
- task ID;
- message range or message ID;
- target session ID;
- per-target FIFO sequence;
- queued, claimed, accepted, rejected, or resolved state;
- claim and acknowledgement timestamps.

A uniqueness constraint enforces at most one active claim per target session. Claim selection and state change occur in one transaction.

### 10.4 `worker_launches`

Stores provider name, task ID, launch ID, one-time token verifier, deadline, and optional bound session ID. It contains no provider credentials or command output.

## 11. Task and Delivery Lifecycle

### 11.1 Existing-session target

1. Authenticate the source capability.
2. Validate A2A content and the routing extension.
3. Confirm the target exists, is authorized as a routable local target, and advertises delivery capability.
4. Atomically create the task, initial messages, and queued delivery.
5. Return the submitted task immediately when requested, or wait for terminal state under normal A2A blocking semantics.
6. When the target is idle, its adapter atomically claims the oldest delivery.
7. The task moves from `SUBMITTED` to `WORKING` at claim.
8. The adapter accepts/rejects injection and reports progress or terminal output.
9. Completion stores bounded results and moves the task to `COMPLETED`.

### 11.2 Managed-worker target

1. Create a submitted task and worker-launch record.
2. Invoke the named WorkerProvider outside the transaction.
3. Give the provider a one-time launch token and bounded launch request.
4. Wait for a delivery-capable session to register with that token.
5. Bind that session to the task and create its queued delivery.
6. Continue through the normal claim and completion flow.

Provider absence, request rejection, launch failure, or launch timeout moves the task to `FAILED` with `WORKER_START_FAILED` or a more specific stable code.

### 11.3 Canonical task states

The core uses A2A states externally:

```text
SUBMITTED -> WORKING -> COMPLETED
                    |-> FAILED
                    |-> CANCELED
SUBMITTED ---------> CANCELED
SUBMITTED ---------> REJECTED
SUBMITTED ---------> FAILED
```

Internal delivery and launch states provide finer detail without inventing public task states.

### 11.4 Deadlines

- Default deadline: 30 minutes after task creation.
- Caller-selected deadlines may be shorter.
- Maximum deadline: 2 hours after task creation.
- Deadline checks use the injectable daemon clock.

An expired queued delivery is never claimable. An expired task becomes `FAILED` with `DEADLINE_EXCEEDED`. If it was already claimed, the coordinator also exposes a cancellation request to the target and ignores late completion.

### 11.5 Cancellation

Before claim, `CancelTask` atomically marks the task `CANCELED` and makes all queued deliveries unclaimable.

After claim, cancellation is cooperative:

1. set `cancellation_requested`;
2. expose it in adapter progress/heartbeat responses;
3. ask a managed WorkerProvider to stop when applicable;
4. wait for adapter acknowledgement;
5. transition to `CANCELED` when acknowledged.

Deadline or target loss may win the race and produce `FAILED`. Terminal transitions use compare-and-set semantics; late updates cannot overwrite a terminal state.

### 11.6 Session closure

When a source session closes:

- queued tasks are canceled;
- claimed tasks receive a cooperative cancellation request;
- task content remains only until the target acknowledges, the target lease expires, or the task deadline wins;
- the task is deleted immediately after that cleanup because no source remains to retrieve it.

When a target closes:

- unclaimed work fails with `TARGET_UNAVAILABLE`;
- claimed work fails with `DELIVERY_LOST`;
- completed tasks remain available to their active source session.

A target is never silently replaced or rerouted.

### 11.7 Daemon restart

No task state survives daemon restart. Task IDs include or encode a random daemon instance identifier. A request carrying an ID from another instance returns `TaskNotFoundError` with bounded metadata indicating `coordinator_restarted`, without revealing prior task content.

Clients may resubmit explicitly. The coordinator never claims to have resumed or reconstructed lost work.

## 12. Retention and Cleanup

All task, message, delivery, and worker-launch rows live in the existing in-memory SQLite database.

- Terminal tasks remain queryable while their source session is active.
- Closing the source removes terminal task content immediately.
- Source closure during active work retains content only for cooperative cancellation cleanup as described above.
- Expired source leases follow the same cleanup path as explicit closure.
- No task content, result, retry queue, or delivery record is written to disk.
- Active tasks prevent empty-daemon shutdown.
- Once no sessions, active cleanup, or retained source-owned results remain, the existing 30-second empty grace period applies.

## 13. Limits

The first version enforces:

- 64 KiB per TextPart;
- 64 KiB serialized JSON per DataPart;
- 1 MiB cumulative validated message/result content per task;
- 50 active tasks per source session;
- 500 active tasks globally;
- one claimed inbound task per target session;
- FIFO queued deliveries per target;
- 30-minute default deadline;
- 2-hour maximum deadline;
- bounded long-poll duration;
- bounded worker options and launch timeout;
- the daemon's existing total SQLite memory ceiling.

A limit failure is explicit and does not create a partial task. If a follow-up would exceed the cumulative task limit, that follow-up is rejected without changing existing task content.

## 14. Error Semantics

Stable internal failure codes map to A2A states and errors.

| Condition | Result |
|---|---|
| Malformed A2A request | binding-level invalid request |
| Unsupported content | `ContentTypeNotSupportedError` |
| Unknown required extension | `ExtensionSupportRequiredError` |
| Unknown/unauthorized task | `TaskNotFoundError` |
| Unauthorized or non-delivery-capable target | task `REJECTED` without target details |
| Target closes before claim | task `FAILED`, `TARGET_UNAVAILABLE` |
| Target disappears after claim | task `FAILED`, `DELIVERY_LOST` |
| Deadline expires | task `FAILED`, `DEADLINE_EXCEEDED` |
| Worker provider unavailable/fails | task `FAILED`, `WORKER_START_FAILED` |
| Old daemon-instance task ID | `TaskNotFoundError` with `coordinator_restarted` metadata |
| Cancel terminal non-canceled task | `TaskNotCancelableError` |
| Queue or memory limit | explicit resource-limit error |

Errors and logs never echo task content, capability tokens, worker options, or private target metadata.

## 15. Fault Isolation and Concurrency

- Registry ingestion and query do not wait for A2A long polls, worker launch, or task completion.
- No SQLite transaction contains network I/O, process spawning, provider calls, or long-poll waiting.
- Long-poll waiters are bounded and abort when their session closes or capability expires.
- Task terminal transitions are atomic and first-terminal-state-wins.
- Delivery claims use a transaction and a uniqueness invariant to prevent duplicate claims.
- Queue notification is advisory; correctness comes from transactional rechecking.
- A2A service failure does not stop heartbeat, lease expiry, transcript capture, or registry query.

## 16. Logging and Observability

Structured logs may contain:

- operation name;
- HTTP status or A2A error type;
- duration;
- counts;
- task state category;
- provider name when not sensitive.

They must not contain:

- message or result text;
- serialized DataPart values;
- source or target capability tokens;
- daemon discovery token;
- worker launch token;
- tool arguments/output;
- private session names, cwd values, or harness identifiers.

Internal metrics are optional and in-memory. No task history or audit log is introduced.

## 17. Protocol and Compatibility Rollout

Adding a per-session task capability changes registration contracts. The workspace advances its internal registry protocol from version 1 to version 2 in one coordinated package update. All private registry/client routes move from `/v1` to `/v2`; the standard A2A paths remain unversioned and require the `A2A-Version: 1.0` service parameter. The daemon does not serve mixed v1/v2 private APIs.

- contracts define `POST /v2/sessions` metadata with `acceptsTaskDelivery` defaulting to false and an optional one-time `launchToken`;
- registration returns `{ sessionId, leaseExpiresAt, taskCapability }`;
- daemon issues and validates scoped task capabilities;
- reusable client retains the task capability;
- the existing Pi adapter continues capture/query behavior but advertises task delivery as false;
- old daemon/client combinations fail closed through protocol health checks;
- daemon recovery starts a compatible process and restores registry snapshots as it does today.

This phase does not make Pi task-delivery capable. That requires its separate bidirectional-adapter design.

## 18. Testing Strategy

### 18.1 Domain tests

Use an injectable clock, in-memory database, fake notifier, and fake WorkerProvider to verify:

- every valid and invalid task transition;
- target immutability;
- follow-up ordering;
- FIFO claim order;
- one active claim per target;
- at-most-once behavior after claim;
- cancel/complete/deadline races;
- source and target closure;
- launch registration and one-time token consumption;
- ownership and cascade cleanup;
- every size/count/deadline limit.

### 18.2 Protocol tests

Validate against official A2A 1.0 shapes and representative SDK-generated fixtures:

- Agent Card correctness;
- REST `SendMessage`, `GetTask`, `ListTasks`, and `CancelTask` behavior;
- blocking and return-immediately send behavior;
- A2A state and error mapping;
- cursor pagination and ownership filtering;
- TextPart/DataPart acceptance;
- FilePart and unsupported-operation rejection;
- extension declaration and target-selector validation;
- ISO-8601 UTC timestamp serialization.

### 18.3 Authorization tests

Prove that:

- one source cannot list/read/cancel another source's task;
- one target cannot claim or update another target's delivery;
- closed/expired capabilities stop working;
- launch tokens are single-use and expire;
- unknown and unauthorized identifiers are indistinguishable;
- no error or structured log contains fixture secrets or content.

### 18.4 Concurrency tests

Cover:

- many senders queueing to one target;
- competing long polls claiming exactly one delivery;
- cancellation racing claim;
- completion racing deadline;
- session expiry racing completion;
- source closure racing a follow-up;
- daemon shutdown with active long polls;
- provider completion racing launch timeout.

### 18.5 Real-daemon end-to-end tests

Use two fake harness reporters and a fake provider against the built daemon:

1. register source and delivery-capable target;
2. send an A2A task to the target;
3. long-poll, claim, accept, and complete it;
4. retrieve the terminal result as the source;
5. prove busy-target FIFO behavior;
6. prove cooperative cancellation signaling;
7. launch and bind a fake managed worker;
8. restart the daemon and detect an old task ID as stale;
9. inspect the runtime directory and confirm it contains no task content;
10. rerun all existing registry recovery, privacy, and compact-query tests unchanged.

## 19. Acceptance Criteria

This phase is complete when:

- the daemon publishes a valid coordinator Agent Card;
- an authenticated local A2A caller can send, get, list, follow up on, and cancel tasks through the REST binding;
- a fake delivery-capable session can claim and resolve work exactly once;
- a fake WorkerProvider can launch a registration that binds to a waiting task;
- all task state, content, and capabilities remain in memory;
- daemon restart produces an explicit stale-task outcome rather than false recovery;
- task failures cannot block or corrupt existing registry behavior;
- current Pi capture/query behavior remains operational but does not advertise inbound delivery;
- tests cover protocol compatibility, ownership, privacy, limits, and concurrency races.

## 20. Follow-on Designs

After this core is implemented and accepted, separate designs should cover:

1. **Pi bidirectional adapter** — idle-aware long polling, attributed prompt injection, response correlation, cooperative cancellation, and a Pi WorkerProvider.
2. **Claude Code integration** — hooks or sidecar lifecycle, attributed prompt injection, MCP query/delegation tools, response correlation, and a Claude WorkerProvider.
3. **Optional A2A enhancements** — streaming/subscription, artifacts, direct session Agent Cards, or remote transport only when concrete use cases justify their privacy and complexity costs.

## 21. Primary References

- [A2A project](https://github.com/a2aproject/A2A)
- [A2A 1.0 specification](https://a2a-protocol.org/latest/specification/)
- Existing registry design: `docs/superpowers/specs/2026-07-22-active-agent-session-registry-design.md`
- Existing registry implementation plan: `docs/superpowers/plans/2026-07-22-active-agent-session-registry.md`
- A2A comparison research: `docs/research/active-session-registry-vs-a2a.md`
