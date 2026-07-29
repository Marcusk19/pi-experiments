# pi-lazyworktree

A [pi](https://pi.dev) extension that treats [LazyWorktree](https://www.npmjs.com/package/lazyworktree)-managed Git worktrees as pi's unit of workspace isolation: it protects the main checkout from unreviewed mutation, and gives the agent a `workspace` tool to prepare, create, rebase, and merge worktrees safely.

This extension has no dependency on any other pi extension or package beyond pi itself. It shells out to the separate `lazyworktree` CLI and to `git`.

## What it does

**Main-checkout protection.** When the current directory resolves to the LazyWorktree main checkout, mutating `bash`/`edit`/`write` tool calls and `!command` shell execution are fail-closed by default: each individual operation requires an explicit interactive confirmation, and the operation stays blocked if no interactive UI is available or the confirmation is denied. A small set of exact, read-only `lazyworktree` inspection subcommands (`doctor`, `describe`, `worktrees list/get/resolve/context`, `notes get`) are allowed without confirmation. Direct `git worktree add|move|remove|prune|repair|lock|unlock` is always hard-blocked, in the main checkout or a worktree, so worktree lifecycle changes go through LazyWorktree instead of bypassing it.

**The `workspace` tool.** Registered for the agent to call directly:

- `status` — classify the current directory as the main checkout, a managed worktree, or unresolved, and return the current LazyWorktree note/context.
- `list` — list sibling worktrees for the current repository with exact paths.
- `prepare` — validate a proposed branch/base/note handoff without mutating Git state.
- `create` — create a new LazyWorktree workspace from a validated base branch, save the note/description, rename the temporary filesystem-safe branch to the requested repository branch when needed, clear inherited upstream tracking, and return the created path plus a safe manual Pi relaunch command.
- `rebase` — rebase an exact managed non-main source worktree onto a validated local target branch without changing the target.
- `merge` — integrate that exact source into the target with an explicit `rebase-ff` or `no-ff` strategy.

**The `/workspace` command** mirrors the same flow interactively:

```text
/workspace
/workspace status
/workspace list
/workspace prepare [branch]
/workspace create [branch]
/workspace rebase [target-branch]
/workspace merge [rebase-ff|no-ff] [target-branch]
```

`prepare`/`create` prompt for the remaining fields and prefill a handoff-note template. Creation is strictly LazyWorktree-only: no implicit dirty-change carry, no `--no-workspace`, no `--update-on-existing`, no shell-based `--exec` launch. When Pi is already running inside tmux, `create` launches the new Pi window with argv-separated `tmux new-window` arguments into the named tmux session (or a linked member of that session group); outside tmux it preserves the created workspace and prints the exact recovery command instead. Launch and recovery preserve a narrow, safe set of Pi runtime flags (extensions, skills, themes, tool/model settings, session directory) without replaying prior prompts or session-control flags.

**Rebase and merge safety.** Both resolve the source through LazyWorktree, require an exact managed path outside the current worktree, and require the main checkout to already have the local target branch checked out. The default target follows local `origin/HEAD`, then local `main` or `master`. Neither operation fetches, pushes, switches branches, stashes changes, deletes worktrees, bypasses hooks, or accepts an arbitrary revision. Both source and target must be clean and free of an unfinished rebase/merge/cherry-pick/revert. A killed or timed-out Git inspection fails closed even if the process wrapper reports exit code zero. A full, control-character-safe preflight shows exact paths, branches, OIDs, divergence, commands, and recovery semantics before interactive confirmation; the extension then revalidates identities, OIDs, branches, cleanliness, and operation state immediately before mutation, and mutation commands use those captured immutable OIDs rather than re-resolving mutable operands. Concurrent calls for the same Git common directory are process-locally locked, not queued.

Standalone `rebase` runs only in the isolated source with commit signing, autostash, and update-refs disabled. Conflicts stay there for an explicit `git rebase --continue`/`--abort`; the target is never touched. `rebase-ff` rebases only when needed and fast-forwards the target with `--ff-only`, never a merge-commit fallback — if the target moved or the fast-forward fails after a successful rebase, the rebased source stays intact and the result reports that the target was not integrated. `no-ff` always creates a commit (even when branch merge options request `--no-commit`) and verifies an unsigned two-parent merge commit with hooks enabled. A failed target merge is aborted only when this invocation launched it and its `MERGE_HEAD` matches the confirmed source; unowned or unrecoverable state is preserved and reported rather than force-reset. Cancellation inspects and reports resulting state rather than claiming a rollback happened.

**Status footer and widget.** A compact indicator identifies the active managed worktree in the footer (the main checkout label is omitted as redundant); a widget above the prompt shows the current branch/path and the first saved note line when available.

## Install

```bash
pi install npm:pi-lazyworktree
```

or from a local checkout:

```bash
pi install ./extensions/lazyworktree
```

Requires the [`lazyworktree`](https://www.npmjs.com/package/lazyworktree) CLI on `PATH`, and `tmux` for automatic new-window Pi launches (optional — `create` falls back to printing a manual launch command otherwise).

## Notes on scope

This extension does not integrate with any task-tracking or session-delegation extension. If you use something like that alongside LazyWorktree, wire it up yourself against the `workspace` tool's structured tool-call results (`created`, `verified`, `launchHelp`, etc.) — this package intentionally has no knowledge of it.

It also does not integrate with a separate "plan mode" or read-only-session extension. If your setup has one, it will not automatically gate `workspace create`/`rebase`/`merge`.

## Known limitation: repositories without a git remote

`workspace create` verifies the saved note by re-querying LazyWorktree with the new worktree's own directory as both the target and the working directory. The `lazyworktree` CLI derives a repository identity from that working directory; for a repository with a configured remote (the normal case) this identity is stable and the verification just works. For a repository with **no** git remote at all, `lazyworktree` falls back to a locally derived identity that is not stable across different checkouts of the same repository (the main checkout and a linked worktree can resolve to different identities), which can make `create` fail with "its saved note was empty" even though the worktree itself was created correctly. Configure `origin` (or any remote) on the repository to avoid this.
