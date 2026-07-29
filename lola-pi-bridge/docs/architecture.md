# Architecture

lola-pi-bridge is a Pi extension package that makes Lola-managed Agent Skills available inside Pi without duplicating or rewriting any skill files.

## Glossary

| Term | Definition |
|---|---|
| **Lola Module** | A registered Lola-managed collection that can contain zero or more Agent Skills. The lifecycle unit: installed, updated, and removed as a whole. |
| **Agent Skill** | A named directory containing `SKILL.md`, nested anywhere inside a Lola Module's skill tree. The browsable and invocable unit within Pi. |
| **Skill Conflict** | Two Lola Modules contributing an Agent Skill with the same directory name. Pi applies load-order disambiguation; the conflict indicator in `/lola-manage` surfaces these. |

## Extension files

```
extensions/
  lola-sync.ts      # skill discovery, install/update commands
  lola-manage.ts    # interactive TUI manager
src/
  lola-modules.ts   # shared discovery + blocklist utilities (used by tests and package installs)
  command-line.ts   # argument parser for /lola-install
```

Both extension files are **self-contained** — every utility function they need is inlined. This lets them work both as symlinks under `~/.pi/agent/extensions/` (where relative imports would break) and as part of a full `pi install` package install (where the `src/` modules are also available). `src/` exists for testing and for consumers using the package API.

## How skill discovery works

### Enumeration: `enumeratedSkillPaths()`

Pi's `resources_discover` event expects an array of `skillPaths`. The bridge does **not** pass the top-level skills directory for each module; it walks the directory tree and returns only directories that directly contain a `SKILL.md` file.

```
~/.lola/modules/skills/skills/
  engineering/
    README.md               ← ignored (no SKILL.md here)
    code-review/
      SKILL.md              ← returned as a skill path ✓
    grill-with-docs/
      SKILL.md              ← returned as a skill path ✓
```

Walking to individual skill directories solves two problems:
1. Modules that group skills into category subdirectories work correctly regardless of nesting depth.
2. `README.md` files inside category directories are never mistaken for skills (Pi uses README as a fallback when SKILL.md is absent).

See ADR 0002 for the trade-off between this approach and returning a single parent directory per module.

### Blocklist filtering

Before returning paths to Pi, `lola-sync.ts` reads `$LOLA_ROOT/pi-skill-blocklist.json`. Any skill present in the blocklist is excluded from the returned `skillPaths`. The blocklist is written by `/lola-manage → Hide Skill` and read on every `resources_discover` call (including after `/reload`).

```
resources_discover
  └── enumeratedSkillPaths()
        ├── walkForSkillDirs()  per module
        └── filter blocked skills via readBlocklist()
```

### Blocklist file format

```json
{
  "hidden": [
    { "module": "skills", "skill": "grill-with-docs" }
  ]
}
```

Located at `$LOLA_ROOT/pi-skill-blocklist.json` (defaults to `~/.lola/pi-skill-blocklist.json`). Plain JSON; safe to edit manually.

## Commands

| Command | Handler file | Description |
|---|---|---|
| `/lola-status` | `lola-sync.ts` | List installed modules and their skill directories. Read-only. |
| `/lola-install` | `lola-sync.ts` | Run `lola mod add <source>` after confirmation, then reload. |
| `/lola-sync [module]` | `lola-sync.ts` | Run `lola mod update` for one or all modules, then reload. |
| `/lola-manage` | `lola-manage.ts` | Interactive TUI manager (see below). TUI-only. |

## `/lola-manage` UI flow

```
Stage 1 — module list (SelectList)
  • Label shows conflict count if any:  "skills ⚠ 2 conflicts"
  • Description shows hidden count:     "14 skills  •  3 hidden"
  │
  ▼ (select module)
Stage 2 — action loop  ← stays open until Escape or a reload-triggering action
  ├── Open Skill      → Stage 3 (skill picker) → external editor → back to Stage 2
  ├── Hide Skill      → Stage 3 (skill picker) → write blocklist → back to Stage 2
  ├── Unhide Skill    → Stage 3 (hidden skills) → write blocklist → back to Stage 2
  ├── Update Module   → confirm → lola mod update → ctx.reload()  [terminal]
  ├── Remove Module   → confirm → lola mod rm --force → ctx.reload()  [terminal]
  └── View Details    → lola mod info overlay → back to Stage 2
  │
  ▼ (Escape from Stage 2)
ctx.reload() once if any hide/unhide changes were made, then return to chat
```

The action loop is intentional: hide and unhide are non-destructive bookkeeping operations that should not close the manager. Only Update and Remove cause an immediate `ctx.reload()` because they change module state on disk.

## External editor handoff

Opening a skill file suspends Pi's TUI, hands full terminal control to the editor, and restores Pi after the editor exits:

```typescript
ctx.ui.custom((tui, ..., done) => {
  tui.stop();
  spawn(editor, [filePath], { stdio: "inherit" });   // blocks
  tui.start();
  tui.requestRender(true);
  done();
});
```

The `tui` reference is obtained from the `ctx.ui.custom()` callback — the only place extensions can access it. A minimal placeholder component renders "Opening file in nvim…" during the brief window between the `custom()` call and `tui.stop()`.

Editor resolution: `$VISUAL` → `$EDITOR` → `nvim`.

See ADR 0001 for the rationale and rejected alternatives.

## Conflict detection

At `/lola-manage` open time, `buildConflictMap()` scans all installed modules and groups skill names by module. Any name with two or more modules is a conflict. The map is passed down through all UI stages:

- **Stage 1 label**: `"ai-helpers ⚠ 2 conflicts"` with conflicting names in description.
- **Stage 3 skill label**: `"grill-with-docs ⚠"` with `"also in: ai-helpers"` in description.

Conflicts are informational — no action is forced. The user can resolve them by hiding the unwanted copy via Hide Skill, or by removing the module.

## ADRs

- [ADR 0001](adr/0001-tui-suspension-for-external-editor.md) — TUI suspension pattern for external editor launch
- [ADR 0002](adr/0002-granular-skill-path-enumeration.md) — granular skill path enumeration instead of parent directory
