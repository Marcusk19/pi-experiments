import { randomBytes } from "node:crypto";
import { PROTOCOL_VERSION } from "@agent-hub/contracts";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

export interface DiscoveryRecord {
  port: number;
  pid: number;
  token: string;
  protocolVersion: typeof PROTOCOL_VERSION;
  startedAt: number;
}

const publishedRecords = new Map<string, DiscoveryRecord>();

export async function writeDiscoveryFile(path: string, record: DiscoveryRecord): Promise<void> {
  const directory = dirname(path);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await fs.chmod(directory, 0o700);
  const tempPath = join(directory, `.tmp-${randomBytes(8).toString("hex")}`);
  const handle = await fs.open(tempPath, "w", 0o600);
  try {
    await handle.writeFile(JSON.stringify(record), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(tempPath, path);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
  publishedRecords.set(path, record);
}

export async function ownsDiscoveryFile(path: string, expected: DiscoveryRecord): Promise<boolean> {
  try {
    const current = JSON.parse(await fs.readFile(path, "utf8")) as Partial<DiscoveryRecord>;
    return sameRecord(current, expected);
  } catch {
    return false;
  }
}

export async function removeDiscoveryFile(path: string): Promise<void> {
  const expected = publishedRecords.get(path);
  try {
    const contents = await fs.readFile(path, "utf8");
    const current = JSON.parse(contents) as Partial<DiscoveryRecord>;
    if (!expected || !sameRecord(current, expected)) return;
    await fs.unlink(path);
  } catch (error) {
    if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  } finally {
    publishedRecords.delete(path);
  }
}

function sameRecord(current: Partial<DiscoveryRecord>, expected: DiscoveryRecord): boolean {
  return current.pid === expected.pid
    && current.token === expected.token
    && current.protocolVersion === expected.protocolVersion
    && current.startedAt === expected.startedAt;
}
