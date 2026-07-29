import { Type, type Static } from "typebox";

const strict = { additionalProperties: false } as const;
const eventBase = {
  eventId: Type.String({ minLength: 1, maxLength: 128 }),
  sequence: Type.Integer({ minimum: 1 }),
  timestamp: Type.Integer({ minimum: 0 }),
};

export const SessionStateSchema = Type.Union([Type.Literal("idle"), Type.Literal("running")]);
export type SessionState = Static<typeof SessionStateSchema>;

export const SessionMetadataSchema = Type.Object({
  adapter: Type.String({ minLength: 1, maxLength: 64 }),
  adapterVersion: Type.String({ minLength: 1, maxLength: 64 }),
  harnessSessionId: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
  cwd: Type.String({ minLength: 1, maxLength: 4096 }),
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
  processId: Type.Integer({ minimum: 1 }),
  startedAt: Type.Integer({ minimum: 0 }),
  state: SessionStateSchema,
  acceptsTaskDelivery: Type.Boolean(),
}, strict);
export type SessionMetadata = Static<typeof SessionMetadataSchema>;

const UserMessageEvent = Type.Object({ ...eventBase, type: Type.Literal("message.user"), text: Type.String({ maxLength: 65_536 }) }, strict);
const AssistantMessageEvent = Type.Object({
  ...eventBase,
  type: Type.Literal("message.assistant"),
  text: Type.String({ maxLength: 65_536 }),
  stopStatus: Type.Union([Type.Literal("stop"), Type.Literal("length"), Type.Literal("toolUse"), Type.Literal("error"), Type.Literal("aborted")]),
  error: Type.Optional(Type.Boolean()),
}, strict);
const ToolActivityEvent = Type.Object({
  ...eventBase,
  type: Type.Literal("tool.activity"),
  toolCallId: Type.String({ minLength: 1, maxLength: 256 }),
  toolName: Type.String({ minLength: 1, maxLength: 256 }),
  status: Type.Union([Type.Literal("running"), Type.Literal("succeeded"), Type.Literal("failed")]),
  startedAt: Type.Integer({ minimum: 0 }),
  endedAt: Type.Optional(Type.Integer({ minimum: 0 })),
}, strict);
const SessionStateEvent = Type.Object({ ...eventBase, type: Type.Literal("session.state"), state: SessionStateSchema }, strict);
const ActivitySummaryEvent = Type.Object({
  ...eventBase,
  type: Type.Literal("activity.summary"),
  summary: Type.String({ minLength: 1, maxLength: 240 }),
  safeForMonitor: Type.Literal(true),
}, strict);
export type ActivitySummaryEvent = Static<typeof ActivitySummaryEvent>;

export const NormalizedEventSchema = Type.Union([UserMessageEvent, AssistantMessageEvent, ToolActivityEvent, SessionStateEvent, ActivitySummaryEvent]);
export type NormalizedEvent = Static<typeof NormalizedEventSchema>;

export const SnapshotSchema = Type.Object({
  lastSequence: Type.Integer({ minimum: 0 }),
  events: Type.Array(NormalizedEventSchema, { maxItems: 10_000 }),
}, strict);
export type Snapshot = Static<typeof SnapshotSchema>;
