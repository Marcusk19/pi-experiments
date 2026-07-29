import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const repo = resolve(import.meta.dirname, "../../..");
const temp = await mkdtemp(join(tmpdir(), "agent-base-git-install-"));
const archive = join(temp, "repository.tar");
const checkout = join(temp, "checkout");
let daemon;

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repo,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolvePromise) => child.once("close", resolvePromise));
}

try {
  await mkdir(checkout);
  const archived = await run("git", ["archive", "--format=tar", `--output=${archive}`, "HEAD"]);
  if (archived.code !== 0) throw new Error(archived.stderr);
  const extracted = await run("tar", ["-xf", archive, "-C", checkout]);
  if (extracted.code !== 0) throw new Error(extracted.stderr);

  const required = [
    "release/hub-extension.js",
    "release/subagents-extension.js",
    "release/hub-daemon.js",
    "release/agents/scout.md",
    "release/agents/planner.md",
    "release/agents/reviewer.md",
    "release/agents/worker.md",
    "release/agents/executor.md",
  ];
  for (const relative of required) await readFile(join(checkout, relative));

  for (const entry of ["hub-extension.js", "subagents-extension.js", "hub-daemon.js"]) {
    const source = await readFile(join(checkout, "release", entry), "utf8");
    if (source.includes("@agent-hub/")) throw new Error(`${entry} leaks workspace imports`);
  }

  const loaded = await run("pi", ["--no-extensions", "-e", checkout, "--list-models"]);
  if (loaded.code !== 0) throw new Error(loaded.stderr || loaded.stdout);

  const runtime = join(temp, "runtime");
  await mkdir(runtime);
  const discovery = join(runtime, "hub.json");
  daemon = spawn(process.execPath, [join(checkout, "release/hub-daemon.js")], {
    env: {
      ...process.env,
      AGENT_HUB_TOKEN: "git-artifact-smoke-token",
      AGENT_HUB_DISCOVERY_FILE: discovery,
      AGENT_HUB_EMPTY_EXIT_MS: "250",
    },
    stdio: "ignore",
  });

  let record;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      record = JSON.parse(await readFile(discovery, "utf8"));
      break;
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    }
  }
  if (!record || record.port <= 0 || record.pid !== daemon.pid) {
    daemon.kill("SIGTERM");
    throw new Error("tracked hub daemon did not publish discovery");
  }
  daemon.kill("SIGTERM");
  await waitForExit(daemon);
  console.log("tracked Git artifact smoke test passed");
} finally {
  if (daemon && daemon.exitCode === null && daemon.signalCode === null) {
    daemon.kill("SIGTERM");
    await waitForExit(daemon);
  }
  await rm(temp, { recursive: true, force: true });
}
