# Coordination Reliability and Pi Delegation — Root-Cause Specification

**Date:** 2026-07-24  
**Status:** Approved for implementation  
**Scope:** local registry daemon ownership, disconnected delivery claims, and source-facing Pi delegation

## 1. Problem statement

Real-process validation exposed three failures that prevent dependable Pi-to-Pi coordination:

1. A delivery claim whose HTTP client disconnects can survive in the registry, claim a later task, and leave that task permanently `working` with no target holding its delivery ID.
2. A registry daemon can remain authenticated and listening after losing its discovery record. A client then starts a second daemon, splitting reporters between two in-memory coordinators.
3. Pi can receive delegated work but cannot initiate it. The extension exposes only `query_active_sessions`, and that tool omits the opaque session selector needed for explicit routing.

The private registry protocol remains version `2`. Public A2A remains protocol `1.0`.

## 2. Root causes

### 2.1 Disconnected claim lifetime is not propagated

`PiInboundDelivery.onAgentStart()` correctly aborts its client-side long poll when Pi becomes busy. `CoordinationTransport` propagates that cancellation to `fetch`, but the registry HTTP adapter calls `DeliveryRouter.claim()` without an `AbortSignal`.

Consequently, the server-side wait remains registered after the socket is gone. If a task notification arrives before asynchronous session-state reporting changes the target from `idle` to `running`, the abandoned wait calls `claimNext()`. Claiming changes the task to `working`; because the HTTP consumer no longer exists, no Pi process receives the delivery ID and no later claim can recover the task.

The reporter-state delay widens the race but is not the ownership failure. The registry must never let work outlive the request that receives its claim token.

### 2.2 Discovery publication is not a daemon-lifetime lease

The daemon publishes `registry.json` once and never verifies continued ownership. The client startup lock exists only while spawning and is then removed. Missing or malformed discovery is treated as absence, allowing another daemon to start while the original remains alive. Existing reporter heartbeats can keep the original non-empty indefinitely.

Conditional discovery-file removal prevents an old daemon from deleting a successor's record, but does not prevent simultaneous listeners. Runtime ownership must cover the daemon's entire listening lifetime, not just startup.

### 2.3 Outbound Pi coordination is an absent interface

The coordinator already supports source-scoped A2A send/get/list/cancel and target-scoped private delivery operations. The Pi adapter consumes target credentials for inbound delivery, but provides no source-oriented A2A client and no model-facing delegation tool. Its query projection also strips both `sessionId` and `acceptsTaskDelivery`, making explicit target selection impossible.

This is an implementation gap rather than a wire-protocol defect.

## 3. Required behavior

### 3.1 Claim cancellation

- The lifetime of `POST /v2/sessions/:id/deliveries:claim` MUST be bound to the inbound HTTP request/response connection.
- Request abortion or response closure MUST abort `DeliveryRouter.claim()` before it can claim future work.
- The handler MUST remove connection listeners after the wait completes.
- The handler MUST not write a response after disconnection.
- A task arriving after an abandoned long poll MUST remain `submitted` and MUST be claimable by the target's next live poll.
- Existing client-side cancellation on Pi `agent_start` and shutdown MUST remain.

### 3.2 Exclusive daemon ownership

- At most one daemon may own and listen for one runtime directory at any instant.
- Ownership MUST persist for the daemon's full lifetime and be distinct from the short client startup lock.
- A daemon MUST periodically verify that the discovery record still identifies its PID, token, protocol version, and startup identity.
- Missing, malformed, or replaced discovery means ownership loss. The daemon MUST stop accepting connections, close runtime resources, and conditionally release ownership.
- A replacement daemon MUST wait for the previous owner to stop listening before publishing and serving.
- Crash recovery MUST use bounded stale-owner detection; PID existence alone is insufficient because of PID reuse.
- Existing reporters connected to an owner that loses discovery MUST encounter connection failure and enter their existing rediscovery path.
- Ownership files MUST be mode `0600` or directories mode `0700`; no token may appear in logs or errors.

Implementation may use a lifetime lock directory with an unguessable nonce and refreshed ownership timestamp. Cleanup must compare ownership identity before removal. Startup and ownership timing must fit within an explicitly tested client deadline.

### 3.3 Source-facing Pi delegation

Expose an outbound coordination module and one strict Pi tool with actions:

```ts
{ action: "send"; targetId: string; instruction: string; deadlineMinutes?: number }
{ action: "watch"; taskId: string }
{ action: "cancel"; taskId: string }
```

Requirements:

- `query_active_sessions` MUST include an opaque `deliveryTargetId` only for delivery-capable sessions other than the caller.
- The target ID is a routing selector, not a credential. Capabilities, root token, process ID, harness session ID, and event IDs MUST remain hidden.
- `send` MUST use the official A2A SDK, A2A `1.0`, the required local-coordination extension, exactly one explicit session target selector, text input only, and `returnImmediately: true`.
- `watch` MUST perform one bounded task snapshot; it MUST NOT create hidden unbounded polling.
- `cancel` MUST explicitly request cancellation. Aborting a tool invocation MUST abort only its HTTP request and MUST NOT implicitly cancel the task.
- Credentials MUST be resolved from the current reporter at execution time because daemon restart rotates URL, session ID, and task capability.
- Caller-supplied coordinator URLs are forbidden.
- Tool output MUST contain only bounded task identity/state/deadline/cancellation/terminal fields and visible target text. Raw A2A payloads and credentials are forbidden.
- Source ownership checks remain enforced by the daemon. A tool must not access tasks owned by another source session.

## 4. Regression tests

### 4.1 Disconnected long poll

A real HTTP integration test MUST:

1. establish that the server entered a 30-second claim;
2. abort the client and observe the client request reject;
3. create a task while registry metadata may still say `idle`;
4. assert the task remains `submitted`;
5. assert the next live claim receives it.

A router-only test is insufficient because the router already supports cancellation; the defect is at the HTTP boundary.

### 4.2 Discovery loss

A real-process test MUST keep daemon A non-empty, delete its discovery file, invoke normal daemon discovery/startup, and prove:

- daemon B becomes healthy and owns discovery;
- daemon A is no longer reachable on its authenticated health endpoint;
- no arbitrary sleep is used as the sole synchronization mechanism;
- runtime permissions and conditional cleanup remain correct.

Add focused ownership tests for concurrent acquisition, replacement, stale-owner recovery, and old-owner cleanup safety.

### 4.3 Pi delegation

Tests MUST cover:

- eligible target-selector visibility and current-session exclusion;
- send/watch/cancel wire behavior and compact projection;
- required A2A version and coordination extension;
- credential secrecy in results, errors, snapshots, and logs;
- refreshed credentials after reporter recovery;
- tool abort without task cancellation;
- source ownership isolation;
- an end-to-end source client → real inbound target completion path.

A final isolated real-process validation SHOULD run two real Pi processes. Pi A must select Pi B using query output, send a unique task through the new tool, watch it to completion, and observe Pi B's visible result. The validation must bind only to `127.0.0.1`, avoid global Pi configuration changes, and clean up every spawned process and temporary runtime directory.

## 5. Non-goals

- Persisting tasks or transcripts to disk.
- Automatic target selection or load balancing.
- Push notifications, A2A streaming, file parts, or arbitrary JSON input from the Pi tool.
- Recovering already-claimed tasks across daemon crashes.
- Exposing bearer capabilities to the model.
- Changing private protocol `2` or public A2A `1.0`.

## 6. Acceptance criteria

- The disconnected-claim regression is red before the fix and green after it.
- Discovery loss cannot leave two simultaneously reachable daemons for one runtime.
- Existing daemon restart, lease, privacy, and protocol-mismatch tests remain green.
- Pi exposes both session query and delegated-task management tools.
- SDK-to-Pi and real Pi-to-Pi completion work with visible-result correlation.
- Busy-target submission remains queued and completes after the target becomes idle.
- `npm test`, `npm run typecheck`, and `npm run build` pass.
- No temporary processes, runtime directories, debug instrumentation, or global Pi settings remain after validation.
