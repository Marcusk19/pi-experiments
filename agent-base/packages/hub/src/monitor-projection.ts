import { basename } from "node:path";
import type {
  MonitorCompleteness,
  MonitorSessionDetail,
  MonitorSessionSummary,
  MonitorSnapshot,
  MonitorState,
  MonitorTimelineEntry,
  MonitorToolDetail,
  MonitorTaskDetail,
} from "@agent-hub/contracts";
import { MONITOR_API_VERSION } from "@agent-hub/contracts";
import type { Clock } from "./clock.js";
import type { HubStore, SessionRow, MonitorToolState } from "./store.js";
import type { TaskStore } from "./coordination/task-store.js";
import type { MonitorIdentity } from "./monitor-identity.js";

export const MAX_MONITOR_SESSIONS = 500;
export const MAX_MONITOR_TOOLS = 50;
export const MAX_MONITOR_TASKS = 50;
export const MAX_MONITOR_TIMELINE = 100;

export interface MonitorProjectionOptions {
  hub: HubStore;
  tasks: TaskStore;
  clock: Clock;
  identity: MonitorIdentity;
  daemonId: string;
  startedAt: number;
  revision: () => number;
}

export class MonitorProjection {
  private readonly options: MonitorProjectionOptions;

  constructor(options: MonitorProjectionOptions) {
    this.options = options;
  }

  snapshot(): MonitorSnapshot {
    const sessions = this.options.hub.listSessionRows({ limit: MAX_MONITOR_SESSIONS + 1 });
    const totalSessions = this.options.hub.countSessions();
    const truncated = totalSessions > MAX_MONITOR_SESSIONS;
    const bounded = sessions.slice(0, MAX_MONITOR_SESSIONS);

    const summaries = bounded.map((session) => this.projectSummary(session));
    summaries.sort((a, b) => {
      const aAttention = a.attentionReasons.length > 0 ? 0 : 1;
      const bAttention = b.attentionReasons.length > 0 ? 0 : 1;
      if (aAttention !== bAttention) return aAttention - bAttention;
      const stateOrder = { running: 0, waiting: 1, idle: 2 };
      const aState = stateOrder[a.state];
      const bState = stateOrder[b.state];
      if (aState !== bState) return aState - bState;
      if (a.activitySince !== b.activitySince) return b.activitySince - a.activitySince;
      return a.monitorId.localeCompare(b.monitorId);
    });

    return {
      apiVersion: MONITOR_API_VERSION,
      revision: this.options.revision(),
      generatedAt: this.options.clock.now(),
      daemonId: this.options.daemonId,
      startedAt: this.options.startedAt,
      totalSessions,
      truncated,
      sessions: summaries,
    };
  }

  detail(monitorId: string): MonitorSessionDetail | undefined {
    const sessions = this.options.hub.listSessionRows({ limit: MAX_MONITOR_SESSIONS });
    const sessionIds = sessions.map((s) => s.id);
    const sessionId = this.options.identity.resolve(monitorId, sessionIds);
    if (!sessionId) return undefined;

    const session = this.options.hub.getSession(sessionId);
    if (!session) return undefined;

    const summary = this.options.hub.latestActivitySummary(sessionId);
    const allTools = this.options.hub.monitorToolStates(sessionId, MAX_MONITOR_TOOLS + 1);
    const toolsTruncated = allTools.length > MAX_MONITOR_TOOLS;
    const tools = allTools.slice(0, MAX_MONITOR_TOOLS);

    const allTasks = this.options.tasks.listTasksForSession(sessionId, MAX_MONITOR_TASKS + 1);
    const tasksTruncated = allTasks.length > MAX_MONITOR_TASKS;
    const tasks = allTasks.slice(0, MAX_MONITOR_TASKS);

    const state = this.deriveState(session, tasks);
    const attentionReasons = this.deriveAttention(session, tools);
    const activitySummary = this.deriveActivitySummary(summary, session, tools, tasks);

    const timeline = this.buildTimeline(session, summary, tools);

    return {
      apiVersion: MONITOR_API_VERSION,
      monitorId,
      displayName: boundString(session.metadata.name ?? workspaceFor(session.metadata.cwd), 128),
      adapter: boundString(session.metadata.adapter, 64),
      adapterVersion: boundString(session.metadata.adapterVersion, 64),
      cwd: boundString(session.metadata.cwd, 4096),
      workspace: boundString(workspaceFor(session.metadata.cwd), 160),
      state,
      activitySummary,
      startedAt: session.metadata.startedAt,
      lastActivityAt: session.lastActivityAt,
      attentionReasons,
      tools: tools.map((t): MonitorToolDetail => ({
        toolCallId: t.toolCallId,
        toolName: t.toolName,
        status: t.status,
        startedAt: t.startedAt,
        ...(t.endedAt !== undefined ? { endedAt: t.endedAt } : {}),
      })),
      tasks: tasks.map((t): MonitorTaskDetail => ({
        taskId: t.id,
        role: t.role,
        state: t.state,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      timeline,
      completeness: {
        activity: summary ? "complete" : "unavailable",
        attention: attentionReasons.length <= 8 ? "complete" : "truncated",
        tools: toolsTruncated ? "truncated" : "complete",
        tasks: tasksTruncated ? "truncated" : "complete",
      },
    };
  }

  private projectSummary(session: SessionRow): MonitorSessionSummary {
    const summary = this.options.hub.latestActivitySummary(session.id);
    const allTools = this.options.hub.monitorToolStates(session.id, MAX_MONITOR_TOOLS + 1);
    const tools = allTools.slice(0, MAX_MONITOR_TOOLS);
    const allTasks = this.options.tasks.listTasksForSession(session.id, MAX_MONITOR_TASKS + 1);
    const tasks = allTasks.slice(0, MAX_MONITOR_TASKS);
    const state = this.deriveState(session, tasks);
    const attentionReasons = this.deriveAttention(session, tools);
    const activitySummary = this.deriveActivitySummary(summary, session, tools, tasks);

    const activeTask = tasks.find(
      (t) => t.role === "target" && (t.state === "submitted" || t.state === "working"),
    );

    return {
      monitorId: this.options.identity.forSession(session.id),
      displayName: boundString(session.metadata.name ?? workspaceFor(session.metadata.cwd), 128),
      adapter: boundString(session.metadata.adapter, 64),
      workspace: boundString(workspaceFor(session.metadata.cwd), 160),
      state,
      activitySummary,
      activitySince: session.lastActivityAt,
      attentionReasons: attentionReasons.slice(0, 8),
      activeToolCount: tools.filter((t) => t.status === "running").length,
      ...(activeTask ? { activeTaskState: activeTask.state as "submitted" | "working" } : {}),
      completeness: {
        activity: summary ? "complete" : "unavailable",
        attention: attentionReasons.length <= 8 ? "complete" : "truncated",
        tools: allTools.length > MAX_MONITOR_TOOLS ? "truncated" : "complete",
        tasks: allTasks.length > MAX_MONITOR_TASKS ? "truncated" : "complete",
      },
    };
  }

  private deriveState(
    session: SessionRow,
    tasks: Array<{ role: string; state: string }>,
  ): MonitorState {
    if (session.state === "running") return "running";
    const hasActiveTargetTask = tasks.some(
      (t) => t.role === "target" && (t.state === "submitted" || t.state === "working"),
    );
    if (hasActiveTargetTask) return "waiting";
    return "idle";
  }

  private deriveAttention(
    session: SessionRow,
    tools: MonitorToolState[],
  ): string[] {
    const reasons: string[] = [];
    const failedTools = tools.filter((t) => t.status === "failed");
    if (failedTools.length > 0) {
      reasons.push(`Failed tool: ${boundString(failedTools[0]!.toolName, 100)}`);
    }
    const runningTools = tools.filter((t) => t.status === "running");
    const longRunning = runningTools.filter(
      (t) => this.options.clock.now() - t.startedAt > 120_000,
    );
    if (longRunning.length > 0) {
      reasons.push(`Long-running tool: ${boundString(longRunning[0]!.toolName, 100)}`);
    }
    return reasons.slice(0, 8);
  }

  private deriveActivitySummary(
    summary: import("@agent-hub/contracts").ActivitySummaryEvent | undefined,
    session: SessionRow,
    tools: MonitorToolState[],
    tasks: Array<{ role: string; state: string }>,
  ): string {
    if (summary) return boundString(summary.summary, 240);

    const runningTools = tools.filter((t) => t.status === "running");
    if (runningTools.length > 0) {
      return boundString(`Running \`${runningTools[0]!.toolName}\``, 240);
    }

    if (session.state === "running") return "Assistant responding";

    const hasActiveTargetTask = tasks.some(
      (t) => t.role === "target" && (t.state === "submitted" || t.state === "working"),
    );
    if (hasActiveTargetTask) return "Waiting on delegated task";

    return "Idle";
  }

  private buildTimeline(
    session: SessionRow,
    summary: import("@agent-hub/contracts").ActivitySummaryEvent | undefined,
    tools: MonitorToolState[],
  ): MonitorTimelineEntry[] {
    const entries: MonitorTimelineEntry[] = [];

    if (summary) {
      entries.push({
        timestamp: summary.timestamp,
        category: "activity.summary",
        label: boundString(summary.summary, 240),
      });
    }

    for (const tool of tools) {
      if (tool.status === "running") {
        entries.push({
          timestamp: tool.startedAt,
          category: "tool.started",
          label: tool.toolName,
        });
      } else {
        entries.push({
          timestamp: tool.endedAt ?? tool.startedAt,
          category: tool.status === "succeeded" ? "tool.succeeded" : "tool.failed",
          label: tool.toolName,
        });
      }
    }

    entries.sort((a, b) => b.timestamp - a.timestamp);
    return entries.slice(0, MAX_MONITOR_TIMELINE);
  }
}

function workspaceFor(cwd: string): string {
  return basename(cwd) || cwd;
}

function boundString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength - 1) + "…";
}
