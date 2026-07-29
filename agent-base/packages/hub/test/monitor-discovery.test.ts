import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MonitorDiscoveryRecord } from "@agent-hub/contracts";
import {
  writeMonitorDiscoveryFile,
  ownsMonitorDiscoveryFile,
  removeMonitorDiscoveryFile,
} from "../src/monitor-discovery.js";

let directory: string;
let discoveryFile: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "monitor-discovery-test-"));
  discoveryFile = join(directory, "monitor.json");
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const record: MonitorDiscoveryRecord = {
  endpoint: "http://127.0.0.1:4321",
  apiVersion: "monitor/v1",
  daemonId: "test-daemon-id",
  startedAt: 1000,
  capability: "a".repeat(64),
};

describe("monitor discovery", () => {
  it("writes and reads a monitor discovery file", async () => {
    await writeMonitorDiscoveryFile(discoveryFile, record);
    const contents = JSON.parse(await readFile(discoveryFile, "utf8"));
    expect(contents.endpoint).toBe(record.endpoint);
    expect(contents.apiVersion).toBe("monitor/v1");
    expect(contents.daemonId).toBe(record.daemonId);
    expect(contents.capability).toBe(record.capability);
  });

  it("does not include root token, PID, or protocol version", async () => {
    await writeMonitorDiscoveryFile(discoveryFile, record);
    const contents = await readFile(discoveryFile, "utf8");
    expect(contents).not.toContain("token");
    expect(contents).not.toContain("pid");
    expect(contents).not.toContain("protocolVersion");
  });

  it("sets 0600 file permissions on non-Windows", async () => {
    if (process.platform === "win32") return;
    await writeMonitorDiscoveryFile(discoveryFile, record);
    const fileStat = await stat(discoveryFile);
    expect(fileStat.mode & 0o777).toBe(0o600);
  });

  it("owns the file after writing", async () => {
    await writeMonitorDiscoveryFile(discoveryFile, record);
    expect(await ownsMonitorDiscoveryFile(discoveryFile, record)).toBe(true);
  });

  it("does not own a file with different daemon ID", async () => {
    await writeMonitorDiscoveryFile(discoveryFile, record);
    expect(await ownsMonitorDiscoveryFile(discoveryFile, { ...record, daemonId: "other" })).toBe(false);
  });

  it("removes a written file safely", async () => {
    await writeMonitorDiscoveryFile(discoveryFile, record);
    await removeMonitorDiscoveryFile(discoveryFile);
    expect(await ownsMonitorDiscoveryFile(discoveryFile, record)).toBe(false);
  });

  it("does not throw when file does not exist", async () => {
    await expect(removeMonitorDiscoveryFile(discoveryFile)).resolves.not.toThrow();
  });
});
