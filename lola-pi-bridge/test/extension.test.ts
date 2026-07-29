import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import lolaSync from "../extensions/lola-sync.js";

type Handler = (event: unknown, ctx: any) => Promise<unknown> | unknown;
type CommandHandler = (args: string, ctx: any) => Promise<void>;

interface FakePi {
  api: ExtensionAPI;
  events: Map<string, Handler>;
  commands: Map<string, CommandHandler>;
  exec: ReturnType<typeof vi.fn>;
  appendEntry: ReturnType<typeof vi.fn>;
}

function fakePi(): FakePi {
  const events = new Map<string, Handler>();
  const commands = new Map<string, CommandHandler>();
  const exec = vi.fn();
  const appendEntry = vi.fn();
  const api = {
    on: vi.fn((name: string, handler: Handler) => events.set(name, handler)),
    registerCommand: vi.fn((name: string, options: { handler: CommandHandler }) => {
      commands.set(name, options.handler);
    }),
    registerEntryRenderer: vi.fn(),
    exec,
    appendEntry,
  } as unknown as ExtensionAPI;
  return { api, events, commands, exec, appendEntry };
}

function fakeContext() {
  return {
    hasUI: true,
    ui: {
      confirm: vi.fn().mockResolvedValue(true),
      notify: vi.fn(),
      setStatus: vi.fn(),
    },
    reload: vi.fn().mockResolvedValue(undefined),
    sessionManager: { getBranch: vi.fn().mockReturnValue([]) },
  };
}

const roots: string[] = [];

/**
 * Creates a registered module with one real skill directory (containing
 * SKILL.md) and returns the path to that individual skill directory.
 * enumeratedSkillPaths() only returns dirs that directly contain SKILL.md,
 * so the fixture must have at least one real skill.
 */
function registeredModule(root: string, name: string): string {
  const moduleRoot = join(root, "modules", name);
  mkdirSync(join(moduleRoot, ".lola"), { recursive: true });
  const skillDir = join(moduleRoot, "skills", "example-skill");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "# example-skill\n");
  writeFileSync(join(moduleRoot, ".lola", "source.yml"), "type: folder\n");
  return skillDir;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("lolaSync extension", () => {
  it("registers all commands and contributes discovered skills", async () => {
    const root = mkdtempSync(join(tmpdir(), "lola-pi-extension-"));
    roots.push(root);
    const skills = registeredModule(root, "shared");
    vi.stubEnv("LOLA_ROOT", root);
    const pi = fakePi();

    lolaSync(pi.api);

    expect([...pi.commands.keys()]).toEqual(["lola-status", "lola-install", "lola-sync"]);
    expect(await pi.events.get("resources_discover")?.({}, fakeContext())).toEqual({
      skillPaths: [skills],
    });
  });

  it("installs a source with exact Lola arguments and reloads resources", async () => {
    const pi = fakePi();
    const ctx = fakeContext();
    pi.exec.mockResolvedValue({ code: 0, stdout: "module added", stderr: "" });
    lolaSync(pi.api);

    await pi.commands.get("lola-install")?.(
      "https://github.com/example/skills.git --name shared --module-content plugins/dev",
      ctx,
    );

    expect(ctx.ui.confirm).toHaveBeenCalledWith(
      "Install Lola module?",
      "Run lola mod add https://github.com/example/skills.git?",
    );
    expect(pi.exec).toHaveBeenCalledWith("lola", [
      "mod", "add", "https://github.com/example/skills.git",
      "--name", "shared",
      "--module-content", "plugins/dev",
    ]);
    expect(pi.appendEntry).toHaveBeenCalledWith("lola-sync-result", expect.objectContaining({
      ok: true,
      operation: "Lola install succeeded: https://github.com/example/skills.git",
    }));
    expect(ctx.reload).toHaveBeenCalledOnce();
  });

  it("updates one module and reloads resources", async () => {
    const pi = fakePi();
    const ctx = fakeContext();
    pi.exec.mockResolvedValue({ code: 0, stdout: "module updated", stderr: "" });
    lolaSync(pi.api);

    await pi.commands.get("lola-sync")?.("shared", ctx);

    expect(pi.exec).toHaveBeenCalledWith("lola", ["mod", "update", "shared"]);
    expect(ctx.reload).toHaveBeenCalledOnce();
  });

  it("reports Lola failure and does not reload", async () => {
    const pi = fakePi();
    const ctx = fakeContext();
    pi.exec.mockResolvedValue({ code: 1, stdout: "", stderr: "source unavailable" });
    lolaSync(pi.api);

    await pi.commands.get("lola-sync")?.("shared", ctx);

    expect(pi.appendEntry).toHaveBeenCalledWith("lola-sync-result", expect.objectContaining({
      ok: false,
      operation: "Lola sync failed: shared",
      output: "Error: source unavailable",
    }));
    expect(ctx.reload).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Lola sync failed; status is visible in the footer.",
      "error",
    );
  });

  it("does not execute when confirmation is declined", async () => {
    const pi = fakePi();
    const ctx = fakeContext();
    ctx.ui.confirm.mockResolvedValue(false);
    lolaSync(pi.api);

    await pi.commands.get("lola-sync")?.("", ctx);

    expect(pi.exec).not.toHaveBeenCalled();
    expect(ctx.reload).not.toHaveBeenCalled();
  });
});
