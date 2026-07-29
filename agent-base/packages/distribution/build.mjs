import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const release = resolve(repo, "release");
const extensionExternal = [
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
  "typebox",
];

await rm(release, { recursive: true, force: true });
await mkdir(release, { recursive: true });

const buildOptions = {
  outdir: release,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22.19",
  packages: "bundle",
  sourcemap: true,
  legalComments: "external",
  logLevel: "info",
};

await build({
  ...buildOptions,
  entryPoints: {
    "hub-extension": resolve(here, "src/hub-extension.ts"),
    "subagents-extension": resolve(here, "src/subagents-extension.ts"),
  },
  external: extensionExternal,
});

// The daemon runs in a detached plain Node process, outside Pi's module loader.
// Bundle typebox so a tracked-only checkout has no runtime package dependency.
await build({
  ...buildOptions,
  entryPoints: {
    "hub-daemon": resolve(repo, "packages/hub/src/daemon.ts"),
  },
});

await cp(resolve(repo, "packages/subagents/agents"), resolve(release, "agents"), {
  recursive: true,
});
