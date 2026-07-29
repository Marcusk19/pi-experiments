import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import type { MonitorDiscoveryRecord } from "@agent-hub/contracts";

const publishedRecords = new Map<string, MonitorDiscoveryRecord>();

export async function writeMonitorDiscoveryFile(
  path: string,
  record: MonitorDiscoveryRecord,
): Promise<void> {
  const directory = dirname(path);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await fs.chmod(directory, 0o700);
  const tempPath = join(directory, `.tmp-monitor-${randomBytes(8).toString("hex")}`);
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

export async function ownsMonitorDiscoveryFile(
  path: string,
  expected: MonitorDiscoveryRecord,
): Promise<boolean> {
  try {
    const current = JSON.parse(await fs.readFile(path, "utf8")) as Partial<MonitorDiscoveryRecord>;
    return sameRecord(current, expected);
  } catch {
    return false;
  }
}

export async function removeMonitorDiscoveryFile(path: string): Promise<void> {
  const expected = publishedRecords.get(path);
  try {
    const contents = await fs.readFile(path, "utf8");
    const current = JSON.parse(contents) as Partial<MonitorDiscoveryRecord>;
    if (!expected || !sameRecord(current, expected)) return;
    await fs.unlink(path);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      (error as NodeJS.ErrnoException).code !== "ENOENT"
    ) {
      throw error;
    }
  } finally {
    publishedRecords.delete(path);
  }
}

function sameRecord(
  current: Partial<MonitorDiscoveryRecord>,
  expected: MonitorDiscoveryRecord,
): boolean {
  return (
    current.daemonId === expected.daemonId &&
    current.capability === expected.capability &&
    current.apiVersion === expected.apiVersion &&
    current.startedAt === expected.startedAt
  );
}
