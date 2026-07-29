# TUI Suspension Pattern for External Editor Launch

The `/lola-manage` command needs to hand terminal control to an external editor (nvim by default, resolved via `$VISUAL` → `$EDITOR` → `nvim`). Pi's `ExtensionAPI` does not expose a direct `tui.stop()` / `tui.start()` method to command handlers. Instead, we enter a `ctx.ui.custom()` callback solely to obtain the `tui` reference, call `tui.stop()`, spawn the editor with `stdio: "inherit"`, await process exit, then call `tui.start()` and `tui.requestRender(true)` before resolving `done()`.

This mirrors the identical pattern used internally by Pi's own `Ctrl+G` external-editor keybinding in `extension-editor.ts`.

## Considered Options

- **`pi.exec(editor, [path])`** — runs a subprocess but leaves Pi's TUI active; the editor renders into a broken terminal.
- **`ctx.ui.editor()`** — opens Pi's own multi-line text widget with Ctrl+G support; not a direct editor session and the file content round-trips through Pi's text field.
- **`tui.stop()` via `ctx.ui.custom()` (chosen)** — gives the editor a clean full-terminal handoff and returns cleanly to the Pi session when the editor exits.
