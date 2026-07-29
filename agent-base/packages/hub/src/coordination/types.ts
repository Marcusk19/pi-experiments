export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type SupportedPart =
  | { kind: "text"; text: string; mediaType: "text/plain" }
  | { kind: "data"; data: JsonValue; mediaType: "application/json" };
export interface CoordinationMessage {
  messageId: string;
  role: "source" | "target";
  parts: SupportedPart[];
  extensions: string[];
}
export type TaskTarget =
  | { type: "session"; sessionId: string }
  | { type: "worker"; provider: string; cwd: string; options: Record<string, JsonValue> };
export type CoordinationTaskState = "submitted" | "working" | "completed" | "failed" | "canceled" | "rejected";
export interface CoordinationTask {
  id: string; instanceId: string; contextId: string; sourceSessionId: string; target: TaskTarget;
  targetSessionId?: string; state: CoordinationTaskState; cancellationRequested: boolean; sourceClosed: boolean;
  deadlineAt: number; createdAt: number; updatedAt: number; terminalCode?: string; contentBytes: number;
}
export interface DeliveryRecord {
  id: string; taskId: string; messageId: string; targetSessionId: string; sequence: number;
  state: "queued" | "claimed" | "accepted" | "rejected" | "resolved";
  claimedAt?: number; acknowledgedAt?: number;
}
export interface ClaimedDelivery { task: CoordinationTask; delivery: DeliveryRecord; message: CoordinationMessage; sourceLabel: string }
export interface TaskMutationResult { task: CoordinationTask; cancellationRequested: boolean }
export interface TaskListFilters { contextId?: string; state?: CoordinationTaskState; pageSize?: number; pageToken?: string; historyLength?: number; statusTimestampAfter?: number }
export interface TaskPage { tasks: CoordinationTask[]; nextPageToken?: string; pageSize: number; totalSize: number }
export interface CreateExistingTaskInput { sourceSessionId: string; targetSessionId: string; contextId: string; deadlineAt: number; message: CoordinationMessage }
export interface CreateWorkerTaskInput { sourceSessionId: string; provider: string; cwd: string; options: Record<string, JsonValue>; contextId: string; deadlineAt: number; message: CoordinationMessage }
export interface WorkerLaunchRecord { taskId: string; provider: string; launchId?: string; state: "starting" | "started" | "bound" | "failed" | "canceled"; deadlineAt: number; boundSessionId?: string }
