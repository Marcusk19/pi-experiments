# Persistent Subagents

The persistent-subagent workspace package in [`agent-base`](../../README.md), for delegating tasks to specialized agents running as visible Pi sessions in tmux panes. See the [persistent subagents design](../../docs/resources/persistent-subagents.md) for the architecture and lifecycle.

It preserves the single, parallel, and chained interface of Pi's MIT-licensed `examples/extensions/subagent` example, but replaces hidden one-shot subprocesses with workers coordinated through the repository's local A2A runtime.

## How it works

Each invocation:

1. creates a worker region below the caller pane, using the bottom half for the first worker and side-by-side panes within that region for later workers;
2. starts a named, saved Pi session with the selected agent's prompt, model, tool allowlist, and working directory;
3. waits for that Pi session to register with `agent-base`;
4. delivers the task through the local A2A coordinator;
5. waits for the A2A task to reach a terminal state and returns its visible result.

The worker Pi remains open and idle after completion. Canceling the parent tool explicitly requests A2A task cancellation but does not destroy a worker that has accepted the task. A pane that fails before task creation is cleaned up.

Supported modes:

- **Single:** one agent and one task
- **Parallel:** up to eight tasks, with at most four running concurrently
- **Chain:** sequential tasks with `{previous}` output handoff

## Architecture boundary

`packages/subagents` owns:

- agent discovery and project-agent trust policy;
- tmux pane placement and Pi process launch;
- parallel scheduling and chain substitution;
- subagent tool progress and result rendering.

The agent-base coordination packages own:

- active-session registration and discovery;
- explicit A2A task routing;
- inbound delivery and visible-result correlation;
- task status, cancellation, daemon recovery, and credentials.

The extensions communicate through a versioned in-process Pi event-bus API. The API exposes coordination operations, not hub tokens or per-session task capabilities. The child is correlated by a generated Pi harness session ID; this internal ID is never included in model-facing tool output.

## Requirements

- Pi 0.82.0 or newer
- tmux; the invoking Pi must be running inside tmux
- a current `agent-base` package loaded in both parent and worker Pi sessions

Invocation outside tmux fails explicitly rather than creating a pane in an arbitrary window. Pane-scoped metadata associates workers with their parent, so closed worker regions are recreated without rearranging unrelated panes in the window.

## Included agents

| Agent | Purpose | Model |
|---|---|---|
| `scout` | Fast codebase reconnaissance | `openai/gpt-5-mini` |
| `planner` | Implementation planning | `openai/gpt-5-mini` |
| `reviewer` | Read-only code review | `openai/gpt-5-mini` |
| `worker` | General-purpose delegated work | `openai/gpt-5-mini` |
| `executor` | Execute a pre-approved task brief | `openai/gpt-5-mini` |

Model selection precedence is: an explicit `model` in the agent definition, `PI_SUBAGENT_MODEL`, then the built-in `openai/gpt-5-mini` default. This applies to bundled, user, project, and custom agents. Model IDs are passed directly to Pi; an unavailable model fails the worker rather than silently falling back.

## Installation

The subagent extension and its definitions are included in the repository's single private Git package:

```bash
pi install git:github.com/Marcusk19/agent-base@v0.1.0
```

No agent symlinks or separate subagent package are required. During migration, remove any separately registered `mkok-subagents` package or copy of the upstream subagent example to avoid registering `subagent` twice, then restart Pi. A process that loaded an older build may need a full restart rather than `/reload`.

## Agent discovery and security

The extension always loads its bundled defaults. User agents from `~/.pi/agent/agents` replace bundled definitions with the same name. Project agents from the nearest `.pi/agents` directory replace both when `agentScope` is `project` or `both`. The precedence is therefore bundled < user < trusted project.

Project agent files are repository-controlled prompts and can direct a worker Pi to use tools. Only enable project agents in repositories you trust. This extracted version preserves the previous local default `confirmProjectAgents: false`; callers can pass `confirmProjectAgents: true` to request an interactive confirmation.

Set `PI_SUBAGENT_MODEL` to override the default for all agents, for example:

```bash
PI_SUBAGENT_MODEL=google/gemini-2.5-flash-lite pi
```

An explicit `model` frontmatter field still takes precedence over the environment override.

Task text and results travel through the loopback-only, in-memory `agent-base` coordinator. The extension never places task text on the child Pi command line. Agent system prompts are shell-quoted as Pi startup arguments and should not contain secrets.

## Development checks

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run build:release
pnpm run test:git-artifact
```

`pnpm run check` performs TypeScript checking, unit tests, a full build, and an isolated load of both source extensions. The artifact smoke test loads only tracked files from `git archive HEAD`.

## Upstream

Originally derived from Pi's subagent example:

- <https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/subagent>

Pi and the extracted example are MIT licensed.
