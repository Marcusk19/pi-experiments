import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";
import type { QueryResponse } from "@agent-hub/contracts";
import type { SessionReporter } from "@agent-hub/client";
import type { AgentToolResult, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";

const MAX_OUTPUT_CHARACTERS = 40_000;

const uuidPattern = "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";
const QueryParameters = Type.Object({
  query: Type.String({
    minLength: 1,
    maxLength: 2_000,
    description: "The user's natural-language question about active agent sessions",
  }),
  mode: Type.Optional(StringEnum(["overview", "search"] as const)),
  cwd: Type.Optional(Type.String({ maxLength: 4_096 })),
  sessionIds: Type.Optional(Type.Array(Type.String({ pattern: uuidPattern }), { maxItems: 50 })),
  includeCurrentSession: Type.Optional(Type.Boolean({ default: false })),
  maxSessions: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
  maxExcerptsPerSession: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
  maxCharacters: Type.Optional(Type.Integer({ minimum: 1_000, maximum: 40_000 })),
}, { additionalProperties: false });

type QueryParameters = Static<typeof QueryParameters>;

interface CompactEvidence {
  kind: string;
  text: string;
  timestamp: number;
}

interface CompactSession {
  deliveryTargetId?: string;
  name?: string;
  cwd: string;
  state: "idle" | "running";
  lastActivityAt: number;
  attention?: string[];
  transcript?: "truncated";
  evidence?: CompactEvidence[];
}

interface CompactQueryResponse {
  mode: "overview" | "search";
  sessions: CompactSession[];
  truncated: boolean;
}

export function createQueryActiveSessionsTool(
  resolveReporter: () => SessionReporter | undefined,
): ToolDefinition<typeof QueryParameters, CompactQueryResponse> {
  return {
    name: "query_active_sessions",
    label: "Query Active Sessions",
    description:
      "Ask free-form questions about other active agent sessions, current work, potential duplication, blockers, " +
      "errors, or anything else that needs attention before taking action.",
    promptSnippet:
      "query_active_sessions → learn what other pi sessions are doing, their blockers, errors, duplication, or " +
      "anything needing attention before you continue.",
    parameters: QueryParameters,
    async execute(_toolCallId, params, signal, _onUpdate, _ctx): Promise<AgentToolResult<CompactQueryResponse>> {
      const reporter = resolveReporter();
      if (!reporter) {
        throw new Error("Agent Activity Hub unavailable; active session capture will retry in the background.");
      }

      const { includeCurrentSession, ...query } = params;

      try {
        const response = await reporter.query(
          includeCurrentSession ? { ...query, includeCurrentSession: true } : query,
          signal,
        );
        const compact = formatResponse(response, reporter.sessionId);
        return {
          content: [{ type: "text", text: JSON.stringify(compact) }],
          details: compact,
        };
      } catch (error) {
        throw mapQueryError(error);
      }
    },
  } satisfies ToolDefinition<typeof QueryParameters, CompactQueryResponse>;
}

function formatResponse(response: QueryResponse, callerSessionId: string | undefined): CompactQueryResponse {
  const compact: CompactQueryResponse = {
    mode: response.mode,
    sessions: response.sessions.map((session) => ({
      ...(callerSessionId !== undefined && session.metadata.acceptsTaskDelivery && session.sessionId !== callerSessionId
        ? { deliveryTargetId: session.sessionId }
        : {}),
      ...(session.metadata.name ? { name: session.metadata.name } : {}),
      cwd: session.metadata.cwd,
      state: session.metadata.state,
      lastActivityAt: session.lastActivityAt,
      ...(session.signals.length > 0 ? { attention: session.signals } : {}),
      ...(session.transcriptCompleteness === "truncated" ? { transcript: "truncated" as const } : {}),
      ...(session.excerpts.length > 0 ? {
        evidence: session.excerpts.map((excerpt) => ({
          kind: excerpt.kind,
          text: truncateText(excerpt.text, 800),
          timestamp: excerpt.timestamp,
        })),
      } : {}),
    })),
    truncated: response.truncated,
  };

  while (JSON.stringify(compact).length > MAX_OUTPUT_CHARACTERS && compact.sessions.length > 0) {
    compact.sessions.pop();
    compact.truncated = true;
  }
  return compact;
}

function truncateText(text: string, maxCharacters: number): string {
  if (text.length <= maxCharacters) return text;
  return `${text.slice(0, maxCharacters - 1)}…`;
}

function mapQueryError(error: unknown): Error {
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : undefined;
  if (code === "HUB_UNAVAILABLE") {
    return new Error("Agent Activity Hub unavailable; active session capture will retry in the background.");
  }
  if (code === "INCOMPATIBLE_PROTOCOL") {
    return new Error("Agent Activity Hub protocol is incompatible; reload or update the package.");
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error("Failed to query active sessions.");
}
