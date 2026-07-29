import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type {
  AppendEventsRequest,
  HeartbeatRequest,
  NormalizedEvent,
  RegisterSessionRequest,
  RegisterSessionResponse,
  SequenceResponse,
  Snapshot,
  SessionMetadata,
  SessionState,
} from "@agent-hub/contracts";
import { HubError } from "./errors.js";
import { createDatabase, databaseSizeBytes } from "./schema.js";
import { SystemClock, type Clock } from "./clock.js";

export const LEASE_MS = 45_000;
export const MAX_SESSION_TEXT_BYTES = 10_485_760; // 10 MiB
export const MAX_DATABASE_BYTES = 268_435_456; // 256 MiB

function capabilityDigest(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

function createTaskCapability(): { token: string; digest: Buffer } {
  const token = randomBytes(32).toString("hex");
  return { token, digest: capabilityDigest(token) };
}

export type TranscriptCompleteness = "complete" | "truncated";

export interface SessionRow {
  id: string;
  metadata: SessionMetadata;
  state: SessionState;
  latestSequence: number;
  lastActivityAt: number;
  leaseExpiresAt: number;
  completeness: TranscriptCompleteness;
  textBytes: number;
}

export interface StoredEvent {
  eventId: string;
  sequence: number;
  timestamp: number;
  kind: string;
  payload: NormalizedEvent;
}

export interface SearchHit {
  eventId: string;
  kind: string;
  text: string;
  timestamp: number;
  score: number;
}

export interface ToolState {
  toolCallId: string;
  toolName: string;
  status: "running" | "succeeded" | "failed";
}

type SessionFilters = {
  excludeSessionId?: string;
  cwd?: string;
  sessionIds?: string[];
  limit: number;
};

interface EventInsertResult {
  addedTextBytes: number;
  lastEventTimestamp: number | undefined;
}

export class HubStore {
  private readonly database: DatabaseSync;
  private readonly clock: Clock;
  private readonly leaseMs: number;
  private readonly ownsDatabase: boolean;
  private inTransaction = false;

  private readonly onProjectionChanged: (() => void) | undefined;

  constructor(options?: { clock?: Clock; database?: DatabaseSync; leaseMs?: number; onProjectionChanged?: (() => void) | undefined }) {
    this.clock = options?.clock ?? new SystemClock();
    this.ownsDatabase = options?.database === undefined;
    this.database = options?.database ?? createDatabase();
    this.leaseMs = options?.leaseMs ?? LEASE_MS;
    this.onProjectionChanged = options?.onProjectionChanged;
  }

  register(request: RegisterSessionRequest): RegisterSessionResponse {
    validateSnapshot(request.snapshot);
    const sessionId = randomUUID();
    const now = this.clock.now();
    const leaseExpiresAt = now + this.leaseMs;
    const metadataJson = JSON.stringify(request.metadata);
    const lastActivityAt = deriveLastActivity(request.snapshot, request.metadata.startedAt);
    const capability = createTaskCapability();

    this.begin();
    try {
      const textBytes = computeTextBytes(request.snapshot.events);
      if (textBytes > MAX_SESSION_TEXT_BYTES) {
        throw new HubError("LIMIT_EXCEEDED", "Session text budget exceeded");
      }

      this.database.prepare(`
        INSERT INTO sessions (id, metadata_json, state, latest_sequence, last_activity_at, lease_expires_at, completeness, text_bytes, task_capability_hash)
        VALUES (?, ?, ?, ?, ?, ?, 'complete', ?, ?)
      `).run(
        sessionId,
        metadataJson,
        request.metadata.state,
        request.snapshot.lastSequence,
        lastActivityAt,
        leaseExpiresAt,
        textBytes,
        capability.digest,
      );

      this.insertEvents(sessionId, request.snapshot.events);
      this.enforceLimits(sessionId);
      this.commit();
      this.onProjectionChanged?.();
      return { sessionId, leaseExpiresAt, taskCapability: capability.token };
    } catch (error) {
      this.rollback();
      if (error instanceof HubError && error.code === "LIMIT_EXCEEDED") {
        safeMarkTruncated(this, sessionId);
      }
      throw error;
    }
  }

  appendEvents(sessionId: string, request: AppendEventsRequest): SequenceResponse {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new HubError("NOT_FOUND", `Session ${sessionId} not found`);
    }

    if (request.expectedSequence > session.latestSequence) {
      throw new HubError("SEQUENCE_GAP", "Append sequence gap detected");
    }

    if (request.expectedSequence < session.latestSequence) {
      ensureIdempotentBatch(this.database, sessionId, request.events);
      return { acceptedSequence: session.latestSequence };
    }

    validateAppendBatch(request.events, session.latestSequence);

    const now = this.clock.now();
    const leaseExpiresAt = now + this.leaseMs;

    this.begin();
    try {
      const { addedTextBytes, lastEventTimestamp } = this.insertEvents(sessionId, request.events);
      const newSequence = request.events.at(-1)!.sequence;
      const lastActivityAt = Math.max(session.lastActivityAt, lastEventTimestamp ?? session.lastActivityAt);
      const updatedState = latestState(request.events) ?? session.metadata.state;
      this.database.prepare(`
        UPDATE sessions
        SET latest_sequence = ?, last_activity_at = ?, lease_expires_at = ?, text_bytes = text_bytes + ?, metadata_json = json_set(metadata_json, '$.state', ?), state = ?
        WHERE id = ?
      `).run(newSequence, lastActivityAt, leaseExpiresAt, addedTextBytes, updatedState, updatedState, sessionId);
      this.enforceLimits(sessionId);
      this.commit();
      this.onProjectionChanged?.();
      return { acceptedSequence: newSequence };
    } catch (error) {
      this.rollback();
      if (error instanceof HubError && error.code === "LIMIT_EXCEEDED") {
        safeMarkTruncated(this, sessionId);
      }
      throw error;
    }
  }

  heartbeat(sessionId: string, request: HeartbeatRequest): { leaseExpiresAt: number } {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new HubError("NOT_FOUND", `Session ${sessionId} not found`);
    }
    const now = this.clock.now();
    const leaseExpiresAt = now + this.leaseMs;
    const metadata: SessionMetadata = { ...session.metadata, state: request.state };
    if (request.name !== undefined) {
      if (request.name === null) {
        delete (metadata as Partial<SessionMetadata>).name;
      } else {
        metadata.name = request.name;
      }
    }
    const lastActivityAt = Math.max(session.lastActivityAt, request.lastActivityAt);
    const projectionChanged = request.state !== session.state
      || lastActivityAt !== session.lastActivityAt
      || metadata.name !== session.metadata.name;

    this.begin();
    try {
      this.database.prepare(`
        UPDATE sessions
        SET state = ?, last_activity_at = ?, lease_expires_at = ?, metadata_json = ?
        WHERE id = ?
      `).run(request.state, lastActivityAt, leaseExpiresAt, JSON.stringify(metadata), sessionId);
      this.commit();
      if (projectionChanged) this.onProjectionChanged?.();
      return { leaseExpiresAt };
    } catch (error) {
      this.rollback();
      throw error;
    }
  }

  replaceSnapshot(sessionId: string, snapshot: Snapshot): SequenceResponse {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new HubError("NOT_FOUND", `Session ${sessionId} not found`);
    }
    validateSnapshot(snapshot);

    const textBytes = computeTextBytes(snapshot.events);
    if (textBytes > MAX_SESSION_TEXT_BYTES) {
      this.markTruncated(sessionId);
      throw new HubError("LIMIT_EXCEEDED", "Session text budget exceeded");
    }

    const leaseExpiresAt = this.clock.now() + this.leaseMs;
    this.begin();
    try {
      this.database.prepare("DELETE FROM events WHERE session_id = ?").run(sessionId);
      this.database.prepare("DELETE FROM event_search WHERE session_id = ?").run(sessionId);
      const { lastEventTimestamp } = this.insertEvents(sessionId, snapshot.events);
      const lastActivityAt = lastEventTimestamp ?? session.lastActivityAt;
      this.database.prepare(`
        UPDATE sessions
        SET latest_sequence = ?, last_activity_at = ?, text_bytes = ?, completeness = 'complete', lease_expires_at = ?
        WHERE id = ?
      `).run(snapshot.lastSequence, lastActivityAt, textBytes, leaseExpiresAt, sessionId);
      this.enforceLimits(sessionId);
      this.commit();
      this.onProjectionChanged?.();
      return { acceptedSequence: snapshot.lastSequence };
    } catch (error) {
      this.rollback();
      if (error instanceof HubError && error.code === "LIMIT_EXCEEDED") {
        safeMarkTruncated(this, sessionId);
      }
      throw error;
    }
  }

  markTruncated(sessionId: string): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("UPDATE sessions SET completeness = 'truncated' WHERE id = ?").run(sessionId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  deleteSession(sessionId: string): boolean {
    this.begin();
    try {
      this.database.prepare("DELETE FROM event_search WHERE session_id = ?").run(sessionId);
      const result = this.database.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
      this.commit();
      if (result.changes > 0) this.onProjectionChanged?.();
      return result.changes > 0;
    } catch (error) {
      this.rollback();
      throw error;
    }
  }

  expireLeases(): string[] {
    const now = this.clock.now();
    this.begin();
    try {
      const rows = this.database.prepare("SELECT id FROM sessions WHERE lease_expires_at <= ?").all(now) as Array<{ id: string }>;
      const expiredIds = rows.map((row) => row.id);
      for (const row of rows) {
        this.database.prepare("DELETE FROM event_search WHERE session_id = ?").run(row.id);
        this.database.prepare("DELETE FROM sessions WHERE id = ?").run(row.id);
      }
      this.commit();
      if (expiredIds.length > 0) this.onProjectionChanged?.();
      return expiredIds;
    } catch (error) {
      this.rollback();
      throw error;
    }
  }

  getSession(sessionId: string): SessionRow | undefined {
    const row = this.database.prepare(`
      SELECT id, metadata_json, state, latest_sequence, last_activity_at, lease_expires_at, completeness, text_bytes
      FROM sessions WHERE id = ?
    `).get(sessionId) as
      | {
        id: string;
        metadata_json: string;
        state: SessionState;
        latest_sequence: number;
        last_activity_at: number;
        lease_expires_at: number;
        completeness: TranscriptCompleteness;
        text_bytes: number;
      }
      | undefined;
    if (!row) {
      return undefined;
    }
    return {
      id: row.id,
      metadata: JSON.parse(row.metadata_json) as SessionMetadata,
      state: row.state,
      latestSequence: row.latest_sequence,
      lastActivityAt: row.last_activity_at,
      leaseExpiresAt: row.lease_expires_at,
      completeness: row.completeness,
      textBytes: row.text_bytes,
    };
  }

  authenticateTaskCapability(token: string): SessionRow | undefined {
    if (!/^[0-9a-f]{64}$/.test(token)) return undefined;
    const candidate = capabilityDigest(token);
    const rows = this.database.prepare("SELECT id, task_capability_hash FROM sessions").all() as Array<{
      id: string;
      task_capability_hash: Uint8Array;
    }>;
    for (const row of rows) {
      const stored = Buffer.from(row.task_capability_hash);
      if (stored.length === candidate.length && timingSafeEqual(stored, candidate)) {
        return this.getSession(row.id);
      }
    }
    return undefined;
  }

  countSessions(): number {
    const row = this.database.prepare("SELECT COUNT(*) as count FROM sessions").get() as { count: number };
    return row.count;
  }

  countSearchRows(sessionId: string): number {
    const row = this.database.prepare("SELECT COUNT(*) as count FROM event_search WHERE session_id = ?").get(sessionId) as { count: number };
    return row.count;
  }

  listSessionRows(filters: SessionFilters): SessionRow[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filters.excludeSessionId !== undefined) {
      clauses.push("id != ?");
      params.push(filters.excludeSessionId);
    }
    if (filters.cwd !== undefined) {
      clauses.push("json_extract(metadata_json, '$.cwd') = ?");
      params.push(filters.cwd);
    }
    if (filters.sessionIds && filters.sessionIds.length > 0) {
      clauses.push(`id IN (${filters.sessionIds.map(() => "?").join(",")})`);
      params.push(...filters.sessionIds);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.database.prepare(`
      SELECT id, metadata_json, state, latest_sequence, last_activity_at, lease_expires_at, completeness, text_bytes
      FROM sessions
      ${where}
      ORDER BY last_activity_at DESC
      LIMIT ?
    `).all(...params, filters.limit) as Array<{
      id: string;
      metadata_json: string;
      state: SessionState;
      latest_sequence: number;
      last_activity_at: number;
      lease_expires_at: number;
      completeness: TranscriptCompleteness;
      text_bytes: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      metadata: JSON.parse(row.metadata_json) as SessionMetadata,
      state: row.state,
      latestSequence: row.latest_sequence,
      lastActivityAt: row.last_activity_at,
      leaseExpiresAt: row.lease_expires_at,
      completeness: row.completeness,
      textBytes: row.text_bytes,
    }));
  }

  recentEvents(sessionId: string, limit: number): StoredEvent[] {
    const rows = this.database.prepare(`
      SELECT event_id, sequence, timestamp, kind, payload_json
      FROM events
      WHERE session_id = ?
      ORDER BY sequence DESC
      LIMIT ?
    `).all(sessionId, limit) as Array<{ event_id: string; sequence: number; timestamp: number; kind: string; payload_json: string }>;
    return rows
      .reverse()
      .map((row) => ({
        eventId: row.event_id,
        sequence: row.sequence,
        timestamp: row.timestamp,
        kind: row.kind,
        payload: JSON.parse(row.payload_json) as NormalizedEvent,
      }));
  }

  searchEvents(sessionId: string, ftsQuery: string | undefined, limit: number): SearchHit[] {
    if (!ftsQuery) {
      return [];
    }
    const rows = this.database.prepare(`
      SELECT e.event_id, e.kind, e.timestamp, snippet(event_search, 2, '[', ']', '…', 24) AS excerpt, bm25(event_search) AS score
      FROM event_search
      JOIN events e ON e.session_id = event_search.session_id AND e.event_id = event_search.event_id
      WHERE event_search.session_id = ? AND event_search MATCH ?
      ORDER BY score ASC, e.timestamp DESC
      LIMIT ?
    `).all(sessionId, ftsQuery, limit) as Array<{ event_id: string; kind: string; timestamp: number; excerpt: string; score: number }>;
    return rows.map((row) => ({
      eventId: row.event_id,
      kind: row.kind,
      text: row.excerpt,
      timestamp: row.timestamp,
      score: row.score,
    }));
  }

  latestToolStates(sessionId: string): ToolState[] {
    const rows = this.database.prepare(`
      SELECT payload_json
      FROM events
      WHERE session_id = ? AND kind = 'tool.activity'
      ORDER BY sequence DESC
    `).all(sessionId) as Array<{ payload_json: string }>;
    const seen = new Map<string, ToolState>();
    for (const row of rows) {
      const payload = JSON.parse(row.payload_json) as NormalizedEvent;
      if (payload.type !== "tool.activity") continue;
      if (seen.has(payload.toolCallId)) continue;
      seen.set(payload.toolCallId, {
        toolCallId: payload.toolCallId,
        toolName: payload.toolName,
        status: payload.status,
      });
    }
    return Array.from(seen.values());
  }

  latestActivitySummary(sessionId: string): import("@agent-hub/contracts").ActivitySummaryEvent | undefined {
    const row = this.database.prepare(`
      SELECT payload_json FROM events
      WHERE session_id = ? AND kind = 'activity.summary'
      ORDER BY sequence DESC LIMIT 1
    `).get(sessionId) as { payload_json: string } | undefined;
    if (!row) return undefined;
    const payload = JSON.parse(row.payload_json) as NormalizedEvent;
    return payload.type === "activity.summary" ? payload : undefined;
  }

  monitorToolStates(sessionId: string, limit: number): MonitorToolState[] {
    const rows = this.database.prepare(`
      SELECT payload_json FROM events
      WHERE session_id = ? AND kind = 'tool.activity'
      ORDER BY sequence DESC
    `).all(sessionId) as Array<{ payload_json: string }>;
    const seen = new Map<string, MonitorToolState>();
    for (const row of rows) {
      const payload = JSON.parse(row.payload_json) as NormalizedEvent;
      if (payload.type !== "tool.activity") continue;
      if (seen.has(payload.toolCallId)) continue;
      seen.set(payload.toolCallId, {
        toolCallId: payload.toolCallId,
        toolName: payload.toolName,
        status: payload.status,
        startedAt: payload.startedAt,
        ...(payload.endedAt !== undefined ? { endedAt: payload.endedAt } : {}),
      });
      if (seen.size >= limit) break;
    }
    return Array.from(seen.values());
  }

  close(): void {
    if (this.ownsDatabase) this.database.close();
  }

  private begin(): void {
    if (this.inTransaction) {
      throw new Error("Nested transactions are not supported");
    }
    this.database.exec("BEGIN IMMEDIATE");
    this.inTransaction = true;
  }

  private commit(): void {
    if (this.inTransaction) {
      this.database.exec("COMMIT");
      this.inTransaction = false;
    }
  }

  private rollback(): void {
    if (this.inTransaction) {
      this.database.exec("ROLLBACK");
      this.inTransaction = false;
    }
  }

  private insertEvents(sessionId: string, events: NormalizedEvent[]): EventInsertResult {
    let addedTextBytes = 0;
    let lastEventTimestamp: number | undefined;
    const insertSearchStmt = this.database.prepare(`
      INSERT INTO event_search (session_id, event_id, body)
      VALUES (?, ?, ?)
    `);
    const insertEventStmt = this.database.prepare(`
      INSERT INTO events (session_id, event_id, sequence, timestamp, kind, payload_json, searchable_text, text_bytes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const event of events) {
      const searchableText = extractSearchableText(event);
      const textBytes = searchableText === undefined ? 0 : utf8Length(searchableText);
      if (searchableText !== undefined) {
        addedTextBytes += textBytes;
        insertSearchStmt.run(sessionId, event.eventId, searchableText);
      }
      insertEventStmt.run(
        sessionId,
        event.eventId,
        event.sequence,
        event.timestamp,
        event.type,
        JSON.stringify(event),
        searchableText ?? null,
        textBytes,
      );
      lastEventTimestamp = event.timestamp;
    }
    return { addedTextBytes, lastEventTimestamp };
  }

  private enforceLimits(sessionId: string): void {
    const sessionRow = this.database.prepare("SELECT text_bytes FROM sessions WHERE id = ?").get(sessionId) as { text_bytes: number } | undefined;
    if (sessionRow && sessionRow.text_bytes > MAX_SESSION_TEXT_BYTES) {
      throw new HubError("LIMIT_EXCEEDED", "Session text budget exceeded");
    }
    if (databaseSizeBytes(this.database) > MAX_DATABASE_BYTES) {
      throw new HubError("LIMIT_EXCEEDED", "Hub database budget exceeded");
    }
  }
}

function validateSnapshot(snapshot: Snapshot): void {
  if (snapshot.events.length === 0) {
    if (snapshot.lastSequence !== 0) {
      throw new HubError("INVALID_EVENT_SEQUENCE", "Snapshot lastSequence must be zero when no events");
    }
    return;
  }
  if (snapshot.events[0]?.sequence !== 1) {
    throw new HubError("INVALID_EVENT_SEQUENCE", "Snapshot must start at sequence 1");
  }
  const ids = new Set<string>();
  for (let index = 0; index < snapshot.events.length; index += 1) {
    const expectedSequence = index + 1;
    const event = snapshot.events[index]!;
    if (event.sequence !== expectedSequence) {
      throw new HubError("INVALID_EVENT_SEQUENCE", "Snapshot events must be contiguous");
    }
    if (ids.has(event.eventId)) {
      throw new HubError("INVALID_EVENT_SEQUENCE", "Duplicate eventId in snapshot");
    }
    ids.add(event.eventId);
  }
  if (snapshot.lastSequence !== snapshot.events.length) {
    throw new HubError("INVALID_EVENT_SEQUENCE", "Snapshot lastSequence mismatch");
  }
}

function validateAppendBatch(events: NormalizedEvent[], latestSequence: number): void {
  if (!events.length) {
    throw new HubError("INVALID_EVENT_SEQUENCE", "Append batch must contain events");
  }
  if (events[0]!.sequence !== latestSequence + 1) {
    throw new HubError("SEQUENCE_GAP", "Append batch must start at next sequence");
  }
  for (let index = 1; index < events.length; index += 1) {
    if (events[index]!.sequence !== events[index - 1]!.sequence + 1) {
      throw new HubError("SEQUENCE_GAP", "Append batch must be contiguous");
    }
  }
}

function ensureIdempotentBatch(database: DatabaseSync, sessionId: string, events: NormalizedEvent[]): void {
  for (const event of events) {
    const row = database.prepare(`
      SELECT payload_json, sequence
      FROM events WHERE session_id = ? AND event_id = ?
    `).get(sessionId, event.eventId) as { payload_json: string; sequence: number } | undefined;
    if (!row) {
      throw new HubError("SEQUENCE_GAP", "Append retry missing persisted event");
    }
    if (row.sequence !== event.sequence) {
      throw new HubError("SEQUENCE_GAP", "Append retry sequence mismatch");
    }
    if (row.payload_json !== JSON.stringify(event)) {
      throw new HubError("SEQUENCE_GAP", "Append retry payload mismatch");
    }
  }
}

function latestState(events: NormalizedEvent[]): SessionState | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === "session.state") {
      return event.state;
    }
  }
  return undefined;
}

function computeTextBytes(events: NormalizedEvent[]): number {
  return events.reduce((total, event) => {
    const text = extractSearchableText(event);
    return total + (text ? utf8Length(text) : 0);
  }, 0);
}

function extractSearchableText(event: NormalizedEvent): string | undefined {
  if (event.type === "message.user" || event.type === "message.assistant") {
    return event.text;
  }
  return undefined;
}

export interface MonitorToolState {
  toolCallId: string;
  toolName: string;
  status: "running" | "succeeded" | "failed";
  startedAt: number;
  endedAt?: number;
}

function utf8Length(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function deriveLastActivity(snapshot: Snapshot, startedAt: number): number {
  if (snapshot.events.length) {
    return snapshot.events.at(-1)!.timestamp;
  }
  return startedAt;
}

function safeMarkTruncated(store: HubStore, sessionId: string): void {
  try {
    store.markTruncated(sessionId);
  } catch {
    // ignore best-effort truncation markers
  }
}
