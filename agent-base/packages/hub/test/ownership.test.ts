import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireDaemonOwnership, type DaemonOwnership, type OwnershipIdentity } from "../src/ownership.js";

const runtimes: string[] = [];
const owners: DaemonOwnership[] = [];

const deadProcess = async (_identity: OwnershipIdentity) => false;

function advancingTime(start = 0) {
  let value = start;
  return {
    now: () => value,
    wait: async (ms: number) => { value += ms; },
  };
}

afterEach(async () => {
  await Promise.allSettled(owners.map((owner) => owner.release()));
  owners.splice(0, owners.length);
  await Promise.all(runtimes.splice(0).map((runtime) => rm(runtime, { recursive: true, force: true })));
});

describe("daemon lifetime ownership", () => {
  it("allows only one concurrent live owner without using wall-clock delays", async () => {
    const discoveryFile = await makeDiscoveryPath();
    owners.push(await acquireDaemonOwnership({ discoveryFile, now: () => 100 }));
    const time = advancingTime(100);

    await expect(acquireDaemonOwnership({
      discoveryFile,
      acquireTimeoutMs: 40,
      staleMs: 1_000,
      pollMs: 5,
      ...time,
    })).rejects.toThrow("startup deadline");
  });

  it("allows a waiting replacement only after the current owner releases", async () => {
    const discoveryFile = await makeDiscoveryPath();
    const first = await acquireDaemonOwnership({ discoveryFile, now: () => 100 });
    owners.push(first);
    let releaseWait!: () => void;
    let observedWait!: () => void;
    const waitEntered = new Promise<void>((resolve) => { observedWait = resolve; });
    const waitGate = new Promise<void>((resolve) => { releaseWait = resolve; });
    let firstWait = true;
    const replacementPromise = acquireDaemonOwnership({
      discoveryFile,
      acquireTimeoutMs: 500,
      staleMs: 1_000,
      now: () => 100,
      wait: async () => {
        if (firstWait) {
          firstWait = false;
          observedWait();
          await waitGate;
        }
      },
    });

    await waitEntered;
    await first.release();
    releaseWait();
    const replacement = await replacementPromise;
    owners.push(replacement);
    expect(replacement.identity.nonce).not.toBe(first.identity.nonce);
  });

  it("never takes a stale timestamp over from a process that is still alive", async () => {
    const discoveryFile = await makeDiscoveryPath();
    const first = await acquireDaemonOwnership({
      discoveryFile,
      pid: 41,
      startedAt: 10,
      now: () => 100,
    });
    owners.push(first);
    const liveness = vi.fn(async (identity: OwnershipIdentity) => {
      expect(identity).toMatchObject(first.identity);
      return true;
    });
    const time = advancingTime(1_000);

    await expect(acquireDaemonOwnership({
      discoveryFile,
      pid: 42,
      startedAt: 20,
      acquireTimeoutMs: 100,
      staleMs: 500,
      pollMs: 25,
      isProcessAlive: liveness,
      ...time,
    })).rejects.toThrow("startup deadline");
    expect(liveness).toHaveBeenCalled();
    expect(await first.refresh()).toBe(true);
  });

  it("fails closed when a stale PID still has the recorded process birth identity", async () => {
    const discoveryFile = await makeDiscoveryPath();
    const birthIdentities = new Map([[41, "boot-a:start-10"], [42, "boot-a:start-20"]]);
    const getProcessBirthIdentity = vi.fn(async (pid: number) => birthIdentities.get(pid));
    const first = await acquireDaemonOwnership({
      discoveryFile,
      pid: 41,
      startedAt: 10,
      now: () => 100,
      getProcessBirthIdentity,
    });
    owners.push(first);
    const time = advancingTime(1_000);

    await expect(acquireDaemonOwnership({
      discoveryFile,
      pid: 42,
      startedAt: 20,
      acquireTimeoutMs: 100,
      staleMs: 500,
      pollMs: 25,
      isProcessAlive: async () => true,
      getProcessBirthIdentity,
      ...time,
    })).rejects.toThrow("startup deadline");

    expect(getProcessBirthIdentity).toHaveBeenCalledWith(41);
    expect(JSON.parse(await readFile(join(first.directory, "owner.json"), "utf8")))
      .toMatchObject({ pid: 41, processBirthIdentity: "boot-a:start-10" });
    expect(await first.refresh()).toBe(true);
  });

  it("recovers a stale owner when its PID was reused by a different process", async () => {
    const discoveryFile = await makeDiscoveryPath();
    const birthIdentities = new Map([[41, "boot-a:start-10"], [42, "boot-a:start-20"]]);
    const getProcessBirthIdentity = async (pid: number) => birthIdentities.get(pid);
    const first = await acquireDaemonOwnership({
      discoveryFile,
      pid: 41,
      startedAt: 10,
      now: () => 100,
      getProcessBirthIdentity,
    });
    owners.push(first);

    birthIdentities.set(41, "boot-a:start-99");
    const replacement = await acquireDaemonOwnership({
      discoveryFile,
      pid: 42,
      startedAt: 20,
      now: () => 1_000,
      staleMs: 500,
      takeoverGraceMs: 0,
      getProcessBirthIdentity,
      isProcessAlive: async () => true,
    });
    owners.push(replacement);

    expect(replacement.identity.processBirthIdentity).toBe("boot-a:start-20");
    expect(await first.refresh()).toBe(false);
    expect(await replacement.refresh()).toBe(true);
  });

  it("recovers only when the complete stale owner identity is no longer live", async () => {
    const discoveryFile = await makeDiscoveryPath();
    const first = await acquireDaemonOwnership({
      discoveryFile,
      pid: 41,
      startedAt: 10,
      now: () => 100,
    });
    owners.push(first);
    const liveness = vi.fn(deadProcess);

    const replacement = await acquireDaemonOwnership({
      discoveryFile,
      pid: 41,
      startedAt: 20,
      now: () => 1_000,
      staleMs: 500,
      takeoverGraceMs: 0,
      isProcessAlive: liveness,
    });
    owners.push(replacement);

    expect(liveness).toHaveBeenCalledWith(expect.objectContaining(first.identity));
    expect(replacement.identity.pid).toBe(first.identity.pid);
    expect(await first.refresh()).toBe(false);
    expect(await replacement.refresh()).toBe(true);
  });

  it("confines old-generation cleanup and keeps secure modes", async () => {
    const discoveryFile = await makeDiscoveryPath();
    const first = await acquireDaemonOwnership({ discoveryFile, pid: 41, now: () => 100 });
    owners.push(first);
    const replacement = await acquireDaemonOwnership({
      discoveryFile,
      pid: 42,
      now: () => 1_000,
      staleMs: 500,
      takeoverGraceMs: 0,
      isProcessAlive: deadProcess,
    });
    owners.push(replacement);

    await first.release();
    expect(await replacement.refresh()).toBe(true);
    const record = JSON.parse(await readFile(join(replacement.directory, "owner.json"), "utf8"));
    expect(record.nonce).toBe(replacement.identity.nonce);
    if (process.platform !== "win32") {
      expect((await stat(replacement.directory)).mode & 0o777).toBe(0o700);
      expect((await stat(join(replacement.directory, "owner.json"))).mode & 0o777).toBe(0o600);
    }
  });
});

async function makeDiscoveryPath(): Promise<string> {
  const runtime = await mkdtemp(join(tmpdir(), "registry-owner-"));
  runtimes.push(runtime);
  return join(runtime, "registry.json");
}
