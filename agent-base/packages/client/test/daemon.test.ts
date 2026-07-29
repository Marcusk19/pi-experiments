import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureDaemon, resolveDaemonEntrypoint } from "../src/daemon.js";
import type { RuntimePaths } from "../src/paths.js";

describe("daemon entrypoint resolution", () => {
  it("uses a tracked release daemon when explicitly configured", async () => {
    await expect(resolveDaemonEntrypoint("/tmp/agent-base/release/hub-daemon.js"))
      .resolves.toBe("/tmp/agent-base/release/hub-daemon.js");
  });

  it("resolves the hub workspace daemon during development", async () => {
    await expect(resolveDaemonEntrypoint()).resolves.toMatch(/hub.*daemon\.js$/);
  });
});

describe("legacy daemon guard", () => {
  it("refuses to start when a legacy daemon is healthy", async () => {
    await expect(
      ensureDaemon({
        detectLegacy: async () => true,
        spawnDaemon: vi.fn(),
      }),
    ).rejects.toMatchObject({
      name: "HubClientError",
      code: "LEGACY_DAEMON_RUNNING",
      retryable: false,
      message: expect.stringContaining("legacy active session registry daemon"),
    });
  });

  let tempDir: string;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "hub-test-"));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("refuses even after acquiring the lock if legacy becomes healthy", async () => {
    let calls = 0;
    const spawnDaemon = vi.fn();
    const paths: RuntimePaths = {
      directory: tempDir,
      discoveryFile: join(tempDir, "hub.json"),
      monitorDiscoveryFile: join(tempDir, "monitor.json"),
      lockDirectory: join(tempDir, "lock"),
    };
    await expect(
      ensureDaemon({
        paths,
        detectLegacy: async () => {
          calls += 1;
          // First call: no legacy, second call (under lock): legacy found
          return calls >= 2;
        },
        spawnDaemon,
      }),
    ).rejects.toMatchObject({
      code: "LEGACY_DAEMON_RUNNING",
      retryable: false,
    });
    expect(spawnDaemon).not.toHaveBeenCalled();
  });
});
