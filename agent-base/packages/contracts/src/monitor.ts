import { Type, type Static } from "typebox";

export const MONITOR_API_VERSION = "monitor/v1" as const;

export const MonitorStateSchema = Type.Union([
  Type.Literal("running"),
  Type.Literal("waiting"),
  Type.Literal("idle"),
]);
export type MonitorState = Static<typeof MonitorStateSchema>;

export const MonitorCompletenessSchema = Type.Union([
  Type.Literal("complete"),
  Type.Literal("unavailable"),
  Type.Literal("truncated"),
]);
export type MonitorCompleteness = Static<typeof MonitorCompletenessSchema>;

export const MonitorSessionSummarySchema = Type.Object({
  monitorId: Type.String({ pattern: "^[0-9a-f]{32}$" }),
  displayName: Type.String({ minLength: 1, maxLength: 128 }),
  adapter: Type.String({ minLength: 1, maxLength: 64 }),
  workspace: Type.String({ minLength: 1, maxLength: 160 }),
  state: MonitorStateSchema,
  activitySummary: Type.String({ minLength: 1, maxLength: 240 }),
  activitySince: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  attentionReasons: Type.Array(
    Type.String({ minLength: 1, maxLength: 120 }),
    { maxItems: 8 },
  ),
  activeToolCount: Type.Integer({ minimum: 0 }),
  activeTaskState: Type.Optional(
    Type.Union([Type.Literal("submitted"), Type.Literal("working")]),
  ),
  completeness: Type.Object({
    activity: MonitorCompletenessSchema,
    attention: MonitorCompletenessSchema,
    tools: MonitorCompletenessSchema,
    tasks: MonitorCompletenessSchema,
  }),
});
export type MonitorSessionSummary = Static<typeof MonitorSessionSummarySchema>;

export const MonitorSnapshotSchema = Type.Object({
  apiVersion: Type.Literal(MONITOR_API_VERSION),
  revision: Type.Integer({ minimum: 0 }),
  generatedAt: Type.Integer({ minimum: 0 }),
  daemonId: Type.String({ minLength: 1 }),
  startedAt: Type.Integer({ minimum: 0 }),
  totalSessions: Type.Integer({ minimum: 0 }),
  truncated: Type.Boolean(),
  sessions: Type.Array(MonitorSessionSummarySchema, { maxItems: 500 }),
});
export type MonitorSnapshot = Static<typeof MonitorSnapshotSchema>;

export const MonitorToolDetailSchema = Type.Object({
  toolCallId: Type.String({ minLength: 1, maxLength: 256 }),
  toolName: Type.String({ minLength: 1, maxLength: 256 }),
  status: Type.Union([
    Type.Literal("running"),
    Type.Literal("succeeded"),
    Type.Literal("failed"),
  ]),
  startedAt: Type.Integer({ minimum: 0 }),
  endedAt: Type.Optional(Type.Integer({ minimum: 0 })),
});
export type MonitorToolDetail = Static<typeof MonitorToolDetailSchema>;

export const MonitorTaskDetailSchema = Type.Object({
  taskId: Type.String({ minLength: 1 }),
  role: Type.Union([Type.Literal("source"), Type.Literal("target")]),
  state: Type.Union([
    Type.Literal("submitted"),
    Type.Literal("working"),
    Type.Literal("completed"),
    Type.Literal("failed"),
    Type.Literal("canceled"),
    Type.Literal("rejected"),
  ]),
  createdAt: Type.Integer({ minimum: 0 }),
  updatedAt: Type.Integer({ minimum: 0 }),
});
export type MonitorTaskDetail = Static<typeof MonitorTaskDetailSchema>;

export const MonitorTimelineEntrySchema = Type.Object({
  timestamp: Type.Integer({ minimum: 0 }),
  category: Type.String({ minLength: 1, maxLength: 64 }),
  label: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
});
export type MonitorTimelineEntry = Static<typeof MonitorTimelineEntrySchema>;

export const MonitorSessionDetailSchema = Type.Object({
  apiVersion: Type.Literal(MONITOR_API_VERSION),
  monitorId: Type.String({ pattern: "^[0-9a-f]{32}$" }),
  displayName: Type.String({ minLength: 1, maxLength: 128 }),
  adapter: Type.String({ minLength: 1, maxLength: 64 }),
  adapterVersion: Type.String({ minLength: 1, maxLength: 64 }),
  cwd: Type.String({ minLength: 1, maxLength: 4096 }),
  workspace: Type.String({ minLength: 1, maxLength: 160 }),
  state: MonitorStateSchema,
  activitySummary: Type.String({ minLength: 1, maxLength: 240 }),
  startedAt: Type.Integer({ minimum: 0 }),
  lastActivityAt: Type.Integer({ minimum: 0 }),
  attentionReasons: Type.Array(
    Type.String({ minLength: 1, maxLength: 120 }),
    { maxItems: 8 },
  ),
  tools: Type.Array(MonitorToolDetailSchema, { maxItems: 50 }),
  tasks: Type.Array(MonitorTaskDetailSchema, { maxItems: 50 }),
  timeline: Type.Array(MonitorTimelineEntrySchema, { maxItems: 100 }),
  completeness: Type.Object({
    activity: MonitorCompletenessSchema,
    attention: MonitorCompletenessSchema,
    tools: MonitorCompletenessSchema,
    tasks: MonitorCompletenessSchema,
  }),
});
export type MonitorSessionDetail = Static<typeof MonitorSessionDetailSchema>;

export const MonitorDiscoveryRecordSchema = Type.Object({
  endpoint: Type.String({ minLength: 1 }),
  apiVersion: Type.Literal(MONITOR_API_VERSION),
  daemonId: Type.String({ minLength: 1 }),
  startedAt: Type.Integer({ minimum: 0 }),
  capability: Type.String({ pattern: "^[0-9a-f]{64}$" }),
});
export type MonitorDiscoveryRecord = Static<typeof MonitorDiscoveryRecordSchema>;
