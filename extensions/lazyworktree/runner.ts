import { spawn } from "node:child_process";
import type { LazyWorktreeInvokeOptions, LazyWorktreeRunnerResult } from "./client.ts";

// LazyWorktree JSON commands must wait for stdio close rather than relying on pi.exec,
// because a short-lived child can exit before all stdout data has been drained.

const FORCE_KILL_DELAY_MS = 5_000;
export const DEFAULT_LAZYWORKTREE_OUTPUT_LIMIT_BYTES = 1024 * 1024;

function abortError(signal?: AbortSignal): Error {
	if (signal?.reason instanceof Error) return signal.reason;
	if (typeof DOMException === "function") return new DOMException("The operation was aborted.", "AbortError");
	const error = new Error("The operation was aborted.");
	error.name = "AbortError";
	return error;
}

function timeoutError(command: string, args: string[], timeout: number): Error {
	return new Error(`${command} ${args.join(" ")} timed out after ${timeout}ms`);
}

function outputLimitError(command: string, args: string[], limit: number): Error {
	return new Error(`${command} ${args.join(" ")} output exceeded ${limit} bytes`);
}

export async function runLazyWorktreeCommand(
	command: string,
	args: string[],
	options: LazyWorktreeInvokeOptions & { maxOutputBytes?: number } = {},
): Promise<LazyWorktreeRunnerResult> {
	if (options.signal?.aborted) throw abortError(options.signal);
	const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_LAZYWORKTREE_OUTPUT_LIMIT_BYTES;
	return new Promise((resolve, reject) => {
		let proc;
		try {
			proc = spawn(command, args, {
				cwd: options.cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});
		} catch (error) {
			reject(error);
			return;
		}

		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		let outputBytes = 0;
		let settled = false;
		let forcedKillId: NodeJS.Timeout | undefined;
		let timeoutId: NodeJS.Timeout | undefined;
		let terminationError: Error | undefined;

		const cleanup = () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = undefined;
			}
			if (forcedKillId) {
				clearTimeout(forcedKillId);
				forcedKillId = undefined;
			}
			if (options.signal) options.signal.removeEventListener("abort", onAbort);
			proc.removeListener("error", onError);
			proc.removeListener("close", onClose);
			proc.stdout?.removeListener("data", onStdout);
			proc.stderr?.removeListener("data", onStderr);
		};

		const terminate = (error: Error) => {
			if (terminationError) return;
			terminationError = error;
			proc.kill("SIGTERM");
			forcedKillId = setTimeout(() => {
				proc.kill("SIGKILL");
			}, FORCE_KILL_DELAY_MS);
			forcedKillId.unref?.();
		};

		const onData = (chunks: Buffer[], chunk: Buffer) => {
			if (settled) return;
			outputBytes += chunk.length;
			if (outputBytes <= maxOutputBytes) chunks.push(chunk);
			if (outputBytes > maxOutputBytes && !terminationError) terminate(outputLimitError(command, args, maxOutputBytes));
		};

		const onStdout = (chunk: Buffer | string) => {
			onData(stdout, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		};

		const onStderr = (chunk: Buffer | string) => {
			onData(stderr, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		};

		const onAbort = () => {
			terminate(abortError(options.signal));
		};

		const onError = (error: Error) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		};

		const onClose = (code: number | null) => {
			if (settled) return;
			settled = true;
			cleanup();
			if (terminationError) {
				reject(terminationError);
				return;
			}
			resolve({
				code: code ?? 0,
				stdout: Buffer.concat(stdout).toString("utf8"),
				stderr: Buffer.concat(stderr).toString("utf8"),
			});
		};

		proc.stdout?.on("data", onStdout);
		proc.stderr?.on("data", onStderr);
		proc.once("error", onError);
		proc.once("close", onClose);

		if (options.signal) options.signal.addEventListener("abort", onAbort, { once: true });
		if (options.timeout && options.timeout > 0) {
			timeoutId = setTimeout(() => {
				terminate(timeoutError(command, args, options.timeout!));
			}, options.timeout);
			timeoutId.unref?.();
		}
	});
}
