# Changelog

## 0.2.0 - 2026-07-24

- Run delegated agents as persistent, named Pi sessions in panes in the caller's current tmux window.
- Route task delivery, terminal results, and cooperative cancellation through the `agent-base` A2A coordinator.
- Preserve waiting single, parallel, and chained tool semantics while leaving completed workers open and idle.
- Add strict TypeScript checking and focused coordination/tmux launcher tests.
- Replace deprecated `gpt-5.1-codex` agent defaults with current OpenAI models.

## 0.1.0 - 2026-07-24

- Extract the locally installed Pi subagent extension into a standalone Pi package.
- Preserve the existing `scout`, `planner`, `reviewer`, `worker`, and `executor` agent definitions.
- Preserve the existing single, parallel, and chained delegation behavior.
