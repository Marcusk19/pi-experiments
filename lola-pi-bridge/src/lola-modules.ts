import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

export function getLolaRoot(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  return env.LOLA_ROOT ? resolve(env.LOLA_ROOT) : join(home, ".lola");
}

export function modulePath(moduleName: string, root: string = getLolaRoot()): string {
  return join(root, "modules", moduleName);
}

export function contentDirectory(moduleRoot: string): string {
  const sourceFile = join(moduleRoot, ".lola", "source.yml");
  if (!existsSync(sourceFile)) return moduleRoot;

  const source = readFileSync(sourceFile, "utf8");
  const match = source.match(/^content_dirname:\s*(.+?)\s*$/m);
  if (!match) return moduleRoot;

  const dirname = match[1].replace(/^['"]|['"]$/g, "");
  return dirname === "/" ? moduleRoot : join(moduleRoot, dirname);
}

export function skillDirectory(moduleName: string, root: string = getLolaRoot()): string {
  return join(contentDirectory(modulePath(moduleName, root)), "skills");
}

export function installedModules(root: string = getLolaRoot()): string[] {
  const modulesRoot = join(root, "modules");
  if (!existsSync(modulesRoot)) return [];

  return readdirSync(modulesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(modulesRoot, entry.name, ".lola")))
    .map((entry) => entry.name)
    .sort();
}

export function skillDirectories(root: string = getLolaRoot()): string[] {
  return installedModules(root)
    .map((moduleName) => skillDirectory(moduleName, root))
    .filter((path) => existsSync(path));
}

/** Recursively finds all directories directly containing a SKILL.md file. */
function walkForSkillDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  if (existsSync(join(dir, "SKILL.md"))) return [dir];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => walkForSkillDirs(join(dir, entry.name)));
  } catch {
    return [];
  }
}

/**
 * Returns individual skill directory paths (each directly containing SKILL.md)
 * across all installed modules. Use this instead of `skillDirectories()` when
 * contributing paths to Pi's resources_discover event, to avoid README.md and
 * other non-skill files in category subdirectories being treated as skills.
 */
export function enumeratedSkillPaths(root: string = getLolaRoot()): string[] {
  return installedModules(root).flatMap((name) =>
    walkForSkillDirs(skillDirectory(name, root)),
  );
}

/**
 * Returns the individual skill directory paths (each directly containing
 * SKILL.md) for a single installed module.
 */
export function skillPathsForModule(
  moduleName: string,
  root: string = getLolaRoot(),
): string[] {
  return walkForSkillDirs(skillDirectory(moduleName, root));
}

/**
 * Returns the skill names (directory basenames) for a single installed module,
 * sorted alphabetically.
 */
export function skillsForModule(
  moduleName: string,
  root: string = getLolaRoot(),
): string[] {
  return skillPathsForModule(moduleName, root)
    .map((dir) => basename(dir))
    .sort();
}

/**
 * Returns a map of skill name → module names that provide it.
 * Entries with more than one module name indicate a Skill Conflict.
 */
export function conflictMap(
  root: string = getLolaRoot(),
): Map<string, string[]> {
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
