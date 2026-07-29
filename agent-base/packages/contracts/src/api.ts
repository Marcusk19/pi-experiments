import { Type, type Static } from "typebox";
import { NormalizedEventSchema, SessionMetadataSchema, SessionStateSchema, SnapshotSchema } from "./events.js";

const strict = { additionalProperties: false } as const;
export const UuidSchema = Type.String({ pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$" });
export const TaskCapabilitySchema = Type.String({ pattern: "^[0-9a-f]{64}$" });
export const RegisterSessionRequestSchema = Type.Object({
  metadata: SessionMetadataSchema,
  snapshot: SnapshotSchema,
  launchToken: Type.Optional(TaskCapabilitySchema),
}, strict);
export const RegisterSessionResponseSchema = Type.Object({ sessionId: UuidSchema, leaseExpiresAt: Type.Integer(), taskCapability: TaskCapabilitySchema }, strict);
export const AppendEventsRequestSchema = Type.Object({ expectedSequence: Type.Integer({ minimum: 0 }), events: Type.Array(NormalizedEventSchema, { minItems: 1, maxItems: 100 }) }, strict);
export const SequenceResponseSchema = Type.Object({ acceptedSequence: Type.Integer({ minimum: 0 }) }, strict);
export const HeartbeatRequestSchema = Type.Object({ state: SessionStateSchema, lastActivityAt: Type.Integer({ minimum: 0 }), name: Type.Optional(Type.Union([Type.String({ minLength: 1, maxLength: 512 }), Type.Null()])) }, strict);
export const HeartbeatResponseSchema = Type.Object({ leaseExpiresAt: Type.Integer() }, strict);
export const ReplaceSnapshotRequestSchema = SnapshotSchema;
export const QueryRequestSchema = Type.Object({
  query: Type.String({ minLength: 1, maxLength: 2_000 }),
  mode: Type.Optional(Type.Union([Type.Literal("overview"), Type.Literal("search")])),
  excludeSessionId: Type.Optional(UuidSchema),
  cwd: Type.Optional(Type.String({ maxLength: 4096 })),
  sessionIds: Type.Optional(Type.Array(UuidSchema, { maxItems: 50 })),
  maxSessions: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
  maxExcerptsPerSession: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
  maxCharacters: Type.Optional(Type.Integer({ minimum: 1_000, maximum: 40_000 })),
}, strict);
export const ExcerptSchema = Type.Object({ eventId: Type.String(), kind: Type.String(), text: Type.String(), timestamp: Type.Integer(), score: Type.Optional(Type.Number()) }, strict);
export const QuerySessionSchema = Type.Object({ sessionId: UuidSchema, metadata: SessionMetadataSchema, lastActivityAt: Type.Integer(), transcriptCompleteness: Type.Union([Type.Literal("complete"), Type.Literal("truncated")]), signals: Type.Array(Type.String()), excerpts: Type.Array(ExcerptSchema) }, strict);
export const QueryResponseSchema = Type.Object({ mode: Type.Union([Type.Literal("overview"), Type.Literal("search")]), sessions: Type.Array(QuerySessionSchema), truncated: Type.Boolean() }, strict);
export const HealthResponseSchema = Type.Object({ protocolVersion: Type.Literal(2), pid: Type.Integer(), startedAt: Type.Integer() }, strict);
export const ApiErrorSchema = Type.Object({ error: Type.Object({ code: Type.String(), message: Type.String() }, strict) }, strict);

export type RegisterSessionRequest = Static<typeof RegisterSessionRequestSchema>;
export type RegisterSessionResponse = Static<typeof RegisterSessionResponseSchema>;
export type AppendEventsRequest = Static<typeof AppendEventsRequestSchema>;
export type SequenceResponse = Static<typeof SequenceResponseSchema>;
export type HeartbeatRequest = Static<typeof HeartbeatRequestSchema>;
export type ReplaceSnapshotRequest = Static<typeof ReplaceSnapshotRequestSchema>;
export type QueryRequest = Static<typeof QueryRequestSchema>;
export type QueryResponse = Static<typeof QueryResponseSchema>;
export type HealthResponse = Static<typeof HealthResponseSchema>;
export type ApiError = Static<typeof ApiErrorSchema>;
