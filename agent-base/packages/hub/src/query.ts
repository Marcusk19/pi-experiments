import type { QueryRequest, QueryResponse } from "@agent-hub/contracts";
import type { HubStore, SearchHit, SessionRow, StoredEvent, ToolState } from "./store.js";

const DEFAULT_OVERVIEW_SESSIONS = 10;
const DEFAULT_SEARCH_SESSIONS = 5;
const ABSOLUTE_MAX_SESSIONS = 50;
const DEFAULT_OVERVIEW_EXCERPTS = 1;
const DEFAULT_SEARCH_EXCERPTS = 2;
const ABSOLUTE_MAX_EXCERPTS = 10;
const DEFAULT_OVERVIEW_CHARACTERS = 6_000;
const DEFAULT_SEARCH_CHARACTERS = 8_000;
const MAX_OVERVIEW_EXCERPT_CHARACTERS = 300;
const MAX_SEARCH_EXCERPT_CHARACTERS = 800;
const MIN_CHARACTERS = 1_000;
const ABSOLUTE_MAX_CHARACTERS = 40_000;
const INACTIVITY_WINDOW_MS = 5 * 60 * 1_000;

const STOP_WORDS = new Set([
  "what",
  "which",
  "session",
  "sessions",
  "going",
  "attention",
  "other",
  "needs",
  "need",
  "does",
  "anything",
  "any",
  "status",
  "currently",
  "my",
  "me",
  "our",
  "we",
  "please",
  "tell",
  "s",
  "re",
  "in",
  "up",
  "about",
  "now",
  "today",
  "this",
  "that",
  "the",
  "work",
  "working",
  "doing",
  "happening",
  "with",
  "is",
  "are",
  "was",
  "be",
  "and",
  "of",
  "to",
  "from",
  "on",
  "for",
  "how",
]);

type QuerySession = QueryResponse["sessions"][number];
type Excerpt = QuerySession["excerpts"][number];

type PreparedSession = {
  base: Omit<QuerySession, "excerpts">;
  excerptCandidates: Excerpt[];
  severity: number;
  lastActivityAt: number;
  searchScore?: number;
  maxExcerpts: number;
};

interface BuildProjectionOptions {
  mode: "overview" | "search";
  now: number;
  maxExcerpts: number;
  ftsQuery?: string;
}

export function resolveQueryMode(query: string, explicit?: "overview" | "search"): "overview" | "search" {
  if (explicit) {
    return explicit;
  }
  return tokenize(query).length === 0 ? "overview" : "search";
}

export function queryActiveSessions(store: HubStore, request: QueryRequest, now: number): QueryResponse {
  const mode = resolveQueryMode(request.query, request.mode);
  const defaultSessions = mode === "overview" ? DEFAULT_OVERVIEW_SESSIONS : DEFAULT_SEARCH_SESSIONS;
  const maxSessions = clamp(request.maxSessions ?? defaultSessions, 1, ABSOLUTE_MAX_SESSIONS);
  const defaultExcerpts = mode === "overview" ? DEFAULT_OVERVIEW_EXCERPTS : DEFAULT_SEARCH_EXCERPTS;
  const defaultCharacters = mode === "overview" ? DEFAULT_OVERVIEW_CHARACTERS : DEFAULT_SEARCH_CHARACTERS;
  const maxExcerptsPerSession = clamp(request.maxExcerptsPerSession ?? defaultExcerpts, 1, ABSOLUTE_MAX_EXCERPTS);
  const maxCharacters = clamp(request.maxCharacters ?? defaultCharacters, MIN_CHARACTERS, ABSOLUTE_MAX_CHARACTERS);
  const candidateLimit = request.sessionIds ? request.sessionIds.length : store.countSessions();
  const filters: Parameters<HubStore["listSessionRows"]>[0] = { limit: candidateLimit };
  if (request.excludeSessionId !== undefined) {
    filters.excludeSessionId = request.excludeSessionId;
  }
  if (request.cwd !== undefined) {
    filters.cwd = request.cwd;
  }
  if (request.sessionIds && request.sessionIds.length > 0) {
    filters.sessionIds = request.sessionIds;
  }
  const rows = store.listSessionRows(filters);

  const tokens = tokenize(request.query);
  const ftsQuery = mode === "search" ? buildFtsQuery(tokens) : undefined;

  const projections: PreparedSession[] = [];
  for (const row of rows) {
    const projectionOptions: BuildProjectionOptions = {
      mode,
      now,
      maxExcerpts: maxExcerptsPerSession,
    };
    if (ftsQuery !== undefined) {
      projectionOptions.ftsQuery = ftsQuery;
    }
    const projection = buildSessionProjection(store, row, projectionOptions);
    if (projection) {
      projections.push(projection);
    }
  }

  const ordered = (mode === "search" ? sortSearchProjections(projections) : sortOverviewProjections(projections))
    .slice(0, maxSessions);
  const response: QueryResponse = { mode, sessions: [], truncated: false };

  for (const projection of ordered) {
    const base: QuerySession = { ...projection.base, excerpts: [] };
    if (!fitsWithNewSession(response, base, maxCharacters)) {
      response.truncated = true;
      break;
    }
    response.sessions.push(base);
    const index = response.sessions.length - 1;
    for (const excerpt of projection.excerptCandidates) {
      if (response.sessions[index]!.excerpts.length >= projection.maxExcerpts) {
        break;
      }
      const nextSession: QuerySession = {
        ...response.sessions[index]!,
        excerpts: [...response.sessions[index]!.excerpts, excerpt],
      };
      if (!fitsWithReplacedSession(response, index, nextSession, maxCharacters)) {
        response.truncated = true;
        return response;
      }
      response.sessions[index] = nextSession;
    }
  }

  if (!fitsBudget(response, maxCharacters)) {
    response.truncated = true;
    while (!fitsBudget(response, maxCharacters) && response.sessions.length) {
      response.sessions.pop();
    }
  }

  return response;
}

export function fitsBudget(response: QueryResponse, maxCharacters: number): boolean {
  return JSON.stringify(response).length <= maxCharacters;
}

function buildSessionProjection(
  store: HubStore,
  row: SessionRow,
  options: BuildProjectionOptions,
): PreparedSession | undefined {
  const recentEvents = store.recentEvents(row.id, options.maxExcerpts * 4);
  const toolStates = store.latestToolStates(row.id);
  const { signals, severity } = computeSignals(row, recentEvents, toolStates, options.now);

  const base: PreparedSession["base"] = {
    sessionId: row.id,
    metadata: row.metadata,
    lastActivityAt: row.lastActivityAt,
    transcriptCompleteness: row.completeness,
    signals,
  };

  if (options.mode === "search") {
    const searchHits = store.searchEvents(row.id, options.ftsQuery, options.maxExcerpts);
    if (!searchHits.length) {
      return undefined;
    }
    const excerptCandidates = buildSearchExcerpts(searchHits, options.maxExcerpts);
    return {
      base,
      excerptCandidates,
      severity,
      lastActivityAt: row.lastActivityAt,
      searchScore: searchHits[0]!.score,
      maxExcerpts: options.maxExcerpts,
    };
  }

  const overviewExcerpts = buildOverviewExcerpts(recentEvents, toolStates, options.maxExcerpts);
  return {
    base,
    excerptCandidates: overviewExcerpts,
    severity,
    lastActivityAt: row.lastActivityAt,
    maxExcerpts: options.maxExcerpts,
  };
}

function buildOverviewExcerpts(events: StoredEvent[], toolStates: ToolState[], limit: number): Excerpt[] {
  const userEvents = events.filter((event) => event.payload.type === "message.user");
  const assistantEvents = events.filter((event) => event.payload.type === "message.assistant");
  const messageEvents = userEvents.length > 0 ? userEvents : assistantEvents.slice(-1);
  const selected = messageEvents.slice(-limit).map<Excerpt>((event) => ({
    eventId: event.eventId,
    kind: event.payload.type,
    text: truncateText(event.payload.type === "message.assistant" || event.payload.type === "message.user" ? event.payload.text : "", MAX_OVERVIEW_EXCERPT_CHARACTERS),
    timestamp: event.timestamp,
  }));
  if (selected.length) {
    return selected;
  }
  if (toolStates.length) {
    const fallbackTimestamp = events.at(-1)?.timestamp ?? Date.now();
    return toolStates.slice(0, limit).map((tool) => ({
      eventId: `${tool.toolCallId}:${tool.status}`,
      kind: "tool.activity",
      text: `Tool ${tool.toolName} ${tool.status}`,
      timestamp: fallbackTimestamp,
    }));
  }
  return [];
}

function buildSearchExcerpts(searchHits: SearchHit[], limit: number): Excerpt[] {
  return searchHits.slice(0, limit).map((hit) => ({
    eventId: hit.eventId,
    kind: hit.kind,
    text: truncateText(hit.text, MAX_SEARCH_EXCERPT_CHARACTERS),
    timestamp: hit.timestamp,
    score: hit.score,
  }));
}

function truncateText(text: string, maxCharacters: number): string {
  if (text.length <= maxCharacters) return text;
  return `${text.slice(0, maxCharacters - 1)}…`;
}

function computeSignals(row: SessionRow, events: StoredEvent[], toolStates: ToolState[], now: number): { signals: string[]; severity: number } {
  const signals: string[] = [];
  let severity = 2;
  const assistantEvent = [...events].reverse().find((event) => event.payload.type === "message.assistant");
  if (assistantEvent && assistantEvent.payload.type === "message.assistant" && assistantEvent.payload.stopStatus === "error") {
    signals.push("assistant_error");
    severity = 0;
  }
  for (const tool of toolStates) {
    if (tool.status === "failed") {
      signals.push(`tool_failed:${tool.toolName}`);
      severity = 0;
    } else if (tool.status === "running") {
      signals.push(`tool_running:${tool.toolName}`);
      severity = Math.min(severity, 1);
    }
  }
  if (now - row.lastActivityAt > INACTIVITY_WINDOW_MS) {
    signals.push("inactive");
  }
  if (row.completeness === "truncated") {
    signals.push("transcript_truncated");
  }
  return { signals, severity };
}

function sortOverviewProjections(projections: PreparedSession[]): PreparedSession[] {
  return projections.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity - b.severity;
    }
    return b.lastActivityAt - a.lastActivityAt;
  });
}

function sortSearchProjections(projections: PreparedSession[]): PreparedSession[] {
  return projections
    .filter((projection) => projection.searchScore !== undefined)
    .sort((a, b) => {
      if (a.searchScore! !== b.searchScore!) {
        return a.searchScore! - b.searchScore!;
      }
      return b.lastActivityAt - a.lastActivityAt;
    });
}

function fitsWithNewSession(response: QueryResponse, session: QuerySession, maxCharacters: number): boolean {
  const candidate: QueryResponse = { ...response, sessions: [...response.sessions, session] };
  return fitsBudget(candidate, maxCharacters);
}

function fitsWithReplacedSession(response: QueryResponse, index: number, session: QuerySession, maxCharacters: number): boolean {
  const sessions = response.sessions.slice();
  sessions[index] = session;
  return fitsBudget({ ...response, sessions }, maxCharacters);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function tokenize(query: string): string[] {
  return (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => !STOP_WORDS.has(token));
}

function buildFtsQuery(tokens: string[]): string | undefined {
  if (!tokens.length) {
    return undefined;
  }
  return tokens.map((token) => `"${token}"*`).join(" OR ");
}
