import type {
  AgentSettledEvent,
  AgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
  MessageEndEvent,
  SessionInfoChangedEvent,
  SessionTreeEvent,
  SessionShutdownEvent,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
} from "@earendil-works/pi-coding-agent";
import type {
  NormalizedEvent,
  SessionMetadata,
  SessionState,
  Snapshot,
} from "@agent-hub/contracts";
import { createSessionReporter, createSourceCoordinationClient } from "@agent-hub/client";
import type { SessionReporter } from "@agent-hub/client";
import type { SessionEntry, SessionMessageEntry } from "@earendil-works/pi-coding-agent";
import { buildCurrentBranchSnapshot, normalizeMessage } from "./normalize.js";
import { createQueryActiveSessionsTool } from "./tool.js";
import { createDelegatedTaskTool, type SourceCoordinationClientFactory } from "./delegation-tool.js";
import { registerPiCoordinationApi } from "./coordination-api.js";
import {
  createCoordinationClient,
  PiInboundDelivery,
  type CoordinationClientFactory,
} from "./inbound-delivery.js";

const ADAPTER_NAME = "pi";
const ADAPTER_VERSION = "0.1.0";
type ReadonlySessionManager = ExtensionContext["sessionManager"];
type AgentMessage = SessionMessageEntry["message"];

export interface AdapterDependencies {
  createReporter?: typeof createSessionReporter;
  createCoordinationTransport?: CoordinationClientFactory;
  createSourceCoordinationClient?: SourceCoordinationClientFactory;
  now?: () => number;
}

export function registerPiAdapter(pi: ExtensionAPI, dependencies: AdapterDependencies = {}): void {
  const now = dependencies.now ?? (() => Date.now());
  let reporter: SessionReporter | undefined;
  let inboundDelivery: PiInboundDelivery | undefined;
  let sessionManager: ReadonlySessionManager | undefined;
  let nextSequence = 1;
  let currentState: SessionState = "idle";
  let reporterStartPromise: Promise<void> | undefined;
  const toolStarts = new Map<string, number>();
  let fallbackEventCounter = 0;

  pi.registerTool(createQueryActiveSessionsTool(() => reporter));
  pi.registerTool(createDelegatedTaskTool(
    () => reporter,
    dependencies.createSourceCoordinationClient ?? createSourceCoordinationClient,
    now,
  ));
  const unregisterCoordinationApi = registerPiCoordinationApi(
    pi,
    () => reporter,
    dependencies.createSourceCoordinationClient ?? createSourceCoordinationClient,
    now,
  );

  pi.on("session_start", async (_event, ctx) => {
    fallbackEventCounter = 0;
    sessionManager = ctx.sessionManager;
    reporterStartPromise = startReporter(ctx).catch(() => undefined);
  });

  pi.on("session_shutdown", async (_event, _ctx) => {
    unregisterCoordinationApi();
    await reporterStartPromise;
    await stopInboundDelivery();
    await stopReporter();
    sessionManager = undefined;
    toolStarts.clear();
    nextSequence = 1;
    currentState = "idle";
  });

  pi.on("message_end", (event, ctx) => {
    sessionManager = ctx.sessionManager;
    const isInboundTaskMessage = inboundDelivery?.onMessage(event.message, ctx) ?? false;
    if (isInboundTaskMessage || !reporter || !sessionManager) {
      return;
    }
    const entryId = resolveMessageEntryId(ctx.sessionManager, event.message, () => fallbackEventCounter++);
    const normalized = normalizeMessage(event.message, {
      eventId: entryId,
      sequence: nextSequence,
    });
    if (normalized.length === 0) {
      return;
    }
    nextSequence += normalized.length;
    const activeReporter = reporter;
    normalized.forEach((item) => activeReporter.enqueue(item));
  });

  pi.on("tool_execution_start", (event, ctx) => {
    sessionManager = ctx.sessionManager;
    if (!reporter || !sessionManager) {
      return;
    }
    const startedAt = now();
    toolStarts.set(event.toolCallId, startedAt);
    reporter.enqueue({
      type: "tool.activity",
      eventId: `${event.toolCallId}:start`,
      sequence: nextSequence++,
      timestamp: startedAt,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      status: "running",
      startedAt,
    });
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    sessionManager = ctx.sessionManager;
    if (!reporter || !sessionManager) {
      return;
    }
    const startedAt = toolStarts.get(event.toolCallId) ?? now();
    toolStarts.delete(event.toolCallId);
    const finishedAt = now();
    reporter.enqueue({
      type: "tool.activity",
      eventId: `${event.toolCallId}:end`,
      sequence: nextSequence++,
      timestamp: finishedAt,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      status: event.isError ? "failed" : "succeeded",
      startedAt,
      endedAt: finishedAt,
    });
    await inboundDelivery?.onProgressBoundary(ctx);
  });

  pi.on("agent_start", (_event: AgentStartEvent, ctx) => {
    sessionManager = ctx.sessionManager;
    inboundDelivery?.onAgentStart(ctx);
    recordStateEvent("running", ctx);
  });

  pi.on("agent_settled", async (_event: AgentSettledEvent, ctx) => {
    sessionManager = ctx.sessionManager;
    recordStateEvent("idle", ctx);
    await inboundDelivery?.onAgentSettled(ctx);
  });

  pi.on("session_info_changed", (event: SessionInfoChangedEvent, ctx) => {
    sessionManager = ctx.sessionManager;
    const name = event.name === undefined ? null : event.name;
    updateMetadata({ name });
  });

  pi.on("session_tree", (_event: SessionTreeEvent, ctx) => {
    sessionManager = ctx.sessionManager;
    refreshSnapshot();
    reporter?.replaceSnapshot();
  });

  function buildMetadata(ctx: ExtensionContext): SessionMetadata {
    const manager = ctx.sessionManager;
    const metadata: SessionMetadata = {
      adapter: ADAPTER_NAME,
      adapterVersion: ADAPTER_VERSION,
      harnessSessionId: manager.getSessionId?.(),
      cwd: manager.getCwd?.() ?? ctx.cwd,
      processId: process.pid,
      startedAt: now(),
      state: currentState,
      acceptsTaskDelivery: typeof pi.sendUserMessage === "function",
    };
    const name = manager.getSessionName?.();
    if (name) {
      metadata.name = name;
    }
    return metadata;
  }

  async function startReporter(ctx: ExtensionContext): Promise<void> {
    if (reporter) {
      await stopReporter();
    }
    const metadata = buildMetadata(ctx);
    const snapshotProvider = (): Snapshot => refreshSnapshot();
    const factory = dependencies.createReporter ?? createSessionReporter;
    const instance = factory({ metadata, snapshotProvider });
    reporter = instance;
    refreshSnapshot();
    if (typeof pi.sendUserMessage !== "function") {
      await instance.start();
      return;
    }
    const coordinationFactory = dependencies.createCoordinationTransport ?? createCoordinationClient;
    let clientKey: string | undefined;
    let client: ReturnType<CoordinationClientFactory> | undefined;
    const delivery = new PiInboundDelivery(pi, ctx, () => {
      const currentBaseUrl = instance.coordinationBaseUrl;
      const currentSessionId = instance.sessionId;
      const currentTaskCapability = instance.taskCapability;
      if (!currentBaseUrl || !currentSessionId || !currentTaskCapability) return undefined;
      const key = `${currentBaseUrl}\n${currentSessionId}\n${currentTaskCapability}`;
      if (key !== clientKey) {
        client = coordinationFactory({
          baseUrl: currentBaseUrl,
          sessionId: currentSessionId,
          taskCapability: currentTaskCapability,
        });
        clientKey = key;
      }
      return client;
    });
    inboundDelivery = delivery;
    delivery.start();
    await instance.start();
  }

  async function stopInboundDelivery(): Promise<void> {
    const delivery = inboundDelivery;
    inboundDelivery = undefined;
    await delivery?.stop();
  }

  async function stopReporter(): Promise<void> {
    if (!reporter) {
      reporterStartPromise = undefined;
      return;
    }
    const closing = reporter;
    reporter = undefined;
    try {
      await closing.close();
    } catch {
      /* ignore close errors */
    } finally {
      reporterStartPromise = undefined;
    }
  }

  function refreshSnapshot(): Snapshot {
    if (!sessionManager) {
      nextSequence = 1;
      return { lastSequence: 0, events: [] };
    }
    const snapshot = buildCurrentBranchSnapshot(sessionManager);
    nextSequence = snapshot.lastSequence + 1;
    return snapshot;
  }

  function recordStateEvent(state: SessionState, ctx: ExtensionContext): void {
    currentState = state;
    updateMetadata({ state });
    if (!reporter || !sessionManager) {
      return;
    }
    const sessionId = ctx.sessionManager.getSessionId?.() ?? "session";
    reporter.enqueue({
      type: "session.state",
      eventId: `${sessionId}:state:${state}:${nextSequence}`,
      sequence: nextSequence++,
      timestamp: now(),
      state,
    });
  }

  function updateMetadata(patch: { state?: SessionState; name?: string | null } = {}): void {
    if (!reporter) {
      if (patch.state) {
        currentState = patch.state;
      }
      return;
    }
    if (patch.state) {
      currentState = patch.state;
    }
    const payload: { state: SessionState; lastActivityAt: number; name?: string | null } = {
      state: patch.state ?? currentState,
      lastActivityAt: now(),
    };
    if (Object.prototype.hasOwnProperty.call(patch, "name")) {
      payload.name = patch.name ?? null;
    }
    reporter.updateMetadata(payload);
  }
}

function resolveMessageEntryId(
  sessionManager: ReadonlySessionManager,
  message: AgentMessage,
  nextFallbackCounter: () => number,
): string {
  const leaf = sessionManager.getLeafEntry?.();
  if (isMessageEntry(leaf) && leaf.message === message) {
    return leaf.id;
  }
  const branch = sessionManager.getBranch?.();
  if (Array.isArray(branch)) {
    for (let i = branch.length - 1; i >= 0; i -= 1) {
      const entry = branch[i];
      if (isMessageEntry(entry) && entry.message === message) {
        return entry.id;
      }
    }
  }
  const fallbackSessionId = sessionManager.getSessionId?.() ?? "session";
  const timestamp = typeof message.timestamp === "number" && Number.isFinite(message.timestamp)
    ? Math.max(0, Math.trunc(message.timestamp))
    : Date.now();
  const counter = nextFallbackCounter();
  return `${fallbackSessionId}:entry:${timestamp}:${counter}`;
}

function isMessageEntry(entry: SessionEntry | undefined): entry is SessionMessageEntry {
  return Boolean(entry && entry.type === "message");
}
