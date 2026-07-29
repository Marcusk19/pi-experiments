import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  conflictMap,
  contentDirectory,
  enumeratedSkillPaths,
  getLolaRoot,
  installedModules,
  skillDirectories,
  skillPathsForModule,
  skillsForModule,
} from "../src/lola-modules.js";

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "lola-pi-bridge-"));
  roots.push(root);
  mkdirSync(join(root, "modules"), { recursive: true });
  return root;
}

function makeModule(
  root: string,
  name: string,
  contentDirname?: string,
  withSkills = true,
): string {
  const moduleRoot = join(root, "modules", name);
  mkdirSync(join(moduleRoot, ".lola"), { recursive: true });
  const source = contentDirname === undefined
    ? "source: https://example.com/module.git\ntype: git\n"
    : `content_dirname: ${contentDirname}\nsource: https://example.com/module.git\ntype: git\n`;
  writeFileSync(join(moduleRoot, ".lola", "source.yml"), source);
  if (withSkills) {
    const contentRoot = contentDirname && contentDirname !== "/"
      ? join(moduleRoot, contentDirname)
      : moduleRoot;
    mkdirSync(join(contentRoot, "skills"), { recursive: true });
  }
  return moduleRoot;
}

/** Add a skill directory (with SKILL.md) under a module's skills directory. */
function makeSkill(moduleRoot: string, ...pathParts: string[]): string {
  const skillDir = join(moduleRoot, "skills", ...pathParts);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), `# ${pathParts.at(-1)}\n`);
  return skillDir;
}

/** Add a README.md (not a skill) directly in a skills subdirectory. */
function makeReadme(moduleRoot: string, ...pathParts: string[]): void {
  const dir = join(moduleRoot, "skills", ...pathParts);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "README.md"), "# Category README\n");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("getLolaRoot", () => {
  it("prefers LOLA_ROOT and resolves relative values", () => {
    expect(getLolaRoot({ LOLA_ROOT: "./custom-lola" }, "/home/tester"))
      .toBe(join(process.cwd(), "custom-lola"));
  });

  it("defaults to the user's .lola directory", () => {
    expect(getLolaRoot({}, "/home/tester")).toBe("/home/tester/.lola");
  });
});

describe("contentDirectory", () => {
  it("uses the module root when source metadata has no content_dirname", () => {
    const root = makeRoot();
    const moduleRoot = makeModule(root, "root-module");
    expect(contentDirectory(moduleRoot)).toBe(moduleRoot);
  });

  it("resolves quoted nested content directories", () => {
    const root = makeRoot();
    const moduleRoot = makeModule(root, "nested-module", "\"plugins/dev\"");
    expect(contentDirectory(moduleRoot)).toBe(join(moduleRoot, "plugins/dev"));
  });

  it("treats slash as the module root", () => {
    const root = makeRoot();
    const moduleRoot = makeModule(root, "slash-module", "/");
    expect(contentDirectory(moduleRoot)).toBe(moduleRoot);
  });
});

describe("module discovery", () => {
  it("returns sorted registered Lola modules only", () => {
    const root = makeRoot();
    makeModule(root, "zeta");
    makeModule(root, "alpha");
    mkdirSync(join(root, "modules", "not-registered"));
    expect(installedModules(root)).toEqual(["alpha", "zeta"]);
  });

  it("returns only existing skill directories (legacy, one path per module)", () => {
    const root = makeRoot();
    makeModule(root, "root-skills");
    makeModule(root, "nested-skills", "plugins/dev");
    makeModule(root, "no-skills", undefined, false);
    expect(skillDirectories(root)).toEqual([
      join(root, "modules", "nested-skills", "plugins/dev", "skills"),
      join(root, "modules", "root-skills", "skills"),
    ]);
  });
});

describe("enumeratedSkillPaths", () => {
  it("returns individual skill dirs instead of parent skill directories", () => {
    const root = makeRoot();
    const mod = makeModule(root, "alpha");
    const s1 = makeSkill(mod, "backport");
    const s2 = makeSkill(mod, "ci");
    const paths = enumeratedSkillPaths(root);
    expect(paths).toEqual(expect.arrayContaining([s1, s2]));
    expect(paths).toHaveLength(2);
  });

  it("recurses into category subdirectories to find nested skills", () => {
    const root = makeRoot();
    const mod = makeModule(root, "nested");
    const s1 = makeSkill(mod, "engineering", "code-review");
    const s2 = makeSkill(mod, "engineering", "tdd");
    const s3 = makeSkill(mod, "misc", "setup-pre-commit");
    const paths = enumeratedSkillPaths(root);
    expect(paths).toEqual(expect.arrayContaining([s1, s2, s3]));
    expect(paths).toHaveLength(3);
  });

  it("ignores README.md files alongside skill directories", () => {
    const root = makeRoot();
    const mod = makeModule(root, "with-readme");
    makeReadme(mod, "engineering");
    const skill = makeSkill(mod, "engineering", "backport");
    const paths = enumeratedSkillPaths(root);
    expect(paths).toEqual([skill]);
  });

  it("does not descend past a directory that already contains SKILL.md", () => {
    const root = makeRoot();
    const mod = makeModule(root, "flat");
    const skill = makeSkill(mod, "backport");
    // A nested SKILL.md inside the skill dir should not produce a second entry
    const nested = join(skill, "sub");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "SKILL.md"), "# nested\n");
    const paths = enumeratedSkillPaths(root);
    // Only the top-level skill dir, not the nested one
    expect(paths).toEqual([skill]);
  });

  it("handles modules with no skills", () => {
    const root = makeRoot();
    makeModule(root, "empty");
    expect(enumeratedSkillPaths(root)).toEqual([]);
  });

  it("combines skills across multiple modules", () => {
    const root = makeRoot();
    const modA = makeModule(root, "alpha");
    const modB = makeModule(root, "beta");
    const s1 = makeSkill(modA, "backport");
    const s2 = makeSkill(modB, "ci");
    const paths = enumeratedSkillPaths(root);
    expect(paths).toEqual(expect.arrayContaining([s1, s2]));
    expect(paths).toHaveLength(2);
  });
});

describe("skillsForModule / skillPathsForModule", () => {
  it("returns skill names sorted alphabetically", () => {
    const root = makeRoot();
    const mod = makeModule(root, "alpha");
    makeSkill(mod, "zeta");
    makeSkill(mod, "alpha");
    makeSkill(mod, "mid");
    expect(skillsForModule("alpha", root)).toEqual(["alpha", "mid", "zeta"]);
  });

  it("returns skill names from nested category dirs", () => {
    const root = makeRoot();
    const mod = makeModule(root, "alpha");
    makeSkill(mod, "engineering", "code-review");
    makeSkill(mod, "misc", "setup-pre-commit");
    expect(skillsForModule("alpha", root)).toEqual(["code-review", "setup-pre-commit"]);
  });

  it("excludes README.md from skill names", () => {
    const root = makeRoot();
    const mod = makeModule(root, "alpha");
    makeReadme(mod, "engineering");
    makeSkill(mod, "engineering", "code-review");
    expect(skillsForModule("alpha", root)).toEqual(["code-review"]);
  });

  it("skillPathsForModule returns full paths to skill directories", () => {
    const root = makeRoot();
    const mod = makeModule(root, "alpha");
    const skillDir = makeSkill(mod, "backport");
    const paths = skillPathsForModule("alpha", root);
    expect(paths).toEqual([skillDir]);
  });
});

describe("conflictMap", () => {
  it("returns an empty map when no skills exist", () => {
    const root = makeRoot();
    makeModule(root, "empty");
    expect(conflictMap(root).size).toBe(0);
  });

  it("maps non-conflicting skills to their single module", () => {
    const root = makeRoot();
    const modA = makeModule(root, "alpha");
    const modB = makeModule(root, "beta");
    makeSkill(modA, "backport");
    makeSkill(modB, "ci");
    const map = conflictMap(root);
    expect(map.get("backport")).toEqual(["alpha"]);
    expect(map.get("ci")).toEqual(["beta"]);
  });

  it("lists both modules when a skill name is shared", () => {
    const root = makeRoot();
    const modA = makeModule(root, "alpha");
    const modB = makeModule(root, "beta");
    makeSkill(modA, "backport");
    makeSkill(modB, "backport");
    const map = conflictMap(root);
    expect(map.get("backport")).toEqual(expect.arrayContaining(["alpha", "beta"]));
    expect(map.get("backport")).toHaveLength(2);
  });

  it("only flags skills present in more than one module as conflicts", () => {
    const root = makeRoot();
    const modA = makeModule(root, "alpha");
    const modB = makeModule(root, "beta");
    makeSkill(modA, "shared");
    makeSkill(modB, "shared");
    makeSkill(modA, "unique");
    const map = conflictMap(root);
    expect((map.get("shared") ?? []).length).toBeGreaterThan(1);
    expect((map.get("unique") ?? []).length).toBe(1);
  });
});
