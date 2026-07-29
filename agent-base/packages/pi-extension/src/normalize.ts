import type { AssistantMessage, StopReason, UserMessage } from "@earendil-works/pi-ai";
import type { ActivitySummaryEvent, NormalizedEvent, Snapshot } from "@agent-hub/contracts";
import type { ExtensionContext, SessionEntry, SessionMessageEntry } from "@earendil-works/pi-coding-agent";
import { INBOUND_TASK_PROMPT_PREFIX } from "./inbound-delivery.js";

type ReadonlySessionManager = ExtensionContext["sessionManager"];
type AgentMessage = SessionMessageEntry["message"];

interface MessageIdentity {
  eventId: string;
  sequence: number;
}

const STOP_ERROR_REASONS: ReadonlySet<StopReason> = new Set(["error", "aborted"]);

export function normalizeMessage(message: AgentMessage, identity: MessageIdentity): NormalizedEvent[] {
  if (isUserMessage(message)) {
    const text = visibleText(message.content);
    if (!text) {
      return [];
    }

    return [
      {
        type: "message.user",
        eventId: identity.eventId,
        sequence: identity.sequence,
        timestamp: normalizeTimestamp(message.timestamp),
        text,
      },
    ];
  }

  if (isAssistantMessage(message)) {
    const text = visibleText(message.content);
    if (!text) {
      return [];
    }

    const event: NormalizedEvent = {
      type: "message.assistant",
      eventId: identity.eventId,
      sequence: identity.sequence,
      timestamp: normalizeTimestamp(message.timestamp),
      text,
      stopStatus: message.stopReason ?? "stop",
    };

    if (STOP_ERROR_REASONS.has(message.stopReason) || message.errorMessage) {
      event.error = true;
    }

    return [event];
  }

  return [];
}

export function buildCurrentBranchSnapshot(sessionManager: Pick<ReadonlySessionManager, "getBranch">): Snapshot {
  const entries = sessionManager.getBranch?.() ?? [];
  const events: NormalizedEvent[] = [];
  let nextSequence = 1;
  let insideInboundTaskTurn = false;

  for (const entry of entries) {
    if (!isMessageEntry(entry)) {
      continue;
    }
    if (isUserMessage(entry.message)) {
      const text = visibleText(entry.message.content);
      if (text.startsWith(INBOUND_TASK_PROMPT_PREFIX)) {
        insideInboundTaskTurn = true;
        continue;
      }
      insideInboundTaskTurn = false;
    } else if (!isAssistantMessage(entry.message)) {
      continue;
    }
    if (insideInboundTaskTurn) {
      continue;
    }

    const normalized = normalizeMessage(entry.message, {
      eventId: entry.id,
      sequence: nextSequence,
    });

    if (normalized.length === 0) {
      continue;
    }

    events.push(...normalized);
    nextSequence += normalized.length;
  }

  return { lastSequence: Math.max(0, nextSequence - 1), events };
}

function visibleText(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .filter((block): block is { type: "text"; text: string } => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

function normalizeTimestamp(value: number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  return Date.now();
}

function isMessageEntry(entry: SessionEntry): entry is SessionMessageEntry {
  return entry.type === "message";
}

function isUserMessage(message: AgentMessage): message is UserMessage {
  return message.role === "user";
}

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
  return message.role === "assistant";
}

export function normalizeActivitySummary(input: {
  eventId: string;
  sequence: number;
  timestamp: number;
  summary: string;
}): ActivitySummaryEvent {
  const summary = input.summary.trim().slice(0, 240);
  if (!summary) throw new Error("Activity summary must not be empty");
  return {
    type: "activity.summary",
    eventId: input.eventId,
    sequence: input.sequence,
    timestamp: input.timestamp,
    summary,
    safeForMonitor: true,
  };
}
