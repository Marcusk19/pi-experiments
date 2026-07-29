import type {
  AppendEventsRequest,
  HeartbeatRequest,
  HealthResponse,
  QueryRequest,
  QueryResponse,
  RegisterSessionRequest,
  RegisterSessionResponse,
  ReplaceSnapshotRequest,
  SequenceResponse,
} from "@agent-hub/contracts";
import {
  ApiErrorSchema,
  HealthResponseSchema,
  QueryResponseSchema,
  RegisterSessionResponseSchema,
  SequenceResponseSchema,
  HeartbeatResponseSchema,
} from "@agent-hub/contracts";
import { Check } from "typebox/value";

export interface HubTransportOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
}

interface JsonSchema<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly [key: string]: any;
}

export interface HubClientErrorOptions {
  code: string;
  message: string;
  status?: number;
  retryable: boolean;
  cause?: unknown;
}

export class HubClientError extends Error {
  readonly code: string;
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(options: HubClientErrorOptions) {
    super(options.message);
    this.name = "HubClientError";
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export class HubTransport {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(options: HubTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 500;
  }

  register(request: RegisterSessionRequest, signal?: AbortSignal): Promise<RegisterSessionResponse> {
    return this.request("/v2/sessions", {
      method: "POST",
      body: JSON.stringify(request),
      headers: { "content-type": "application/json" },
    }, RegisterSessionResponseSchema, signal);
  }

  append(sessionId: string, request: AppendEventsRequest, signal?: AbortSignal): Promise<SequenceResponse> {
    return this.request(`/v2/sessions/${sessionId}/events`, {
      method: "POST",
      body: JSON.stringify(request),
      headers: { "content-type": "application/json" },
    }, SequenceResponseSchema, signal);
  }

  heartbeat(sessionId: string, request: HeartbeatRequest, signal?: AbortSignal): Promise<{ leaseExpiresAt: number }> {
    return this.request(`/v2/sessions/${sessionId}/heartbeat`, {
      method: "POST",
      body: JSON.stringify(request),
      headers: { "content-type": "application/json" },
    }, HeartbeatResponseSchema, signal);
  }

  replaceSnapshot(sessionId: string, request: ReplaceSnapshotRequest, signal?: AbortSignal): Promise<SequenceResponse> {
    return this.request(`/v2/sessions/${sessionId}/snapshot`, {
      method: "PUT",
      body: JSON.stringify(request),
      headers: { "content-type": "application/json" },
    }, SequenceResponseSchema, signal);
  }

  deleteSession(sessionId: string, signal?: AbortSignal): Promise<void> {
    return this.request(`/v2/sessions/${sessionId}`, { method: "DELETE" }, undefined, signal);
  }

  query(request: QueryRequest, signal?: AbortSignal): Promise<QueryResponse> {
    return this.request("/v2/query", {
      method: "POST",
      body: JSON.stringify(request),
      headers: { "content-type": "application/json" },
    }, QueryResponseSchema, signal);
  }

  health(signal?: AbortSignal): Promise<HealthResponse> {
    return this.request("/v2/health", { method: "GET" }, HealthResponseSchema, signal);
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    schema?: JsonSchema<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.token}`);
    headers.set("accept", "application/json");
    const controllerSignal = this.combineSignals(signal);
    const requestInit: RequestInit = { ...init, headers, signal: controllerSignal ?? null };
    const url = `${this.baseUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, requestInit);
    } catch (error) {
      this.throwNetworkError(error);
    }

    if (!response.ok) {
      await this.throwHttpError(response);
    }

    if (!schema) {
      await response.arrayBuffer().catch(() => undefined);
      return undefined as T;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new HubClientError({
        code: "INVALID_RESPONSE",
        message: "Agent Activity Hub returned a malformed response.",
        status: response.status,
        retryable: true,
      });
    }

    if (!Check(schema, body)) {
      throw new HubClientError({
        code: "INVALID_RESPONSE",
        message: "Agent Activity Hub response did not match the expected schema.",
        status: response.status,
        retryable: true,
      });
    }
    return body as T;
  }

  private combineSignals(signal?: AbortSignal): AbortSignal | undefined {
    const signals: AbortSignal[] = [];
    if (signal) signals.push(signal);
    if (Number.isFinite(this.timeoutMs)) {
      signals.push(AbortSignal.timeout(this.timeoutMs));
    }
    if (signals.length === 0) return undefined;
    if (signals.length === 1) return signals[0];
    return AbortSignal.any(signals);
  }

  private throwNetworkError(error: unknown): never {
    const isAbort = error instanceof Error && error.name === "AbortError";
    throw new HubClientError({
      code: "HUB_UNAVAILABLE",
      message: isAbort ? "Agent Activity Hub request timed out." : "Agent Activity Hub is unavailable.",
      retryable: true,
      cause: error,
    });
  }

  private async throwHttpError(response: Response): Promise<never> {
    const contentType = response.headers.get("content-type") ?? "";
    let code = `HTTP_${response.status}`;
    let message = `Agent Activity Hub request failed with status ${response.status}.`;
    const retryable = response.status >= 500 || response.status === 408 || response.status === 429;

    if (contentType.includes("application/json")) {
      try {
        const json = await response.json();
        if (Check(ApiErrorSchema, json)) {
          code = json.error.code;
          message = json.error.message || message;
        }
      } catch {
        // ignore malformed JSON
      }
    } else {
      await response.arrayBuffer().catch(() => undefined);
    }

    throw new HubClientError({ code, message, status: response.status, retryable });
  }
}
