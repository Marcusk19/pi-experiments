export type CoordinationErrorCode =
  | "TASK_NOT_FOUND" | "TASK_NOT_CANCELABLE" | "TARGET_REJECTED" | "TARGET_UNAVAILABLE"
  | "DELIVERY_LOST" | "DELIVERY_NOT_FOUND" | "DELIVERY_NOT_OWNED" | "DEADLINE_EXCEEDED"
  | "TASK_CONTENT_LIMIT" | "TASK_COUNT_LIMIT" | "DATABASE_LIMIT" | "UNSUPPORTED_CONTENT"
  | "INVALID_ROUTING_EXTENSION" | "WORKER_PROVIDER_NOT_FOUND" | "WORKER_START_FAILED" | "LAUNCH_TOKEN_INVALID";

export class CoordinationError extends Error {
  constructor(readonly code: CoordinationErrorCode, message: string, readonly status: number) {
    super(message); this.name = "CoordinationError";
  }
}
