// packages/distribution/src/subagents-extension.ts
import { fileURLToPath as fileURLToPath2 } from "node:url";

// packages/subagents/dist/index.js
import { randomUUID } from "node:crypto";
import * as os from "node:os";
import * as path3 from "node:path";
import { fileURLToPath } from "node:url";
import { StringEnum } from "@earendil-works/pi-ai";
import { CONFIG_DIR_NAME as CONFIG_DIR_NAME2, getAgentDir as getAgentDir2, getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

// packages/subagents/dist/agents.js
import * as fs from "node:fs";
import * as path from "node:path";
import { CONFIG_DIR_NAME, getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
function loadAgentsFromDir(dir, source) {
  const agents = [];
  if (!fs.existsSync(dir)) {
    return agents;
  }
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return agents;
  }
  for (const entry of entries) {
    if (!entry.name.endsWith(".md"))
      continue;
    if (!entry.isFile() && !entry.isSymbolicLink())
      continue;
    const filePath = path.join(dir, entry.name);
    let content;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    const { frontmatter, body } = parseFrontmatter(content);
    if (!frontmatter.name || !frontmatter.description) {
      continue;
    }
    const tools = frontmatter.tools?.split(",").map((t) => t.trim()).filter(Boolean);
    agents.push({
      name: frontmatter.name,
      description: frontmatter.description,
      tools: tools && tools.length > 0 ? tools : void 0,
      model: frontmatter.model,
      systemPrompt: body,
      source,
      filePath
    });
  }
  return agents;
}
function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function findNearestProjectAgentsDir(cwd) {
  let currentDir = cwd;
  while (true) {
    const candidate = path.join(currentDir, CONFIG_DIR_NAME, "agents");
    if (isDirectory(candidate))
      return candidate;
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir)
      return null;
    currentDir = parentDir;
  }
}
function discoverAgents(cwd, scope, options = {}) {
  const userDir = options.userAgentsDir ?? path.join(getAgentDir(), "agents");
  const projectAgentsDir = findNearestProjectAgentsDir(cwd);
  const bundledAgents = options.bundledAgentsDir ? loadAgentsFromDir(options.bundledAgentsDir, "bundled") : [];
  const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
  const projectAgents = scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project");
  const agentMap = /* @__PURE__ */ new Map();
  for (const agent of bundledAgents)
    agentMap.set(agent.name, agent);
  for (const agent of userAgents)
    agentMap.set(agent.name, agent);
  for (const agent of projectAgents)
    agentMap.set(agent.name, agent);
  return { agents: Array.from(agentMap.values()), projectAgentsDir };
}

// packages/subagents/dist/coordination.js
var COORDINATION_API_CHANNEL = "agent-activity-hub:coordination-api:v1";
function requestCoordinationApi(pi) {
  let api;
  pi.events.emit(COORDINATION_API_CHANNEL, {
    version: 1,
    accept(candidate) {
      if (isCoordinationApi(candidate))
        api = candidate;
    }
  });
  if (!api) {
    throw new Error("Local Pi coordination is unavailable. Load a current agent-base extension and restart Pi.");
  }
  return api;
}
function isTerminalTaskState(state) {
  return state === "completed" || state === "failed" || state === "canceled" || state === "rejected";
}
function isCoordinationApi(value) {
  if (!value || typeof value !== "object")
    return false;
  const candidate = value;
  return candidate.version === 1 && typeof candidate.sendToHarnessSession === "function" && typeof candidate.watch === "function" && typeof candidate.cancel === "function";
}

// packages/subagents/dist/tmux-worker.js
import { spawn } from "node:child_process";
import * as fs2 from "node:fs";
import * as path2 from "node:path";
var workerParentOption = "@mkok_subagent_parent";
var paneLayoutTails = /* @__PURE__ */ new Map();
async function launchTmuxWorker(request, signal, run = runProcess) {
  if (!/^%\d+$/.test(request.targetPane))
    throw new Error("The current tmux pane could not be identified.");
  if (!path2.isAbsolute(request.cwd))
    throw new Error("The worker working directory must be absolute.");
  if (!/^[0-9a-f-]{36}$/.test(request.sessionId))
    throw new Error("The worker session ID is invalid.");
  const invocation = getPiInvocation();
  const piArgs = [
    ...invocation.args,
    "--session-id",
    request.sessionId,
    "--name",
    request.name
  ];
  if (request.model)
    piArgs.push("--model", request.model);
  if (request.tools && request.tools.length > 0)
    piArgs.push("--tools", request.tools.join(","));
  if (request.systemPrompt.trim())
    piArgs.push("--append-system-prompt", request.systemPrompt);
  const childEnvironment = [
    "env",
    "-u",
    "PI_SESSION_ID",
    "-u",
    "PI_SESSION_FILE",
    "-u",
    "PI_PROVIDER",
    "-u",
    "PI_MODEL",
    "-u",
    "PI_REASONING_LEVEL"
  ];
  if (request.xdgRuntimeDir)
    childEnvironment.push(`XDG_RUNTIME_DIR=${request.xdgRuntimeDir}`);
  const childCommand = [
    ...childEnvironment,
    invocation.command,
    ...piArgs
  ].map(shellQuote).join(" ");
  const paneId = await withPaneLayoutLock(request.targetPane, async () => {
    signal?.throwIfAborted();
    const workerPanes = await findWorkerPanes(request.targetPane, signal, run);
    const splitTarget = widestPane(workerPanes)?.paneId ?? request.targetPane;
    const splitDirection = workerPanes.length === 0 ? ["-v", "-l", "50%"] : ["-h"];
    const result = await run("tmux", [
      "split-window",
      "-d",
      "-P",
      "-F",
      "#{pane_id}",
      ...splitDirection,
      "-t",
      splitTarget,
      "-c",
      request.cwd,
      childCommand
    ], { signal });
    if (result.code !== 0) {
      throw new Error(`Could not create the worker pane: ${safeError(result.stderr)}`);
    }
    const createdPane = result.stdout.trim();
    if (!/^%\d+$/.test(createdPane))
      throw new Error("tmux did not return a worker pane ID.");
    try {
      const tagged = await run("tmux", [
        "set-option",
        "-p",
        "-t",
        createdPane,
        workerParentOption,
        request.targetPane
      ], { signal });
      if (tagged.code !== 0) {
        throw new Error(`Could not identify the worker region: ${safeError(tagged.stderr)}`);
      }
      return createdPane;
    } catch (error) {
      await killTmuxPane(createdPane, run);
      throw error;
    }
  });
  return { paneId, sessionId: request.sessionId };
}
async function closeTmuxPane(paneId, run = runProcess) {
  if (!/^%\d+$/.test(paneId))
    return;
  const inspected = await run("tmux", [
    "display-message",
    "-p",
    "-t",
    paneId,
    `#{${workerParentOption}}`
  ]).catch(() => void 0);
  const parentPane = inspected?.code === 0 ? inspected.stdout.trim() : "";
  if (/^%\d+$/.test(parentPane)) {
    await withPaneLayoutLock(parentPane, () => killTmuxPane(paneId, run));
    return;
  }
  await killTmuxPane(paneId, run);
}
function currentTmuxPane(env = process.env) {
  const pane = env.TMUX_PANE;
  if (!env.TMUX || !pane || !/^%\d+$/.test(pane)) {
    throw new Error("Persistent subagents require Pi to run inside tmux.");
  }
  return pane;
}
function shellQuote(value) {
  if (value.length === 0)
    return "''";
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
async function findWorkerPanes(targetPane, signal, run) {
  const result = await run("tmux", [
    "list-panes",
    "-t",
    targetPane,
    "-F",
    `#{pane_id}	#{${workerParentOption}}	#{pane_width}`
  ], { signal });
  if (result.code !== 0) {
    throw new Error(`Could not inspect the worker region: ${safeError(result.stderr)}`);
  }
  return result.stdout.trim().split("\n").flatMap((line) => {
    const [paneId, parentPane, width] = line.split("	");
    if (!paneId || parentPane !== targetPane || !/^%\d+$/.test(paneId))
      return [];
    const parsedWidth = Number.parseInt(width ?? "", 10);
    return Number.isFinite(parsedWidth) ? [{ paneId, width: parsedWidth }] : [];
  });
}
function widestPane(panes) {
  return panes.reduce((widest, pane) => !widest || pane.width > widest.width ? pane : widest, void 0);
}
async function killTmuxPane(paneId, run) {
  await run("tmux", ["kill-pane", "-t", paneId]).catch(() => void 0);
}
async function withPaneLayoutLock(targetPane, action) {
  const previous = paneLayoutTails.get(targetPane) ?? Promise.resolve();
  let release = () => void 0;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  paneLayoutTails.set(targetPane, current);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (paneLayoutTails.get(targetPane) === current)
      paneLayoutTails.delete(targetPane);
  }
}
function getPiInvocation() {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtualScript && fs2.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript] };
  }
  const execName = path2.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  return isGenericRuntime ? { command: "pi", args: [] } : { command: process.execPath, args: [] };
}
function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], signal: options.signal });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ stdout, stderr, code }));
  });
}
function safeError(value) {
  const line = value.trim().split("\n")[0] ?? "tmux failed";
  return line.slice(0, 512) || "tmux failed";
}

// packages/subagents/dist/index.js
var BUNDLED_AGENTS_DIR = fileURLToPath(new URL("./agents/", import.meta.url));
var MAX_PARALLEL_TASKS = 8;
var MAX_CONCURRENCY = 4;
var COLLAPSED_ITEM_COUNT = 10;
var PER_TASK_OUTPUT_CAP = 50 * 1024;
function formatTokens(count) {
  if (count < 1e3)
    return count.toString();
  if (count < 1e4)
    return `${(count / 1e3).toFixed(1)}k`;
  if (count < 1e6)
    return `${Math.round(count / 1e3)}k`;
  return `${(count / 1e6).toFixed(1)}M`;
}
function formatUsageStats(usage, model) {
  const parts = [];
  if (usage.turns)
    parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
  if (usage.input)
    parts.push(`\u2191${formatTokens(usage.input)}`);
  if (usage.output)
    parts.push(`\u2193${formatTokens(usage.output)}`);
  if (usage.cacheRead)
    parts.push(`R${formatTokens(usage.cacheRead)}`);
  if (usage.cacheWrite)
    parts.push(`W${formatTokens(usage.cacheWrite)}`);
  if (usage.cost)
    parts.push(`$${usage.cost.toFixed(4)}`);
  if (usage.contextTokens && usage.contextTokens > 0) {
    parts.push(`ctx:${formatTokens(usage.contextTokens)}`);
  }
  if (model)
    parts.push(model);
  return parts.join(" ");
}
function formatToolCall(toolName, args, themeFg) {
  const shortenPath = (p) => {
    const home = os.homedir();
    return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
  };
  switch (toolName) {
    case "bash": {
      const command = args.command || "...";
      const preview = command.length > 60 ? `${command.slice(0, 60)}...` : command;
      return themeFg("muted", "$ ") + themeFg("toolOutput", preview);
    }
    case "read": {
      const rawPath = args.file_path || args.path || "...";
      const filePath = shortenPath(rawPath);
      const offset = args.offset;
      const limit = args.limit;
      let text = themeFg("accent", filePath);
      if (offset !== void 0 || limit !== void 0) {
        const startLine = offset ?? 1;
        const endLine = limit !== void 0 ? startLine + limit - 1 : "";
        text += themeFg("warning", `:${startLine}${endLine ? `-${endLine}` : ""}`);
      }
      return themeFg("muted", "read ") + text;
    }
    case "write": {
      const rawPath = args.file_path || args.path || "...";
      const filePath = shortenPath(rawPath);
      const content = args.content || "";
      const lines = content.split("\n").length;
      let text = themeFg("muted", "write ") + themeFg("accent", filePath);
      if (lines > 1)
        text += themeFg("dim", ` (${lines} lines)`);
      return text;
    }
    case "edit": {
      const rawPath = args.file_path || args.path || "...";
      return themeFg("muted", "edit ") + themeFg("accent", shortenPath(rawPath));
    }
    case "ls": {
      const rawPath = args.path || ".";
      return themeFg("muted", "ls ") + themeFg("accent", shortenPath(rawPath));
    }
    case "find": {
      const pattern = args.pattern || "*";
      const rawPath = args.path || ".";
      return themeFg("muted", "find ") + themeFg("accent", pattern) + themeFg("dim", ` in ${shortenPath(rawPath)}`);
    }
    case "grep": {
      const pattern = args.pattern || "";
      const rawPath = args.path || ".";
      return themeFg("muted", "grep ") + themeFg("accent", `/${pattern}/`) + themeFg("dim", ` in ${shortenPath(rawPath)}`);
    }
    default: {
      const argsStr = JSON.stringify(args);
      const preview = argsStr.length > 50 ? `${argsStr.slice(0, 50)}...` : argsStr;
      return themeFg("accent", toolName) + themeFg("dim", ` ${preview}`);
    }
  }
}
function getFinalOutput(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant") {
      for (const part of msg.content) {
        if (part.type === "text")
          return part.text;
      }
    }
  }
  return "";
}
function isFailedResult(result) {
  return result.exitCode > 0 || result.stopReason === "error" || result.stopReason === "aborted";
}
function getResultOutput(result) {
  if (isFailedResult(result)) {
    return result.errorMessage || result.stderr || result.output || getFinalOutput(result.messages) || "(no output)";
  }
  return result.output || getFinalOutput(result.messages) || "(no output)";
}
function getSuccessfulResultOutput(result) {
  return result.output || getFinalOutput(result.messages);
}
function truncateParallelOutput(output) {
  const byteLength = Buffer.byteLength(output, "utf8");
  if (byteLength <= PER_TASK_OUTPUT_CAP)
    return output;
  let truncated = output.slice(0, PER_TASK_OUTPUT_CAP);
  while (Buffer.byteLength(truncated, "utf8") > PER_TASK_OUTPUT_CAP) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}

[Output truncated: ${byteLength - Buffer.byteLength(truncated, "utf8")} bytes omitted. Full output preserved in tool details.]`;
}
function getDisplayItems(messages, output) {
  const items = [];
  for (const msg of messages) {
    if (msg.role === "assistant") {
      for (const part of msg.content) {
        if (part.type === "text")
          items.push({ type: "text", text: part.text });
        else if (part.type === "toolCall")
          items.push({ type: "toolCall", name: part.name, args: part.arguments });
      }
    }
  }
  if (output && !items.some((item) => item.type === "text" && item.text === output)) {
    items.push({ type: "text", text: output });
  }
  return items;
}
async function mapWithConcurrencyLimit(items, concurrency, fn) {
  if (items.length === 0)
    return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = new Array(limit).fill(null).map(async () => {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length)
        return;
      results[current] = await fn(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}
async function runSingleAgent(pi, defaultCwd, agents, agentName, task, cwd, step, signal, onUpdate, makeDetails) {
  const agent = agents.find((candidate) => candidate.name === agentName);
  if (!agent) {
    const available = agents.map((candidate) => `"${candidate.name}"`).join(", ") || "none";
    return failedResult(agentName, "unknown", task, `Unknown agent: "${agentName}". Available agents: ${available}.`, step);
  }
  const workerSessionId = randomUUID();
  const currentResult = {
    agent: agentName,
    agentSource: agent.source,
    task,
    exitCode: -1,
    messages: [],
    stderr: "",
    usage: emptyUsage(),
    model: agent.model,
    step,
    sessionId: workerSessionId
  };
  const emitUpdate = (text) => onUpdate?.({
    content: [{ type: "text", text }],
    details: makeDetails([currentResult])
  });
  let taskCreated = false;
  try {
    const api = requestCoordinationApi(pi);
    const worker = await launchTmuxWorker({
      targetPane: currentTmuxPane(),
      cwd: cwd ?? defaultCwd,
      sessionId: workerSessionId,
      name: `subagent: ${agent.name}`,
      systemPrompt: agent.systemPrompt,
      ...agent.model ? { model: agent.model } : {},
      ...agent.tools ? { tools: agent.tools } : {},
      ...process.env.XDG_RUNTIME_DIR ? { xdgRuntimeDir: process.env.XDG_RUNTIME_DIR } : {}
    }, signal);
    currentResult.paneId = worker.paneId;
    emitUpdate(`Started ${agent.name} in tmux pane ${worker.paneId}; waiting for Pi registration...`);
    let snapshot = await api.sendToHarnessSession({
      harnessSessionId: worker.sessionId,
      instruction: task
    }, signal);
    taskCreated = true;
    currentResult.taskId = snapshot.taskId;
    applySnapshot(currentResult, snapshot);
    emitUpdate(`${agent.name}: ${snapshot.state}`);
    while (!isTerminalTaskState(snapshot.state)) {
      await abortableDelay(250, signal);
      snapshot = await api.watch(snapshot.taskId, signal);
      applySnapshot(currentResult, snapshot);
      emitUpdate(`${agent.name}: ${snapshot.state}`);
    }
    return currentResult;
  } catch (error) {
    if (signal?.aborted) {
      if (taskCreated && currentResult.taskId) {
        const api = safeCoordinationApi(pi);
        await api?.cancel(currentResult.taskId, AbortSignal.timeout(2e3)).catch(() => void 0);
      } else if (currentResult.paneId) {
        await closeTmuxPane(currentResult.paneId);
      }
      throw new Error("Subagent was aborted.");
    }
    if (!taskCreated && currentResult.paneId)
      await closeTmuxPane(currentResult.paneId);
    currentResult.exitCode = 1;
    currentResult.stopReason = "error";
    currentResult.errorMessage = safeMessage(error);
    return currentResult;
  }
}
function applySnapshot(result, snapshot) {
  result.taskState = snapshot.state;
  result.output = snapshot.targetText;
  result.exitCode = snapshot.state === "completed" ? 0 : isTerminalTaskState(snapshot.state) ? 1 : -1;
  result.stopReason = snapshot.state === "completed" ? "end" : snapshot.state;
  if (result.exitCode === 1 && !result.output) {
    result.errorMessage = snapshot.terminalCode ?? `Delegated task ${snapshot.state}.`;
  }
}
function failedResult(agent, agentSource, task, message, step) {
  return {
    agent,
    agentSource,
    task,
    exitCode: 1,
    messages: [],
    stderr: message,
    errorMessage: message,
    usage: emptyUsage(),
    step
  };
}
function emptyUsage() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
}
function safeCoordinationApi(pi) {
  try {
    return requestCoordinationApi(pi);
  } catch {
    return void 0;
  }
}
function safeMessage(error) {
  if (!(error instanceof Error))
    return "Persistent subagent failed.";
  return error.message.slice(0, 1e3);
}
function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Operation aborted."));
      return;
    }
    let timer;
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Operation aborted."));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
var TaskItem = Type.Object({
  agent: Type.String({ description: "Name of the agent to invoke" }),
  task: Type.String({ description: "Task to delegate to the agent" }),
  cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" }))
});
var ChainItem = Type.Object({
  agent: Type.String({ description: "Name of the agent to invoke" }),
  task: Type.String({ description: "Task with optional {previous} placeholder for prior output" }),
  cwd: Type.Optional(Type.String({ description: "Working directory for the agent process" }))
});
var AgentScopeSchema = StringEnum(["user", "project", "both"], {
  description: 'Which agent directories to use. Default: "user". Use "both" to include project-local agents.',
  default: "user"
});
var SubagentParams = Type.Object({
  agent: Type.Optional(Type.String({ description: "Name of the agent to invoke (for single mode)" })),
  task: Type.Optional(Type.String({ description: "Task to delegate (for single mode)" })),
  tasks: Type.Optional(Type.Array(TaskItem, { description: "Array of {agent, task} for parallel execution" })),
  chain: Type.Optional(Type.Array(ChainItem, { description: "Array of {agent, task} for sequential execution" })),
  agentScope: Type.Optional(AgentScopeSchema),
  confirmProjectAgents: Type.Optional(Type.Boolean({ description: "Prompt before running project-local agents. Default: false.", default: false })),
  cwd: Type.Optional(Type.String({ description: "Working directory for the agent process (single mode)" }))
});
function registerSubagentExtension(pi, options = {}) {
  const bundledAgentsDir2 = options.bundledAgentsDir ?? BUNDLED_AGENTS_DIR;
  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description: [
      "Delegate tasks to specialized subagents with isolated context.",
      "Modes: single (agent + task), parallel (tasks array), chain (sequential with {previous} placeholder).",
      `Default agent scope is "user" (from ${path3.join(getAgentDir2(), "agents")}).`,
      `To enable project-local agents in ${CONFIG_DIR_NAME2}/agents, set agentScope: "both" (or "project").`
    ].join(" "),
    parameters: SubagentParams,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const agentScope = params.agentScope ?? "user";
      const discovery = discoverAgents(ctx.cwd, agentScope, { bundledAgentsDir: bundledAgentsDir2 });
      const agents = discovery.agents;
      const confirmProjectAgents = params.confirmProjectAgents ?? false;
      const hasChain = (params.chain?.length ?? 0) > 0;
      const hasTasks = (params.tasks?.length ?? 0) > 0;
      const hasSingle = Boolean(params.agent && params.task);
      const modeCount = Number(hasChain) + Number(hasTasks) + Number(hasSingle);
      const makeDetails = (mode) => (results) => ({
        mode,
        agentScope,
        projectAgentsDir: discovery.projectAgentsDir,
        results
      });
      if (modeCount !== 1) {
        const available2 = agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
        return {
          content: [
            {
              type: "text",
              text: `Invalid parameters. Provide exactly one mode.
Available agents: ${available2}`
            }
          ],
          details: makeDetails("single")([])
        };
      }
      if ((agentScope === "project" || agentScope === "both") && confirmProjectAgents && ctx.hasUI) {
        const requestedAgentNames = /* @__PURE__ */ new Set();
        if (params.chain)
          for (const step of params.chain)
            requestedAgentNames.add(step.agent);
        if (params.tasks)
          for (const t of params.tasks)
            requestedAgentNames.add(t.agent);
        if (params.agent)
          requestedAgentNames.add(params.agent);
        const projectAgentsRequested = Array.from(requestedAgentNames).map((name) => agents.find((a) => a.name === name)).filter((a) => a?.source === "project");
        if (projectAgentsRequested.length > 0) {
          const names = projectAgentsRequested.map((a) => a.name).join(", ");
          const dir = discovery.projectAgentsDir ?? "(unknown)";
          const ok = await ctx.ui.confirm("Run project-local agents?", `Agents: ${names}
Source: ${dir}

Project agents are repo-controlled. Only continue for trusted repositories.`);
          if (!ok)
            return {
              content: [{ type: "text", text: "Canceled: project-local agents not approved." }],
              details: makeDetails(hasChain ? "chain" : hasTasks ? "parallel" : "single")([])
            };
        }
      }
      if (params.chain && params.chain.length > 0) {
        const results = [];
        let previousOutput = "";
        for (let i = 0; i < params.chain.length; i++) {
          const step = params.chain[i];
          const taskWithContext = step.task.replace(/\{previous\}/g, previousOutput);
          const chainUpdate = onUpdate ? (partial) => {
            const currentResult = partial.details?.results[0];
            if (currentResult) {
              const allResults = [...results, currentResult];
              onUpdate({
                content: partial.content,
                details: makeDetails("chain")(allResults)
              });
            }
          } : void 0;
          const result = await runSingleAgent(pi, ctx.cwd, agents, step.agent, taskWithContext, step.cwd, i + 1, signal, chainUpdate, makeDetails("chain"));
          results.push(result);
          const isError = isFailedResult(result);
          if (isError) {
            const errorMsg = getResultOutput(result);
            return {
              content: [{ type: "text", text: `Chain stopped at step ${i + 1} (${step.agent}): ${errorMsg}` }],
              details: makeDetails("chain")(results),
              isError: true
            };
          }
          previousOutput = getSuccessfulResultOutput(result);
        }
        return {
          content: [{ type: "text", text: getSuccessfulResultOutput(results[results.length - 1]) || "(no output)" }],
          details: makeDetails("chain")(results)
        };
      }
      if (params.tasks && params.tasks.length > 0) {
        if (params.tasks.length > MAX_PARALLEL_TASKS)
          return {
            content: [
              {
                type: "text",
                text: `Too many parallel tasks (${params.tasks.length}). Max is ${MAX_PARALLEL_TASKS}.`
              }
            ],
            details: makeDetails("parallel")([])
          };
        const allResults = new Array(params.tasks.length);
        for (let i = 0; i < params.tasks.length; i++) {
          allResults[i] = {
            agent: params.tasks[i].agent,
            agentSource: "unknown",
            task: params.tasks[i].task,
            exitCode: -1,
            // -1 = still running
            messages: [],
            stderr: "",
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 }
          };
        }
        const emitParallelUpdate = () => {
          if (onUpdate) {
            const running = allResults.filter((r) => r.exitCode === -1).length;
            const done = allResults.filter((r) => r.exitCode !== -1).length;
            onUpdate({
              content: [
                { type: "text", text: `Parallel: ${done}/${allResults.length} done, ${running} running...` }
              ],
              details: makeDetails("parallel")([...allResults])
            });
          }
        };
        const results = await mapWithConcurrencyLimit(params.tasks, MAX_CONCURRENCY, async (t, index) => {
          const result = await runSingleAgent(
            pi,
            ctx.cwd,
            agents,
            t.agent,
            t.task,
            t.cwd,
            void 0,
            signal,
            // Per-task update callback
            (partial) => {
              if (partial.details?.results[0]) {
                allResults[index] = partial.details.results[0];
                emitParallelUpdate();
              }
            },
            makeDetails("parallel")
          );
          allResults[index] = result;
          emitParallelUpdate();
          return result;
        });
        const successCount = results.filter((r) => !isFailedResult(r)).length;
        const summaries = results.map((r) => {
          const output = truncateParallelOutput(getResultOutput(r));
          const status = isFailedResult(r) ? `failed${r.stopReason && r.stopReason !== "end" ? ` (${r.stopReason})` : ""}` : "completed";
          return `### [${r.agent}] ${status}

${output}`;
        });
        return {
          content: [
            {
              type: "text",
              text: `Parallel: ${successCount}/${results.length} succeeded

${summaries.join("\n\n---\n\n")}`
            }
          ],
          details: makeDetails("parallel")(results)
        };
      }
      if (params.agent && params.task) {
        const result = await runSingleAgent(pi, ctx.cwd, agents, params.agent, params.task, params.cwd, void 0, signal, onUpdate, makeDetails("single"));
        const isError = isFailedResult(result);
        if (isError) {
          const errorMsg = getResultOutput(result);
          return {
            content: [{ type: "text", text: `Agent ${result.stopReason || "failed"}: ${errorMsg}` }],
            details: makeDetails("single")([result]),
            isError: true
          };
        }
        return {
          content: [{ type: "text", text: getSuccessfulResultOutput(result) || "(no output)" }],
          details: makeDetails("single")([result])
        };
      }
      const available = agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
      return {
        content: [{ type: "text", text: `Invalid parameters. Available agents: ${available}` }],
        details: makeDetails("single")([])
      };
    },
    renderCall(args, theme, _context) {
      const scope = args.agentScope ?? "user";
      if (args.chain && args.chain.length > 0) {
        let text2 = theme.fg("toolTitle", theme.bold("subagent ")) + theme.fg("accent", `chain (${args.chain.length} steps)`) + theme.fg("muted", ` [${scope}]`);
        for (let i = 0; i < Math.min(args.chain.length, 3); i++) {
          const step = args.chain[i];
          const cleanTask = step.task.replace(/\{previous\}/g, "").trim();
          const preview2 = cleanTask.length > 40 ? `${cleanTask.slice(0, 40)}...` : cleanTask;
          text2 += "\n  " + theme.fg("muted", `${i + 1}.`) + " " + theme.fg("accent", step.agent) + theme.fg("dim", ` ${preview2}`);
        }
        if (args.chain.length > 3)
          text2 += `
  ${theme.fg("muted", `... +${args.chain.length - 3} more`)}`;
        return new Text(text2, 0, 0);
      }
      if (args.tasks && args.tasks.length > 0) {
        let text2 = theme.fg("toolTitle", theme.bold("subagent ")) + theme.fg("accent", `parallel (${args.tasks.length} tasks)`) + theme.fg("muted", ` [${scope}]`);
        for (const t of args.tasks.slice(0, 3)) {
          const preview2 = t.task.length > 40 ? `${t.task.slice(0, 40)}...` : t.task;
          text2 += `
  ${theme.fg("accent", t.agent)}${theme.fg("dim", ` ${preview2}`)}`;
        }
        if (args.tasks.length > 3)
          text2 += `
  ${theme.fg("muted", `... +${args.tasks.length - 3} more`)}`;
        return new Text(text2, 0, 0);
      }
      const agentName = args.agent || "...";
      const preview = args.task ? args.task.length > 60 ? `${args.task.slice(0, 60)}...` : args.task : "...";
      let text = theme.fg("toolTitle", theme.bold("subagent ")) + theme.fg("accent", agentName) + theme.fg("muted", ` [${scope}]`);
      text += `
  ${theme.fg("dim", preview)}`;
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded }, theme, _context) {
      const details = result.details;
      if (!details || details.results.length === 0) {
        const text2 = result.content[0];
        return new Text(text2?.type === "text" ? text2.text : "(no output)", 0, 0);
      }
      const mdTheme = getMarkdownTheme();
      const renderDisplayItems = (items, limit) => {
        const toShow = limit ? items.slice(-limit) : items;
        const skipped = limit && items.length > limit ? items.length - limit : 0;
        let text2 = "";
        if (skipped > 0)
          text2 += theme.fg("muted", `... ${skipped} earlier items
`);
        for (const item of toShow) {
          if (item.type === "text") {
            const preview = expanded ? item.text : item.text.split("\n").slice(0, 3).join("\n");
            text2 += `${theme.fg("toolOutput", preview)}
`;
          } else {
            text2 += `${theme.fg("muted", "\u2192 ") + formatToolCall(item.name, item.args, theme.fg.bind(theme))}
`;
          }
        }
        return text2.trimEnd();
      };
      if (details.mode === "single" && details.results.length === 1) {
        const r = details.results[0];
        const isError = isFailedResult(r);
        const icon = isError ? theme.fg("error", "\u2717") : theme.fg("success", "\u2713");
        const displayItems = getDisplayItems(r.messages, r.output);
        const finalOutput = getSuccessfulResultOutput(r);
        if (expanded) {
          const container = new Container();
          let header = `${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}`;
          if (isError && r.stopReason)
            header += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
          container.addChild(new Text(header, 0, 0));
          if (isError && r.errorMessage)
            container.addChild(new Text(theme.fg("error", `Error: ${r.errorMessage}`), 0, 0));
          container.addChild(new Spacer(1));
          container.addChild(new Text(theme.fg("muted", "\u2500\u2500\u2500 Task \u2500\u2500\u2500"), 0, 0));
          container.addChild(new Text(theme.fg("dim", r.task), 0, 0));
          container.addChild(new Spacer(1));
          container.addChild(new Text(theme.fg("muted", "\u2500\u2500\u2500 Output \u2500\u2500\u2500"), 0, 0));
          if (displayItems.length === 0 && !finalOutput) {
            container.addChild(new Text(theme.fg("muted", "(no output)"), 0, 0));
          } else {
            for (const item of displayItems) {
              if (item.type === "toolCall")
                container.addChild(new Text(theme.fg("muted", "\u2192 ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)), 0, 0));
            }
            if (finalOutput) {
              container.addChild(new Spacer(1));
              container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
            }
          }
          const usageStr2 = formatUsageStats(r.usage, r.model);
          if (usageStr2) {
            container.addChild(new Spacer(1));
            container.addChild(new Text(theme.fg("dim", usageStr2), 0, 0));
          }
          return container;
        }
        let text2 = `${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}`;
        if (isError && r.stopReason)
          text2 += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
        if (isError && r.errorMessage)
          text2 += `
${theme.fg("error", `Error: ${r.errorMessage}`)}`;
        else if (displayItems.length === 0)
          text2 += `
${theme.fg("muted", "(no output)")}`;
        else {
          text2 += `
${renderDisplayItems(displayItems, COLLAPSED_ITEM_COUNT)}`;
          if (displayItems.length > COLLAPSED_ITEM_COUNT)
            text2 += `
${theme.fg("muted", "(Ctrl+O to expand)")}`;
        }
        const usageStr = formatUsageStats(r.usage, r.model);
        if (usageStr)
          text2 += `
${theme.fg("dim", usageStr)}`;
        return new Text(text2, 0, 0);
      }
      const aggregateUsage = (results) => {
        const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
        for (const r of results) {
          total.input += r.usage.input;
          total.output += r.usage.output;
          total.cacheRead += r.usage.cacheRead;
          total.cacheWrite += r.usage.cacheWrite;
          total.cost += r.usage.cost;
          total.turns += r.usage.turns;
        }
        return total;
      };
      if (details.mode === "chain") {
        const successCount = details.results.filter((r) => r.exitCode === 0).length;
        const icon = successCount === details.results.length ? theme.fg("success", "\u2713") : theme.fg("error", "\u2717");
        if (expanded) {
          const container = new Container();
          container.addChild(new Text(icon + " " + theme.fg("toolTitle", theme.bold("chain ")) + theme.fg("accent", `${successCount}/${details.results.length} steps`), 0, 0));
          for (const r of details.results) {
            const rIcon = r.exitCode === 0 ? theme.fg("success", "\u2713") : theme.fg("error", "\u2717");
            const displayItems = getDisplayItems(r.messages, r.output);
            const finalOutput = getSuccessfulResultOutput(r);
            container.addChild(new Spacer(1));
            container.addChild(new Text(`${theme.fg("muted", `\u2500\u2500\u2500 Step ${r.step}: `) + theme.fg("accent", r.agent)} ${rIcon}`, 0, 0));
            container.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", r.task), 0, 0));
            for (const item of displayItems) {
              if (item.type === "toolCall") {
                container.addChild(new Text(theme.fg("muted", "\u2192 ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)), 0, 0));
              }
            }
            if (finalOutput) {
              container.addChild(new Spacer(1));
              container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
            }
            const stepUsage = formatUsageStats(r.usage, r.model);
            if (stepUsage)
              container.addChild(new Text(theme.fg("dim", stepUsage), 0, 0));
          }
          const usageStr2 = formatUsageStats(aggregateUsage(details.results));
          if (usageStr2) {
            container.addChild(new Spacer(1));
            container.addChild(new Text(theme.fg("dim", `Total: ${usageStr2}`), 0, 0));
          }
          return container;
        }
        let text2 = icon + " " + theme.fg("toolTitle", theme.bold("chain ")) + theme.fg("accent", `${successCount}/${details.results.length} steps`);
        for (const r of details.results) {
          const rIcon = r.exitCode === 0 ? theme.fg("success", "\u2713") : theme.fg("error", "\u2717");
          const displayItems = getDisplayItems(r.messages, r.output);
          text2 += `

${theme.fg("muted", `\u2500\u2500\u2500 Step ${r.step}: `)}${theme.fg("accent", r.agent)} ${rIcon}`;
          if (displayItems.length === 0)
            text2 += `
${theme.fg("muted", "(no output)")}`;
          else
            text2 += `
${renderDisplayItems(displayItems, 5)}`;
        }
        const usageStr = formatUsageStats(aggregateUsage(details.results));
        if (usageStr)
          text2 += `

${theme.fg("dim", `Total: ${usageStr}`)}`;
        text2 += `
${theme.fg("muted", "(Ctrl+O to expand)")}`;
        return new Text(text2, 0, 0);
      }
      if (details.mode === "parallel") {
        const running = details.results.filter((r) => r.exitCode === -1).length;
        const successCount = details.results.filter((r) => r.exitCode !== -1 && !isFailedResult(r)).length;
        const failCount = details.results.filter((r) => r.exitCode !== -1 && isFailedResult(r)).length;
        const isRunning = running > 0;
        const icon = isRunning ? theme.fg("warning", "\u23F3") : failCount > 0 ? theme.fg("warning", "\u25D0") : theme.fg("success", "\u2713");
        const status = isRunning ? `${successCount + failCount}/${details.results.length} done, ${running} running` : `${successCount}/${details.results.length} tasks`;
        if (expanded && !isRunning) {
          const container = new Container();
          container.addChild(new Text(`${icon} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`, 0, 0));
          for (const r of details.results) {
            const rIcon = isFailedResult(r) ? theme.fg("error", "\u2717") : theme.fg("success", "\u2713");
            const displayItems = getDisplayItems(r.messages, r.output);
            const finalOutput = getSuccessfulResultOutput(r);
            container.addChild(new Spacer(1));
            container.addChild(new Text(`${theme.fg("muted", "\u2500\u2500\u2500 ") + theme.fg("accent", r.agent)} ${rIcon}`, 0, 0));
            container.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", r.task), 0, 0));
            for (const item of displayItems) {
              if (item.type === "toolCall") {
                container.addChild(new Text(theme.fg("muted", "\u2192 ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)), 0, 0));
              }
            }
            if (finalOutput) {
              container.addChild(new Spacer(1));
              container.addChild(new Markdown(finalOutput.trim(), 0, 0, mdTheme));
            }
            const taskUsage = formatUsageStats(r.usage, r.model);
            if (taskUsage)
              container.addChild(new Text(theme.fg("dim", taskUsage), 0, 0));
          }
          const usageStr = formatUsageStats(aggregateUsage(details.results));
          if (usageStr) {
            container.addChild(new Spacer(1));
            container.addChild(new Text(theme.fg("dim", `Total: ${usageStr}`), 0, 0));
          }
          return container;
        }
        let text2 = `${icon} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`;
        for (const r of details.results) {
          const rIcon = r.exitCode === -1 ? theme.fg("warning", "\u23F3") : isFailedResult(r) ? theme.fg("error", "\u2717") : theme.fg("success", "\u2713");
          const displayItems = getDisplayItems(r.messages, r.output);
          text2 += `

${theme.fg("muted", "\u2500\u2500\u2500 ")}${theme.fg("accent", r.agent)} ${rIcon}`;
          if (displayItems.length === 0)
            text2 += `
${theme.fg("muted", r.exitCode === -1 ? "(running...)" : "(no output)")}`;
          else
            text2 += `
${renderDisplayItems(displayItems, 5)}`;
        }
        if (!isRunning) {
          const usageStr = formatUsageStats(aggregateUsage(details.results));
          if (usageStr)
            text2 += `

${theme.fg("dim", `Total: ${usageStr}`)}`;
        }
        if (!expanded)
          text2 += `
${theme.fg("muted", "(Ctrl+O to expand)")}`;
        return new Text(text2, 0, 0);
      }
      const text = result.content[0];
      return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
    }
  });
}

// packages/distribution/src/subagents-extension.ts
var bundledAgentsDir = fileURLToPath2(new URL("./agents/", import.meta.url));
function subagentsExtension(pi) {
  registerSubagentExtension(pi, { bundledAgentsDir });
}
export {
  subagentsExtension as default
};
//# sourceMappingURL=subagents-extension.js.map
