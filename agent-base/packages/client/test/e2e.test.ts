import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NormalizedEvent } from "@agent-hub/contracts";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSessionReporter,
  ensureDaemon,
  resolveRuntimePaths,
  type RuntimePaths,
  type SessionReporter,
} from "../dist/index.js";

let runtime: string | undefined;
let reporters: SessionReporter[] = [];
let daemonPids = new Set<number>();
let previousRuntime: string | undefined;

afterEach(async () => {
  await Promise.allSettled(reporters.map((reporter) => reporter.close()));
  reporters = [];
  if (runtime) {
    const pids = [...daemonPids];
    for (const pid of pids) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // The daemon may already have exited.
      }
    }
    await waitFor(() => pids.every((pid) => !processAlive(pid)));
    daemonPids.clear();
    await rm(runtime, { recursive: true, force: true });
  }
  if (previousRuntime === undefined) delete process.env.XDG_RUNTIME_DIR;
  else process.env.XDG_RUNTIME_DIR = previousRuntime;
  runtime = undefined;
});

describe("real daemon", () => {
  it("registers two reporters, searches evidence, and excludes the caller", async () => {
    const harness = await createHarness();
    const first = harness.makeReporter("one", "review authentication");
    const second = harness.makeReporter("two", "debug PROJQUAY-123 authentication");
    await Promise.all([first.reporter.start(), second.reporter.start()]);

    const overview = await first.reporter.query({ query: "what are my other sessions doing?" });
    expect(overview.mode).toBe("overview");
    expect(overview.sessions).toHaveLength(1);
    expect(overview.sessions[0]?.metadata.harnessSessionId).toBe("two");

    const search = await first.reporter.query({ query: "PROJQUAY-123", mode: "search" });
    expect(search.sessions[0]?.metadata.harnessSessionId).toBe("two");
    expect(search.sessions[0]?.excerpts.some((excerpt) => excerpt.text.includes("PROJQUAY"))).toBe(true);

    const files = (await readdir(harness.paths.directory)).sort();
    expect(files).toEqual(["hub.json", "hub.json.owner", "monitor.json"]);
    expect(await readFile(harness.paths.discoveryFile, "utf8")).not.toContain("PROJQUAY-123");
    expect(await readFile(join(harness.paths.directory, "hub.json.owner", "owner.json"), "utf8"))
      .not.toContain("PROJQUAY-123");
  }, 10_000);

  it("removes a reporter before close resolves", async () => {
    const harness = await createHarness();
    const first = harness.makeReporter("one", "coordinate release work");
    const second = harness.makeReporter("two", "run smoke tests");
    await Promise.all([first.reporter.start(), second.reporter.start()]);

    await second.reporter.close();
    const result = await first.reporter.query({ query: "what are my other sessions doing?" });
    expect(result.sessions).toEqual([]);
  }, 10_000);

  it("replaces a non-empty daemon that loses discovery before publishing a successor", async () => {
    const harness = await createHarness();
    const session = harness.makeReporter("discovery-loss", "keep the first daemon non-empty");
    await session.reporter.start();
    const original = await readFullDiscovery(harness.paths);
    expect(original).toBeDefined();

    await rm(harness.paths.discoveryFile);
    const replacement = await harness.ensureTestDaemon();

    expect(replacement.pid).not.toBe(original!.pid);
    await waitFor(async () => !(await authenticatedHealth(original!)), 5_000);
    expect(await readFullDiscovery(harness.paths)).toEqual(replacement);

    if (process.platform !== "win32") {
      const { stat } = await import("node:fs/promises");
      expect((await stat(harness.paths.directory)).mode & 0o777).toBe(0o700);
      expect((await stat(harness.paths.discoveryFile)).mode & 0o777).toBe(0o600);
    }
  }, 10_000);

  it("restarts a killed daemon and restores the authoritative snapshot", async () => {
    const harness = await createHarness();
    const session = harness.makeReporter("recovery", "initial task");
    await session.reporter.start();
    const originalSessionId = session.reporter.sessionId;
    const originalRecord = await readDiscovery(harness.paths);
    expect(originalRecord).toBeDefined();

    process.kill(originalRecord!.pid, "SIGTERM");
    await waitFor(async () => !(await exists(harness.paths.discoveryFile)));

    const recoveryEvent: NormalizedEvent = {
      type: "message.assistant",
      eventId: "recovery-2",
      sequence: 2,
      timestamp: 2_000,
      text: "recovered evidence",
      stopStatus: "stop",
    };
    session.events.push(recoveryEvent);
    session.reporter.enqueue(recoveryEvent);

    await waitFor(async () => {
      const record = await readDiscovery(harness.paths);
      return record !== undefined
        && record.pid !== originalRecord!.pid
        && session.reporter.sessionId !== originalSessionId
        && session.reporter.status === "connected";
    }, 8_000);

    const result = await session.reporter.query({
      query: "recovered evidence",
      mode: "search",
      includeCurrentSession: true,
    });
    expect(result.sessions[0]?.excerpts.some((excerpt) => excerpt.text.includes("recovered"))).toBe(true);
  }, 15_000);

  it("handles 50 concurrent reporters without leaking transcript text to runtime files", async () => {
    const harness = await createHarness();
    const sessions = Array.from({ length: 50 }, (_, index) =>
      harness.makeReporter(`load-${index}`, `private-load-fixture-${index}`));

    await Promise.all(sessions.map(({ reporter }) => reporter.start()));
    const result = await sessions[0]!.reporter.query({
      query: "what are my other sessions doing?",
      mode: "overview",
      maxSessions: 50,
      maxCharacters: 40_000,
    });
    expect(result.sessions).toHaveLength(49);

    const runtimeContents = await Promise.all([
      readFile(harness.paths.discoveryFile, "utf8"),
      readFile(join(harness.paths.directory, "hub.json.owner", "owner.json"), "utf8"),
    ]);
    expect(runtimeContents.join("\n")).not.toContain("private-load-fixture");

    await Promise.all(sessions.map(({ reporter }) => reporter.close()));
    expect(sessions.every(({ reporter }) => reporter.status === "closed")).toBe(true);
  }, 20_000);
});

async function createHarness(): Promise<{
  paths: RuntimePaths;
  ensureTestDaemon: () => ReturnType<typeof ensureDaemon>;
  makeReporter(id: string, text: string): { reporter: SessionReporter; events: NormalizedEvent[] };
}> {
  previousRuntime = process.env.XDG_RUNTIME_DIR;
  runtime = await mkdtemp(join(tmpdir(), "agent-hub-e2e-"));
  process.env.XDG_RUNTIME_DIR = runtime;
  const paths = await resolveRuntimePaths();
  const ensureTestDaemon = () => ensureDaemon({
    paths,
    spawnDaemon: async ({ token }) => {
      const child = spawn(process.execPath, [join(process.cwd(), "packages/hub/dist/daemon.js")], {
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          AGENT_HUB_TOKEN: token,
          AGENT_HUB_DISCOVERY_FILE: paths.discoveryFile,
        },
      });
      child.unref();
      if (child.pid !== undefined) daemonPids.add(child.pid);
    },
  });

  return {
    paths,
    ensureTestDaemon,
    makeReporter(id: string, text: string) {
      const events: NormalizedEvent[] = [{
        type: "message.user",
        eventId: `${id}-1`,
        sequence: 1,
        timestamp: 1_000,
        text,
      }];
      const reporter = createSessionReporter({
        metadata: {
          adapter: "pi",
          adapterVersion: "0.1.0",
          harnessSessionId: id,
          cwd: `/repo/${id}`,
          processId: process.pid,
          startedAt: 1_000,
          state: "idle",
          acceptsTaskDelivery: false,
        },
        ensureDaemon: ensureTestDaemon,
        snapshotProvider: () => ({ lastSequence: events.length, events: [...events] }),
      });
      reporters.push(reporter);
      return { reporter, events };
    },
  };
}

interface FullDiscovery {
  port: number;
  pid: number;
  token: string;
  protocolVersion: 2;
  startedAt: number;
}

async function readDiscovery(paths: RuntimePaths): Promise<{ pid: number } | undefined> {
  return readFullDiscovery(paths);
}

async function readFullDiscovery(paths: RuntimePaths): Promise<FullDiscovery | undefined> {
  try {
    return JSON.parse(await readFile(paths.discoveryFile, "utf8")) as FullDiscovery;
  } catch {
    return undefined;
  }
}

async function authenticatedHealth(record: FullDiscovery): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${record.port}/v2/health`, {
      headers: { authorization: `Bearer ${record.token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}
