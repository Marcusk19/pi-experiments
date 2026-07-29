import { randomUUID } from "node:crypto";
import {
  Role,
  TaskState,
  type AgentCard,
  type Message,
  type SendMessageRequest,
  type Task,
} from "@a2a-js/sdk";
import {
  ClientFactory,
  ClientFactoryOptions,
  DefaultAgentCardResolver,
  RestTransportFactory,
  ServiceParameters,
  createAuthenticatingFetchWithRetry,
  withA2AExtensions,
  type Client,
  type RequestOptions,
} from "@a2a-js/sdk/client";
import { A2A_VERSION, LOCAL_COORDINATION_EXTENSION } from "@agent-hub/contracts";

const DEFAULT_TIMEOUT_MS = 5_000;
const HISTORY_LENGTH = 10;
const MAX_TARGET_TEXT_CHARACTERS = 8_000;
const MAX_INSTRUCTION_CHARACTERS = 65_536;
const MAX_ID_CHARACTERS = 256;

export interface SourceCoordinationClientOptions {
  baseUrl: string;
  taskCapability: string;
  timeoutMs?: number;
}

export interface SendSourceTaskRequest {
  targetId: string;
  instruction: string;
  deadline?: string;
}

export type SourceTaskState = "submitted" | "working" | "completed" | "failed" | "canceled" | "rejected" | "unknown";

export interface SourceTaskSnapshot {
  taskId: string;
  contextId: string;
  state: SourceTaskState;
  deadline?: string;
  cancellationRequested: boolean;
  terminalCode?: string;
  targetText?: string;
}

export interface SourceCoordinationClient {
  send(request: SendSourceTaskRequest, signal?: AbortSignal): Promise<SourceTaskSnapshot>;
  watch(taskId: string, signal?: AbortSignal): Promise<SourceTaskSnapshot>;
  cancel(taskId: string, signal?: AbortSignal): Promise<SourceTaskSnapshot>;
}

export class SourceCoordinationClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceCoordinationClientError";
  }
}

export function createSourceCoordinationClient(options: SourceCoordinationClientOptions): SourceCoordinationClient {
  return new SourceCoordinationClientImpl(options);
}

class SourceCoordinationClientImpl implements SourceCoordinationClient {
  private readonly baseUrl: string;
  private readonly taskCapability: string;
  private readonly timeoutMs: number;
  private clientPromise: Promise<Client> | undefined;

  constructor(options: SourceCoordinationClientOptions) {
    this.baseUrl = normalizeLoopbackBaseUrl(options.baseUrl);
    if (!options.taskCapability) throw new SourceCoordinationClientError("A source task capability is required.");
    if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) {
      throw new SourceCoordinationClientError("Coordination timeout must be positive.");
    }
    this.taskCapability = options.taskCapability;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async send(request: SendSourceTaskRequest, signal?: AbortSignal): Promise<SourceTaskSnapshot> {
    assertText(request.targetId, "Delivery target", MAX_ID_CHARACTERS);
    assertText(request.instruction, "Instruction", MAX_INSTRUCTION_CHARACTERS);
    if (request.deadline !== undefined && !Number.isFinite(Date.parse(request.deadline))) {
      throw new SourceCoordinationClientError("Coordination send request is invalid.");
    }
    try {
      const client = await this.getClient(signal);
      const params: SendMessageRequest = {
        tenant: "",
        message: {
          messageId: randomUUID(),
          contextId: "",
          taskId: "",
          role: Role.ROLE_USER,
          parts: [
            {
              content: {
                $case: "data",
                value: { kind: "coordination.target", target: { type: "session", sessionId: request.targetId } },
              },
              metadata: undefined,
              filename: "",
              mediaType: "application/json",
            },
            {
              content: { $case: "text", value: request.instruction },
              metadata: undefined,
              filename: "",
              mediaType: "text/plain",
            },
          ],
          metadata: undefined,
          extensions: [LOCAL_COORDINATION_EXTENSION],
          referenceTaskIds: [],
        },
        configuration: {
          acceptedOutputModes: ["text/plain"],
          taskPushNotificationConfig: undefined,
          historyLength: HISTORY_LENGTH,
          returnImmediately: true,
        },
        metadata: request.deadline === undefined
          ? undefined
          : { [LOCAL_COORDINATION_EXTENSION]: { deadline: request.deadline } },
      };
      const result = await client.sendMessage(params, this.requestOptions(signal));
      if (!isTask(result)) throw new Error("Expected a task response");
      return projectTask(result);
    } catch {
      throw new SourceCoordinationClientError("Coordination send request failed.");
    }
  }

  async watch(taskId: string, signal?: AbortSignal): Promise<SourceTaskSnapshot> {
    assertText(taskId, "Task ID", MAX_ID_CHARACTERS);
    try {
      const client = await this.getClient(signal);
      const task = await client.getTask({ tenant: "", id: taskId, historyLength: HISTORY_LENGTH }, this.requestOptions(signal));
      return projectTask(task);
    } catch {
      throw new SourceCoordinationClientError("Coordination watch request failed.");
    }
  }

  async cancel(taskId: string, signal?: AbortSignal): Promise<SourceTaskSnapshot> {
    assertText(taskId, "Task ID", MAX_ID_CHARACTERS);
    try {
      const client = await this.getClient(signal);
      const task = await client.cancelTask({ tenant: "", id: taskId, metadata: undefined }, this.requestOptions(signal));
      return projectTask(task);
    } catch {
      throw new SourceCoordinationClientError("Coordination cancel request failed.");
    }
  }

  private requestOptions(signal?: AbortSignal): RequestOptions {
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)])
      : AbortSignal.timeout(this.timeoutMs);
    return {
      signal: requestSignal,
      serviceParameters: ServiceParameters.create(withA2AExtensions(LOCAL_COORDINATION_EXTENSION)),
    };
  }

  private getClient(signal?: AbortSignal): Promise<Client> {
    this.clientPromise ??= this.createClient(signal).catch((error: unknown) => {
      this.clientPromise = undefined;
      throw error;
    });
    return this.clientPromise;
  }

  private async createClient(signal?: AbortSignal): Promise<Client> {
    const authenticate = (fetchImpl: typeof fetch) => createAuthenticatingFetchWithRetry(fetchImpl, {
      headers: async () => ({ Authorization: `Bearer ${this.taskCapability}` }),
      shouldRetryWithHeaders: async () => undefined,
    });
    const resolver = new DefaultAgentCardResolver({ fetchImpl: this.boundedFetch(signal) });
    const card = await resolver.resolve(this.baseUrl);
    const safeCard = validateAndRestrictCard(card, this.baseUrl);
    const transportFetch = authenticate(this.boundedFetch());
    const factory = new ClientFactory(ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
      transports: [new RestTransportFactory({ fetchImpl: transportFetch })],
      cardResolver: resolver,
      clientConfig: { polling: true },
    }));
    return factory.createFromAgentCard(safeCard);
  }

  private boundedFetch(extraSignal?: AbortSignal): typeof fetch {
    return (input, init = {}) => {
      const signals = [AbortSignal.timeout(this.timeoutMs)];
      if (extraSignal) signals.push(extraSignal);
      if (init.signal) signals.push(init.signal);
      return fetch(input, {
        ...init,
        redirect: "error",
        signal: AbortSignal.any(signals),
      });
    };
  }
}

function normalizeLoopbackBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SourceCoordinationClientError("Coordination endpoint must be a loopback HTTP URL.");
  }
  if (
    url.protocol !== "http:"
    || url.hostname !== "127.0.0.1"
    || url.username !== ""
    || url.password !== ""
    || url.search !== ""
    || url.hash !== ""
    || (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new SourceCoordinationClientError("Coordination endpoint must be a loopback HTTP URL.");
  }
  return url.origin;
}

function validateAndRestrictCard(card: AgentCard, baseUrl: string): AgentCard {
  const matchingInterface = card.supportedInterfaces.find((candidate) => {
    let origin: string | undefined;
    try {
      const url = new URL(candidate.url);
      origin = url.pathname === "/" && !url.search && !url.hash ? url.origin : undefined;
    } catch {
      origin = undefined;
    }
    return candidate.protocolBinding === "HTTP+JSON"
      && candidate.protocolVersion === A2A_VERSION
      && origin === baseUrl;
  });
  const extension = card.capabilities?.extensions.find((candidate) => candidate.uri === LOCAL_COORDINATION_EXTENSION);
  if (!matchingInterface || !extension?.required) {
    throw new SourceCoordinationClientError("Coordinator does not support the required A2A protocol.");
  }
  return { ...card, supportedInterfaces: [matchingInterface] };
}

function assertText(value: string, label: string, maxLength: number): void {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new SourceCoordinationClientError(`${label} is invalid.`);
  }
}

function isTask(value: Message | Task): value is Task {
  return typeof (value as Partial<Task>).id === "string" && typeof (value as Partial<Task>).contextId === "string";
}

function projectTask(task: Task): SourceTaskSnapshot {
  assertText(task.id, "Task ID", MAX_ID_CHARACTERS);
  assertText(task.contextId, "Context ID", MAX_ID_CHARACTERS);
  const metadata = task.metadata;
  const deadline = typeof metadata?.deadline === "string" ? truncate(metadata.deadline, 128) : undefined;
  const terminalCode = typeof metadata?.terminalCode === "string" ? truncate(metadata.terminalCode, 128) : undefined;
  const targetText = visibleTargetText(task);
  return {
    taskId: task.id,
    contextId: task.contextId,
    state: projectState(task.status?.state),
    ...(deadline ? { deadline } : {}),
    cancellationRequested: metadata?.cancellationRequested === true,
    ...(terminalCode ? { terminalCode } : {}),
    ...(targetText ? { targetText } : {}),
  };
}

function visibleTargetText(task: Task): string | undefined {
  const messages = [...task.history];
  const statusMessage = task.status?.message;
  if (statusMessage && !messages.some((message) => message.messageId === statusMessage.messageId)) {
    messages.push(statusMessage);
  }
  const text = messages
    .filter((message) => message.role === Role.ROLE_AGENT)
    .flatMap((message) => message.parts)
    .filter((part) => part.content?.$case === "text")
    .map((part) => part.content?.$case === "text" ? part.content.value : "")
    .filter(Boolean)
    .join("\n");
  return text ? truncate(text, MAX_TARGET_TEXT_CHARACTERS) : undefined;
}

function projectState(state: TaskState | undefined): SourceTaskState {
  switch (state) {
    case TaskState.TASK_STATE_SUBMITTED: return "submitted";
    case TaskState.TASK_STATE_WORKING: return "working";
    case TaskState.TASK_STATE_COMPLETED: return "completed";
    case TaskState.TASK_STATE_FAILED: return "failed";
    case TaskState.TASK_STATE_CANCELED: return "canceled";
    case TaskState.TASK_STATE_REJECTED: return "rejected";
    default: return "unknown";
  }
}

function truncate(value: string, maxCharacters: number): string {
  return value.length <= maxCharacters ? value : value.slice(0, maxCharacters);
}
