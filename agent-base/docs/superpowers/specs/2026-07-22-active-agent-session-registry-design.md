# Active Agent Session Registry Design

**Date:** 2026-07-22  
**Status:** Approved  
**Initial harness:** Pi

## 1. Purpose

Provide a local registry of currently active agent sessions so a user can ask an agent free-form questions such as:

- “What is going on in my other sessions?”
- “Which session needs my attention?”
- “Is another agent already working on this issue?”

The calling LLM may invoke one read-only query tool. Session capture and lifecycle management happen automatically in harness adapters; the LLM does not participate in ingestion, registration, heartbeat, or cleanup.

The MVP supports Pi on one local machine. It establishes a harness-neutral contract that later adapters, such as Claude Code, can implement.

## 2. Goals

- Track only currently active sessions.
- Capture normalized user/assistant transcript text and tool activity automatically.
- Let an LLM query active sessions through one bounded, read-only tool.
- Remove a session and its transcript immediately when it closes.
- Remove crashed sessions through heartbeat lease expiry.
- Avoid writing transcript content to disk.
- Keep capture failures from blocking or slowing normal harness operation.
- Make the adapter boundary reusable across agent harnesses.

## 3. Non-goals

The MVP does not include:

- adapters for harnesses other than Pi;
- closed-session history, analytics, or audit logs;
- vector embeddings or semantic indexing;
- remote access, cloud sync, TLS, or multi-user authentication;
- a web dashboard, MCP server, or server-side LLM summarization;
- automatic attention classification beyond deterministic error and activity signals;
- npm publication or a general installer.

## 4. Architecture

Use a TypeScript monorepo containing four packages.

### 4.1 `contracts`

Defines TypeBox schemas and inferred TypeScript types for:

- session metadata;
- normalized transcript events;
- lifecycle requests and responses;
- query requests and bounded query results;
- protocol and schema versions.

This package has no Pi, HTTP, or SQLite dependency. It is the stable boundary for future adapters and alternative service implementations.

### 4.2 `registry`

A local Node.js daemon that:

- binds to a dynamically selected loopback port;
- authenticates requests with a random bearer token;
- owns in-memory SQLite and FTS5 indexes;
- serializes event ingestion;
- manages leases, expiry, deletion, and idle shutdown;
- validates all external data at the HTTP boundary;
- performs bounded overview and lexical-search queries.

The service uses `node:http` with a small internal router. A general web framework is not required for the initial endpoint set. Fastify is the fallback if routing and validation plumbing begins to obscure domain behavior.

### 4.3 `client`

A typed client used by harness adapters. It owns:

- daemon discovery and authenticated health checks;
- startup locking and on-demand daemon spawning;
- stale discovery-file recovery;
- typed HTTP calls and protocol compatibility checks;
- event buffering, batching, timeouts, and retries;
- sequence-gap recovery through snapshot replacement.

The client does not know how Pi events are represented.

### 4.4 `pi-extension`

A thin Pi adapter that:

- translates Pi lifecycle and finalized message/tool events into normalized events;
- sends an initial current-branch snapshot on startup or resume;
- reconciles the snapshot after in-place tree navigation;
- updates active session state and heartbeat;
- flushes and deletes the registration on shutdown;
- registers the read-only `query_active_sessions` tool.

Future harness adapters should depend on `contracts` and `client`, not on Pi or SQLite.

## 5. Runtime discovery and daemon lifecycle

The client and daemon share a user-only runtime directory. A daemon discovery file contains:

- loopback port;
- daemon PID;
- bearer token;
- protocol version;
- daemon start timestamp.

It never contains transcript content. File and directory permissions must restrict access to the current user.

When an adapter starts:

1. Read the discovery file, if present.
2. Perform an authenticated health check and verify protocol compatibility.
3. If unavailable, acquire a filesystem startup lock.
4. Recheck discovery after acquiring the lock.
5. Spawn the daemon as a detached child only if no healthy compatible daemon exists.
6. Wait for a bounded authenticated readiness interval.
7. Publish the discovery file atomically, then register the session.

The registry exits 30 seconds after the final active session is removed. A later adapter restarts it on demand. Stale discovery files are identified by health check rather than PID alone.

## 6. Normalized domain model

### 6.1 Session

An active session contains:

- registry-generated `sessionId`;
- adapter type and adapter version;
- harness session identifier when available;
- working directory;
- optional human-readable session name;
- harness process ID;
- start timestamp;
- last activity timestamp;
- lease expiry timestamp;
- state: `idle` or `running`;
- latest accepted adapter sequence number;
- transcript completeness: `complete` or `truncated`.

### 6.2 Transcript events

The normalized event union contains:

- `message.user` — finalized visible user text;
- `message.assistant` — finalized visible assistant text, stop status, and optional error status;
- `tool.activity` — tool name, harness call ID, start/end timestamps, and `running`, `succeeded`, or `failed` status;
- `session.state` — state and activity transitions.

Every event has:

- a stable adapter-assigned event ID;
- monotonic sequence number;
- event timestamp;
- event-specific payload.

The enclosing registration snapshot or session-scoped endpoint supplies the registry session association; initial snapshot events cannot contain a registry ID that has not yet been assigned. Retries are idempotent by stable event ID and sequence number.

### 6.3 Capture policy

The Pi adapter stores:

- user text;
- visible assistant text;
- assistant stop/error status;
- tool name, status, and timing;
- session metadata and state.

It excludes:

- hidden thinking/reasoning blocks;
- image content;
- tool arguments;
- raw or rendered tool output;
- provider request/response payloads;
- authentication material.

Pi streaming deltas are not ingested. Finalized `message_end` events prevent duplicate partial content.

## 7. Pi lifecycle mapping

### 7.1 Startup and replacement

On `session_start`, the extension:

1. Ensures a compatible daemon is available.
2. Builds a normalized snapshot from Pi’s current active branch.
3. Registers the session with that snapshot.
4. Starts heartbeat and background flushing.

Pi emits `session_shutdown` followed by a new `session_start` for `/new`, `/resume`, `/fork`, and `/clone`. The old registration is deleted and the replacement registers independently.

### 7.2 In-place tree navigation

After `session_tree`, the adapter sends an atomic replacement snapshot. This makes registry content represent the branch currently visible to the active Pi runtime rather than abandoned branches.

### 7.3 Messages and tools

- Finalized user and assistant messages are captured from `message_end`.
- Tool start and end status come from `tool_execution_start` and `tool_execution_end`.
- Agent lifecycle events update session state to support overview queries.
- Session name changes update metadata.

### 7.4 Shutdown

On `session_shutdown`, the adapter:

1. Stops heartbeat and accepts no new capture events.
2. Makes a bounded best-effort event flush.
3. Sends idempotent session deletion.
4. Releases in-process resources.

If shutdown delivery fails, lease expiry removes the session.

## 8. HTTP API

All endpoints are under `/v1`, require bearer authentication—including the health endpoint—validate request bodies, and return structured error codes. The client generates the token before spawning the daemon and passes it through the child environment, allowing authenticated readiness checks before the discovery file is published.

### 8.1 Endpoints

- `GET /v1/health`  
  Returns readiness, daemon identity, and protocol version.

- `POST /v1/sessions`  
  Registers an active session and its initial normalized snapshot.

- `POST /v1/sessions/:id/events`  
  Ingests an ordered idempotent batch.

- `PUT /v1/sessions/:id/heartbeat`  
  Renews the lease and may update state and last activity.

- `PUT /v1/sessions/:id/snapshot`  
  Atomically replaces transcript events and resets the accepted sequence.

- `DELETE /v1/sessions/:id`  
  Idempotently deletes session metadata, transcript events, and FTS rows before returning success.

- `POST /v1/query`  
  Returns bounded metadata, deterministic signals, and excerpts from active sessions.

### 8.2 Sequence handling

Every mutating event request identifies the expected sequence range. Duplicate accepted events are no-ops. A sequence gap returns a dedicated conflict response. The client then discards its pending incremental queue and sends a fresh authoritative snapshot.

The adapter never silently skips a gap and continues with a transcript it claims is complete.

## 9. Query semantics

The Pi tool is named `query_active_sessions`. It accepts:

- required natural-language `query`;
- optional `mode`: `overview` or `search`;
- optional cwd/session filters;
- optional `includeCurrentSession`, defaulting to `false`;
- bounded limits for sessions, excerpts per session, and total returned characters.

### 9.1 Overview mode

Overview returns:

- session name/ID, adapter, cwd, state, and age of last activity;
- a bounded recent transcript tail;
- deterministic attention evidence:
  - failed tool activity;
  - assistant error status;
  - currently running tools;
  - prolonged inactivity;
  - transcript truncation.

The service does not declare that a session “needs attention.” It exposes evidence and lets the calling LLM interpret it.

### 9.2 Search mode

Search:

- removes stop words from the natural-language query;
- uses FTS5/BM25 to rank transcript matches;
- incorporates recency as a secondary signal;
- returns bounded match snippets and a short recent tail for context.

If mode is omitted, meaningful topic terms select search. A generic cross-session status or attention query selects overview. The Pi extension supplies its registry session ID directly to the client for default exclusion; the model does not need to know or reproduce that ID.

### 9.3 Output safety

The registry enforces limits even if the tool requests larger values. Results report truncation explicitly. Tool output remains below Pi’s general tool-output ceiling and never writes a full-result spill file, because that would violate the no-transcript-on-disk requirement.

## 10. Storage and concurrency

The registry uses an in-memory SQLite database with FTS5. A central daemon means adapters do not open the database or coordinate locks.

In-memory storage is intentional:

- only active sessions are in scope;
- closed sessions must be deleted;
- transcript content should not remain in database pages or WAL files;
- adapters can reconstruct active state from snapshots after daemon restart.

SQLite transactions provide atomic registration, snapshot replacement, event ingestion, lease deletion, and explicit close deletion. The Node daemon is the sole database owner and serializes write operations.

The registry enforces configurable per-session transcript and total-memory ceilings. When a ceiling is reached, it rejects additional event batches with a specific limit error. The adapter marks the session `truncated`; it does not silently claim complete capture.

## 11. Reliability and error handling

### 11.1 Lease behavior

Default timings:

- heartbeat interval: 10 seconds;
- lease duration: 45 seconds;
- daemon idle-exit grace: 30 seconds.

Lease expiry deletes the session in one transaction. Sleep/wake races are safe: if cleanup wins, the next adapter request receives “session not found” and re-registers from a fresh snapshot.

### 11.2 Non-blocking capture

Normal Pi work must not depend on registry availability.

- Event handlers perform lightweight normalization and enqueue work.
- A bounded in-process queue flushes batches in the background.
- Network calls use short connect and response timeouts.
- Retries use bounded exponential backoff with jitter.
- Extended failure causes queue replacement by a new snapshot after reconnection.
- No retry queue or transcript spool is persisted to disk.

The only startup work allowed to add bounded latency is daemon discovery/start and initial registration. Failure disables capture temporarily rather than preventing Pi startup.

### 11.3 User-visible failures

The extension may show a compact Pi status indicator for disconnected or truncated capture. It must not repeatedly notify or flood the transcript.

The query tool returns concise typed failures, including:

- registry unavailable;
- incompatible protocol version;
- invalid query;
- query budget exceeded.

It never hangs while attempting indefinite recovery.

## 12. Security and privacy

- Bind only to loopback.
- Require a random bearer token from the user-only discovery file.
- Validate every untrusted request against TypeBox schemas.
- Enforce body-size, event-count, text-size, and query-result limits.
- Never place transcripts, tokens, or query excerpts in daemon logs.
- Log only IDs, counts, durations, status codes, and error classes.
- Keep transcript data solely in daemon memory.
- Delete session metadata, events, and search rows atomically on close or expiry.

This is local single-user protection, not a multi-user security boundary. Any process running as the same OS user may be able to access the runtime token.

## 13. Testing strategy

### 13.1 Contract tests

- Validate every request, response, and event fixture.
- Confirm Pi normalization excludes thinking, images, tool arguments, and tool output.
- Verify unsupported protocol versions fail clearly.

### 13.2 Registry unit tests

Using an injectable clock:

- idempotent ingestion and duplicate batches;
- sequence-gap rejection;
- atomic snapshot replacement;
- explicit deletion and cascading FTS cleanup;
- lease expiry and idle shutdown;
- FTS5 ranking and recency tie-breaking;
- overview attention evidence;
- current-session exclusion;
- every request and output budget;
- malformed data, authentication failure, and log redaction.

### 13.3 Client and concurrency integration tests

- Concurrent startup produces one daemon.
- Duplicate retries remain idempotent.
- Lost batches cause snapshot recovery.
- Daemon death causes restart and active-session re-registration.
- Simultaneous ingest, query, close, and expiry remain consistent.
- Registry outage does not block a simulated harness event loop.
- Fifty simulated concurrent sessions ingest and query without errors.

The fifty-session case is a confidence test, not a stated production capacity.

### 13.4 Pi adapter tests

- Unit-test Pi-to-normalized translation separately from transport.
- Test buffering and state transitions with a fake client.
- Smoke-test extension lifecycle registration against Pi.
- Exercise the registered query tool against a real local registry.

### 13.5 Manual acceptance

With two real Pi processes:

1. Both automatically register as distinct active sessions.
2. One agent answers “What’s going on in my other sessions?” through one bounded tool call.
3. A topic query returns relevant FTS excerpts.
4. Tool or assistant failures appear as attention evidence.
5. Clean close removes the session before deletion returns.
6. Forced process termination removes the session after lease expiry.
7. Forced daemon termination is followed by recreation and fresh snapshots.
8. Inspection confirms excluded content was never captured.

## 14. Packaging and rollout

The monorepo should expose a Pi package manifest pointing at the extension entry point. Runtime dependencies belong in `dependencies`; Pi packages imported by the extension remain peer dependencies as required by Pi packaging conventions.

The MVP is installed through a local package path with `pi install /absolute/path/to/package`. This verifies the production package shape without including npm publication in scope.

## 15. Future evolution

Likely follow-on work, each requiring a separate design, includes:

- a Claude Code adapter using the same contracts and client;
- a standalone CLI or dashboard;
- authenticated remote/multi-machine transport;
- optional retained history with an explicit privacy model;
- semantic/vector retrieval if lexical search proves insufficient;
- replacing the Node daemon with Go or Rust while preserving the HTTP contract.
