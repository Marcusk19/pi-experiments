import type { AgentMessage } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionHandler,
  ExtensionUIContext,
  ModelRegistry,
  SessionEntry,
  SessionMessageEntry,
} from "@earendil-works/pi-coding-agent";
import type { SessionReporter } from "@agent-hub/client";
import { vi } from "vitest";

export interface FakePiHarness {
  pi: ExtensionAPI;
  context: ExtensionContext;
  sessionManager: FakeSessionManager;
  registerToolMock: ReturnType<typeof vi.fn>;
  sendUserMessageMock: ReturnType<typeof vi.fn>;
  isIdleMock: ReturnType<typeof vi.fn>;
  abortMock: ReturnType<typeof vi.fn>;
  emit: <E>(event: string, payload: E, ctx?: ExtensionContext) => Promise<void>;
}

export class FakeSessionManager {
  private entries: SessionEntry[] = [];
  private sessionId: string;
  private cwd: string;
  private name?: string;

  constructor(options: { sessionId?: string; cwd?: string } = {}) {
    this.sessionId = options.sessionId ?? "pi-session";
    this.cwd = options.cwd ?? "/repo";
  }

  setName(name?: string): void {
    this.name = name;
  }

  addMessage(message: AgentMessage, id?: string): SessionMessageEntry {
    const entryId = id ?? `entry-${this.entries.length + 1}`;
    const entry: SessionMessageEntry = {
      type: "message",
      id: entryId,
      parentId: this.entries.length === 0 ? null : this.entries[this.entries.length - 1]!.id,
      timestamp: new Date().toISOString(),
      message,
    };
    this.entries.push(entry);
    return entry;
  }

  setBranch(entries: SessionEntry[]): void {
    this.entries = entries.slice();
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getCwd(): string {
    return this.cwd;
  }

  getSessionName(): string | undefined {
    return this.name;
  }

  getBranch(): SessionEntry[] {
    return this.entries.slice();
  }

  getLeafEntry(): SessionEntry | undefined {
    return this.entries[this.entries.length - 1];
  }
}

export function createFakeReporter(overrides: Partial<SessionReporter> = {}): SessionReporter {
  const reporter: SessionReporter = {
    start: vi.fn().mockResolvedValue(undefined),
    enqueue: vi.fn(),
    replaceSnapshot: vi.fn(),
    updateMetadata: vi.fn(),
    query: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    sessionId: "reporter-session",
    taskCapability: undefined,
    coordinationBaseUrl: undefined,
    status: "connected",
    ...overrides,
  } as SessionReporter;
  return reporter;
}

export function createFakePiHarness(options: { sessionId?: string; cwd?: string } = {}): FakePiHarness {
  const handlers = new Map<string, ExtensionHandler<any, any>[]>();
  const busHandlers = new Map<string, Set<(data: unknown) => void>>();
  const sessionManager = new FakeSessionManager(options);
  const registerToolMock = vi.fn();
  const sendUserMessageMock = vi.fn();
  const isIdleMock = vi.fn(() => true);
  const abortMock = vi.fn();

  const pi = {
    on(event: string, handler: ExtensionHandler<any, any>) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    registerTool: registerToolMock,
    sendUserMessage: sendUserMessageMock,
    events: {
      emit(channel: string, data: unknown) {
        for (const handler of busHandlers.get(channel) ?? []) handler(data);
      },
      on(channel: string, handler: (data: unknown) => void) {
        const channelHandlers = busHandlers.get(channel) ?? new Set<(data: unknown) => void>();
        channelHandlers.add(handler);
        busHandlers.set(channel, channelHandlers);
        return () => channelHandlers.delete(handler);
      },
    },
  } as unknown as ExtensionAPI;

  const noop = () => undefined;
  const context: ExtensionContext = {
    ui: {} as ExtensionUIContext,
    mode: "tui",
    hasUI: true,
    cwd: sessionManager.getCwd(),
    sessionManager: sessionManager as unknown as ExtensionContext["sessionManager"],
    modelRegistry: {} as ModelRegistry,
    model: undefined,
    isIdle: isIdleMock,
    isProjectTrusted: () => true,
    signal: undefined,
    abort: abortMock,
    hasPendingMessages: () => false,
    shutdown: noop,
    getContextUsage: () => undefined,
    compact: noop,
    getSystemPrompt: () => "",
  };

  const emit = async <E>(event: string, payload: E, ctx: ExtensionContext = context) => {
    const list = handlers.get(event) ?? [];
    for (const handler of list) {
      await handler(payload, ctx);
    }
  };

  return { pi, context, sessionManager, registerToolMock, sendUserMessageMock, isIdleMock, abortMock, emit };
}
