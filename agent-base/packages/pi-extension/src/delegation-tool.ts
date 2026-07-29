import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";
import type { AgentToolResult, ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  createSourceCoordinationClient,
  type SessionReporter,
  type SourceCoordinationClient,
  type SourceCoordinationClientOptions,
  type SourceTaskSnapshot,
  type SourceTaskState,
} from "@agent-hub/client";

const id = () => Type.String({ minLength: 1, maxLength: 256 });
const DelegatedTaskParameters = Type.Union([
  Type.Object({
    action: StringEnum(["send"] as const),
    targetId: id(),
    instruction: Type.String({ minLength: 1, maxLength: 65_536 }),
    deadlineMinutes: Type.Optional(Type.Integer({ minimum: 1, maximum: 1_440 })),
  }, { additionalProperties: false }),
  Type.Object({ action: StringEnum(["watch"] as const), taskId: id() }, { additionalProperties: false }),
  Type.Object({ action: StringEnum(["cancel"] as const), taskId: id() }, { additionalProperties: false }),
]);

type DelegatedTaskParameters = Static<typeof DelegatedTaskParameters>;
export type SourceCoordinationClientFactory = (options: SourceCoordinationClientOptions) => SourceCoordinationClient;

export function createDelegatedTaskTool(
  resolveReporter: () => SessionReporter | undefined,
  createClient: SourceCoordinationClientFactory = createSourceCoordinationClient,
  now: () => number = () => Date.now(),
): ToolDefinition<typeof DelegatedTaskParameters, SourceTaskSnapshot> {
  return {
    name: "delegate_task",
    label: "Delegate Task",
    description:
      "Send text work to exactly one delivery-capable local Pi session, take one bounded task snapshot, or explicitly " +
      "request cancellation. Use deliveryTargetId from query_active_sessions; coordinator URLs are never accepted.",
    promptSnippet:
      "delegate_task → send work to one deliveryTargetId, watch one task snapshot, or explicitly cancel a delegated task.",
    parameters: DelegatedTaskParameters,
    async execute(_toolCallId, params, signal, _onUpdate, _ctx): Promise<AgentToolResult<SourceTaskSnapshot>> {
      const reporter = resolveReporter();
      if (!reporter?.sessionId || !reporter.coordinationBaseUrl || !reporter.taskCapability) {
        throw new Error("Coordination unavailable; session registration will retry in the background.");
      }

      try {
        // Resolve all connection details at execution time. Reporter recovery may
        // rotate every one of these values between tool invocations.
        const client = createClient({
          baseUrl: reporter.coordinationBaseUrl,
          taskCapability: reporter.taskCapability,
        });
        let result: SourceTaskSnapshot;
        if (params.action === "send") {
          result = await client.send({
            targetId: params.targetId,
            instruction: params.instruction,
            ...(params.deadlineMinutes === undefined
              ? {}
              : { deadline: new Date(now() + params.deadlineMinutes * 60_000).toISOString() }),
          }, signal);
        } else if (params.action === "watch") {
          result = await client.watch(params.taskId, signal);
        } else {
          result = await client.cancel(params.taskId, signal);
        }
        const compact = compactSnapshot(result);
        return {
          content: [{ type: "text", text: JSON.stringify(compact) }],
          details: compact,
        };
      } catch {
        // SDK/network errors are intentionally not forwarded: they may contain
        // request internals. In particular, never interpolate reporter credentials.
        throw new Error(`Delegated task ${params.action} failed.`);
      }
    },
  } satisfies ToolDefinition<typeof DelegatedTaskParameters, SourceTaskSnapshot>;
}

function compactSnapshot(value: SourceTaskSnapshot): SourceTaskSnapshot {
  const states = new Set<SourceTaskState>([
    "submitted", "working", "completed", "failed", "canceled", "rejected", "unknown",
  ]);
  const state = states.has(value.state) ? value.state : "unknown";
  const taskId = opaqueId(value.taskId);
  const contextId = opaqueId(value.contextId);
  return {
    taskId,
    contextId,
    state,
    ...(typeof value.deadline === "string" ? { deadline: truncate(value.deadline, 128) } : {}),
    cancellationRequested: value.cancellationRequested === true,
    ...(typeof value.terminalCode === "string" ? { terminalCode: truncate(value.terminalCode, 128) } : {}),
    ...(typeof value.targetText === "string" ? { targetText: truncate(value.targetText, 8_000) } : {}),
  };
}

function opaqueId(value: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new Error("Delegated task response contains an invalid opaque ID.");
  }
  return value;
}

function truncate(value: string, maxCharacters: number): string {
  return typeof value === "string" ? value.slice(0, maxCharacters) : "";
}
