/**
 * lola-manage — interactive manager for installed Lola modules.
 *
 * Self-contained: all Lola module discovery utilities are inlined so this
 * file works both as a standalone symlinked extension and as part of the
 * lola-pi-bridge package installation.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, Key, type SelectItem, SelectList, Text, matchesKey } from "@earendil-works/pi-tui";

// ---------------------------------------------------------------------------
// Lola module discovery utilities + blocklist (inlined for symlink compat)
// ---------------------------------------------------------------------------

function getLolaRoot(): string {
  return process.env.LOLA_ROOT
    ? resolve(process.env.LOLA_ROOT)
    : join(homedir(), ".lola");
}

function contentDirectory(moduleRoot: string): string {
  const sourceFile = join(moduleRoot, ".lola", "source.yml");
  if (!existsSync(sourceFile)) return moduleRoot;
  const source = readFileSync(sourceFile, "utf8");
  const match = source.match(/^content_dirname:\s*(.+?)\s*$/m);
  if (!match) return moduleRoot;
  const dirname = match[1].replace(/^['"]|['"]$/g, "");
  return dirname === "/" ? moduleRoot : join(moduleRoot, dirname);
}

function skillDirectory(moduleName: string, root: string): string {
  return join(contentDirectory(join(root, "modules", moduleName)), "skills");
}

function installedModules(root: string): string[] {
  const modulesRoot = join(root, "modules");
  if (!existsSync(modulesRoot)) return [];
  return readdirSync(modulesRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(modulesRoot, e.name, ".lola")))
    .map((e) => e.name)
    .sort();
}

/** Recursively finds all directories that directly contain a SKILL.md file. */
function walkForSkillDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  if (existsSync(join(dir, "SKILL.md"))) return [dir];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .flatMap((e) => walkForSkillDirs(join(dir, e.name)));
  } catch {
    return [];
  }
}

function skillPathsForModule(moduleName: string, root: string): string[] {
  return walkForSkillDirs(skillDirectory(moduleName, root));
}

function skillsForModule(moduleName: string, root: string): string[] {
  return skillPathsForModule(moduleName, root)
    .map((dir) => basename(dir))
    .sort();
}

// Blocklist — persisted to $LOLA_ROOT/pi-skill-blocklist.json

interface HiddenSkill {
  module: string;
  skill: string;
}

function blocklistPath(root: string): string {
  return join(root, "pi-skill-blocklist.json");
}

function readBlocklist(root: string): HiddenSkill[] {
  const file = blocklistPath(root);
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, "utf8")) as { hidden?: HiddenSkill[] };
    return Array.isArray(data.hidden) ? data.hidden : [];
  } catch {
    return [];
  }
}

function writeBlocklist(root: string, hidden: HiddenSkill[]): void {
  writeFileSync(blocklistPath(root), JSON.stringify({ hidden }, null, 2), "utf8");
}

/** Maps skill name → module names that provide it. Length > 1 = Skill Conflict. */
function buildConflictMap(root: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const moduleName of installedModules(root)) {
    for (const skillName of skillsForModule(moduleName, root)) {
      const existing = map.get(skillName) ?? [];
      existing.push(moduleName);
      map.set(skillName, existing);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Shared selector helper
// ---------------------------------------------------------------------------

type UiCtx = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];

async function showSelector(
  ctx: UiCtx,
  title: string,
  items: SelectItem[],
): Promise<string | null> {
  return ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    container.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));

    const list = new SelectList(items, Math.min(items.length, 12), {
      selectedPrefix: (t) => theme.fg("accent", t),
      selectedText: (t) => theme.fg("accent", t),
      description: (t) => theme.fg("muted", t),
      scrollInfo: (t) => theme.fg("dim", t),
      noMatch: (t) => theme.fg("warning", t),
    });
    list.onSelect = (item) => done(item.value);
    list.onCancel = () => done(null);
    container.addChild(list);

    container.addChild(
      new Text(theme.fg("dim", "↑↓ navigate  enter select  esc cancel"), 1, 0),
    );
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

    return {
      render: (w: number) => container.render(w),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        list.handleInput(data);
        tui.requestRender();
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Action: Open Skill (stage 3)
// ---------------------------------------------------------------------------

async function launchEditor(ctx: UiCtx, filePath: string): Promise<void> {
  const editorCmd = process.env.VISUAL ?? process.env.EDITOR ?? "nvim";
  const [editor, ...editorArgs] = editorCmd.split(" ");

  await ctx.ui.custom<void>((tui, _theme, _kb, done) => {
    void (async () => {
      tui.stop();
      try {
        await new Promise<void>((resolve) => {
          const child = spawn(editor!, [...editorArgs, filePath], { stdio: "inherit" });
          child.on("error", () => resolve());
          child.on("close", () => resolve());
        });
      } finally {
        tui.start();
        tui.requestRender(true);
        done(undefined);
      }
    })();

    const editorName = editor ?? "editor";
    return {
      render: () => [`  Opening ${basename(filePath)} in ${editorName}…`],
      invalidate: () => {},
      handleInput: () => {},
    };
  });
}

async function handleOpenSkill(
  ctx: UiCtx,
  moduleName: string,
  conflicts: Map<string, string[]>,
  root: string,
): Promise<void> {
  const skillDirs = skillPathsForModule(moduleName, root);

  if (skillDirs.length === 0) {
    ctx.ui.notify(`No skills found in module "${moduleName}".`, "warning");
    return;
  }

  const items: SelectItem[] = skillDirs
    .slice()
    .sort((a, b) => basename(a).localeCompare(basename(b)))
    .map((dir) => {
      const name = basename(dir);
      const otherModules = (conflicts.get(name) ?? []).filter((m) => m !== moduleName);
      return {
        value: join(dir, "SKILL.md"),
        label: otherModules.length > 0 ? `${name} ⚠` : name,
        description: otherModules.length > 0
          ? `also in: ${otherModules.join(", ")}`
          : undefined,
      };
    });

  const skillFile = await showSelector(ctx, `${moduleName} — Skills`, items);
  if (skillFile === null) return;

  await launchEditor(ctx, skillFile);
}

// ---------------------------------------------------------------------------
// Action: Hide Skill
// ---------------------------------------------------------------------------

async function handleHideSkill(
  ctx: UiCtx,
  moduleName: string,
  conflicts: Map<string, string[]>,
  root: string,
  hidden: HiddenSkill[],
): Promise<void> {
  const hiddenInModule = new Set(
    hidden.filter((h) => h.module === moduleName).map((h) => h.skill),
  );
  const skillDirs = skillPathsForModule(moduleName, root)
    .filter((dir) => !hiddenInModule.has(basename(dir)));

  if (skillDirs.length === 0) {
    ctx.ui.notify("All skills in this module are already hidden.", "info");
    return;
  }

  const items: SelectItem[] = skillDirs
    .slice()
    .sort((a, b) => basename(a).localeCompare(basename(b)))
    .map((dir) => {
      const name = basename(dir);
      const otherModules = (conflicts.get(name) ?? []).filter((m) => m !== moduleName);
      return {
        value: name,
        label: otherModules.length > 0 ? `${name} ⚠` : name,
        description: otherModules.length > 0
          ? `also in: ${otherModules.join(", ")} — hiding removes it only from this module`
          : undefined,
      };
    });

  const skillName = await showSelector(ctx, `${moduleName} — Hide Skill`, items);
  if (skillName === null) return;

  writeBlocklist(root, [...hidden, { module: moduleName, skill: skillName }]);
  ctx.ui.notify(`"${skillName}" hidden. Changes apply when you close the manager.`, "info");
}

// ---------------------------------------------------------------------------
// Action: Unhide Skill
// ---------------------------------------------------------------------------

async function handleUnhideSkill(
  ctx: UiCtx,
  moduleName: string,
  root: string,
  hidden: HiddenSkill[],
): Promise<void> {
  const hiddenInModule = hidden.filter((h) => h.module === moduleName);

  const items: SelectItem[] = hiddenInModule.map(({ skill }) => ({
    value: skill,
    label: skill,
    description: "currently hidden from Pi",
  }));

  const skillName = await showSelector(ctx, `${moduleName} — Unhide Skill`, items);
  if (skillName === null) return;

  writeBlocklist(
    root,
    hidden.filter((h) => !(h.module === moduleName && h.skill === skillName)),
  );
  ctx.ui.notify(`"${skillName}" unhidden. Changes apply when you close the manager.`, "info");
}

// ---------------------------------------------------------------------------
// Action: Update Module
// ---------------------------------------------------------------------------

async function handleUpdate(
  pi: ExtensionAPI,
  ctx: UiCtx,
  moduleName: string,
): Promise<void> {
  const ok = await ctx.ui.confirm(
    "Update Lola Module",
    `Run lola mod update ${moduleName}?`,
  );
  if (!ok) return;

  ctx.ui.setStatus("lola-manage", `updating ${moduleName}…`);
  try {
    const result = await pi.exec("lola", ["mod", "update", moduleName]);
    const summary = (result.stdout || result.stderr || "").trim().slice(0, 120);
    ctx.ui.notify(
      summary ? `${moduleName} updated: ${summary}` : `${moduleName} updated`,
      "info",
    );
    await ctx.reload();
  } catch (error) {
    ctx.ui.setStatus("lola-manage", undefined);
    ctx.ui.notify(
      `Update failed: ${error instanceof Error ? error.message : String(error)}`,
      "error",
    );
  }
}

// ---------------------------------------------------------------------------
// Action: Remove Module
// ---------------------------------------------------------------------------

async function handleRemove(
  pi: ExtensionAPI,
  ctx: UiCtx,
  moduleName: string,
): Promise<void> {
  const ok = await ctx.ui.confirm(
    "Remove Lola Module",
    `Remove "${moduleName}"? This cannot be undone.`,
  );
  if (!ok) return;

  ctx.ui.setStatus("lola-manage", `removing ${moduleName}…`);
  try {
    await pi.exec("lola", ["mod", "rm", moduleName, "--force"]);
    ctx.ui.notify(`"${moduleName}" removed.`, "info");
    await ctx.reload();
  } catch (error) {
    ctx.ui.setStatus("lola-manage", undefined);
    ctx.ui.notify(
      `Removal failed: ${error instanceof Error ? error.message : String(error)}`,
      "error",
    );
  }
}

// ---------------------------------------------------------------------------
// Action: View Details
// ---------------------------------------------------------------------------

async function handleDetails(
  pi: ExtensionAPI,
  ctx: UiCtx,
  moduleName: string,
): Promise<void> {
  let output: string;
  try {
    const result = await pi.exec("lola", ["mod", "info", moduleName]);
    output = (result.stdout || result.stderr || "No output.").trim();
  } catch (error) {
    ctx.ui.notify(
      `Failed to get module info: ${error instanceof Error ? error.message : String(error)}`,
      "error",
    );
    return;
  }

  await ctx.ui.custom<void>(
    (_tui, theme, _kb, done) => {
      const container = new Container();
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
      container.addChild(new Text(theme.fg("accent", theme.bold(moduleName)), 1, 0));
      container.addChild(new Text(output, 1, 0));
      container.addChild(new Text(theme.fg("dim", "esc  close"), 1, 1));
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

      return {
        render: (w: number) => container.render(w),
        invalidate: () => container.invalidate(),
        handleInput: (data: string) => {
          if (matchesKey(data, Key.escape)) done(undefined);
        },
      };
    },
    { overlay: true, overlayOptions: { width: "70%", maxHeight: "80%" } },
  );
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function lolaManage(pi: ExtensionAPI): void {
  pi.registerCommand("lola-manage", {
    description: "Browse, open, update, or remove installed Lola modules",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/lola-manage requires interactive (TUI) mode.", "error");
        return;
      }

      const root = getLolaRoot();
      const modules = installedModules(root);

      if (modules.length === 0) {
        ctx.ui.notify(
          "No Lola modules installed. Use /lola-install to add one.",
          "warning",
        );
        return;
      }

      const conflicts = buildConflictMap(root);

      // Stage 1 — module selection
      const buildModuleItems = () => {
        const h = readBlocklist(root);
        return modules.map((name) => {
          const skills = skillsForModule(name, root);
          const conflicting = skills.filter((s) => (conflicts.get(s)?.length ?? 0) > 1);
          const hiddenCount = h.filter((e) => e.module === name).length;
          const label = conflicting.length > 0
            ? `${name} ⚠ ${conflicting.length} conflict${conflicting.length > 1 ? "s" : ""}`
            : name;
          const descParts: string[] = [];
          if (conflicting.length > 0) descParts.push(`conflicts: ${conflicting.join(", ")}`);
          else descParts.push(`${skills.length} skill${skills.length !== 1 ? "s" : ""}`);
          if (hiddenCount > 0) descParts.push(`${hiddenCount} hidden`);
          return { value: name, label, description: descParts.join("  •  ") };
        });
      };

      const selectedModule = await showSelector(ctx, "Lola Modules", buildModuleItems());
      if (selectedModule === null) return;

      // Stage 2 — action loop: stays open until user escapes or a reload-
      // triggering action (update/remove) exits the handler.
      const skills = skillsForModule(selectedModule, root);
      const conflicting = skills.filter((s) => (conflicts.get(s)?.length ?? 0) > 1);
      const conflictNote = conflicting.length > 0
        ? ` — ⚠ ${conflicting.length} conflict${conflicting.length > 1 ? "s" : ""}`
        : "";

      let pendingReload = false;

      while (true) {
        // Re-read blocklist each iteration so hide/unhide counts stay fresh.
        const hidden = readBlocklist(root);
        const hiddenInModule = hidden.filter((h) => h.module === selectedModule);

        const actionItems: SelectItem[] = [
          {
            value: "open",
            label: "Open Skill",
            description: `Browse ${skills.length} skill${skills.length !== 1 ? "s" : ""}${conflictNote} and open in editor`,
          },
          {
            value: "hide",
            label: "Hide Skill",
            description: "Remove a skill from Pi without deleting it (survives lola mod update)",
          },
          ...(hiddenInModule.length > 0
            ? [{
                value: "unhide",
                label: "Unhide Skill",
                description: `${hiddenInModule.length} skill${hiddenInModule.length !== 1 ? "s" : ""} currently hidden`,
              }]
            : []),
          {
            value: "update",
            label: "Update Module",
            description: "Pull latest changes with lola mod update",
          },
          {
            value: "remove",
            label: "Remove Module",
            description: "Delete with lola mod rm (irreversible)",
          },
          {
            value: "details",
            label: "View Details",
            description: "Show lola mod info output",
          },
        ];

        const selectedAction = await showSelector(ctx, selectedModule, actionItems);
        if (selectedAction === null) break; // user escaped — exit loop

        switch (selectedAction) {
          case "open":
            await handleOpenSkill(ctx, selectedModule, conflicts, root);
            break;
          case "hide":
            await handleHideSkill(ctx, selectedModule, conflicts, root, hidden);
            pendingReload = true;
            break;
          case "unhide":
            await handleUnhideSkill(ctx, selectedModule, root, hidden);
            pendingReload = true;
            break;
          case "update":
            await handleUpdate(pi, ctx, selectedModule); // calls ctx.reload() — terminal
            return;
          case "remove":
            await handleRemove(pi, ctx, selectedModule); // calls ctx.reload() — terminal
            return;
          case "details":
            await handleDetails(pi, ctx, selectedModule);
            break;
        }
      }

      // Apply any pending visibility changes now that the manager is closed.
      if (pendingReload) await ctx.reload();
    },
  });
}
