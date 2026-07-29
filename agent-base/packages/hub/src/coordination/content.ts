import type { CoordinationMessage, JsonValue, SupportedPart } from "./types.js";
import { CoordinationError } from "./errors.js";
export const MAX_PART_BYTES = 65_536;
export const MAX_TASK_CONTENT_BYTES = 1_048_576;
export function partBytes(part: SupportedPart): number {
  return Buffer.byteLength(part.kind === "text" ? part.text : JSON.stringify(part.data), "utf8");
}
export function validateMessage(message: CoordinationMessage): number {
  if (!message.messageId || message.messageId.length > 128 || message.parts.length === 0 || message.parts.length > 100) {
    throw new CoordinationError("UNSUPPORTED_CONTENT", "Message shape is invalid", 400);
  }
  let total = 0;
  for (const part of message.parts) {
    if ((part.kind === "text" && part.mediaType !== "text/plain") ||
        (part.kind === "data" && (part.mediaType !== "application/json" || !isJsonValue(part.data)))) {
      throw new CoordinationError("UNSUPPORTED_CONTENT", "Message content is unsupported", 400);
    }
    const size = partBytes(part);
    if (size > MAX_PART_BYTES) throw new CoordinationError("TASK_CONTENT_LIMIT", "A message part exceeds 64 KiB", 413);
    total += size;
  }
  return total;
}
export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return typeof value === "object" && Object.values(value as Record<string, unknown>).every(isJsonValue);
}
