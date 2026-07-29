# Agent Activity Hub Monitor Design

**Date:** 2026-07-27
**Status:** Approved for planning
**Scope:** Harness-agnostic naming, read-only monitor API, and standalone Go CLI/TUI

## 1. Purpose

Rename the active agent session registry subsystem to **Agent Activity Hub** and add a standalone, read-only **Activity Monitor**. The monitor will answer one question quickly:

> What is each live agent session doing right now?

The default command prints a concise snapshot and exits. An interactive mode provides a polished, information-dense terminal interface built with Charmbracelet libraries.

The monitor is a client of the hub, not a Pi extension. Pi remains one possible activity producer through its adapter, and Pi's existing `/sessions` extension remains the Pi-native interface.

## 2. Goals

- Replace the overloaded “registry” product/domain name with **Agent Activity Hub**.
- Present live activity from any conforming harness adapter without Pi-specific behavior.
- Provide a fast, non-interactive snapshot as the default experience.
- Provide a responsive, read-only TUI for live inspection and drill-down.
- Use a dedicated, least-privilege monitor API and capability.
- Keep the hub's existing local, ephemeral privacy model.
- Exclude verbatim transcript content from monitor responses.
- Make the monitor easy to distribute as a standalone Go binary.
- Preserve a stable API seam for possible web, desktop, or editor clients later.

## 3. Non-goals

This design does not include:

- delegation, cancellation, worker launch, or session termination from the monitor;
- persistent session or task history;
- remote or LAN access;
- a web, desktop, menu-bar, or editor interface;
- notifications or observability-system export;
- replacing the TypeScript daemon, adapters, or coordination implementation with Go;
- replacing Pi's `/sessions` experience;
- model-generated activity summaries;
- installation of the monitor through the Pi package;
- a compatibility API that permanently retains “registry” terminology.

## 4. Product Vocabulary and Rename

The subsystem uses the following vocabulary:

| Term | Meaning |
|---|---|
| **Agent Activity Hub** | The complete local subsystem for live agent presence, activity, and coordination |
| **hub daemon** | The centralized, loopback-only, ephemeral service |
| **adapter** | A harness-specific producer of normalized session activity |
| **Activity Monitor** | The standalone human-facing snapshot CLI and interactive TUI |
| **session** | One live adapter instance representing agent work |
| **task** | One coordinated A2A work item |

The command is `agent-hub`; it opens the interactive TUI by default. Use `agent-hub list` for one-shot output.

The rename applies to subsystem package scopes, protocol identifiers, runtime paths, environment variables, documentation, and user-facing messages. Internal database operations may use the generic verb “register,” but no component remains named “registry.”

The repository-level Agent Base name remains unchanged because it also distributes subagent functionality outside this subsystem.

Proposed technical names are:

- TypeScript package scope: `@agent-hub/*`;
- runtime directory: `$XDG_RUNTIME_DIR/agent-activity-hub`, with the existing platform fallback policy;
- local coordination extension prefix: `urn:agent-activity-hub:`;
- executable: `agent-hub`.

## 5. Architecture

```text
Harness adapters ──publish──> Agent Activity Hub daemon
                                      │
                              read-only monitor API
                                      │
                         Agent Activity Hub client
                              ┌──────┴──────┐
                         Snapshot CLI   Interactive TUI
```

### 5.1 Hub daemon

The TypeScript hub daemon remains authoritative for:

- session liveness and lease expiry;
- normalized activity ingestion;
- current-state projection;
- activity-summary selection;
- attention classification;
- response bounds;
- monitor authentication;
- A2A task coordination.

The daemon does not contain terminal presentation logic.

### 5.2 Harness adapters

Adapters publish normalized session metadata and events. They may additionally publish a bounded, display-safe activity summary. Adapters remain responsible for excluding harness-private data from normalized events.

Pi is one adapter implementation. Neither the monitor API nor Go executable imports Pi APIs or uses Pi's in-process coordination interface.

### 5.3 Go Activity Monitor

The monitor is a standalone Go executable with three public commands or modes:

```text
agent-hub               Open the interactive monitor (default)
agent-hub list          Print one styled snapshot and exit
agent-hub list --json   Print the snapshot contract as JSON and exit
agent-hub version       Print client version and build information
```

The Go client owns daemon discovery, monitor authentication, protocol validation, reconnect behavior, and rendering. It does not start the daemon, register itself as a session, read SQLite, or reimplement hub projections.

### 5.4 Source layout

The implementation uses these repository paths:

```text
go.mod
cmd/agent-hub/             Executable entry point and command parsing
internal/monitorapi/       Discovery, authentication, types, and HTTP client
internal/snapshot/         Plain, styled, and JSON snapshot output
internal/tui/              Bubble Tea application and components
schemas/monitor/v1/        Canonical JSON Schemas and shared fixtures
```

The monitor API client, snapshot renderer, and Bubble Tea model remain independently testable.

## 6. Monitor API

### 6.1 Endpoints

The daemon exposes a versioned, read-only surface:

```text
GET /monitor/v1/snapshot
GET /monitor/v1/snapshot?after=<revision>&wait=<milliseconds>
GET /monitor/v1/sessions/<monitor-id>
```

`GET /monitor/v1/snapshot` returns hub health, a monotonically changing daemon-lifetime revision, generation time, and bounded live-session summaries. A snapshot contains at most 500 sessions and reports the total count and a truncation flag when that limit is exceeded.

When `after` equals the current revision, the daemon waits for a relevant change or the bounded wait duration. The TUI requests 25 seconds; the daemon permits at most 30 seconds. It then returns either a new snapshot or an unchanged response.

`GET /monitor/v1/sessions/<monitor-id>` returns bounded operational detail for one currently live session. Monitor IDs are opaque identifiers, not session capabilities or harness session IDs.

The default CLI performs one immediate snapshot request. The TUI loads an initial snapshot, long-polls by revision, and fetches detail only for the selected session when required.

### 6.2 Contract ownership

The monitor contract is defined by canonical, language-neutral JSON Schema under `schemas/monitor/v1/`.

- The TypeScript server validates its projections against the schema.
- The Go client uses matching typed structs.
- Both implementations consume shared valid and invalid fixtures.
- Monitor API versioning is independent of internal database and A2A protocol versions.
- Unknown response fields are tolerated within monitor API v1; missing required fields and invalid known fields are rejected.

### 6.3 Projection responsibility

The daemon, not the Go client, determines:

- canonical session state;
- attention reasons;
- default activity ordering;
- display-safe activity summaries;
- duration source timestamps;
- response truncation and completeness indicators.

The Go client may apply user-selected filters and sorting to fields explicitly present in the contract. It does not inspect raw events to infer state.

## 7. Monitor Data and Privacy

### 7.1 Snapshot fields

Each bounded session summary includes:

- opaque monitor ID;
- display name;
- adapter or harness label;
- workspace display value;
- current state;
- display-safe activity summary;
- state start or last-activity timestamp;
- zero or more deterministic attention reasons;
- active tool count and active task state when present;
- completeness indicators when any value is unavailable or truncated.

Display names are limited to 128 characters, adapter/harness labels to 64, workspace display values to 160, activity summaries to 240, and attention reasons to eight entries of 120 characters each. The workspace display value is suitable for terminal output. Full paths are limited to 4,096 characters on the detail endpoint.

### 7.2 Detail fields

Session detail may include:

- adapter name and version;
- full bounded working directory;
- session start and last-activity times;
- current operational state;
- latest adapter-provided activity summary;
- bounded tool names, statuses, and durations;
- associated task IDs and states without task prompt or result content;
- deterministic attention reasons;
- an operational timeline containing at most 100 event categories, timestamps, tool states, and state changes.

Tool detail contains at most 50 active or recent tool records. Detail responses carry completeness flags when either bound truncates data.

### 7.3 Excluded fields

Monitor responses never include:

- verbatim user messages;
- verbatim assistant messages;
- thinking or reasoning content;
- tool arguments or raw tool output;
- task prompt or result text;
- provider payloads;
- root, session, task, delivery, or monitor capabilities;
- process IDs;
- harness-private session identifiers.

### 7.4 Activity summaries

Adapters may publish a bounded `activity.summary` event intended for human display. This value must be explicitly treated as monitor-safe by the adapter.

If no summary exists, the daemon uses deterministic operational text such as:

- “assistant responding”;
- “running `go test`”;
- “waiting on delegated task”;
- “idle.”

The daemon does not call a model and does not derive a semantic summary from verbatim transcript text.

## 8. Authentication and Discovery

The hub creates a dedicated, read-only monitor capability. It authorizes only monitor `GET` endpoints and cannot:

- register or delete sessions;
- append or replace events;
- access raw transcript/search projections;
- send, watch, cancel, claim, or mutate tasks;
- perform daemon maintenance.

Monitor discovery metadata is written separately from maintenance discovery metadata with user-only filesystem permissions. It contains only the loopback endpoint, monitor API version, daemon start identity, and monitor capability required by the standalone client.

The capability rotates on daemon restart. The Go client resolves discovery again after authentication failure or connection loss. The daemon remains bound to loopback, and the monitor persists no endpoint, capability, response cache, or history to disk.

## 9. Snapshot CLI Experience

Running `agent-hub list` prints a current snapshot and exits:

```text
AGENT ACTIVITY                                      4 live · updated now

SESSION          HARNESS   WORKSPACE       ACTIVITY                    AGE
fix-auth         Claude    quay            Running tests                8m
review-4821      Pi        quay-ui         Reviewing PR #4821          14m
konflux-debug    Cursor    operator        Waiting on pipeline           6m
docs             Pi        agent-base      Idle                          3m
```

Behavior:

- active and attention sessions appear before waiting and idle sessions;
- columns adapt to terminal width without wrapping rows;
- narrow output drops lower-priority columns and marks truncation;
- color reinforces status but never carries meaning alone;
- `--no-color` emits plain aligned text;
- `--wide` retains additional columns when the terminal permits;
- `--json` emits the stable monitor snapshot contract;
- no alternate screen, animation, or persistent process is used;
- no live sessions produces a clear successful empty state;
- no running daemon produces a distinct diagnostic and non-zero exit.

Transcript excerpts do not appear in any snapshot mode.

## 10. Interactive TUI Experience

The TUI uses:

- Bubble Tea for the update/view architecture;
- Bubbles for table, viewport, filter input, spinner, and help components;
- Lip Gloss for responsive layout, adaptive color, borders, and typography.

Huh is not required because the first version has no guided forms.

The visual style is polished and information-dense:

```text
┌ Agent Activity Hub ─ 4 live ─ 1 attention ─ updated now ───────────┐
│ Sessions                         │ Session detail                    │
│ ● fix-auth      running    8m    │ fix-auth · Claude                 │
│ ! review-4821   attention 14m    │ ~/workspace/quay                  │
│ ◐ pipeline      waiting    6m    │ Running test/auth...              │
│ ○ docs          idle       3m    │                                  │
│                                  │ Recent activity                   │
│                                  │ 12:41 tool started · go test      │
│                                  │ 12:40 assistant responding        │
├──────────────────────────────────┴───────────────────────────────────┤
│ / filter   s sort   r refresh   ? help   q quit                     │
└──────────────────────────────────────────────────────────────────────┘
```

### 10.1 Layout

- Terminals at least 100 columns wide use a session list and detail pane.
- Terminals from 60 through 99 columns use separate list and detail screens.
- Terminals smaller than 60 columns or 16 rows show a minimum-size message instead of a broken layout.
- The header shows hub health, live-session count, attention count, and freshness.
- The footer shows context-sensitive keys and active filter state.

### 10.2 Interaction

- Arrow keys and `j`/`k` move selection.
- Enter opens detail in narrow mode.
- Escape returns to the list or clears the active interaction.
- `/` opens text filtering.
- `s` changes sort order.
- `r` forces rediscovery and refresh.
- `?` toggles help.
- `q` exits when no text input is active.

Filters cover text, state, harness, and workspace. Sort options cover hub activity order, age, harness, workspace, and name.

Selection, filters, sort choice, and scroll position survive data refreshes when their referenced items still exist.

### 10.3 Accessibility and terminal compatibility

- Every status glyph has a textual label.
- Styling adapts to dark and light terminal backgrounds.
- `NO_COLOR` and `TERM=dumb` disable decorative color.
- The UI remains usable with keyboard-only navigation.
- Resize events recompute layout without losing selection.

## 11. Failure and Recovery Behavior

| Condition | Snapshot behavior | TUI behavior |
|---|---|---|
| Hub is not running | Explain that the hub is not running; do not start it | Show the same diagnostic and exit |
| No live sessions | Print a successful empty state | Show an empty list with hub health |
| Temporary disconnect | Print the connection error and exit non-zero | Keep the last valid view, mark it stale, retry with bounded backoff |
| Daemon restart | Rediscover once before failing | Rediscover endpoint and rotated capability, then load a fresh snapshot |
| Authentication failure | Rediscover once before failing | Rediscover; never repeatedly submit a rejected credential |
| Protocol mismatch | Print client/server versions and upgrade guidance | Show a blocking compatibility screen |
| Malformed response | Reject it and exit non-zero | Keep the last valid view and show a non-destructive error banner |
| Selected session expires | Not applicable | Select the nearest remaining row; clear detail when none remain |
| Terminal too small | Emit plain snapshot output | Show the required minimum dimensions |

Retries use exponential backoff with jitter, starting at 250 milliseconds and capped at 10 seconds. A successful response resets the retry state. Stale data is always visibly labeled and never presented as current.

## 12. Packaging and Release

The monitor is distributed independently of Pi through private GitHub Release archives for:

- macOS arm64;
- macOS amd64;
- Linux arm64;
- Linux amd64.

Each release includes SHA-256 checksums. Build version, commit, and build date are injected into `agent-hub version`. Release automation runs contract, Go, TypeScript, integration, and artifact smoke tests before publication.

The executable does not require Node.js or repository dependencies. A separately installed adapter currently starts and owns the TypeScript daemon, which still requires its existing Node.js runtime.

A Homebrew tap may consume these artifacts in a later project; it is not part of this design.

## 13. Rename Migration

The rename is a coordinated breaking release:

1. Rename TypeScript package scopes and imports from `@agent-session/*` to `@agent-hub/*`.
2. Rename daemon discovery/runtime paths and protocol identifiers.
3. Update extension bundles, tests, documentation, diagnostics, and release validation.
4. Add detection for the legacy runtime directory.
5. If a legacy daemon is detected, refuse to start a competing renamed daemon and instruct the user to update and restart active sessions.
6. Do not migrate ephemeral sessions or tasks.
7. Retain the legacy-runtime detector through the rename release and the next feature release, then remove it in the following breaking release; do not retain a legacy API.

All installed adapters must update together. Active sessions restart during the upgrade. This avoids silently splitting activity between old and new daemons.

## 14. Testing Strategy

### 14.1 Go unit tests

Test:

- Bubble Tea state transitions with deterministic messages;
- selection preservation across refresh, expiry, filtering, sorting, and resize;
- wide, narrow, minimum-size, stale, empty, and error layouts;
- snapshot rendering at representative widths;
- no-color and dumb-terminal behavior;
- JSON output stability;
- discovery, retry, restart, and protocol-mismatch transitions.

Layout tests assert structural regions and essential text rather than every ANSI byte.

### 14.2 Contract tests

Both TypeScript and Go consume shared fixtures covering:

- valid minimal and complete responses;
- invalid required fields and field types;
- tolerated unknown fields;
- API version mismatch;
- maximum summary, session, tool, and timeline bounds;
- truncation/completeness markers;
- absence of transcript, raw tool, task-content, process-ID, harness-ID, and capability fields.

### 14.3 Daemon integration tests

Verify:

- monitor capability access is limited to monitor `GET` endpoints;
- mutation, maintenance, raw search, and A2A endpoints reject it;
- initial snapshot and detail projections are bounded;
- long-poll wakes on relevant changes and times out cleanly;
- session expiry advances revision and removes detail;
- restart rotates capability and supports rediscovery;
- multiple adapter names work without Pi-specific assumptions;
- legacy and renamed daemons cannot run silently in parallel.

### 14.4 End-to-end and artifact tests

Launch the real daemon, publish sessions through test adapters, and invoke the built Go executable to verify:

- styled, plain, JSON, empty, and disconnected snapshot modes;
- TUI initial state and long-poll refresh;
- disconnect and restart recovery;
- removal of an active selection;
- protocol mismatch diagnostics;
- execution of release artifacts outside the repository without Node or Go dependencies on the monitor side.

## 15. Acceptance Criteria

The design is complete when:

1. `agent-hub` opens the interactive Charmbracelet TUI by default, providing responsive, read-only live inspection.
2. `agent-hub list` reports up to 500 live sessions in one snapshot, clearly reports any truncation, and exits.
3. The monitor executable contains no Pi dependency and works with multiple adapter labels.
4. Monitor credentials cannot access session mutation, transcript search, or task operations.
5. Monitor responses contain no verbatim transcript, raw tool output, task content, harness-private IDs, process IDs, or capabilities.
6. The TUI visibly handles stale data, daemon restart, expired selection, narrow terminals, and protocol mismatch.
7. No monitor data or credentials are persisted by the Go client.
8. GitHub Releases provide checksummed standalone artifacts for the four approved platform/architecture pairs.
9. The old “registry” subsystem name is removed without allowing old and renamed daemons to split active sessions silently.
10. Contract, unit, integration, end-to-end, and release-artifact tests pass.

## 16. Alternatives Considered

### Local web dashboard

A web interface offers richer visual layout and future timeline exploration, but adds a frontend/server lifecycle, browser context switch, and larger security surface. It is not the best fit for quick on-demand inspection over terminals, tmux, or SSH.

### Desktop or menu-bar monitor

A passive application is well suited to notifications, but is platform-specific and optimizes awareness rather than the chosen question of inspecting all current work on demand.

### MCP or another agent-facing tool

MCP can expose hub data to agents, but it is not a human operations interface. It may be added independently without replacing the Activity Monitor.

### Pi-integrated TUI

Pi already has a `/sessions` extension. Building the monitor into Pi would duplicate that interface and violate the goal of making the hub harness-agnostic.

### TypeScript TUI

A TypeScript terminal UI would align with the existing implementation language, but would not provide the requested Charmbracelet experience or standalone deployment properties. Go is limited to the monitor to avoid rewriting stable hub internals.

### Full Go rewrite

Rewriting the daemon and coordination core would enlarge risk and scope without improving the first user-facing monitoring experience. The versioned monitor API provides a clean language boundary instead.
