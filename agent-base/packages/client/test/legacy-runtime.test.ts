import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectLegacyDaemon } from "../src/legacy-runtime.js";

let directory: string;
let discoveryFile: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "legacy-runtime-test-"));
  discoveryFile = join(directory, "registry.json");
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("detectLegacyDaemon", () => {
  it("recognizes only an authenticated healthy legacy daemon", async () => {
    await writeFile(
      discoveryFile,
      JSON.stringify({ port: 4321, pid: 7, token: "secret", protocolVersion: 2, startedAt: 10 }),
    );
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
      return new Response(
        JSON.stringify({ protocolVersion: 2, pid: 7, startedAt: 10 }),
        { status: 200 },
      );
    });
    await expect(detectLegacyDaemon({ directory, discoveryFile }, fetchImpl)).resolves.toBe(true);
  });

  it("does not delete malformed or unhealthy legacy discovery", async () => {
    await writeFile(discoveryFile, "not-json");
    await expect(detectLegacyDaemon({ directory, discoveryFile }, vi.fn())).resolves.toBe(false);
    await expect(readFile(discoveryFile, "utf8")).resolves.toBe("not-json");
  });

  it("returns false when discovery file does not exist", async () => {
    await expect(detectLegacyDaemon({ directory, discoveryFile }, vi.fn())).resolves.toBe(false);
  });

  it("returns false when health check fails", async () => {
    await writeFile(
      discoveryFile,
      JSON.stringify({ port: 4321, pid: 7, token: "secret", protocolVersion: 2, startedAt: 10 }),
    );
    const fetchImpl = vi.fn(async () => new Response("", { status: 500 }));
    await expect(detectLegacyDaemon({ directory, discoveryFile }, fetchImpl)).resolves.toBe(false);
  });

  it("returns false when health response does not match discovery", async () => {
    await writeFile(
      discoveryFile,
      JSON.stringify({ port: 4321, pid: 7, token: "secret", protocolVersion: 2, startedAt: 10 }),
    );
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ protocolVersion: 2, pid: 999, startedAt: 10 }), { status: 200 }),
    );
    await expect(detectLegacyDaemon({ directory, discoveryFile }, fetchImpl)).resolves.toBe(false);
  });
});
