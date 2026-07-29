# Persistent Subagents Design

## Status

Accepted design. This document describes the current persistent-subagent extension in `packages/subagents` and its boundary with the Agent Activity Hub coordination runtime.

## 1. Purpose

The `subagent` Pi tool delegates work to named, specialized Pi sessions that remain visible and usable in tmux panes. It provides isolated context without creating hidden one-shot model processes, while reusing the local coordination runtime for task delivery, result collection, cancellation, and recovery.

The design optimizes for:

- visible worker lifecycle in the caller's tmux window;
- isolated context and agent-specific prompts/tools;
- predictable single, parallel, and chained delegation;
- bounded, text-oriented results;
- explicit model selection with inexpensive defaults;
- no exposure of hub credentials to model-facing tools.

## 2. Non-goals

The subagent extension does not:

- implement its own task database, daemon, or A2A server;
- route work implicitly to arbitrary active sessions;
- place task text on a child-process command line;
- expose bearer tokens or coordinator URLs to the model;
- accept a model override in each tool invocation;
- destroy an accepted worker merely because the parent tool was canceled;
- provide durable task history after the local coordinator restarts.

## 3. Runtime topology

```text
Parent Pi process
  │
  ├─ subagent tool
  │    ├─ discover agent definition
  │    ├─ create/tag tmux worker pane
  │    ├─ start child Pi with prompt/model/tools
  │    └─ use in-process coordination API
  │             │
  │             ▼
  │      Agent Activity Hub daemon
  │        ├─ registers child session
  │        ├─ delivers task through A2A/private delivery
  │        └─ stores ephemeral task state
  │             │
  │             ▼
  │       Child Pi process in tmux
  │         └─ receives synthetic delegated prompt
  ```

`packages/subagents` owns discovery, tmux/process lifecycle, scheduling, and rendering. `packages/pi-extension` and the hub own session registration, delivery, task state, credentials, and visible-result correlation.

The child is correlated with a generated Pi harness session ID. That ID is internal metadata and is not returned in model-facing output.

## 4. Agent definitions

Agent definitions are Markdown files with frontmatter:

```markdown
---
name: scout
description: Fast codebase reconnaissance
tools: read, grep, find, ls, bash
model: openai/gpt-5-mini
---

Agent system prompt...
```

The bundled definitions live in `packages/subagents/agents/`. User definitions are loaded from `~/.pi/agent/agents`. Trusted project definitions are loaded from the nearest `.pi/agents` directory when the invocation selects `agentScope: "project"` or `"both"`.

Definitions are merged by name with this precedence:

```text
bundled < user < trusted project
```

A later definition replaces the earlier definition; fields are not merged individually.

### Model resolution

The effective model is resolved during discovery:

1. explicit, non-empty `model` frontmatter;
2. `PI_SUBAGENT_MODEL`;
3. `openai/gpt-5-mini`.

This applies to all agent sources, including custom names. The resolved provider-qualified model is passed to the child Pi as `--model`. Model IDs are not prevalidated against a registry; if Pi cannot use the model, that worker fails explicitly rather than silently switching to a potentially more expensive model.

Model selection is intentionally configuration-driven. The `subagent` tool schema does not accept a model field, so a task cannot unexpectedly escalate model cost.

## 5. Worker launch lifecycle

For every task:

1. Find the named agent in the discovered set.
2. Generate a fresh UUID harness session ID.
3. Identify the caller's tmux pane. Outside tmux, fail explicitly.
4. Create a worker pane in the caller's lower worker region:
   - the first worker uses the lower half of the caller pane;
   - later workers split the widest tagged worker pane horizontally;
   - pane operations are serialized to avoid parallel layout races.
5. Start Pi in the new pane with:
   - the generated session ID;
   - a display name such as `subagent: scout`;
   - the resolved model;
   - the agent's tool allowlist;
   - the agent system prompt;
   - the task working directory.
6. Remove inherited Pi session/model environment variables so the child receives deliberate launch settings rather than accidental parent state.
7. Wait for the child to register with the coordination runtime.
8. Send the task through the in-process coordination API.
9. Watch one bounded task snapshot at a time until a terminal state.
10. Return the visible child result and usage details to the parent tool.

Task text is sent after child registration through the coordinator. It is not included in tmux commands or process arguments.

A worker that fails before task creation has its pane closed. A worker that completes remains open and idle for inspection or reuse by the normal Pi session lifecycle.

## 6. Delegation modes

### Single

One `{ agent, task }` pair runs in one worker. An optional `cwd` controls the worker's working directory.

### Parallel

A `tasks` array launches up to eight tasks, with at most four active at once. Each task gets its own worker session and pane. Results are returned in task order, and one task failure does not prevent other scheduled tasks from completing.

### Chain

A `chain` array runs sequentially. The successful output from one step is substituted into `{previous}` in the next step's task. A failed step stops the chain; later steps are not launched.

The tool requires exactly one of single, parallel, or chain mode.

## 7. Coordination and result flow

```text
subagent tool
  → request trusted coordination API
  → wait for exact child harness session ID
  → send text task
  → receive task snapshot
  → watch until terminal
  → expose bounded result
```

The child receives an inbound synthetic turn marked `[A2A delegated task]`. The Pi inbound-delivery layer collects only visible assistant text as the task result. Thinking, tool arguments, raw tool output, provider payloads, and credentials are not copied into model-facing results.

The parent sees compact progress updates and final output. Full structured diagnostics remain in tool details where supported.

## 8. Cancellation and failure behavior

- Canceling before task creation closes the newly created worker pane.
- Canceling after task creation requests cooperative A2A cancellation.
- A worker that has accepted a task is not forcibly destroyed by parent cancellation.
- Unknown agent names return an error listing available agents.
- Child registration or coordinator errors fail the task and clean up only an uncommitted pane.
- Coordinator recovery is delegated to the shared client/reporter layer.
- A coordinator restart intentionally does not reconstruct old in-memory task content.
- Task deadlines, target loss, and delivery failures become terminal task states and are rendered as failures.

## 9. Trust and security boundaries

Project agent definitions are repository-controlled prompts with tool access. Project scope is opt-in through the tool parameters, and callers may request confirmation before running project-local definitions. Only trusted repositories should enable project agents.

The extension preserves these boundaries:

- the child receives only the selected prompt, tools, model, cwd, and session ID;
- task text travels over the local coordinator, not command-line arguments;
- root tokens, task capabilities, and coordinator URLs stay inside trusted extension code;
- tmux shell arguments are quoted before launch;
- worker panes are tagged with parent metadata so unrelated panes are not rearranged;
- results are bounded and treated as untrusted agent text.

The coordinator remains loopback-only and ephemeral; it owns authentication and task capabilities.

## 10. Key implementation seams

| Concern | Entry point |
| --- | --- |
| Agent parsing and precedence | `packages/subagents/src/agents.ts` |
| Tool schema and orchestration | `packages/subagents/src/index.ts` |
| Pane placement and Pi launch | `packages/subagents/src/tmux-worker.ts` |
| Trusted coordination API | `packages/pi-extension/src/coordination-api.ts` |
| Child inbound task delivery | `packages/pi-extension/src/inbound-delivery.ts` |
| Source task send/watch/cancel | `packages/client/src/source-coordination-client.ts`, `packages/pi-extension/src/delegation-tool.ts` |
| Task state and delivery invariants | `packages/hub/src/coordination/` |
| Agent discovery tests | `packages/subagents/test/agents.test.ts` |
| Worker layout tests | `packages/subagents/test/tmux-worker.test.ts` |
| Orchestration tests | `packages/subagents/test/coordination.test.ts` |

## 11. Design invariants

1. Every worker has an isolated Pi session and a visible tmux pane.
2. Every task has one explicit agent definition and one generated child session ID.
3. Task payloads never appear in child process arguments.
4. Model precedence is deterministic and cost-conscious.
5. Parallelism is bounded both at the task tool and pane-layout layers.
6. Accepted work is cooperative: cancellation does not imply process destruction.
7. The subagent layer does not duplicate hub persistence or credentials.
8. Project-agent execution is opt-in and trust-sensitive.
9. Results contain visible text only and remain bounded.
10. Coordinator restarts do not imply durable subagent task recovery.

## 12. Related documentation

- [`packages/subagents/README.md`](../../../packages/subagents/README.md) — user-facing installation and configuration
- [`docs/resources/architecture.md`](../../resources/architecture.md) — complete hub architecture and protocol boundaries
- [`docs/resources/releasing.md`](../../resources/releasing.md) — release and isolated tmux verification
- [`docs/superpowers/specs/2026-07-24-coordination-reliability-and-pi-delegation.md`](./2026-07-24-coordination-reliability-and-pi-delegation.md) — coordination reliability and Pi delegation requirements
