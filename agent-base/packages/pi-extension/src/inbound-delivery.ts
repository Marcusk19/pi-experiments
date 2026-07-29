import { randomUUID } from "node:crypto";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, SessionMessageEntry } from "@earendil-works/pi-coding-agent";
import { CoordinationTransport } from "@agent-hub/client";
import type { AdapterMessage, ClaimedDelivery, TaskMutationResponse } from "@agent-hub/contracts";

export const INBOUND_TASK_PROMPT_PREFIX = "[A2A delegated task]\n";

const CLAIM_WAIT_SECONDS = 30;
const RETRY_DELAY_MS = 250;
const MAX_PROMPT_BYTES = 65_536;
const MAX_RESULT_BYTES = 65_536;

type PiMessage = SessionMessageEntry["message"];

export interface CoordinationClient {
  claim(body: { waitSeconds: number }, signal?: AbortSignal): Promise<ClaimedDelivery | undefined>;
  accept(deliveryId: string, signal?: AbortSignal): Promise<TaskMutationResponse>;
  reject(deliveryId: string, body: { code: string; message?: string }, signal?: AbortSignal): Promise<TaskMutationResponse>;
  progress(taskId: string, body: { message?: AdapterMessage }, signal?: AbortSignal): Promise<TaskMutationResponse>;
  complete(taskId: string, deliveryId: string, body: { message: AdapterMessage }, signal?: AbortSignal): Promise<TaskMutationResponse>;
  fail(taskId: string, deliveryId: string, body: { code: string; message?: string }, signal?: AbortSignal): Promise<TaskMutationResponse>;
  acknowledgeCanceled(taskId: string, signal?: AbortSignal): Promise<TaskMutationResponse>;
}

export interface InboundDeliveryCredentials {
  baseUrl: string;
  sessionId: string;
  taskCapability: string;
}

export type CoordinationClientFactory = (credentials: InboundDeliveryCredentials) => CoordinationClient;

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value?: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
}

interface ActiveDelivery {
  claim: ClaimedDelivery;
  client: CoordinationClient;
  context: ExtensionContext;
  output: string[];
  outputBytes: number;
  turnFailed: boolean;
  canceled: boolean;
  settled: Deferred<void>;
  finished: Deferred<void>;
  checkpoint: Promise<void>;
  checkpointFailed: boolean;
}

export class PiInboundDelivery {
  private readonly shutdown = new AbortController();
  private claimController: AbortController | undefined;
  private loopPromise: Promise<void> | undefined;
  private active: ActiveDelivery | undefined;
  private idleWaiter: Deferred<void> | undefined;
  private context: ExtensionContext;

  constructor(
    private readonly pi: ExtensionAPI,
    context: ExtensionContext,
    private readonly getClient: () => CoordinationClient | undefined,
  ) {
    this.context = context;
  }

  start(): void {
    if (!this.loopPromise) {
      this.loopPromise = this.run();
    }
  }

  onAgentStart(context: ExtensionContext): void {
    this.context = context;
    this.claimController?.abort();
    if (this.active) {
      this.scheduleCheckpoint(this.active);
    }
  }

  onMessage(message: PiMessage, context: ExtensionContext): boolean {
    this.context = context;
    const active = this.active;
    if (!active) return false;
    if (message.role === "assistant") {
      const text = visibleAssistantText(message);
      if (text && active.outputBytes < MAX_RESULT_BYTES) {
        const separatorBytes = active.output.length > 0 ? 2 : 0;
        const remaining = Math.max(0, MAX_RESULT_BYTES - active.outputBytes - separatorBytes);
        const bounded = truncateUtf8(text, remaining);
        if (bounded) {
          active.output.push(bounded);
          active.outputBytes += separatorBytes + Buffer.byteLength(bounded, "utf8");
        }
      }
      if (message.stopReason === "error" || message.stopReason === "aborted" || message.errorMessage) {
        active.turnFailed = true;
      }
    }
    return true;
  }

  async onProgressBoundary(context: ExtensionContext): Promise<void> {
    this.context = context;
    if (this.active) {
      this.scheduleCheckpoint(this.active);
      await this.active.checkpoint;
    }
  }

  async onAgentSettled(context: ExtensionContext): Promise<void> {
    this.context = context;
    const active = this.active;
    if (!active) {
      this.wakeIdleWaiter();
      return;
    }
    this.scheduleCheckpoint(active);
    await active.checkpoint;
    active.settled.resolve();
    await active.finished.promise;
  }

  async stop(): Promise<void> {
    this.shutdown.abort();
    this.claimController?.abort();
    this.wakeIdleWaiter();
    this.active?.settled.resolve();
    await this.loopPromise?.catch(() => undefined);
  }

  private async run(): Promise<void> {
    while (!this.shutdown.signal.aborted) {
      if (!this.context.isIdle()) {
        await this.waitUntilIdle();
        continue;
      }
      const client = this.getClient();
      if (!client) {
        await abortableDelay(RETRY_DELAY_MS, this.shutdown.signal);
        continue;
      }
      this.claimController = new AbortController();
      const signal = AbortSignal.any([this.shutdown.signal, this.claimController.signal]);
      try {
        const claim = await client.claim({ waitSeconds: CLAIM_WAIT_SECONDS }, signal);
        if (!claim || this.shutdown.signal.aborted) continue;
        if (!this.context.isIdle()) {
          await client.reject(claim.deliveryId, { code: "TARGET_BUSY_RACE" }, this.shutdown.signal);
          continue;
        }
        await this.process(claim, client);
      } catch {
        if (!this.shutdown.signal.aborted && !this.claimController.signal.aborted) {
          await abortableDelay(RETRY_DELAY_MS, this.shutdown.signal);
        }
      } finally {
        this.claimController = undefined;
      }
    }
  }

  private async process(claim: ClaimedDelivery, client: CoordinationClient): Promise<void> {
    const accepted = await client.accept(claim.deliveryId, this.shutdown.signal);
    if (accepted.cancellationRequested) {
      await client.acknowledgeCanceled(claim.taskId, this.shutdown.signal);
      return;
    }

    const active: ActiveDelivery = {
      claim,
      client,
      context: this.context,
      output: [],
      outputBytes: 0,
      turnFailed: false,
      canceled: false,
      settled: deferred<void>(),
      finished: deferred<void>(),
      checkpoint: Promise.resolve(),
      checkpointFailed: false,
    };
    this.active = active;
    try {
      this.pi.sendUserMessage(buildPrompt(claim));
      await active.settled.promise;
      await active.checkpoint;
      if (this.shutdown.signal.aborted || active.canceled) return;
      if (active.checkpointFailed) throw new Error("Cancellation checkpoint failed");
      const text = truncateUtf8(active.output.join("\n\n").trim(), MAX_RESULT_BYTES);
      if (active.turnFailed) {
        await client.fail(claim.taskId, claim.deliveryId, { code: "PI_TURN_FAILED" }, this.shutdown.signal);
      } else if (!text) {
        await client.fail(claim.taskId, claim.deliveryId, { code: "PI_EMPTY_RESULT" }, this.shutdown.signal);
      } else {
        await client.complete(claim.taskId, claim.deliveryId, {
          message: {
            messageId: randomUUID(),
            parts: [{ kind: "text", text, mediaType: "text/plain" }],
          },
        }, this.shutdown.signal);
      }
    } catch {
      if (!this.shutdown.signal.aborted && !active.canceled) {
        await client.fail(claim.taskId, claim.deliveryId, { code: "PI_DELIVERY_FAILED" }, this.shutdown.signal).catch(() => undefined);
      }
    } finally {
      if (this.active === active) this.active = undefined;
      active.finished.resolve();
    }
  }

  private scheduleCheckpoint(active: ActiveDelivery): void {
    active.checkpoint = active.checkpoint.then(async () => {
      if (active.canceled || this.shutdown.signal.aborted) return;
      const response = await active.client.progress(active.claim.taskId, {}, this.shutdown.signal);
      if (!response.cancellationRequested) return;
      active.canceled = true;
      active.context.abort();
      await active.client.acknowledgeCanceled(active.claim.taskId, this.shutdown.signal);
      active.settled.resolve();
    }).catch(() => {
      active.checkpointFailed = true;
    });
  }

  private async waitUntilIdle(): Promise<void> {
    if (this.context.isIdle() || this.shutdown.signal.aborted) return;
    this.idleWaiter ??= deferred<void>();
    await Promise.race([
      this.idleWaiter.promise,
      new Promise<void>((resolve) => this.shutdown.signal.addEventListener("abort", () => resolve(), { once: true })),
    ]);
  }

  private wakeIdleWaiter(): void {
    this.idleWaiter?.resolve();
    this.idleWaiter = undefined;
  }
}

export function createCoordinationClient(credentials: InboundDeliveryCredentials): CoordinationClient {
  return new CoordinationTransport(credentials);
}

function buildPrompt(claim: ClaimedDelivery): string {
  const sourceLabel = truncateUtf8(
    claim.sourceLabel.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim(),
    512,
  ) || "agent session";
  const content = claim.message.parts
    .filter((part) => part.kind !== "data" || !isRoutingSelector(part.data))
    .map((part) => part.kind === "text" ? part.text : `[JSON data]\n${canonicalJson(part.data)}`)
    .join("\n\n");
  return truncateUtf8([
    INBOUND_TASK_PROMPT_PREFIX.trimEnd(),
    `Source: ${sourceLabel}`,
    `Deadline: ${claim.deadline}`,
    "--- Task content ---",
    content,
    "--- End task content ---",
  ].join("\n"), MAX_PROMPT_BYTES);
}

function isRoutingSelector(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as { kind?: unknown }).kind === "coordination.target");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function visibleAssistantText(message: AssistantMessage): string {
  return message.content
    .filter((part): part is Extract<(typeof message.content)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= maxBytes) return value;
  if (maxBytes <= 3) return ".".repeat(maxBytes);
  let end = maxBytes;
  while (end > 0) {
    const byte = bytes[end];
    if (byte === undefined || (byte & 0xc0) !== 0x80) break;
    end -= 1;
  }
  return `${bytes.subarray(0, Math.max(0, end - 3)).toString("utf8")}...`;
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"];
  let reject!: Deferred<T>["reject"];
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = (value) => onResolve(value as T | PromiseLike<T>);
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    timer.unref?.();
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}
