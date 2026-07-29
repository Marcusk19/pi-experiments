import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const COORDINATION_API_CHANNEL = "agent-activity-hub:coordination-api:v1";

export type CoordinatedTaskState =
	| "submitted"
	| "working"
	| "completed"
	| "failed"
	| "canceled"
	| "rejected"
	| "unknown";

export interface CoordinatedTaskSnapshot {
	taskId: string;
	contextId: string;
	state: CoordinatedTaskState;
	deadline?: string;
	cancellationRequested: boolean;
	terminalCode?: string;
	targetText?: string;
}

export interface PiCoordinationApi {
	readonly version: 1;
	sendToHarnessSession(
		request: {
			harnessSessionId: string;
			instruction: string;
			deadlineMinutes?: number;
			targetWaitMs?: number;
		},
		signal?: AbortSignal,
	): Promise<CoordinatedTaskSnapshot>;
	watch(taskId: string, signal?: AbortSignal): Promise<CoordinatedTaskSnapshot>;
	cancel(taskId: string, signal?: AbortSignal): Promise<CoordinatedTaskSnapshot>;
}

export function requestCoordinationApi(pi: ExtensionAPI): PiCoordinationApi {
	let api: PiCoordinationApi | undefined;
	pi.events.emit(COORDINATION_API_CHANNEL, {
		version: 1,
		accept(candidate: unknown) {
			if (isCoordinationApi(candidate)) api = candidate;
		},
	});
	if (!api) {
		throw new Error(
			"Local Pi coordination is unavailable. Load a current agent-base extension and restart Pi.",
		);
	}
	return api;
}

export function isTerminalTaskState(state: CoordinatedTaskState): boolean {
	return state === "completed" || state === "failed" || state === "canceled" || state === "rejected";
}

function isCoordinationApi(value: unknown): value is PiCoordinationApi {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<PiCoordinationApi>;
	return (
		candidate.version === 1 &&
		typeof candidate.sendToHarnessSession === "function" &&
		typeof candidate.watch === "function" &&
		typeof candidate.cancel === "function"
	);
}
