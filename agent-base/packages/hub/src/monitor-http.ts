import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError, sendJson, bearerToken } from "./http-utils.js";
import type { MonitorProjection } from "./monitor-projection.js";
import type { MonitorRevision } from "./monitor-revision.js";

export interface MonitorHttpContext {
  capabilityDigest: Buffer;
  projection: MonitorProjection;
  revision: MonitorRevision;
  signal?: AbortSignal;
}

function authenticateMonitor(req: IncomingMessage, expected: Buffer): void {
  const token = bearerToken(req);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    throw new HttpError(401, "UNAUTHORIZED", "Invalid monitor capability");
  }
  const candidate = createHash("sha256").update(token, "utf8").digest();
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
    throw new HttpError(401, "UNAUTHORIZED", "Invalid monitor capability");
  }
}

export async function handleMonitorRequest(
  req: IncomingMessage,
  res: ServerResponse,
  context: MonitorHttpContext,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (!url.pathname.startsWith("/monitor/")) return false;

  // Authenticate before any further processing
  authenticateMonitor(req, context.capabilityDigest);

  if (req.method !== "GET") {
    throw new HttpError(405, "METHOD_NOT_ALLOWED", "Monitor endpoints accept only GET requests");
  }

  if (url.pathname === "/monitor/v1/snapshot") {
    return handleSnapshot(url, res, context);
  }

  const detailMatch = url.pathname.match(/^\/monitor\/v1\/sessions\/([^/]+)$/);
  if (detailMatch) {
    return handleDetail(detailMatch[1]!, res, context);
  }

  throw new HttpError(404, "NOT_FOUND", "Monitor route not found");
}

async function handleSnapshot(
  url: URL,
  res: ServerResponse,
  context: MonitorHttpContext,
): Promise<boolean> {
  const afterParam = url.searchParams.get("after");
  const waitParam = url.searchParams.get("wait");

  let after: number | undefined;
  if (afterParam !== null) {
    after = Number(afterParam);
    if (!Number.isSafeInteger(after) || after < 0) {
      throw new HttpError(400, "INVALID_PARAMETER", "Parameter 'after' must be a non-negative integer");
    }
  }

  let waitMs = 0;
  if (waitParam !== null) {
    waitMs = Number(waitParam);
    if (!Number.isSafeInteger(waitMs) || waitMs < 0) {
      throw new HttpError(400, "INVALID_PARAMETER", "Parameter 'wait' must be a non-negative integer");
    }
    waitMs = Math.min(waitMs, 30_000);
  }

  if (after !== undefined && after === context.revision.current() && waitMs > 0) {
    await context.revision.waitForChange(after, waitMs, context.signal);
  }

  sendJson(res, 200, context.projection.snapshot());
  return true;
}

function handleDetail(
  monitorId: string,
  res: ServerResponse,
  context: MonitorHttpContext,
): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(monitorId);
  } catch {
    throw new HttpError(404, "NOT_FOUND", "Session not found");
  }
  if (!/^[0-9a-f]{32}$/.test(decoded)) {
    throw new HttpError(404, "NOT_FOUND", "Session not found");
  }

  const detail = context.projection.detail(decoded);
  if (!detail) {
    throw new HttpError(404, "NOT_FOUND", "Session not found");
  }

  sendJson(res, 200, detail);
  return true;
}
