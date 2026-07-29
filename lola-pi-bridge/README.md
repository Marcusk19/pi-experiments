# lola-pi-bridge

Expose [Lola](https://github.com/RedHatProductSecurity/lola)-managed Agent Skills directly to [Pi](https://github.com/earendil-works/pi-mono) without copying them into a second installation tree.

## Prerequisites

- Node.js 18 or newer
- Pi 0.81.1 or newer
- Lola 0.5.0 or newer available as `lola` on `PATH`

Verify Lola before installing the bridge:

```bash
lola --version
```

## Install

Install a pinned release from GitHub:

```bash
pi install git:github.com/Marcusk19/lola-pi-bridge@v0.1.0
```

Try the current checkout for one Pi invocation without changing settings:

```bash
pi -e git:github.com/Marcusk19/lola-pi-bridge
```

After installation, start Pi and run:

```text
/lola-status
```

## Commands

### `/lola-status`

Lists registered Lola modules and the skill directory each module exposes to Pi.

### `/lola-install <source> [--name <module>] [--module-content <path>]`

Runs `lola mod add` after confirmation, then reloads Pi so newly discovered skills are immediately available.

Examples:

```text
/lola-install https://github.com/example/agent-skills.git
/lola-install https://github.com/example/monorepo.git --name shared --module-content plugins/dev
/lola-install '/Users/me/My Skills' --name local-skills
```

The source may be any source supported by `lola mod add`, including Git repositories, archives, and local folders.

### `/lola-sync [module]`

Runs `lola mod update` after confirmation and reloads Pi resources. Omit the module name to update every registered module.

```text
/lola-sync shared
/lola-sync
```

## Configuration

The bridge reads Lola modules from:

```text
$LOLA_ROOT/modules
```

If `LOLA_ROOT` is unset, it defaults to:

```text
$HOME/.lola/modules
```

For every registered module, the bridge reads `.lola/source.yml`. If the file declares `content_dirname`, Pi receives `<module>/<content_dirname>/skills`; otherwise Pi receives `<module>/skills`. Directories that do not exist are ignored.

## How it works

Lola owns module retrieval and updates. The bridge subscribes to Pi's `resources_discover` event and contributes Lola skill directories through `skillPaths`. No skill files are copied, generated, or rewritten by the bridge.

Successful and failed install/update operations are stored as Pi custom session entries. The latest operation remains visible in Pi's footer across `/reload`.

## Security

Pi extensions run with the user's full system permissions. This extension can execute `lola mod add` and `lola mod update`, and installed Agent Skills can instruct an agent to execute arbitrary actions. Review Lola sources before confirming installation and pin this package to a trusted Git tag.

## Development

```bash
npm install
npm run check
```

The quality gate runs strict TypeScript checking, Vitest, and `npm pack --dry-run`.

## License

MIT
