import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_ACQUIRE_TIMEOUT_MS = 4_000;
const DEFAULT_STALE_MS = 500;
const DEFAULT_POLL_MS = 25;
const DEFAULT_TAKEOVER_GRACE_MS = 150;
const OWNER_FILE = "owner.json";

export interface OwnershipIdentity {
  pid: number;
  startedAt: number;
  nonce: string;
  /** OS process birth identity, or null when the platform cannot provide one safely. */
  processBirthIdentity: string | null;
}

interface OwnershipRecord extends OwnershipIdentity {
  refreshedAt: number;
}

export interface AcquireDaemonOwnershipOptions {
  discoveryFile: string;
  pid?: number;
  startedAt?: number;
  acquireTimeoutMs?: number;
  staleMs?: number;
  pollMs?: number;
  takeoverGraceMs?: number;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  randomSource?: (size: number) => Buffer;
  /** PID existence probe. `false` must mean that the recorded process is definitely gone. */
  isProcessAlive?: (identity: OwnershipIdentity) => boolean | Promise<boolean>;
  /** Injectable process birth lookup; undefined means that identity is unavailable or ambiguous. */
  getProcessBirthIdentity?: (pid: number) => string | undefined | Promise<string | undefined>;
}

export interface DaemonOwnership {
  readonly directory: string;
  readonly identity: OwnershipIdentity;
  refresh(): Promise<boolean>;
  release(): Promise<void>;
}

/**
 * Own the daemon slot for its complete lifetime.
 *
 * The owner record is immutable. In particular, refresh never performs a
 * compare-then-overwrite: it only verifies the complete identity. A stale slot
 * is recoverable only after both its timestamp is old and its recorded process
 * is definitely gone. PID reuse is detected by comparing OS process birth
 * identity where supported. Missing or ambiguous live identity fails closed;
 * this deliberately prefers an unavailable daemon to taking the slot from a
 * live (possibly paused) process.
 */
export async function acquireDaemonOwnership(
  options: AcquireDaemonOwnershipOptions,
): Promise<DaemonOwnership> {
  const now = options.now ?? Date.now;
  const wait = options.wait ?? ((ms: number) => delay(ms));
  const deadline = now() + (options.acquireTimeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS);
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const takeoverGraceMs = options.takeoverGraceMs ?? DEFAULT_TAKEOVER_GRACE_MS;
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  const getProcessBirthIdentity = options.getProcessBirthIdentity ?? defaultProcessBirthIdentity;
  const directory = `${options.discoveryFile}.owner`;
  const pid = options.pid ?? process.pid;
  const identity: OwnershipIdentity = {
    pid,
    startedAt: options.startedAt ?? now(),
    nonce: (options.randomSource ?? randomBytes)(24).toString("hex"),
    processBirthIdentity: normalizeProcessBirthIdentity(await getProcessBirthIdentity(pid)),
  };
  let replacedStaleOwner = false;
  let acquired = false;
  const candidate = `${directory}.candidate-${identity.nonce}`;

  await fs.mkdir(dirname(directory), { recursive: true, mode: 0o700 });
  // Build a complete generation before publishing it at the canonical path.
  // Contenders therefore never see a live owner directory without enough
  // identity to perform the required liveness check.
  await fs.mkdir(candidate, { mode: 0o700 });
  try {
    await writeOwnerRecord(candidate, { ...identity, refreshedAt: now() });
    while (now() < deadline) {
      try {
        await fs.rename(candidate, directory);
        acquired = true;
        if (replacedStaleOwner && takeoverGraceMs > 0) await wait(takeoverGraceMs);
        return createOwnership(directory, identity);
      } catch (error) {
        if (!isRetryableFilesystemRace(error)) throw error;
      }

      const current = await readOwnerRecord(directory).catch((error) => {
        if (isRetryableFilesystemRace(error)) return undefined;
        throw error;
      });
      const timestamp = current?.refreshedAt ?? await directoryTimestamp(directory);
      const stale = timestamp !== undefined && now() - timestamp > staleMs;
      // A malformed canonical generation is not eligible for takeover: valid
      // implementations publish atomically, so ambiguity must fail closed.
      if (stale && current && await recordedProcessIsDefinitelyGone(
        current,
        isProcessAlive,
        getProcessBirthIdentity,
      )) {
        const quarantine = `${directory}.stale-${identity.nonce}`;
        try {
          await fs.rename(directory, quarantine);
          // Only the detached generation is deleted. A successor can create the
          // canonical directory immediately without being reachable by cleanup.
          await fs.rm(quarantine, { recursive: true, force: true });
          replacedStaleOwner = true;
          continue;
        } catch (error) {
          if (!isRetryableFilesystemRace(error)) throw error;
        }
      }
      await wait(Math.min(pollMs, Math.max(1, deadline - now())));
    }
    throw new Error("Hub daemon ownership could not be acquired before the startup deadline.");
  } finally {
    if (!acquired) await fs.rm(candidate, { recursive: true, force: true }).catch(() => undefined);
  }
}

function createOwnership(
  directory: string,
  identity: OwnershipIdentity,
): DaemonOwnership {
  let released = false;
  let operation = Promise.resolve();

  const serialized = <T>(work: () => Promise<T>): Promise<T> => {
    const result = operation.then(work, work);
    operation = result.then(() => undefined, () => undefined);
    return result;
  };

  return {
    directory,
    identity,
    refresh() {
      return serialized(async () => {
        if (released) return false;
        return sameIdentity(await readOwnerRecord(directory), identity);
      });
    },
    release() {
      return serialized(async () => {
        if (released) return;
        released = true;
        const current = await readOwnerRecord(directory);
        if (!sameIdentity(current, identity)) return;
        await retireDirectory(directory, identity.nonce);
      });
    },
  };
}

async function retireDirectory(directory: string, nonce: string): Promise<void> {
  const retired = `${directory}.released-${nonce}`;
  try {
    // Rename is the ownership boundary. Recursive deletion is confined to the
    // old generation and can never traverse a newly acquired canonical slot.
    await fs.rename(directory, retired);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  await fs.rm(retired, { recursive: true, force: true });
}

async function writeOwnerRecord(directory: string, record: OwnershipRecord): Promise<void> {
  const path = join(directory, OWNER_FILE);
  const temp = join(directory, `.owner-${record.nonce}.tmp`);
  const handle = await fs.open(temp, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(record), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(temp, path);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
}

async function readOwnerRecord(directory: string): Promise<OwnershipRecord | undefined> {
  try {
    const value = JSON.parse(await fs.readFile(join(directory, OWNER_FILE), "utf8")) as Partial<OwnershipRecord>;
    if (
      Number.isSafeInteger(value.pid) && (value.pid ?? 0) > 0
      && Number.isSafeInteger(value.startedAt) && (value.startedAt ?? -1) >= 0
      && typeof value.nonce === "string" && value.nonce.length > 0
      && (value.processBirthIdentity === undefined || value.processBirthIdentity === null
        || (typeof value.processBirthIdentity === "string" && value.processBirthIdentity.length > 0))
      && Number.isFinite(value.refreshedAt)
    ) {
      // Records from the PID-only format remain safely readable. A missing
      // birth identity is treated as ambiguous while that PID is live, but a
      // definitely dead PID can still be recovered after an upgrade.
      return {
        ...value,
        processBirthIdentity: normalizeProcessBirthIdentity(value.processBirthIdentity),
      } as OwnershipRecord;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }
  return undefined;
}

async function directoryTimestamp(directory: string): Promise<number | undefined> {
  try {
    return (await fs.stat(directory)).mtimeMs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    if (isRetryableWindowsRace(error)) return undefined;
    throw error;
  }
}

function sameIdentity(
  current: OwnershipRecord | undefined,
  expected: OwnershipIdentity,
): boolean {
  return current?.pid === expected.pid
    && current.startedAt === expected.startedAt
    && current.nonce === expected.nonce
    && current.processBirthIdentity === expected.processBirthIdentity;
}

async function recordedProcessIsDefinitelyGone(
  identity: OwnershipIdentity,
  isProcessAlive: (identity: OwnershipIdentity) => boolean | Promise<boolean>,
  getProcessBirthIdentity: (pid: number) => string | undefined | Promise<string | undefined>,
): Promise<boolean> {
  if (!(await isProcessAlive(identity))) return true;
  if (identity.processBirthIdentity === null) return false;

  try {
    const current = normalizeProcessBirthIdentity(await getProcessBirthIdentity(identity.pid));
    // A live PID with unavailable identity is ambiguous and must never be taken
    // over. A different, positively identified birth proves PID reuse.
    return current !== null && current !== identity.processBirthIdentity;
  } catch {
    return false;
  }
}

function normalizeProcessBirthIdentity(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function defaultIsProcessAlive(identity: OwnershipIdentity): boolean {
  try {
    process.kill(identity.pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // EPERM means the PID exists but cannot be signalled. Unknown errors are
    // ambiguous. Both fail closed unless a later probe definitely disproves
    // liveness or identifies a reused PID.
    return code !== "ESRCH";
  }
}

async function defaultProcessBirthIdentity(pid: number): Promise<string | undefined> {
  if (process.platform === "linux") {
    try {
      const [stat, bootId] = await Promise.all([
        fs.readFile(`/proc/${pid}/stat`, "utf8"),
        fs.readFile("/proc/sys/kernel/random/boot_id", "utf8"),
      ]);
      const commandEnd = stat.lastIndexOf(")");
      if (commandEnd < 0) return undefined;
      // Fields after the parenthesized command begin at proc(5) field 3. The
      // process start time is field 22, hence index 19 in this suffix.
      const fields = stat.slice(commandEnd + 1).trim().split(/\s+/);
      const startTicks = fields[19];
      const boot = bootId.trim();
      if (!boot || !startTicks || !/^\d+$/.test(startTicks)) return undefined;
      return `linux:${boot}:${startTicks}`;
    } catch {
      return undefined;
    }
  }

  if (process.platform === "darwin") {
    const started = await execFileText("ps", ["-p", String(pid), "-o", "lstart="]);
    const normalized = started?.trim().replace(/\s+/g, " ");
    return normalized ? `darwin:${normalized}` : undefined;
  }

  if (process.platform === "win32") {
    const started = await execFileText("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$p = Get-Process -Id ${pid} -ErrorAction Stop; $p.StartTime.ToUniversalTime().Ticks`,
    ]);
    const ticks = started?.trim();
    return ticks && /^\d+$/.test(ticks) ? `win32:${ticks}` : undefined;
  }

  // Platforms without a stable process-birth source deliberately return no
  // identity. A live PID is then ambiguous and stale takeover fails closed.
  return undefined;
}

function execFileText(file: string, args: string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 1_000, windowsHide: true }, (error, stdout) => {
      resolve(error ? undefined : stdout);
    });
  });
}

function isRetryableWindowsRace(error: unknown): boolean {
  if (process.platform !== "win32") return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EPERM" || code === "EACCES" || code === "EBUSY";
}

function isRetryableFilesystemRace(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "EEXIST" || code === "ENOTEMPTY"
    || isRetryableWindowsRace(error);
}
