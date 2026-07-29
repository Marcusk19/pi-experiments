import { readFile, rm } from "node:fs/promises";
import { Type, type Static } from "typebox";
import { Check } from "typebox/value";
import { PROTOCOL_VERSION, HealthResponseSchema } from "@agent-hub/contracts";
import type { RuntimePaths } from "./paths.js";
import { HubClientError, HubTransport } from "./transport.js";

const DiscoveryRecordSchema = Type.Object({
  port: Type.Integer({ minimum: 1 }),
  pid: Type.Integer({ minimum: 1 }),
  token: Type.String({ minLength: 1 }),
  protocolVersion: Type.Integer({ minimum: 1 }),
  startedAt: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });
export interface DiscoveryRecord extends Omit<Static<typeof DiscoveryRecordSchema>, "protocolVersion"> {
  protocolVersion: typeof PROTOCOL_VERSION;
}

export type HealthCheck = (record: DiscoveryRecord, signal?: AbortSignal) => Promise<void>;

const defaultHealthCheck: HealthCheck = async (record, signal) => {
  const transport = new HubTransport({ baseUrl: `http://127.0.0.1:${record.port}`, token: record.token });
  const response = await transport.health(signal);
  if (!Check(HealthResponseSchema, response)) {
    throw new HubClientError({
      code: "INVALID_RESPONSE",
      message: "Agent Activity Hub returned an invalid health payload.",
      retryable: true,
    });
  }
};

export interface ReadDiscoveryOptions {
  healthCheck?: HealthCheck;
  signal?: AbortSignal;
}

export async function readHealthyDiscovery(
  paths: RuntimePaths,
  options: ReadDiscoveryOptions = {},
): Promise<DiscoveryRecord | undefined> {
  let raw: string;
  try {
    raw = await readFile(paths.discoveryFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new HubClientError({
      code: "DISCOVERY_READ_FAILED",
      message: "Unable to read the Agent Activity Hub discovery file.",
      retryable: true,
      cause: error,
    });
  }

  const record = await parseRecord(raw, paths);
  if (!record) return undefined;
  if (record.protocolVersion !== PROTOCOL_VERSION) {
    throw new HubClientError({
      code: "INCOMPATIBLE_PROTOCOL",
      message: "Agent Activity Hub protocol is incompatible with this client.",
      retryable: false,
    });
  }

  const healthCheck = options.healthCheck ?? defaultHealthCheck;
  try {
    await healthCheck(record, options.signal);
  } catch (error) {
    if (error instanceof HubClientError && error.code === "INCOMPATIBLE_PROTOCOL") {
      throw error;
    }
    return undefined;
  }
  return record;
}

async function parseRecord(raw: string, paths: RuntimePaths): Promise<DiscoveryRecord | undefined> {
  try {
    const parsed = JSON.parse(raw);
    if (Check(DiscoveryRecordSchema, parsed)) {
      return parsed as DiscoveryRecord;
    }
  } catch {
    // ignore
  }
  await rm(paths.discoveryFile, { force: true }).catch(() => undefined);
  return undefined;
}
