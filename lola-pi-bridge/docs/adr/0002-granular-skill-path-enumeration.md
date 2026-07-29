# Granular Skill Path Enumeration Instead of Parent Directory

Pi's `resources_discover` event previously received one parent `skillPath` per Lola Module (e.g. `~/.lola/modules/skills/skills`). Pi then applied its own recursive discovery, which falls back to README.md for directories that lack SKILL.md. This caused category-level README.md files in multi-level module layouts to be registered as phantom skills.

We replaced the single-path-per-module approach with `enumeratedSkillPaths()`: a recursive walk that returns only directories that directly contain SKILL.md. Pi receives a list of precise skill directories rather than a parent directory. This also feeds the conflict-detection logic in `/lola-manage`, which computes the full skill-name map across all returned paths.

## Considered Options

- **Return one parent directory per module (previous approach)** — simple, but Pi's internal fallback to README.md produces phantom skills in modules with category subdirectories.
- **Return individual SKILL.md-containing directories (chosen)** — precise; eliminates README.md phantom skills; enables cross-module conflict detection from the same enumeration.
- **Filter at the Pi level** — not possible; the extension does not control Pi's internal skill-discovery algorithm.

## Consequences

`resources_discover` may now return a large number of paths (one per installed skill rather than one per module). If Pi imposes limits on `skillPaths` count, this may need revisiting.
