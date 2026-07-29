import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureDaemon } from "../src/daemon.js";
import type { DiscoveryRecord, HealthCheck } from "../src/discovery.js";
import { readHealthyDiscovery } from "../src/discovery.js";
import { resolveRuntimePaths, type RuntimePaths } from "../src/paths.js";
import { HubClientError } from "../src/transport.js";

const healthyRecord: DiscoveryRecord = {
  port: 4000,
  pid: 123,
  token: "token-1",
  protocolVersion: 2,
  startedAt: 1,
};

const fakeHealthCheck: HealthCheck = vi.fn(async () => {});

export async function publishHealthyDiscovery(file: string, record: DiscoveryRecord) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(record), { mode: 0o600 });
}

function createTestPaths(dir: string): RuntimePaths {
  return {
    directory: dir,
    discoveryFile: join(dir, "registry.json"),
    lockDirectory: join(dir, "lock"),
  };
}

describe("runtime paths", () => {
  let originalXdg: string | undefined;

  beforeEach(() => {
    originalXdg = process.env.XDG_RUNTIME_DIR;
  });

  afterEach(async () => {
    if (originalXdg === undefined) delete process.env.XDG_RUNTIME_DIR;
    else process.env.XDG_RUNTIME_DIR = originalXdg;
  });

  it("uses XDG runtime dir with secure modes", async () => {
    const runtime = await mkdtemp(join(tmpdir(), "agent-rt-"));
    process.env.XDG_RUNTIME_DIR = runtime;
    const paths = await resolveRuntimePaths();
    expect(paths.directory.startsWith(runtime)).toBe(true);
    const dirStat = await stat(paths.directory);
    if (process.platform !== "win32") {
      expect(dirStat.mode & 0o777).toBe(0o700);
    }
    await rm(runtime, { recursive: true, force: true });
  });
});

describe("readHealthyDiscovery", () => {
  let runtimeDir: string;
  let paths: RuntimePaths;

  beforeEach(async () => {
    runtimeDir = await mkdtemp(join(tmpdir(), "agent-client-"));
    paths = createTestPaths(runtimeDir);
    await mkdir(paths.directory, { recursive: true });
    fakeHealthCheck.mockClear();
  });

  afterEach(async () => {
    await rm(runtimeDir, { recursive: true, force: true });
  });

  it("returns undefined when file is missing", async () => {
    const record = await readHealthyDiscovery(paths, { healthCheck: fakeHealthCheck });
    expect(record).toBeUndefined();
    expect(fakeHealthCheck).not.toHaveBeenCalled();
  });

  it("validates the record and calls the health check", async () => {
    await publishHealthyDiscovery(paths.discoveryFile, healthyRecord);
    const record = await readHealthyDiscovery(paths, { healthCheck: fakeHealthCheck });
    expect(record).toEqual(healthyRecord);
    expect(fakeHealthCheck).toHaveBeenCalledWith(healthyRecord, undefined);
    if (process.platform !== "win32") {
      const fileStat = await stat(paths.discoveryFile);
      expect(fileStat.mode & 0o777).toBe(0o600);
    }
  });

  it("throws on incompatible protocol", async () => {
    await publishHealthyDiscovery(paths.discoveryFile, { ...healthyRecord, protocolVersion: 99 } as DiscoveryRecord);
    await expect(readHealthyDiscovery(paths, { healthCheck: fakeHealthCheck })).rejects.toBeInstanceOf(HubClientError);
  });
});

describe("ensureDaemon", () => {
  let runtimeDir: string;
  let paths: RuntimePaths;

  beforeEach(async () => {
    runtimeDir = await mkdtemp(join(tmpdir(), "agent-daemon-"));
    paths = createTestPaths(runtimeDir);
    await mkdir(paths.directory, { recursive: true });
    fakeHealthCheck.mockClear();
  });

  afterEach(async () => {
    await rm(runtimeDir, { recursive: true, force: true });
  });

  it("returns existing healthy discovery without spawning", async () => {
    await publishHealthyDiscovery(paths.discoveryFile, healthyRecord);
    const record = await ensureDaemon({ paths, healthCheck: fakeHealthCheck });
    expect(record).toEqual(healthyRecord);
  });

  it("spawns exactly once for concurrent callers", async () => {
    let spawnCount = 0;
    const spawnDaemon = async () => {
      spawnCount += 1;
      await publishHealthyDiscovery(paths.discoveryFile, healthyRecord);
    };
    const records = await Promise.all(
      Array.from({ length: 20 }, () =>
        ensureDaemon({
          paths,
          spawnDaemon,
          healthCheck: fakeHealthCheck,
          now: () => Date.now(),
          wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        }),
      ),
    );
    expect(spawnCount).toBe(1);
    expect(new Set(records.map((record) => record.token))).toEqual(new Set([healthyRecord.token]));
  });

  it("replaces malformed discovery files", async () => {
    await writeFile(paths.discoveryFile, "not json", { mode: 0o600 });
    let spawned = false;
    const spawnDaemon = async () => {
      spawned = true;
      await publishHealthyDiscovery(paths.discoveryFile, { ...healthyRecord, token: "token-new" });
    };
    const record = await ensureDaemon({ paths, spawnDaemon, healthCheck: fakeHealthCheck });
    expect(spawned).toBe(true);
    expect(record?.token).toBe("token-new");
  });

  it("removes stale locks older than five seconds", async () => {
    await mkdir(paths.lockDirectory, { recursive: false });
    const past = new Date(Date.now() - 10_000);
    await utimes(paths.lockDirectory, past, past);
    let spawnCount = 0;
    const spawnDaemon = async () => {
      spawnCount += 1;
      await publishHealthyDiscovery(paths.discoveryFile, { ...healthyRecord, token: randomUUID() });
    };
    await ensureDaemon({
      paths,
      spawnDaemon,
      healthCheck: fakeHealthCheck,
      now: () => Date.now(),
    });
    expect(spawnCount).toBe(1);
  });

  it("leaves tested startup margin beyond lifetime-owner recovery", async () => {
    let now = 0;
    let published = false;
    const record = await ensureDaemon({
      paths,
      spawnDaemon: async () => {},
      healthCheck: fakeHealthCheck,
      now: () => now,
      random: () => 0,
      wait: async (ms) => {
        now += ms;
        if (!published && now >= 4_500) {
          published = true;
          await publishHealthyDiscovery(paths.discoveryFile, healthyRecord);
        }
      },
    });

    expect(record).toEqual(healthyRecord);
    expect(now).toBeGreaterThanOrEqual(4_500);
    expect(now).toBeLessThan(6_000);
  });

  it("fails after bounded start timeout", async () => {
    await expect(
      ensureDaemon({
        paths,
        spawnDaemon: async () => {},
        healthCheck: async () => {
          throw new HubClientError({ code: "HUB_UNAVAILABLE", message: "down", retryable: true });
        },
        now: (() => {
          let now = 0;
          return () => (now += 500);
        })(),
        wait: () => Promise.resolve(),
      }),
    ).rejects.toMatchObject({ code: "DAEMON_START_FAILED" });
  });
});
