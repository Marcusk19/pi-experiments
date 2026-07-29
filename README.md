# pi-experiments

Personal [pi](https://pi.dev) extensions.

Each top-level directory under `extensions/` is a self-contained, independently
installable pi extension with its own `package.json`. See each extension's own
README for what it does and how to install it.

## Extensions

- [`extensions/lazyworktree`](extensions/lazyworktree) — coming soon
- [`kube-approval`](kube-approval) — approval gate for guarded oc/kubectl/aws bash commands
- [`extensions/lazyworktree`](extensions/lazyworktree) — protects the LazyWorktree main checkout from unreviewed mutation and gives the agent a `workspace` tool to prepare, create, rebase, and merge managed Git worktrees.

## Development

```bash
npm install   # dev-only deps to run the test suite locally
npm test      # runs every extension's tests
npm run lint  # repo-wide whitespace/newline/JSON/syntax checks
```

Each extension also has its own `peerDependencies` declaring what it needs
from a real pi installation; the root `package.json` is private and exists
only for this dev workflow, not for publishing.
