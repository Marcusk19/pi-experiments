/**
 * lola-sync — exposes Lola-managed Agent Skills to Pi and provides
 * install/update commands.
 *
 * Self-contained: all Lola module discovery utilities are inlined so this
 * file works both as a standalone symlinked extension and as part of the
 * lola-pi-bridge package installation.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

// ---------------------------------------------------------------------------
// Command-line parsing utilities (inlined for symlink compatibility)
// ---------------------------------------------------------------------------

interface InstallArguments {
  source: string;
  moduleName?: string;
  moduleContent?: string;
}

const INSTALL_USAGE =
  "Usage: /lola-install <source> [--name <module>] [--module-content <path>]";

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | undefined;
  let escaped = false;
  let started = false;
  for (const character of input) {
    if (escaped) { token += character; escaped = false; started = true; continue; }
    if (character === "\\" && quote !== "'") { escaped = true; started = true; continue; }
    if (quote) {
      if (character === quote) quote = undefined;
      else token += character;
      started = true;
      continue;
    }
    if (character === "'" || character === '"') { quote = character; started = true; continue; }
    if (/\s/.test(character)) {
      if (started) { tokens.push(token); token = ""; started = false; }
      continue;
    }
    token += character;
    started = true;
  }
  if (quote) throw new Error("Unterminated quoted argument");
  if (escaped) token += "\\";
  if (started) tokens.push(token);
  return tokens;
}

function optionValue(tokens: string[], index: number, option: string): string {
  const value = tokens[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

function parseInstallArgs(input: string): InstallArguments {
  const tokens = tokenize(input);
  let source: string | undefined;
  let moduleName: string | undefined;
  let moduleContent: string | undefined;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--name") { moduleName = optionValue(tokens, index, token); index += 1; }
    else if (token.startsWith("--name=")) { moduleName = token.slice("--name=".length); if (!moduleName) throw new Error("--name requires a value"); }
    else if (token === "--module-content") { moduleContent = optionValue(tokens, index, token); index += 1; }
    else if (token.startsWith("--module-content=")) { moduleContent = token.slice("--module-content=".length); if (!moduleContent) throw new Error("--module-content requires a value"); }
    else if (token.startsWith("--")) { throw new Error(`Unsupported option: ${token}`); }
    else if (source === undefined) { source = token; }
    else { throw new Error(`Unexpected argument: ${token}`); }
  }
  if (!source) throw new Error(INSTALL_USAGE);
  return { source, moduleName, moduleContent };
}

function parseSyncArgs(input: string): string | undefined {
  const tokens = tokenize(input);
  if (tokens.length === 0) return undefined;
  if (tokens.length > 1) throw new Error("Expected one Lola module name");
  const moduleName = tokens[0];
  if (!/^[a-z0-9][a-z0-9-]*$/.test(moduleName)) throw new Error(`Invalid Lola module name: ${moduleName}`);
  return moduleName;
}

// ---------------------------------------------------------------------------
// Lola module discovery utilities (inlined for symlink compatibility)
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

// ---------------------------------------------------------------------------
// Skill blocklist (hidden skills)
// ---------------------------------------------------------------------------

export interface HiddenSkill {
  module: string;
  skill: string;
}

interface Blocklist {
  hidden: HiddenSkill[];
}

export function blocklistPath(root: string): string {
  return join(root, "pi-skill-blocklist.json");
}

export function readBlocklist(root: string): HiddenSkill[] {
  const file = blocklistPath(root);
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, "utf8")) as Partial<Blocklist>;
    return Array.isArray(data.hidden) ? data.hidden : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Skill path enumeration with blocklist applied
// ---------------------------------------------------------------------------

function enumeratedSkillPaths(root: string): string[] {
  const blocked = readBlocklist(root);
  const blockedSet = new Set(
    blocked.map(({ module, skill }) => `${module}:${skill}`),
  );

  return installedModules(root).flatMap((moduleName) =>
    walkForSkillDirs(skillDirectory(moduleName, root)).filter(
      (dir) => !blockedSet.has(`${moduleName}:${basename(dir)}`),
    ),
  );
}

// ---------------------------------------------------------------------------
// Extension helpers
// ---------------------------------------------------------------------------

interface StoredResult {
  ok?: boolean;
  operation?: string;
  output?: string;
}

function outputSummary(output: string): string {
  const trimmed = output.trim();
  if (trimmed.length <= 3000) return trimmed;
  return `${trimmed.slice(0, 3000)}\n[…output truncated…]`;
}

async function runLola(
  pi: ExtensionAPI,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  const result = await pi.exec("lola", args);
  if (result.code !== 0) {
    throw new Error(
      result.stderr.trim() || result.stdout.trim() || `lola exited with ${result.code}`,
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function lolaSync(pi: ExtensionAPI): void {
  pi.registerEntryRenderer("lola-sync-result", (entry, _options, theme) => {
    const data = entry.data as StoredResult;
    const icon = data.ok ? theme.fg("success", "✓") : theme.fg("error", "✗");
    const text = `${icon} ${data.operation ?? "Lola operation"}`
      + (data.output ? `\n${theme.fg("dim", data.output)}` : "");
    return new Text(text, 0, 0);
  });

  pi.on("session_start", (_event, ctx) => {
    const latest = [...ctx.sessionManager.getBranch()]
      .reverse()
      .find((entry) => entry.type === "custom" && entry.customType === "lola-sync-result");
    if (!latest || latest.type !== "custom") return;
    const data = latest.data as StoredResult;
    ctx.ui.setStatus(
      "lola-sync",
      `${data.ok ? "✓" : "✗"} ${data.operation ?? "Lola operation"}`,
    );
  });

  pi.on("resources_discover", async () => {
    const paths = enumeratedSkillPaths(getLolaRoot());
    return paths.length > 0 ? { skillPaths: paths } : undefined;
  });

  pi.registerCommand("lola-status", {
    description: "Show Lola modules currently exposed as Pi skills",
    handler: async (_args, ctx) => {
      const root = getLolaRoot();
      const modules = installedModules(root);
      const message = modules.length === 0
        ? `No Lola modules found under ${root}/modules`
        : modules.map((name) => `${name}: ${skillDirectory(name, root)}`).join("\n");
      ctx.ui.notify(message, modules.length > 0 ? "info" : "warning");
    },
  });

  pi.registerCommand("lola-install", {
    description: "Install skills from any Lola source and expose them to Pi",
    handler: async (args, ctx) => {
      let parsed;
      try {
        parsed = parseInstallArgs(args);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        return;
      }

      const { source, moduleContent, moduleName } = parsed;
      if (ctx.hasUI && !(await ctx.ui.confirm(
        "Install Lola module?",
        `Run lola mod add ${source}?`,
      ))) return;

      ctx.ui.setStatus("lola-sync", "installing Lola module…");
      try {
        const command = ["mod", "add", source];
        if (moduleName) command.push("--name", moduleName);
        if (moduleContent) command.push("--module-content", moduleContent);
        const result = await runLola(pi, command);
        const output = outputSummary(result.stdout || result.stderr);
        pi.appendEntry("lola-sync-result", {
          ok: true,
          operation: `Lola install succeeded: ${source}`,
          output: output || "No output from Lola.",
        });
        ctx.ui.setStatus("lola-sync", `✓ Lola install succeeded: ${source}`);
        ctx.ui.notify("Lola install succeeded; status is visible in the footer.", "info");
        await ctx.reload();
        return;
      } catch (error) {
        const output = outputSummary(String(error));
        pi.appendEntry("lola-sync-result", {
          ok: false,
          operation: `Lola install failed: ${source}`,
          output,
        });
        ctx.ui.setStatus("lola-sync", `✗ Lola install failed: ${source}`);
        ctx.ui.notify("Lola install failed; status is visible in the footer.", "error");
      }
    },
  });

  pi.registerCommand("lola-sync", {
    description: "Update one Lola module, or all Lola modules, and reload Pi skills",
    handler: async (args, ctx) => {
      let moduleName: string | undefined;
      try {
        moduleName = parseSyncArgs(args);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        return;
      }

      const target = moduleName ?? "all modules";
      if (ctx.hasUI && !(await ctx.ui.confirm(
        "Update Lola modules?",
        `Run lola mod update ${target}?`,
      ))) return;

      ctx.ui.setStatus("lola-sync", `updating ${target}…`);
      try {
        const result = await runLola(pi, [
          "mod",
          "update",
          ...(moduleName ? [moduleName] : []),
        ]);
        const output = outputSummary(result.stdout || result.stderr);
        pi.appendEntry("lola-sync-result", {
          ok: true,
          operation: `Lola sync succeeded: ${target}`,
          output: output || "No output from Lola.",
        });
        ctx.ui.setStatus("lola-sync", `✓ Lola sync succeeded: ${target}`);
        ctx.ui.notify("Lola sync succeeded; status is visible in the footer.", "info");
        await ctx.reload();
        return;
      } catch (error) {
        const output = outputSummary(String(error));
        pi.appendEntry("lola-sync-result", {
          ok: false,
          operation: `Lola sync failed: ${target}`,
          output,
        });
        ctx.ui.setStatus("lola-sync", `✗ Lola sync failed: ${target}`);
        ctx.ui.notify("Lola sync failed; status is visible in the footer.", "error");
      }
    },
  });
}
