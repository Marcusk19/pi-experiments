# Turnkey GitHub Pi Package Installation Plan

> **For agentic workers:** This plan is documentation only. Do not automatically invoke implementation subskills. If the user explicitly requests execution, ask them to choose an execution skill first. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authorized users install the complete project directly from GitHub with `pi install git:github.com/Marcusk19/agent-base`, without npm publication, repository cloning, manual builds, agent symlinks, or daemon configuration.

**Architecture:** Keep the TypeScript workspaces as development modules and commit a generated `release/` directory containing three self-contained ESM bundles plus bundled agent definitions. The root `package.json` remains the Pi package manifest and points only at tracked release bundles, so a production-only Git checkout does not need TypeScript, workspace links, or build scripts at installation time.

**Tech Stack:** Node.js 22.19+, TypeScript 5.9, pnpm workspaces, esbuild, Vitest, Pi 0.82+, tmux, GitHub, GitHub Actions.

## Global Constraints

- Do not publish any package to the npm registry.
- The primary install command is `pi install git:github.com/Marcusk19/agent-base`; SSH users may use `pi install git:git@github.com:Marcusk19/agent-base`.
- The GitHub repository is private. Installers must have repository access and working HTTPS or SSH Git credentials. Do not describe this as available to the general public while the repository remains private.
- Use pnpm for development installation, scripts, lockfiles, packing, and release builds.
- Commit the generated `release/` directory because Pi's Git installer must work from a clean production checkout without dev dependencies.
- Publish one logical Pi package only. Generated bundles must contain all internal `@agent-session/*` code and `@a2a-js/sdk`.
- Externalize only Pi-provided packages (`@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox`) and Node built-ins.
- Do not use install, postinstall, or prepare scripts. Installation must not write into `~/.pi`, modify tmux settings, or start the daemon.
- Keep the daemon loopback-only and lazy-started. Ship no credentials, session data, task data, discovery files, model keys, or user configuration.
- Node.js 22.19+, Pi 0.82+, and tmux remain external prerequisites; only the `subagent` tool requires tmux.
- Bundled agents must use the user's Pi default model unless a user or project definition explicitly declares a model.
- Agent precedence is bundled < user < trusted project.
- A release tag is an external side effect. Build and validate the release commit first, then stop for explicit approval before creating or pushing the first tag.
- Do not claim turnkey behavior until an archive containing only tracked files passes extension loading, daemon startup, bundled-agent discovery, and a real isolated tmux delegation.

---

## File Structure

### New files

- `pnpm-workspace.yaml` — pnpm workspace declaration.
- `packages/distribution/build.mjs` — deterministic three-entry bundle builder.
- `packages/distribution/src/registry-extension.ts` — registry entry that injects the packaged daemon path.
- `packages/distribution/src/subagents-extension.ts` — public subagent entry.
- `packages/distribution/tsconfig.json` — typechecks distribution entry points.
- `packages/distribution/test/git-artifact-smoke.mjs` — validates a clean tracked-file archive.
- `release/registry-extension.js` — committed registry/Pi adapter bundle.
- `release/subagents-extension.js` — committed persistent-subagent bundle.
- `release/registry-daemon.js` — committed daemon executable.
- `release/agents/*.md` — committed provider-neutral bundled agents.
- `.github/workflows/ci.yml` — source, generated-artifact, and clean-archive checks.
- `.github/workflows/release.yml` — validates pushed version tags without publishing to npm.
- `docs/resources/releasing.md` — GitHub release and installation procedure.

### Modified files

- `package.json` — root Pi manifest points to `release/`, uses pnpm scripts, and has no lifecycle build script.
- `package-lock.json` — removed after conversion to `pnpm-lock.yaml`.
- `packages/client/package.json` — internal dependencies use `workspace:*`.
- `packages/client/src/daemon.ts` — accepts an explicit daemon entry point.
- `packages/client/test/daemon.test.ts` — verifies packaged and development daemon resolution.
- `packages/pi-extension/package.json` — internal dependencies use `workspace:*`.
- `packages/registry/package.json` — internal dependencies use `workspace:*`.
- `packages/subagents/src/agents.ts` — loads bundled defaults and applies precedence.
- `packages/subagents/src/index.ts` — resolves bundled agents relative to the extension.
- `packages/subagents/test/agents.test.ts` — verifies discovery and override behavior.
- `packages/subagents/agents/*.md` — removes hard-coded OpenAI models.
- `README.md` — documents GitHub installation, authentication, update, migration, and removal.
- `packages/subagents/README.md` — removes symlink installation as the normal path.
- `docs/resources/architecture.md` — documents the tracked distribution boundary.

---

### Task 1: Convert development commands and workspace linking to pnpm

**Files:**
- Create: `pnpm-workspace.yaml`
- Modify: `package.json`
- Modify: `packages/client/package.json`
- Modify: `packages/pi-extension/package.json`
- Modify: `packages/registry/package.json`
- Create: `pnpm-lock.yaml`
- Delete: `package-lock.json`

**Interfaces:**
- Consumes: current workspace package versions and source checks.
- Produces: deterministic pnpm workspace links and a frozen CI lockfile.

- [ ] **Step 1: Capture the current baseline with pnpm's script runner**

```bash
cd /Users/mkok/workspace/agent-base
corepack enable
pnpm run check
git status --short
```

Expected: the existing source checks pass; only plan documentation is uncommitted.

- [ ] **Step 2: Import the npm lock before deleting it**

```bash
pnpm import
```

Expected: `pnpm-lock.yaml` is created with equivalent dependency resolution.

- [ ] **Step 3: Add the workspace declaration**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
```

Add to root `package.json`:

```json
{
  "packageManager": "pnpm@10.15.1",
  "engines": {
    "node": ">=22.19.0",
    "pnpm": ">=10.15.1"
  }
}
```

- [ ] **Step 4: Make internal package links explicit**

Use `workspace:*` for these existing internal dependencies:

```text
packages/client/package.json       @agent-session/contracts
packages/pi-extension/package.json @agent-session/contracts
packages/pi-extension/package.json @agent-session/client
packages/registry/package.json     @agent-session/contracts
```

For example:

```json
{
  "dependencies": {
    "@agent-session/contracts": "workspace:*"
  }
}
```

- [ ] **Step 5: Replace the lockfile and verify a frozen install**

```bash
rm package-lock.json
pnpm install
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
```

Expected: installation, all source tests, typecheck, and build pass; no npm lockfile is regenerated.

- [ ] **Step 6: Commit the package-manager change**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml package-lock.json packages/*/package.json
git commit -m "build: adopt pnpm workspace management"
```

---

### Task 2: Add a packaged daemon-entrypoint seam

**Files:**
- Modify: `packages/client/src/daemon.ts`
- Create: `packages/client/test/daemon.test.ts`

**Interfaces:**
- Consumes: `ensureDaemon(options: EnsureDaemonOptions)` and detached daemon spawning.
- Produces: `EnsureDaemonOptions.daemonEntrypoint?: string` and `resolveDaemonEntrypoint(explicit?: string): Promise<string>`.

- [ ] **Step 1: Add failing resolver tests**

Create `packages/client/test/daemon.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { resolveDaemonEntrypoint } from "../src/daemon.js";

describe("daemon entrypoint resolution", () => {
  it("uses a tracked release daemon when explicitly configured", async () => {
    await expect(resolveDaemonEntrypoint("/tmp/agent-base/release/registry-daemon.js"))
      .resolves.toBe("/tmp/agent-base/release/registry-daemon.js");
  });

  it("resolves the registry workspace daemon during development", async () => {
    await expect(resolveDaemonEntrypoint()).resolves.toMatch(/registry.*daemon\.js$/);
  });
});
```

- [ ] **Step 2: Verify the test fails before implementation**

```bash
pnpm vitest run packages/client/test/daemon.test.ts
```

Expected: FAIL because the resolver export does not exist.

- [ ] **Step 3: Extend `EnsureDaemonOptions`**

Add:

```typescript
export interface EnsureDaemonOptions {
  paths?: RuntimePaths;
  resolvePaths?: () => Promise<RuntimePaths>;
  healthCheck?: HealthCheck;
  spawnDaemon?: (options: { token: string; paths: RuntimePaths }) => Promise<void>;
  daemonEntrypoint?: string;
  randomSource?: (size: number) => Buffer;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  random?: () => number;
}
```

Add:

```typescript
export async function resolveDaemonEntrypoint(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const resolved = await import.meta.resolve("@agent-session/registry/daemon");
  return fileURLToPath(resolved);
}
```

- [ ] **Step 4: Thread the option through default spawning**

Inside `ensureDaemon`:

```typescript
const spawnFn = options.spawnDaemon ?? ((spawnOptions) =>
  defaultSpawnDaemon(spawnOptions, options.daemonEntrypoint));
```

Replace the current default spawner with:

```typescript
async function defaultSpawnDaemon(
  options: { token: string; paths: RuntimePaths },
  daemonEntrypoint?: string,
): Promise<void> {
  const daemonPath = await resolveDaemonEntrypoint(daemonEntrypoint);
  const child = spawn(process.execPath, [daemonPath], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      AGENT_SESSION_TOKEN: options.token,
      AGENT_SESSION_DISCOVERY_FILE: options.paths.discoveryFile,
    },
  });
  child.unref();
}
```

- [ ] **Step 5: Run focused and real-daemon tests**

```bash
pnpm vitest run packages/client/test/daemon.test.ts packages/client/test/discovery.test.ts packages/client/test/e2e.test.ts
```

Expected: all selected tests pass, including daemon recovery.

- [ ] **Step 6: Commit the daemon packaging seam**

```bash
git add packages/client/src/daemon.ts packages/client/test/daemon.test.ts
git commit -m "client: allow packaged daemon entrypoints"
```

---

### Task 3: Load bundled, provider-neutral agents without symlinks

**Files:**
- Modify: `packages/subagents/src/agents.ts`
- Modify: `packages/subagents/src/index.ts`
- Create: `packages/subagents/test/agents.test.ts`
- Modify: `packages/subagents/agents/executor.md`
- Modify: `packages/subagents/agents/planner.md`
- Modify: `packages/subagents/agents/reviewer.md`
- Modify: `packages/subagents/agents/scout.md`
- Modify: `packages/subagents/agents/worker.md`

**Interfaces:**
- Consumes: `discoverAgents(cwd, scope)` and package-relative `import.meta.url`.
- Produces: `AgentSource = "bundled" | "user" | "project"`, injected discovery directories for tests, and bundled < user < project precedence.

- [ ] **Step 1: Add failing bundled-agent tests**

Create `packages/subagents/test/agents.test.ts`:

```typescript
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverAgents } from "../src/agents.ts";

const agent = (name: string, description: string) =>
  `---\nname: ${name}\ndescription: ${description}\n---\nPrompt`;

describe("bundled agent discovery", () => {
  it("loads defaults without user agent files", () => {
    const root = mkdtempSync(join(tmpdir(), "agent-base-agents-"));
    const bundled = join(root, "bundled");
    const user = join(root, "user");
    mkdirSync(bundled);
    mkdirSync(user);
    writeFileSync(join(bundled, "worker.md"), agent("worker", "bundled"));

    const result = discoverAgents(root, "user", {
      bundledAgentsDir: bundled,
      userAgentsDir: user,
    });

    expect(result.agents).toMatchObject([
      { name: "worker", source: "bundled", model: undefined },
    ]);
  });

  it("lets a user definition replace a bundled definition", () => {
    const root = mkdtempSync(join(tmpdir(), "agent-base-agents-"));
    const bundled = join(root, "bundled");
    const user = join(root, "user");
    mkdirSync(bundled);
    mkdirSync(user);
    writeFileSync(join(bundled, "worker.md"), agent("worker", "bundled"));
    writeFileSync(join(user, "worker.md"), agent("worker", "user"));

    const result = discoverAgents(root, "user", {
      bundledAgentsDir: bundled,
      userAgentsDir: user,
    });

    expect(result.agents).toMatchObject([{ name: "worker", source: "user" }]);
  });
});
```

Add a third test with `.pi/agents/worker.md`, scope `both`, and expected source `project`.

- [ ] **Step 2: Verify discovery options are initially rejected**

```bash
pnpm vitest run packages/subagents/test/agents.test.ts
```

Expected: FAIL because bundled discovery is not implemented.

- [ ] **Step 3: Implement discovery sources and precedence**

Add:

```typescript
export type AgentSource = "bundled" | "user" | "project";

export interface AgentDiscoveryOptions {
  bundledAgentsDir?: string;
  userAgentsDir?: string;
}
```

Load and merge in this order:

```typescript
const bundledAgents = options.bundledAgentsDir
  ? loadAgentsFromDir(options.bundledAgentsDir, "bundled")
  : [];
const userDir = options.userAgentsDir ?? path.join(getAgentDir(), "agents");
const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
const projectAgents = scope === "user" || !projectAgentsDir
  ? []
  : loadAgentsFromDir(projectAgentsDir, "project");

const agentMap = new Map<string, AgentConfig>();
for (const item of bundledAgents) agentMap.set(item.name, item);
for (const item of userAgents) agentMap.set(item.name, item);
for (const item of projectAgents) agentMap.set(item.name, item);
```

Bundled defaults remain available for all scopes; scope controls which customizable directories augment them.

- [ ] **Step 4: Resolve bundled agents relative to both source and release bundles**

In `packages/subagents/src/index.ts`:

```typescript
import { fileURLToPath } from "node:url";

const BUNDLED_AGENTS_DIR = fileURLToPath(new URL("./agents/", import.meta.url));
```

The release build will place `subagents-extension.js` and `agents/` together under `release/`. For source tests that load `packages/subagents/src/index.ts`, inject or alias the directory to `packages/subagents/agents`; do not rely on a nonexistent `src/agents/` directory. Implement a registration option:

```typescript
export interface SubagentExtensionOptions {
  bundledAgentsDir?: string;
}

export function registerSubagentExtension(
  pi: ExtensionAPI,
  options: SubagentExtensionOptions = {},
): void {
  const bundledAgentsDir = options.bundledAgentsDir ?? BUNDLED_AGENTS_DIR;
}
```

The development default export passes:

```typescript
registerSubagentExtension(pi, {
  bundledAgentsDir: fileURLToPath(new URL("../agents/", import.meta.url)),
});
```

The distribution entry passes `release/agents` relative to its own bundle.

- [ ] **Step 5: Remove provider-specific model declarations**

Remove the `model:` frontmatter line from each file under `packages/subagents/agents/`. Keep model parsing for user/project overrides. A child launched without an explicit model uses the user's Pi default provider and model.

- [ ] **Step 6: Run all subagent tests**

```bash
pnpm vitest run packages/subagents/test
```

Expected: agent discovery, coordination, and tmux layout tests pass.

- [ ] **Step 7: Commit bundled-agent behavior**

```bash
git add packages/subagents/src packages/subagents/test packages/subagents/agents
git commit -m "subagents: load provider-neutral bundled agents"
```

---

### Task 4: Build and commit the Git-installable release directory

**Files:**
- Create: `packages/distribution/package.json`
- Create: `packages/distribution/tsconfig.json`
- Create: `packages/distribution/src/registry-extension.ts`
- Create: `packages/distribution/src/subagents-extension.ts`
- Create: `packages/distribution/build.mjs`
- Modify: `package.json`
- Modify: `.gitignore`
- Create and track: `release/**`

**Interfaces:**
- Consumes: registry adapter, injected daemon entrypoint, subagent registration, registry daemon, and bundled agent Markdown.
- Produces: a tracked, self-contained `release/` tree referenced by the root Pi manifest.

- [ ] **Step 1: Add the private build workspace**

Create `packages/distribution/package.json`:

```json
{
  "name": "@agent-session/distribution-build",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "devDependencies": {
    "@agent-session/client": "workspace:*",
    "@agent-session/pi-extension": "workspace:*",
    "@agent-session/registry": "workspace:*",
    "@agent-session/subagents": "workspace:*",
    "esbuild": "^0.25.9"
  }
}
```

- [ ] **Step 2: Add its TypeScript project**

Create `packages/distribution/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "references": [
    { "path": "../client" },
    { "path": "../pi-extension" },
    { "path": "../registry" },
    { "path": "../subagents" }
  ]
}
```

- [ ] **Step 3: Create the release registry entry**

Create `packages/distribution/src/registry-extension.ts`:

```typescript
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createSessionReporter,
  ensureDaemon,
  type SessionReporterOptions,
} from "@agent-session/client";
import { registerPiAdapter } from "@agent-session/pi-extension";

const daemonEntrypoint = fileURLToPath(new URL("./registry-daemon.js", import.meta.url));

function createReleaseReporter(options: SessionReporterOptions) {
  return createSessionReporter({
    ...options,
    ensureDaemon: () => ensureDaemon({ daemonEntrypoint }),
  });
}

export default function registryExtension(pi: ExtensionAPI): void {
  registerPiAdapter(pi, { createReporter: createReleaseReporter });
}
```

- [ ] **Step 4: Create the release subagent entry**

Create `packages/distribution/src/subagents-extension.ts`:

```typescript
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSubagentExtension } from "@agent-session/subagents";

const bundledAgentsDir = fileURLToPath(new URL("./agents/", import.meta.url));

export default function subagentsExtension(pi: ExtensionAPI): void {
  registerSubagentExtension(pi, { bundledAgentsDir });
}
```

- [ ] **Step 5: Implement deterministic release generation**

Create `packages/distribution/build.mjs`:

```javascript
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const release = resolve(repo, "release");
const external = [
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
  "typebox",
];

await rm(release, { recursive: true, force: true });
await mkdir(release, { recursive: true });

await build({
  entryPoints: {
    "registry-extension": resolve(here, "src/registry-extension.ts"),
    "subagents-extension": resolve(here, "src/subagents-extension.ts"),
    "registry-daemon": resolve(repo, "packages/registry/src/daemon.ts"),
  },
  outdir: release,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22.19",
  packages: "bundle",
  external,
  sourcemap: true,
  legalComments: "external",
  logLevel: "info",
});

await cp(resolve(repo, "packages/subagents/agents"), resolve(release, "agents"), {
  recursive: true,
});
```

- [ ] **Step 6: Point the root Pi manifest at tracked bundles**

Change root `package.json` to:

```json
{
  "name": "@marcusk19/agent-base",
  "version": "0.1.0",
  "private": true,
  "pi": {
    "extensions": [
      "./release/registry-extension.js",
      "./release/subagents-extension.js"
    ]
  }
}
```

Remove the root `prepare` script. Add:

```json
{
  "scripts": {
    "build:release": "node packages/distribution/build.mjs",
    "check:release": "pnpm run check && pnpm run build:release && pnpm run test:git-artifact"
  }
}
```

Retain the normal source build, typecheck, test, and check scripts.

- [ ] **Step 7: Track release output explicitly**

The current `.gitignore` rule `dist/` does not exclude `release/`; add only temporary test archives:

```gitignore
*.git-install-test.tar
```

Run:

```bash
pnpm install
pnpm run build:release
git add -f release
```

- [ ] **Step 8: Reject unresolved workspace imports**

```bash
if rg '@agent-session/' release/*.js; then
  echo 'release bundle contains private workspace imports' >&2
  exit 1
fi
```

Expected: no matches.

- [ ] **Step 9: Verify the release tree**

```bash
find release -maxdepth 2 -type f -print | sort
```

Expected:

```text
release/agents/executor.md
release/agents/planner.md
release/agents/reviewer.md
release/agents/scout.md
release/agents/worker.md
release/registry-daemon.js
release/registry-daemon.js.map
release/registry-extension.js
release/registry-extension.js.map
release/subagents-extension.js
release/subagents-extension.js.map
```

- [ ] **Step 10: Commit source and generated artifacts together**

```bash
git add package.json pnpm-lock.yaml .gitignore packages/distribution release
git commit -m "build: add tracked GitHub distribution"
```

---

### Task 5: Validate a clean tracked-file archive

**Files:**
- Create: `packages/distribution/test/git-artifact-smoke.mjs`
- Modify: root `package.json`

**Interfaces:**
- Consumes: `git archive HEAD`, root Pi manifest, tracked release bundles, and Pi local-package loading.
- Produces: `pnpm run test:git-artifact`, proving installation does not depend on ignored files, workspace build output, or `node_modules`.

- [ ] **Step 1: Write the tracked-archive smoke test**

Create `packages/distribution/test/git-artifact-smoke.mjs`:

```javascript
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const repo = resolve(import.meta.dirname, "../../..");
const temp = await mkdtemp(join(tmpdir(), "agent-base-git-install-"));
const archive = join(temp, "repository.tar");
const checkout = join(temp, "checkout");

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repo,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

try {
  await mkdir(checkout);
  const archived = await run("git", ["archive", "--format=tar", `--output=${archive}`, "HEAD"]);
  if (archived.code !== 0) throw new Error(archived.stderr);
  const extracted = await run("tar", ["-xf", archive, "-C", checkout]);
  if (extracted.code !== 0) throw new Error(extracted.stderr);

  const required = [
    "release/registry-extension.js",
    "release/subagents-extension.js",
    "release/registry-daemon.js",
    "release/agents/scout.md",
    "release/agents/planner.md",
    "release/agents/reviewer.md",
    "release/agents/worker.md",
    "release/agents/executor.md",
  ];
  for (const relative of required) await readFile(join(checkout, relative));

  for (const entry of ["registry-extension.js", "subagents-extension.js", "registry-daemon.js"]) {
    const source = await readFile(join(checkout, "release", entry), "utf8");
    if (source.includes("@agent-session/")) throw new Error(`${entry} leaks workspace imports`);
  }

  const loaded = await run("pi", ["--no-extensions", "-e", checkout, "--list-models"]);
  if (loaded.code !== 0) throw new Error(loaded.stderr || loaded.stdout);

  const runtime = join(temp, "runtime");
  await mkdir(runtime);
  const discovery = join(runtime, "registry.json");
  const daemon = spawn(process.execPath, [join(checkout, "release/registry-daemon.js")], {
    env: {
      ...process.env,
      AGENT_SESSION_TOKEN: "git-artifact-smoke-token",
      AGENT_SESSION_DISCOVERY_FILE: discovery,
      AGENT_SESSION_EMPTY_EXIT_MS: "250",
    },
    stdio: "ignore",
  });

  let record;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      record = JSON.parse(await readFile(discovery, "utf8"));
      break;
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    }
  }
  if (!record || record.port <= 0 || record.pid !== daemon.pid) {
    daemon.kill("SIGTERM");
    throw new Error("tracked registry daemon did not publish discovery");
  }
  daemon.kill("SIGTERM");
  console.log("tracked Git artifact smoke test passed");
} finally {
  await rm(temp, { recursive: true, force: true });
}
```

- [ ] **Step 2: Add the test script**

Add to root `package.json`:

```json
{
  "scripts": {
    "test:git-artifact": "node packages/distribution/test/git-artifact-smoke.mjs"
  }
}
```

- [ ] **Step 3: Prove stale generated files are detected**

Run:

```bash
pnpm run build:release
git diff --exit-code -- release
pnpm run test:git-artifact
```

Expected: release diff is empty and the archive smoke test passes.

- [ ] **Step 4: Prove the test is red-capable**

Temporarily remove `release/registry-daemon.js`, run `pnpm run test:git-artifact`, and verify it fails for the missing tracked daemon. Restore it with:

```bash
git checkout -- release/registry-daemon.js
```

- [ ] **Step 5: Commit exact-artifact validation**

```bash
git add package.json packages/distribution/test/git-artifact-smoke.mjs
git commit -m "test: validate tracked Git distribution"
```

---

### Task 6: Document authenticated GitHub installation and migration

**Files:**
- Modify: `README.md`
- Modify: `packages/subagents/README.md`
- Modify: `docs/resources/architecture.md`
- Create: `docs/resources/releasing.md`

**Interfaces:**
- Consumes: final Git source, root Pi manifest, tracked release layout, and private-repository constraint.
- Produces: exact install, authentication, update, pinning, migration, removal, and release instructions.

- [ ] **Step 1: Make GitHub installation the primary README path**

Document HTTPS installation:

```bash
pi install git:github.com/Marcusk19/agent-base
```

Document SSH installation:

```bash
pi install git:git@github.com:Marcusk19/agent-base
```

State clearly that the private repository requires access and configured Git credentials. Do not imply that `gh auth login` automatically configures every Git client; users must verify with:

```bash
git ls-remote https://github.com/Marcusk19/agent-base.git HEAD
```

or:

```bash
git ls-remote git@github.com:Marcusk19/agent-base.git HEAD
```

- [ ] **Step 2: Document deterministic tagged installs**

Use:

```bash
pi install git:github.com/Marcusk19/agent-base@v0.1.0
```

Explain that pinned tags do not advance during `pi update --extensions`. To move to a new version, reinstall using the new tag:

```bash
pi install git:github.com/Marcusk19/agent-base@v0.2.0
```

For users intentionally tracking the default branch:

```bash
pi install git:github.com/Marcusk19/agent-base
pi update --extensions
```

- [ ] **Step 3: Document migration without duplicate tools**

```bash
pi remove /absolute/path/to/agent-base
pi remove /absolute/path/to/mkok-subagents
pi install git:github.com/Marcusk19/agent-base@v0.1.0
pi list
```

Expected: `pi list` contains exactly one agent-base package. Source checkouts do not need deletion.

- [ ] **Step 4: Document turnkey scope and prerequisites**

Describe:

- automatic loading of `query_active_sessions`, `delegate_task`, and `subagent`;
- lazy daemon startup with no service setup;
- bundled `scout`, `planner`, `reviewer`, `worker`, and `executor` agents;
- default Pi model inheritance and user/project overrides;
- Node.js 22.19+, Pi 0.82+, and tmux prerequisites;
- outside tmux, registry tools work while `subagent` fails explicitly;
- in-memory privacy guarantees and excluded sensitive data.

- [ ] **Step 5: Update architecture with the Git distribution boundary**

Add:

```text
private TypeScript workspaces
           │ pnpm run build:release
           ▼
tracked release/
  ├─ registry-extension.js
  ├─ subagents-extension.js
  ├─ registry-daemon.js
  └─ agents/*.md
           │ Pi Git package loader
           ▼
installed private Git checkout
```

State that tracked bundles may not import internal workspace names and that CI rebuilds and diffs them.

- [ ] **Step 6: Write the release runbook**

In `docs/resources/releasing.md`, require:

1. clean `main` branch;
2. `pnpm install --frozen-lockfile`;
3. version bump in root `package.json`;
4. `pnpm run build:release`;
5. `pnpm run check:release`;
6. `git diff --exit-code -- release` after committing generated changes;
7. signed tag matching the root version;
8. explicit approval before pushing the tag;
9. isolated install of the exact tag and real tmux nonce validation.

- [ ] **Step 7: Remove stale symlink/npm-publication guidance**

```bash
rg -n 'ln -sfn|pnpm publish|npm:@marcusk19|mkok-subagents' \
  README.md \
  packages/subagents/README.md \
  docs/resources/architecture.md \
  docs/resources/releasing.md
```

Expected: `mkok-subagents` appears only in migration/history; npm publication commands are absent; symlinks are absent from user installation.

- [ ] **Step 8: Commit user and maintainer documentation**

```bash
git add README.md packages/subagents/README.md docs/resources/architecture.md docs/resources/releasing.md
git commit -m "docs: describe private GitHub installation"
```

---

### Task 7: Add CI and tag validation without npm publishing

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Modify: `package.json`

**Interfaces:**
- Consumes: source checks, deterministic release generation, archive smoke test, and root semantic version.
- Produces: CI that rejects stale tracked bundles and release-tag validation that performs no publication.

- [ ] **Step 1: Add branch and pull-request CI**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.15.1
      - uses: actions/setup-node@v4
        with:
          node-version: 22.19.0
          cache: pnpm
      - run: sudo apt-get update && sudo apt-get install -y tmux
      - run: pnpm install --frozen-lockfile
      - run: pnpm run check:release
      - run: git diff --exit-code -- release
```

- [ ] **Step 2: Add exact version-tag validation**

Add:

```json
{
  "scripts": {
    "check:release-version": "node -e \"const p=require('./package.json'); const tag=process.env.GITHUB_REF_NAME; if (tag !== 'v'+p.version) throw new Error('tag '+tag+' does not match version '+p.version)\""
  }
}
```

- [ ] **Step 3: Add a non-publishing tag workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Validate release tag

on:
  push:
    tags:
      - "v*"

permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.15.1
      - uses: actions/setup-node@v4
        with:
          node-version: 22.19.0
          cache: pnpm
      - run: sudo apt-get update && sudo apt-get install -y tmux
      - run: pnpm install --frozen-lockfile
      - run: pnpm run check:release-version
      - run: pnpm run check:release
      - run: git diff --exit-code -- release
```

This workflow validates a Git tag only. It has no npm permissions, registry credentials, package publication, or GitHub Release creation.

- [ ] **Step 4: Validate workflows locally**

```bash
pnpm run check:release
GITHUB_REF_NAME=v0.1.0 pnpm run check:release-version
git diff --check
git diff --exit-code -- release
```

Expected: all checks pass and generated release files match the commit.

- [ ] **Step 5: Commit CI**

```bash
git add .github package.json
git commit -m "ci: validate Git-installable releases"
```

---

### Task 8: Perform isolated acceptance and stop before the first tag

**Files:**
- Modify: root `package.json` only if the accepted version changes.
- Modify: `pnpm-lock.yaml` only if the root version is represented there.
- Regenerate and commit: `release/**` whenever source or version-visible bundle content changes.

**Interfaces:**
- Consumes: all prior tasks and the private GitHub repository.
- Produces: a release commit proven installable from tracked files, followed by an explicit approval boundary before tag creation.

- [ ] **Step 1: Run the complete clean-tree gate**

```bash
pnpm install --frozen-lockfile
pnpm run check:release
git diff --check
git diff --exit-code -- release
git status --short
```

Expected: all source and artifact tests pass; no generated difference remains.

- [ ] **Step 2: Create a temporary tracked-file checkout**

```bash
temp_checkout=$(mktemp -d)
git archive HEAD | tar -x -C "$temp_checkout"
test -f "$temp_checkout/release/registry-extension.js"
test -f "$temp_checkout/release/subagents-extension.js"
test -f "$temp_checkout/release/registry-daemon.js"
```

Expected: all release entries exist without `node_modules` or ignored workspace build output.

- [ ] **Step 3: Validate clean Pi loading**

```bash
temp_home=$(mktemp -d)
temp_runtime=$(mktemp -d)
trap 'rm -rf "$temp_checkout" "$temp_home" "$temp_runtime"' EXIT
HOME="$temp_home" XDG_RUNTIME_DIR="$temp_runtime" \
  pi --no-extensions -e "$temp_checkout" --list-models >/dev/null
```

Expected: both extensions load with no duplicate tool or unresolved import errors.

- [ ] **Step 4: Perform a real isolated tmux nonce test**

Use a dedicated tmux socket and a shell trap. Install or load the temporary checkout in that isolated Pi home, start the parent Pi, invoke bundled `worker` with a random nonce, and verify:

- no agent symlink exists in the temporary home;
- bundled `worker` is discovered;
- the child uses the temporary Pi home's configured default model;
- the daemon discovery record reports `127.0.0.1` connectivity and a dynamic port;
- the parent remains in the upper pane;
- workers occupy the lower row with distinct horizontal positions;
- the nonce returns through the A2A task result;
- panes, daemon, and runtime files are removed even when assertions fail.

Capture geometry with:

```bash
tmux list-panes -F '#{pane_id} #{pane_top} #{pane_left} #{pane_width} #{pane_height}'
```

Expected: the parent has `pane_top=0`; worker panes share a larger `pane_top` and have distinct `pane_left` values.

- [ ] **Step 5: Push the release commit but not a tag**

```bash
git push origin main
```

Expected: CI passes on `main`, including the release rebuild diff.

- [ ] **Step 6: Report and stop for explicit tag approval**

Report:

- release commit SHA;
- root version;
- source and artifact test totals;
- tracked release file list and combined byte size;
- isolated tmux geometry;
- nonce completion result;
- confirmation that the repository remains private;
- the exact proposed tag and install commands.

Do not create or push the tag in this step.

- [ ] **Step 7: After explicit approval, create and push the signed tag**

```bash
git tag -s v0.1.0 -m "agent-base v0.1.0"
git push origin v0.1.0
```

- [ ] **Step 8: Verify installation from the private GitHub tag**

From an authorized account with a fresh Pi home:

```bash
pi install git:github.com/Marcusk19/agent-base@v0.1.0
pi list
```

Expected: exactly one `Marcusk19/agent-base` Git package is listed. Start Pi in tmux and repeat the worker nonce test before describing the release as turnkey.

---

## Self-Review Results

- **Scope:** The plan targets private GitHub installation only and contains no npm publication step, token, trusted publisher, or npm release workflow.
- **Turnkey boundary:** Authorized users need Pi, Node, tmux, model credentials, repository access, and functional Git authentication. They do not need a clone, build, daemon service, symlink, or package-manager command.
- **Consequential assumption challenged:** A private repository cannot provide frictionless installation to arbitrary users. The plan is turnkey only for authorized GitHub users and preserves repository privacy until explicitly changed.
- **Artifact correctness:** The Git-installed checkout uses committed bundles and agents. CI rebuilds and diffs them, and a `git archive` smoke test proves ignored files and workspace links are unnecessary.
- **Security:** Installation has no lifecycle scripts and starts no process. The daemon remains lazy, loopback-only, credential-protected, and ephemeral.
- **Type consistency:** `daemonEntrypoint`, `AgentSource`, `SubagentExtensionOptions`, release filenames, root Pi manifest paths, tests, and documentation use the same names throughout.
