export type HubErrorCode = "NOT_FOUND" | "SEQUENCE_GAP" | "LIMIT_EXCEEDED" | "INVALID_EVENT_SEQUENCE";

const STATUS_BY_CODE: Record<HubErrorCode, number> = {
  NOT_FOUND: 404,
  SEQUENCE_GAP: 409,
  LIMIT_EXCEEDED: 413,
  INVALID_EVENT_SEQUENCE: 400,
};

export class HubError extends Error {
  readonly code: HubErrorCode;
  readonly status: number;

  constructor(code: HubErrorCode, message: string) {
    super(message);
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

export function isHubError(error: unknown): error is HubError {
  return error instanceof HubError;
}
