# Active Agent Session Registry and Agent2Agent (A2A)

_Originally researched: 2026-07-23; updated for the integrated A2A coordinator: 2026-07-24._

## Summary

The local session registry and A2A solve adjacent problems and are both part of the current design:

- The **session registry** discovers and tracks live Pi processes, captures a bounded privacy-filtered view of their activity, resolves explicit delivery targets, and supports `query_active_sessions`.
- **A2A 1.0** supplies the interoperable task protocol used by sources to send, inspect, list, and cancel delegated tasks through the local coordinator.
- A2A does not automatically enumerate local Pi sessions. It describes how to discover an Agent Card at a known location or through a separate registry/catalog, and how to communicate with the server described by that card.

The project therefore retains the registry. Removing it would require another presence and target-discovery mechanism with equivalent responsibilities.

## Discovery is not session enumeration

A2A requires an A2A server to publish an Agent Card. Section 8.2 of the A2A specification lists three ways clients can find cards:

1. a well-known URI on an already-known server domain;
2. a registry or catalog;
3. direct configuration of an Agent Card URL or content.

None of these mechanisms enumerates arbitrary local Pi processes by itself. Likewise, A2A `ListTasks` lists tasks owned by one known A2A server; it does not list agents, terminals, or harness sessions.

In this project, the protected runtime discovery record locates one loopback coordinator. The coordinator publishes one public Agent Card. Individual Pi sessions are private, ephemeral delivery targets behind that coordinator rather than independent A2A servers.

## Current responsibility split

### Local session registry

The private registry protocol and in-memory store provide:

- session registration, heartbeat leases, state, and deletion;
- exact harness-session correlation for newly launched workers;
- names, working directories, activity state, and bounded transcript evidence;
- full-text and overview projections for `query_active_sessions`;
- explicit `deliveryTargetId` resolution;
- private target claim, acceptance, progress, completion, and failure operations;
- daemon discovery, ownership, recovery, and per-session capabilities.

### Public A2A coordinator

The coordinator exposes A2A 1.0 operations for:

- public Agent Card retrieval;
- `SendMessage` for an explicitly selected local target;
- `GetTask` and `ListTasks` for bounded task snapshots;
- `CancelTask` for cooperative cancellation;
- standard A2A task, message, part, state, and error mapping.

The required local-coordination extension carries the explicit target selector. A2A owns the source-facing task contract; private delivery remains an implementation detail between the coordinator and the selected Pi adapter.

### Persistent subagents

`packages/subagents` owns agent discovery, tmux layout, process launch, and single/parallel/chained orchestration. It requests the versioned in-process coordination API from `packages/pi-extension`, waits for the launched harness session to become delivery-capable, and then uses the same A2A task lifecycle. It never receives daemon URLs, root tokens, or per-session capabilities.

## Why one coordinator is preferable to one A2A server per Pi session

Running every Pi process as an independent A2A server would still require a local catalog of dynamic endpoints and liveness. It would also multiply listeners, credentials, Agent Cards, task stores, and recovery paths. The current coordinator centralizes those concerns while keeping all traffic loopback-only and all transcript/task content ephemeral.

A direct parent/child handshake could replace much of the registry for a narrower product that only launches managed children. It would not preserve discovery of arbitrary existing sessions, `query_active_sessions`, transcript search, or delegation to a previously running Pi session. That is not the current project scope.

## Session observability versus task observability

The two state models are deliberately different:

- Registry session state describes a live harness process and its recent activity, including idle/busy state, tool timing, and bounded visible transcript evidence.
- A2A task state describes one delegated unit of work and its exchanged messages or result.

Task status cannot substitute for session presence: a live idle Pi may have no A2A tasks, while completed tasks may outlive the activity that produced them until their source session or coordinator disappears.

## Privacy and identity

Registry capture includes finalized visible user and assistant text, assistant stop/error signals, tool name/status/timing, and basic session metadata. It excludes thinking, images, tool arguments, raw tool output, provider payloads, and authentication material. Transcript and task content remain in memory.

A2A identity describes the coordinator service through its Agent Card and identifies exchanged work through task, message, and context IDs. These identifiers are not equivalent to a local terminal process or Pi harness session. Internal session IDs and capabilities remain absent from model-facing output.

## Cross-harness implications

Another harness can use the public A2A surface only after it has an adapter and an authenticated source identity accepted by the local coordinator. Receiving work also requires a target adapter that implements the private claim and completion lifecycle, or a future standard A2A target bridge. A2A provides the task vocabulary and wire contract; it does not provide Pi or Claude Code lifecycle integration automatically.

## Decision

Retain the local registry and the public A2A coordinator as complementary layers. Do not replace registry presence, query, or target-resolution behavior with A2A task discovery. Revisit this only if the product scope is intentionally reduced to direct parent-launched workers without arbitrary session awareness.

## Sources

- [`docs/resources/architecture.md`](../resources/architecture.md) — current package topology, protocols, data flows, security invariants, and extension seams.
- [`A2A/docs/specification.md`](../../A2A/docs/specification.md), especially §3.1 and §8 — task operations, Agent Cards, and discovery mechanisms.
- [`docs/superpowers/specs/2026-07-22-active-agent-session-registry-design.md`](../superpowers/specs/2026-07-22-active-agent-session-registry-design.md) — original registry scope and privacy constraints; historical where superseded by current architecture.
