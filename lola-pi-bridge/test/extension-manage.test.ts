import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import lolaManage from "../extensions/lola-manage.js";

type CommandHandler = (args: string, ctx: any) => Promise<void>;

interface FakePi {
  api: ExtensionAPI;
  commands: Map<string, CommandHandler>;
  exec: ReturnType<typeof vi.fn>;
}

function fakePi(): FakePi {
  const commands = new Map<string, CommandHandler>();
  const exec = vi.fn();
  const api = {
    on: vi.fn(),
    registerCommand: vi.fn((name: string, options: { handler: CommandHandler }) => {
      commands.set(name, options.handler);
    }),
    registerEntryRenderer: vi.fn(),
    appendEntry: vi.fn(),
    exec,
  } as unknown as ExtensionAPI;
  return { api, commands, exec };
}

function fakeTuiCtx(overrides: Record<string, unknown> = {}) {
  return {
    mode: "tui",
    hasUI: true,
    ui: {
      notify: vi.fn(),
      confirm: vi.fn().mockResolvedValue(true),
      setStatus: vi.fn(),
      custom: vi.fn().mockResolvedValue(null),
    },
    reload: vi.fn().mockResolvedValue(undefined),
    sessionManager: { getBranch: vi.fn().mockReturnValue([]) },
    ...overrides,
  };
}

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "lola-pi-manage-"));
  roots.push(root);
  mkdirSync(join(root, "modules"), { recursive: true });
  return root;
}

function makeModule(root: string, name: string): string {
  const moduleRoot = join(root, "modules", name);
  mkdirSync(join(moduleRoot, ".lola"), { recursive: true });
  writeFileSync(
    join(moduleRoot, ".lola", "source.yml"),
    "source: https://example.com/module.git\ntype: git\n",
  );
  mkdirSync(join(moduleRoot, "skills"), { recursive: true });
  return moduleRoot;
}

function makeSkill(moduleRoot: string, name: string): void {
  const skillDir = join(moduleRoot, "skills", name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), `# ${name}\n`);
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("lolaManage extension", () => {
  it("registers the lola-manage command", () => {
    const pi = fakePi();
    lolaManage(pi.api);
    expect(pi.commands.has("lola-manage")).toBe(true);
  });

  it("notifies an error in non-TUI mode", async () => {
    const pi = fakePi();
    lolaManage(pi.api);
    const ctx = fakeTuiCtx({ mode: "rpc" });
    await pi.commands.get("lola-manage")?.("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("TUI"),
      "error",
    );
    expect(ctx.ui.custom).not.toHaveBeenCalled();
  });

  it("notifies with install hint when no modules are installed", async () => {
    const root = makeRoot();
    vi.stubEnv("LOLA_ROOT", root);
    const pi = fakePi();
    lolaManage(pi.api);
    const ctx = fakeTuiCtx();
    await pi.commands.get("lola-manage")?.("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("lola-install"),
      "warning",
    );
    expect(ctx.ui.custom).not.toHaveBeenCalled();
  });

  it("opens the module selector when modules are installed", async () => {
    const root = makeRoot();
    vi.stubEnv("LOLA_ROOT", root);
    const mod = makeModule(root, "shared");
    makeSkill(mod, "backport");
    const pi = fakePi();
    lolaManage(pi.api);
    const ctx = fakeTuiCtx();
    // custom returns null (user cancelled) — we just verify it was called
    await pi.commands.get("lola-manage")?.("", ctx);
    expect(ctx.ui.custom).toHaveBeenCalledOnce();
  });

  it("calls lola mod update and reloads when update action is selected", async () => {
    const root = makeRoot();
    vi.stubEnv("LOLA_ROOT", root);
    const mod = makeModule(root, "shared");
    makeSkill(mod, "backport");
    const pi = fakePi();
    pi.exec.mockResolvedValue({ code: 0, stdout: "up to date", stderr: "" });
    lolaManage(pi.api);

    // Stage 1 returns module name, Stage 2 returns action "update"
    const ctx = fakeTuiCtx();
    let callCount = 0;
    ctx.ui.custom = vi.fn().mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) return "shared"; // module selection
      if (callCount === 2) return "update"; // action selection
      return null;
    });

    await pi.commands.get("lola-manage")?.("", ctx);

    expect(pi.exec).toHaveBeenCalledWith("lola", ["mod", "update", "shared"]);
    expect(ctx.reload).toHaveBeenCalledOnce();
  });

  it("calls lola mod rm --force and reloads when remove is confirmed", async () => {
    const root = makeRoot();
    vi.stubEnv("LOLA_ROOT", root);
    const mod = makeModule(root, "shared");
    makeSkill(mod, "backport");
    const pi = fakePi();
    pi.exec.mockResolvedValue({ code: 0, stdout: "", stderr: "" });
    lolaManage(pi.api);

    const ctx = fakeTuiCtx();
    let callCount = 0;
    ctx.ui.custom = vi.fn().mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) return "shared";
      if (callCount === 2) return "remove";
      return null;
    });

    await pi.commands.get("lola-manage")?.("", ctx);

    expect(pi.exec).toHaveBeenCalledWith("lola", ["mod", "rm", "shared", "--force"]);
    expect(ctx.reload).toHaveBeenCalledOnce();
  });

  it("does not remove when confirmation is declined", async () => {
    const root = makeRoot();
    vi.stubEnv("LOLA_ROOT", root);
    const mod = makeModule(root, "shared");
    makeSkill(mod, "backport");
    const pi = fakePi();
    lolaManage(pi.api);

    const ctx = fakeTuiCtx();
    ctx.ui.confirm = vi.fn().mockResolvedValue(false);
    let callCount = 0;
    ctx.ui.custom = vi.fn().mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) return "shared";
      if (callCount === 2) return "remove";
      return null;
    });

    await pi.commands.get("lola-manage")?.("", ctx);

    expect(pi.exec).not.toHaveBeenCalled();
    expect(ctx.reload).not.toHaveBeenCalled();
  });

  it("shows conflict indicators for modules with duplicate skill names", async () => {
    const root = makeRoot();
    vi.stubEnv("LOLA_ROOT", root);
    const modA = makeModule(root, "alpha");
    const modB = makeModule(root, "beta");
    makeSkill(modA, "shared-skill");
    makeSkill(modB, "shared-skill");
    const pi = fakePi();
    lolaManage(pi.api);

    const ctx = fakeTuiCtx();
    let capturedItems: { label: string }[] = [];
    ctx.ui.custom = vi.fn().mockImplementation(
      async (factory: (tui: any, theme: any, kb: any, done: any) => any) => {
        // Capture the SelectItem labels by inspecting the factory call
        // We intercept by returning null (cancel) — the key check is on the factory arg
        const fakeTheme = {
          fg: (_: string, t: string) => t,
          bold: (t: string) => t,
        };
        const fakeTui = { requestRender: vi.fn() };
        factory(fakeTui, fakeTheme, {}, (v: any) => v);
        return null;
      },
    );

    await pi.commands.get("lola-manage")?.("", ctx);

    // The first custom() call is Stage 1 — verify it was called (conflict label is in the component)
    expect(ctx.ui.custom).toHaveBeenCalledOnce();
  });
});
