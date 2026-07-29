import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createSourceCoordinationClient,
  type SessionReporter,
  type SourceCoordinationClient,
  type SourceCoordinationClientOptions,
  type SourceTaskSnapshot,
} from "@agent-hub/client";

export const COORDINATION_API_CHANNEL = "agent-activity-hub:coordination-api:v1";
const DEFAULT_TARGET_WAIT_MS = 15_000;
const QUERY_INTERVAL_MS = 100;

export interface SendToHarnessSessionRequest {
  harnessSessionId: string;
  instruction: string;
  deadlineMinutes?: number;
  targetWaitMs?: number;
}

export interface PiCoordinationApi {
  readonly version: 1;
  sendToHarnessSession(request: SendToHarnessSessionRequest, signal?: AbortSignal): Promise<SourceTaskSnapshot>;
  watch(taskId: string, signal?: AbortSignal): Promise<SourceTaskSnapshot>;
  cancel(taskId: string, signal?: AbortSignal): Promise<SourceTaskSnapshot>;
}

export interface PiCoordinationApiRequest {
  version: 1;
  accept(api: PiCoordinationApi): void;
}

export type CoordinationApiClientFactory = (options: SourceCoordinationClientOptions) => SourceCoordinationClient;

export function registerPiCoordinationApi(
  pi: ExtensionAPI,
  resolveReporter: () => SessionReporter | undefined,
  createClient: CoordinationApiClientFactory = createSourceCoordinationClient,
  now: () => number = () => Date.now(),
): () => void {
  const api: PiCoordinationApi = {
    version: 1,
    async sendToHarnessSession(request, signal) {
      assertText(request.harnessSessionId, "Harness session ID", 256);
      assertText(request.instruction, "Instruction", 65_536);
      const waitMs = request.targetWaitMs ?? DEFAULT_TARGET_WAIT_MS;
      if (!Number.isInteger(waitMs) || waitMs < 1 || waitMs > 60_000) {
        throw new Error("Target wait timeout is invalid.");
      }
      if (
        request.deadlineMinutes !== undefined
        && (!Number.isInteger(request.deadlineMinutes) || request.deadlineMinutes < 1 || request.deadlineMinutes > 1_440)
      ) {
        throw new Error("Task deadline is invalid.");
      }

      const targetId = await waitForTarget(resolveReporter, request.harnessSessionId, waitMs, signal, now);
      const client = currentClient(resolveReporter, createClient);
      return client.send({
        targetId,
        instruction: request.instruction,
        ...(request.deadlineMinutes === undefined
          ? {}
          : { deadline: new Date(now() + request.deadlineMinutes * 60_000).toISOString() }),
      }, signal);
    },
    async watch(taskId, signal) {
      return currentClient(resolveReporter, createClient).watch(taskId, signal);
    },
    async cancel(taskId, signal) {
      return currentClient(resolveReporter, createClient).cancel(taskId, signal);
    },
  };

  return pi.events.on(COORDINATION_API_CHANNEL, (data) => {
    if (!isApiRequest(data)) return;
    data.accept(api);
  });
}

async function waitForTarget(
  resolveReporter: () => SessionReporter | undefined,
  harnessSessionId: string,
  waitMs: number,
  signal: AbortSignal | undefined,
  now: () => number,
): Promise<string> {
  const deadline = now() + waitMs;
  while (now() < deadline) {
    throwIfAborted(signal);
    const reporter = requireReporter(resolveReporter);
    const remaining = Math.max(1, deadline - now());
    const querySignal = combineSignals(signal, AbortSignal.timeout(Math.min(2_000, remaining)));
    const response = await reporter.query({
      query: "locate a newly launched delivery-capable Pi worker",
      mode: "overview",
      includeCurrentSession: true,
      maxSessions: 50,
      maxExcerptsPerSession: 1,
      maxCharacters: 4_000,
    }, querySignal);
    const target = response.sessions.find((session) =>
      session.sessionId !== reporter.sessionId
      && session.metadata.acceptsTaskDelivery
      && session.metadata.harnessSessionId === harnessSessionId
    );
    if (target) return target.sessionId;
    await abortableDelay(Math.min(QUERY_INTERVAL_MS, Math.max(1, deadline - now())), signal);
  }
  throw new Error("Launched Pi worker did not register before the timeout.");
}

function currentClient(
  resolveReporter: () => SessionReporter | undefined,
  createClient: CoordinationApiClientFactory,
): SourceCoordinationClient {
  const reporter = requireReporter(resolveReporter);
  if (!reporter.coordinationBaseUrl || !reporter.taskCapability) {
    throw new Error("Coordination unavailable; session registration will retry in the background.");
  }
  return createClient({
    baseUrl: reporter.coordinationBaseUrl,
    taskCapability: reporter.taskCapability,
  });
}

function requireReporter(resolveReporter: () => SessionReporter | undefined): SessionReporter {
  const reporter = resolveReporter();
  if (!reporter?.sessionId) {
    throw new Error("Coordination unavailable; session registration will retry in the background.");
  }
  return reporter;
}

function isApiRequest(value: unknown): value is PiCoordinationApiRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<PiCoordinationApiRequest>;
  return request.version === 1 && typeof request.accept === "function";
}

function assertText(value: string, label: string, maxLength: number): void {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new Error(`${label} is invalid.`);
  }
}

function combineSignals(signal: AbortSignal | undefined, timeout: AbortSignal): AbortSignal {
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new Error("Operation aborted.");
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    let timer: NodeJS.Timeout;
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Operation aborted."));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
