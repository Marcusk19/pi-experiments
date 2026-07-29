import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveLegacyRuntimePaths, resolveRuntimePaths } from "../src/paths.js";

const original = process.env.XDG_RUNTIME_DIR;
let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "paths-test-"));
});

afterEach(async () => {
  if (original === undefined) delete process.env.XDG_RUNTIME_DIR;
  else process.env.XDG_RUNTIME_DIR = original;
  vi.restoreAllMocks();
  await rm(tempDir, { recursive: true, force: true });
});

describe("hub runtime paths", () => {
  it("uses renamed XDG paths without changing legacy paths", async () => {
    process.env.XDG_RUNTIME_DIR = tempDir;
    const paths = await resolveRuntimePaths();
    expect(paths).toMatchObject({
      directory: join(tempDir, "agent-activity-hub"),
      discoveryFile: join(tempDir, "agent-activity-hub", "hub.json"),
      monitorDiscoveryFile: join(tempDir, "agent-activity-hub", "monitor.json"),
      lockDirectory: join(tempDir, "agent-activity-hub", "lock"),
    });
    expect(resolveLegacyRuntimePaths()).toEqual({
      directory: join(tempDir, "agent-session-registry"),
      discoveryFile: join(tempDir, "agent-session-registry", "registry.json"),
    });
  });
});
