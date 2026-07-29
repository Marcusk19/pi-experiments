import { readFile } from "node:fs/promises";
import type { LegacyRuntimePaths } from "./paths.js";

type Fetch = typeof fetch;

interface LegacyRecord {
  port: number;
  pid: number;
  token: string;
  protocolVersion: number;
  startedAt: number;
}

export async function detectLegacyDaemon(
  paths: LegacyRuntimePaths,
  fetchImpl: Fetch = fetch,
): Promise<boolean> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(paths.discoveryFile, "utf8"));
  } catch {
    return false;
  }
  if (!isRecord(value)) return false;
  try {
    const response = await fetchImpl(`http://127.0.0.1:${value.port}/v2/health`, {
      headers: { authorization: `Bearer ${value.token}`, accept: "application/json" },
      signal: AbortSignal.timeout(500),
    });
    if (!response.ok) return false;
    const health = (await response.json()) as Record<string, unknown>;
    return (
      health.protocolVersion === value.protocolVersion &&
      health.pid === value.pid &&
      health.startedAt === value.startedAt
    );
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is LegacyRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    Number.isInteger(r.port) &&
    Number(r.port) > 0 &&
    Number.isInteger(r.pid) &&
    typeof r.token === "string" &&
    r.token.length > 0 &&
    Number.isInteger(r.protocolVersion) &&
    Number.isInteger(r.startedAt)
  );
}
