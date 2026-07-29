# Releasing agent-base from private GitHub

agent-base is distributed as a private Git package. It is not published to npm. Authorized installers need repository access and working Git credentials.

## Prepare the release commit

1. Start from a clean, up-to-date `main` branch:

   ```bash
   git switch main
   git pull --ff-only origin main
   git status --short
   ```

2. Install exactly the locked development dependencies:

   ```bash
   pnpm install --frozen-lockfile
   ```

3. Set the intended semantic version in the root `package.json`. Update `pnpm-lock.yaml` with pnpm if the version is represented there.

4. Regenerate the committed distribution and run every source and tracked-artifact check:

   ```bash
   pnpm run build:release
   pnpm run check:release
   git diff --check
   ```

5. Commit source, version, and generated `release/` changes together. Rebuild once more and require no generated difference:

   ```bash
   pnpm run build:release
   git diff --exit-code -- release
   git status --short
   ```

6. Push the release commit to `origin/main` and wait for CI. CI installs with the frozen pnpm lockfile, rebuilds `release/`, rejects generated diffs, and runs the tracked `git archive` smoke test.

## Isolated acceptance

Before tagging, extract `git archive HEAD` into a temporary checkout and load it with a temporary `HOME` and `XDG_RUNTIME_DIR`. The checkout must have no `node_modules`, ignored build output, or user-agent symlinks.

Run Pi in a dedicated tmux socket and delegate a random nonce to the bundled `worker`. Verify all of the following:

- both release extensions load without duplicate tools or unresolved imports;
- the bundled worker is discovered without files under the temporary Pi home;
- the worker uses the configured subagent model (`PI_SUBAGENT_MODEL`, or the built-in `openai/gpt-5-mini` default);
- daemon discovery reports loopback connectivity on `127.0.0.1` and a dynamic port;
- the parent remains in the upper pane;
- workers share the lower row and have distinct horizontal positions;
- the nonce returns through the A2A task result;
- a shell trap removes panes, daemon processes, runtime files, and temporary homes even on failure.

Capture pane geometry with:

```bash
tmux list-panes -F '#{pane_id} #{pane_top} #{pane_left} #{pane_width} #{pane_height}'
```

Do not describe the release as turnkey until this tracked-file acceptance passes.

## Approval and tag

Tag creation and pushing are external side effects. Stop after reporting the validated release commit and obtain explicit user approval.

After approval, create a signed tag whose name exactly matches `v` plus the root package version, then push only that tag:

```bash
GITHUB_REF_NAME=v0.1.0 pnpm run check:release-version
git tag -s v0.1.0 -m "agent-base v0.1.0"
git push origin v0.1.0
```

The tag workflow validates the version, source checks, generated release diff, and archive smoke test. It does not publish an npm package. It publishes a private GitHub Release containing checksummed standalone `agent-hub` archives for macOS and Linux on arm64 and amd64.

Authorized users can install the monitor independently of Pi:

```bash
gh release download v0.2.0 --repo Marcusk19/agent-base --pattern 'agent-hub_0.2.0_darwin_arm64.tar.gz' --pattern SHA256SUMS
shasum -a 256 -c SHA256SUMS --ignore-missing
tar -xzf agent-hub_0.2.0_darwin_arm64.tar.gz
install agent-hub "$HOME/.local/bin/agent-hub"
agent-hub version
agent-hub list
agent-hub
```

The monitor binary does not install or start the Node.js hub daemon. A separately installed harness adapter owns daemon startup.

Finally, use an authorized account and a fresh Pi home to install the exact private tag:

```bash
pi install git:github.com/Marcusk19/agent-base@v0.1.0
pi list
```

Confirm exactly one agent-base Git package is listed, then repeat the isolated tmux nonce test against the installed tag.
