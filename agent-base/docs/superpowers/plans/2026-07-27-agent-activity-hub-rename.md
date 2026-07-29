# Agent Activity Hub Rename Implementation Plan

> **For agentic workers:** This plan is documentation only. Do not automatically invoke implementation subskills. If the user explicitly requests execution, ask them to choose an execution skill first. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the active-session registry subsystem to Agent Activity Hub and prevent legacy and renamed daemons from running simultaneously.

**Architecture:** This is a coordinated breaking rename across contracts, TypeScript workspaces, runtime discovery, Pi/subagent adapters, release bundles, and documentation. A side-effect-free legacy detector checks the old protected discovery record before the renamed client starts a hub daemon; ephemeral sessions and tasks are never migrated.

**Tech Stack:** TypeScript 5.9, Node.js 22.19 built-in SQLite, TypeBox, Vitest, pnpm 10.15.1, esbuild.

## Global Constraints

- Keep the root `@marcusk19/agent-base` package and repository name unchanged.
- Rename workspace scope `@agent-session/*` to `@agent-hub/*`.
- Rename `packages/registry/` to `packages/hub/` and its package to `@agent-hub/hub`.
- Use runtime directory `agent-activity-hub`, maintenance discovery file `hub.json`, and lock directory `lock`.
- Rename `AGENT_SESSION_TOKEN`, `AGENT_SESSION_DISCOVERY_FILE`, `AGENT_SESSION_EMPTY_EXIT_MS`, and `AGENT_SESSION_LEASE_MS` to the corresponding `AGENT_HUB_*` names.
- Use `urn:agent-activity-hub:extension:local-coordination:v1` and `agent-activity-hub:coordination-api:v1` exactly.
- Rename release bundles to `hub-extension.js` and `hub-daemon.js`.
- Do not migrate, persist, copy, delete, or expose legacy session/task data or capabilities.
- A healthy legacy daemon must block renamed daemon startup with `LEGACY_DAEMON_RUNNING`.
- Node.js remains at least 22.19.0 and pnpm remains at least 10.15.1.

---

### Task 1: Rename package and protocol identities

**Files:**
- Modify: `packages/contracts/package.json`
- Modify: `packages/contracts/src/coordination.ts`
- Modify: `packages/contracts/test/contracts.test.ts`
- Modify: `packages/client/package.json`
- Modify: `packages/pi-extension/package.json`
- Modify: `packages/subagents/package.json`
- Modify: `packages/distribution/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: existing workspace package graph and `LOCAL_COORDINATION_EXTENSION`.
- Produces: `@agent-hub/contracts`, `@agent-hub/client`, `@agent-hub/pi-extension`, `@agent-hub/subagents`, `@agent-hub/distribution-build`, and the new coordination URN.

- [ ] **Step 1: Add a failing exact-identity contract test**

Add to `packages/contracts/test/contracts.test.ts`:

```ts
import { LOCAL_COORDINATION_EXTENSION } from "../src/index.js";

it("uses the Agent Activity Hub coordination identity", () => {
  expect(LOCAL_COORDINATION_EXTENSION).toBe(
    "urn:agent-activity-hub:extension:local-coordination:v1",
  );
  expect(LOCAL_COORDINATION_EXTENSION).not.toContain("agent-session-registry");
});
```

- [ ] **Step 2: Run the test and verify the legacy URN fails**

Run: `pnpm vitest run packages/contracts/test/contracts.test.ts`
Expected: FAIL showing the current `urn:agent-session-registry:...` value.

- [ ] **Step 3: Rename package manifests and contract imports mechanically**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
for path in [Path("packages/contracts/package.json"), Path("packages/client/package.json"), Path("packages/pi-extension/package.json"), Path("packages/subagents/package.json"), Path("packages/distribution/package.json")]:
    text = path.read_text()
    text = text.replace("@agent-session/contracts", "@agent-hub/contracts")
    text = text.replace("@agent-session/client", "@agent-hub/client")
    text = text.replace("@agent-session/pi-extension", "@agent-hub/pi-extension")
    text = text.replace("@agent-session/subagents", "@agent-hub/subagents")
    text = text.replace("@agent-session/distribution-build", "@agent-hub/distribution-build")
    path.write_text(text)
PY
pnpm install --lockfile-only
```

Set `LOCAL_COORDINATION_EXTENSION` in `packages/contracts/src/coordination.ts` to:

```ts
export const LOCAL_COORDINATION_EXTENSION =
  "urn:agent-activity-hub:extension:local-coordination:v1" as const;
```

- [ ] **Step 4: Replace all TypeScript workspace imports**

Run:

```bash
rg -l '@agent-session/' packages --glob '!**/dist/**' \
  | xargs perl -pi -e 's/\@agent-session\//\@agent-hub\//g'
```

- [ ] **Step 5: Verify contracts and lockfile pass**

Run: `pnpm vitest run packages/contracts/test/contracts.test.ts && pnpm install --frozen-lockfile`
Expected: PASS; pnpm reports an up-to-date lockfile.

### Task 2: Rename runtime paths and add legacy path resolution

**Files:**
- Modify: `packages/client/src/paths.ts`
- Create: `packages/client/test/paths.test.ts`

**Interfaces:**
- Consumes: `XDG_RUNTIME_DIR`, `tmpdir()`, and the current UID fallback.
- Produces: `resolveRuntimePaths(): Promise<RuntimePaths>` and `resolveLegacyRuntimePaths(): LegacyRuntimePaths`.

- [ ] **Step 1: Write failing path tests**

Create `packages/client/test/paths.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveLegacyRuntimePaths, resolveRuntimePaths } from "../src/paths.js";

const original = process.env.XDG_RUNTIME_DIR;
afterEach(() => {
  if (original === undefined) delete process.env.XDG_RUNTIME_DIR;
  else process.env.XDG_RUNTIME_DIR = original;
  vi.restoreAllMocks();
});

describe("hub runtime paths", () => {
  it("uses renamed XDG paths without changing legacy paths", async () => {
    process.env.XDG_RUNTIME_DIR = "/run/user/test";
    await expect(resolveRuntimePaths()).resolves.toMatchObject({
      directory: "/run/user/test/agent-activity-hub",
      discoveryFile: "/run/user/test/agent-activity-hub/hub.json",
      lockDirectory: "/run/user/test/agent-activity-hub/lock",
    });
    expect(resolveLegacyRuntimePaths()).toEqual({
      directory: "/run/user/test/agent-session-registry",
      discoveryFile: "/run/user/test/agent-session-registry/registry.json",
    });
  });
});
```

- [ ] **Step 2: Verify the new resolver is missing**

Run: `pnpm vitest run packages/client/test/paths.test.ts`
Expected: FAIL because `resolveLegacyRuntimePaths` is not exported and renamed paths differ.

- [ ] **Step 3: Implement exact renamed and legacy paths**

Replace `packages/client/src/paths.ts` with the existing permission logic plus these exported resolvers:

```ts
export interface RuntimePaths {
  directory: string;
  discoveryFile: string;
  lockDirectory: string;
}
export interface LegacyRuntimePaths { directory: string; discoveryFile: string }

export async function resolveRuntimePaths(): Promise<RuntimePaths> {
  const directory = resolveDirectory("agent-activity-hub");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(directory, 0o700).catch(() => undefined);
  return { directory, discoveryFile: join(directory, "hub.json"), lockDirectory: join(directory, "lock") };
}

export function resolveLegacyRuntimePaths(): LegacyRuntimePaths {
  const directory = resolveDirectory("agent-session-registry");
  return { directory, discoveryFile: join(directory, "registry.json") };
}

function resolveDirectory(name: string): string {
  const override = process.env.XDG_RUNTIME_DIR;
  if (override) return join(override, name);
  const uid = typeof process.getuid === "function" ? String(process.getuid()) : "shared";
  return join(tmpdir(), `${name}-${uid}`);
}
```

Keep the existing `chmod`, `mkdir`, `tmpdir`, and `join` imports.

- [ ] **Step 4: Run path tests**

Run: `pnpm vitest run packages/client/test/paths.test.ts`
Expected: PASS.

### Task 3: Detect a healthy legacy daemon without mutating it

**Files:**
- Create: `packages/client/src/legacy-runtime.ts`
- Create: `packages/client/test/legacy-runtime.test.ts`
- Modify: `packages/client/src/transport.ts`

**Interfaces:**
- Consumes: `LegacyRuntimePaths` and legacy `/v2/health` response `{ protocolVersion: 2, pid, startedAt }`.
- Produces: `detectLegacyDaemon(paths, fetchImpl?): Promise<boolean>` and legacy-runtime detection consumed by `ensureDaemon`; the client error class is renamed to `HubClientError` in Task 5.

- [ ] **Step 1: Write failing detector tests**

Create `packages/client/test/legacy-runtime.test.ts` with temporary files and an injected fetch:

```ts
it("recognizes only an authenticated healthy legacy daemon", async () => {
  await writeFile(discoveryFile, JSON.stringify({ port: 4321, pid: 7, token: "secret", protocolVersion: 2, startedAt: 10 }));
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
    return new Response(JSON.stringify({ protocolVersion: 2, pid: 7, startedAt: 10 }), { status: 200 });
  });
  await expect(detectLegacyDaemon({ directory, discoveryFile }, fetchImpl)).resolves.toBe(true);
});

it("does not delete malformed or unhealthy legacy discovery", async () => {
  await writeFile(discoveryFile, "not-json");
  await expect(detectLegacyDaemon({ directory, discoveryFile }, vi.fn())).resolves.toBe(false);
  await expect(readFile(discoveryFile, "utf8")).resolves.toBe("not-json");
});
```

Include `mkdtemp`, `mkdir`, `readFile`, `writeFile`, `rm`, and cleanup matching existing client tests.

- [ ] **Step 2: Verify the module is absent**

Run: `pnpm vitest run packages/client/test/legacy-runtime.test.ts`
Expected: FAIL resolving `../src/legacy-runtime.js`.

- [ ] **Step 3: Implement bounded, side-effect-free detection**

Create `packages/client/src/legacy-runtime.ts`:

```ts
import { readFile } from "node:fs/promises";
import type { LegacyRuntimePaths } from "./paths.js";

type Fetch = typeof fetch;
interface LegacyRecord { port: number; pid: number; token: string; protocolVersion: number; startedAt: number }

export async function detectLegacyDaemon(paths: LegacyRuntimePaths, fetchImpl: Fetch = fetch): Promise<boolean> {
  let value: unknown;
  try { value = JSON.parse(await readFile(paths.discoveryFile, "utf8")); }
  catch { return false; }
  if (!isRecord(value)) return false;
  try {
    const response = await fetchImpl(`http://127.0.0.1:${value.port}/v2/health`, {
      headers: { authorization: `Bearer ${value.token}`, accept: "application/json" },
      signal: AbortSignal.timeout(500),
    });
    if (!response.ok) return false;
    const health = await response.json() as Record<string, unknown>;
    return health.protocolVersion === value.protocolVersion && health.pid === value.pid && health.startedAt === value.startedAt;
  } catch { return false; }
}

function isRecord(value: unknown): value is LegacyRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return Number.isInteger(r.port) && Number(r.port) > 0 && Number.isInteger(r.pid)
    && typeof r.token === "string" && r.token.length > 0
    && Number.isInteger(r.protocolVersion) && Number.isInteger(r.startedAt);
}
```

- [ ] **Step 4: Run detector tests**

Run: `pnpm vitest run packages/client/test/legacy-runtime.test.ts`
Expected: PASS and the malformed file remains present.

### Task 4: Block renamed daemon startup and rename daemon environment

**Files:**
- Modify: `packages/client/src/daemon.ts`
- Modify: `packages/client/test/daemon.test.ts`
- Modify: `packages/client/src/transport.ts`

**Interfaces:**
- Consumes: `detectLegacyDaemon(resolveLegacyRuntimePaths())`.
- Produces: renamed daemon spawn and non-retryable `RegistryClientError("LEGACY_DAEMON_RUNNING")`; Task 5 mechanically renames that class to `HubClientError` without changing the code or message.

- [ ] **Step 1: Add failing startup-guard tests**

Add tests that inject `detectLegacy: async () => true` into `EnsureDaemonOptions`, assert `spawnDaemon` is never called, and assert:

```ts
await expect(ensureDaemon(options)).rejects.toMatchObject({
  name: "RegistryClientError",
  code: "LEGACY_DAEMON_RUNNING",
  retryable: false,
  message: "A legacy active session registry daemon is running. Update the Agent Base package and restart active sessions before starting Agent Activity Hub.",
});
```

Add a second test where the first check returns false and the check under the acquired lock returns true; spawning must still be zero calls.

- [ ] **Step 2: Verify startup currently ignores the detector**

Run: `pnpm vitest run packages/client/test/daemon.test.ts`
Expected: FAIL because `detectLegacy` is not accepted.

- [ ] **Step 3: Add the guard and renamed spawn contract**

Extend `EnsureDaemonOptions`:

```ts
detectLegacy?: () => Promise<boolean>;
```

At entry and immediately after lock acquisition, call the injected function or `detectLegacyDaemon(resolveLegacyRuntimePaths())`; throw:

```ts
new RegistryClientError({
  code: "LEGACY_DAEMON_RUNNING",
  message: "A legacy active session registry daemon is running. Update the Agent Base package and restart active sessions before starting Agent Activity Hub.",
  retryable: false,
});
```

Change daemon entrypoint and environment:

```ts
return fileURLToPath(new URL("../../hub/dist/daemon.js", import.meta.url));
// child env
AGENT_HUB_TOKEN: options.token,
AGENT_HUB_DISCOVERY_FILE: options.paths.discoveryFile,
```

- [ ] **Step 4: Run startup tests**

Run: `pnpm vitest run packages/client/test/daemon.test.ts packages/client/test/legacy-runtime.test.ts`
Expected: PASS.

### Task 5: Move the hub package and rename public TypeScript symbols

**Files:**
- Move: `packages/registry/` → `packages/hub/`
- Move: `packages/hub/src/registry-http.ts` → `packages/hub/src/hub-http.ts`
- Modify: all files under `packages/hub/src/` and `packages/hub/test/`
- Modify: all files under `packages/client/src/` and `packages/client/test/`
- Modify: `packages/distribution/tsconfig.json`

**Interfaces:**
- Consumes: package identities from Task 1.
- Produces: `HubStore`, `HubError`, `HubTransport`, `HubClientError`, `HubServer`, `createHubServer`, and `handleHubRequest`.

- [ ] **Step 1: Move files and make tests fail on old exports**

Run:

```bash
git mv packages/registry packages/hub
git mv packages/hub/src/registry-http.ts packages/hub/src/hub-http.ts
```

In `packages/hub/test/http.test.ts`, import only renamed exports:

```ts
import type { HubServer } from "../src/index.js";
import { HubStore, createHubServer } from "../src/index.js";
```

- [ ] **Step 2: Verify renamed exports do not exist**

Run: `pnpm vitest run packages/hub/test/http.test.ts`
Expected: FAIL because the hub symbols are not exported.

- [ ] **Step 3: Apply exact symbol renames**

Run:

```bash
rg -l 'RegistryStore|RegistryError|isRegistryError|RegistryServer|createRegistryServer|handleRegistryRequest|RegistryTransport|RegistryClientError|registry-http|packages/registry' packages package.json tsconfig.base.json --glob '!**/dist/**' \
  | xargs perl -pi -e 's/RegistryStore/HubStore/g; s/RegistryError/HubError/g; s/isRegistryError/isHubError/g; s/RegistryServer/HubServer/g; s/createRegistryServer/createHubServer/g; s/handleRegistryRequest/handleHubRequest/g; s/RegistryTransport/HubTransport/g; s/RegistryClientError/HubClientError/g; s/registry-http/hub-http/g; s#packages/registry#packages/hub#g'
```

Set `packages/hub/package.json` name to `@agent-hub/hub`. Update `packages/hub/src/index.ts` to export only renamed public symbols. Rename error code `REGISTRY_UNAVAILABLE` to `HUB_UNAVAILABLE` and user-facing error text to “Agent Activity Hub”. Rename semantic variables/fields named `registry` to `hub` where they represent this component; retain generic `register()` operations and SQLite table names.

- [ ] **Step 4: Rename daemon environment reads**

In `packages/hub/src/daemon.ts`, use:

```ts
const token = process.env.AGENT_HUB_TOKEN;
const file = process.env.AGENT_HUB_DISCOVERY_FILE;
if (!token) throw new Error("AGENT_HUB_TOKEN is required");
if (!file) throw new Error("AGENT_HUB_DISCOVERY_FILE is required");
const emptyMs = positiveIntegerEnv("AGENT_HUB_EMPTY_EXIT_MS", DEFAULT_EMPTY_EXIT_MS);
// runtime option
leaseMs: positiveIntegerEnv("AGENT_HUB_LEASE_MS", LEASE_MS),
```

- [ ] **Step 5: Typecheck and run hub/client tests**

Run: `pnpm exec tsc -b packages/contracts packages/hub packages/client --pretty false && pnpm vitest run packages/hub/test packages/client/test`
Expected: PASS with no old symbol imports.

### Task 6: Rename Pi coordination channel and adapter language

**Files:**
- Modify: `packages/pi-extension/src/coordination-api.ts`
- Modify: `packages/pi-extension/src/index.ts`
- Modify: `packages/pi-extension/src/tool.ts`
- Modify: `packages/pi-extension/test/coordination-api.test.ts`
- Modify: `packages/pi-extension/test/tool.test.ts`
- Modify: `packages/subagents/src/coordination.ts`
- Modify: `packages/subagents/test/coordination.test.ts`

**Interfaces:**
- Consumes: `HubClientError` and hub client package.
- Produces: exact shared event channel `agent-activity-hub:coordination-api:v1`.

- [ ] **Step 1: Change tests to require the new channel and diagnostics**

Assert in both coordination test suites:

```ts
expect(COORDINATION_API_CHANNEL).toBe("agent-activity-hub:coordination-api:v1");
```

Update tool error expectations to “Agent Activity Hub unavailable” and `HUB_UNAVAILABLE`.

- [ ] **Step 2: Verify old channel and copy fail**

Run: `pnpm vitest run packages/pi-extension/test packages/subagents/test`
Expected: FAIL on old channel/error wording.

- [ ] **Step 3: Update both channel endpoints atomically**

Set in both source files:

```ts
export const COORDINATION_API_CHANNEL = "agent-activity-hub:coordination-api:v1" as const;
```

Rename the Pi extension entry function from `activeSessionRegistry` to `agentActivityHub`; update diagnostic copy and imports without renaming public tools `query_active_sessions`, `delegate_task`, or `subagent`.

- [ ] **Step 4: Run adapter tests**

Run: `pnpm vitest run packages/pi-extension/test packages/subagents/test`
Expected: PASS.

### Task 7: Rename release bundles and package manifest

**Files:**
- Modify: `packages/distribution/build.mjs`
- Move: `packages/distribution/src/registry-extension.ts` → `packages/distribution/src/hub-extension.ts`
- Modify: `packages/distribution/test/git-artifact-smoke.mjs`
- Modify: `package.json`
- Regenerate: `release/`

**Interfaces:**
- Consumes: renamed hub and extension entry points.
- Produces: tracked `release/hub-extension.js`, `release/hub-daemon.js`, maps, and root Pi extension manifest.

- [ ] **Step 1: Update the artifact smoke test first**

Require exactly:

```js
const required = [
  "release/hub-extension.js",
  "release/subagents-extension.js",
  "release/hub-daemon.js",
  "release/agents/scout.md",
  "release/agents/planner.md",
  "release/agents/reviewer.md",
  "release/agents/worker.md",
  "release/agents/executor.md",
];
```

Use `hub.json`, `AGENT_HUB_TOKEN`, `AGENT_HUB_DISCOVERY_FILE`, and `AGENT_HUB_EMPTY_EXIT_MS`; reject leaked `@agent-hub/` workspace imports.

- [ ] **Step 2: Verify the old build fails the new smoke test**

Run: `pnpm run test:git-artifact`
Expected: FAIL because hub bundles do not exist.

- [ ] **Step 3: Rename build entries and root manifest**

Run: `git mv packages/distribution/src/registry-extension.ts packages/distribution/src/hub-extension.ts`

Use build entries:

```js
entryPoints: {
  "hub-extension": resolve(here, "src/hub-extension.ts"),
  "subagents-extension": resolve(here, "src/subagents-extension.ts"),
}
// detached entry
entryPoints: { "hub-daemon": resolve(repo, "packages/hub/src/daemon.ts") }
```

Set root Pi extensions to:

```json
["./release/hub-extension.js", "./release/subagents-extension.js"]
```

- [ ] **Step 4: Regenerate and test tracked artifacts**

Run: `pnpm run build:release && pnpm run test:git-artifact`
Expected: PASS; old `release/registry-*` files are removed and new `release/hub-*` files are tracked.

### Task 8: Update documentation and complete migration verification

**Files:**
- Modify: `README.md`
- Modify: `docs/resources/architecture.md`
- Modify: `docs/resources/releasing.md`
- Modify: `docs/research/active-session-registry-vs-a2a.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: all renamed commands, files, package identities, and migration behavior.
- Produces: one consistent Agent Activity Hub vocabulary and operator migration instructions.

- [ ] **Step 1: Replace product terminology while preserving historical document context**

Describe the old name only in a “Migrating from the active session registry” section. Include exact operator action:

```text
Close active Pi/adapter sessions, wait for the legacy daemon to exit, update Agent Base, and restart sessions. Agent Activity Hub does not migrate ephemeral sessions or tasks.
```

Update architecture diagrams, runtime paths, bundle names, environment variables, troubleshooting, privacy text, and release acceptance commands.

- [ ] **Step 2: Scan for forbidden active terminology**

Run:

```bash
rg -n '@agent-session/|agent-session-registry|AGENT_SESSION_|registry-extension|registry-daemon|packages/registry|RegistryStore|RegistryTransport|RegistryClientError' \
  package.json pnpm-lock.yaml packages README.md docs/resources .github release
```

Expected: no matches except the intentional legacy detector, migration documentation, and historical research wording.

- [ ] **Step 3: Run the complete release check**

Run: `pnpm run check:release && git diff --check && git diff --exit-code -- release`
Expected: all typechecks/tests/build/smoke tests pass; regenerated `release/` is clean.

- [ ] **Step 4: Verify the migration guard manually with automated fixtures**

Run: `pnpm vitest run packages/client/test/legacy-runtime.test.ts packages/client/test/daemon.test.ts packages/client/test/e2e.test.ts`
Expected: PASS, including refusal to spawn beside a healthy legacy daemon and no mutation of legacy discovery.
