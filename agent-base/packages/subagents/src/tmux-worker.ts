import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export interface TmuxWorkerRequest {
	targetPane: string;
	cwd: string;
	sessionId: string;
	name: string;
	systemPrompt: string;
	model?: string;
	tools?: string[];
	xdgRuntimeDir?: string;
}

export interface TmuxWorker {
	paneId: string;
	sessionId: string;
}

export type RunProcess = (
	command: string,
	args: string[],
	options?: { signal?: AbortSignal },
) => Promise<{ stdout: string; stderr: string; code: number | null }>;

const workerParentOption = "@mkok_subagent_parent";
const paneLayoutTails = new Map<string, Promise<void>>();

export async function launchTmuxWorker(
	request: TmuxWorkerRequest,
	signal?: AbortSignal,
	run: RunProcess = runProcess,
): Promise<TmuxWorker> {
	if (!/^%\d+$/.test(request.targetPane)) throw new Error("The current tmux pane could not be identified.");
	if (!path.isAbsolute(request.cwd)) throw new Error("The worker working directory must be absolute.");
	if (!/^[0-9a-f-]{36}$/.test(request.sessionId)) throw new Error("The worker session ID is invalid.");

	const invocation = getPiInvocation();
	const piArgs = [
		...invocation.args,
		"--session-id",
		request.sessionId,
		"--name",
		request.name,
	];
	if (request.model) piArgs.push("--model", request.model);
	if (request.tools && request.tools.length > 0) piArgs.push("--tools", request.tools.join(","));
	if (request.systemPrompt.trim()) piArgs.push("--append-system-prompt", request.systemPrompt);

	const childEnvironment = [
		"env",
		"-u", "PI_SESSION_ID",
		"-u", "PI_SESSION_FILE",
		"-u", "PI_PROVIDER",
		"-u", "PI_MODEL",
		"-u", "PI_REASONING_LEVEL",
	];
	if (request.xdgRuntimeDir) childEnvironment.push(`XDG_RUNTIME_DIR=${request.xdgRuntimeDir}`);
	const childCommand = [
		...childEnvironment,
		invocation.command,
		...piArgs,
	].map(shellQuote).join(" ");

	const paneId = await withPaneLayoutLock(request.targetPane, async () => {
		signal?.throwIfAborted();
		const workerPanes = await findWorkerPanes(request.targetPane, signal, run);
		const splitTarget = widestPane(workerPanes)?.paneId ?? request.targetPane;
		const splitDirection = workerPanes.length === 0 ? ["-v", "-l", "50%"] : ["-h"];
		const result = await run("tmux", [
			"split-window",
			"-d",
			"-P",
			"-F",
			"#{pane_id}",
			...splitDirection,
			"-t",
			splitTarget,
			"-c",
			request.cwd,
			childCommand,
		], { signal });
		if (result.code !== 0) {
			throw new Error(`Could not create the worker pane: ${safeError(result.stderr)}`);
		}
		const createdPane = result.stdout.trim();
		if (!/^%\d+$/.test(createdPane)) throw new Error("tmux did not return a worker pane ID.");

		try {
			const tagged = await run("tmux", [
				"set-option",
				"-p",
				"-t",
				createdPane,
				workerParentOption,
				request.targetPane,
			], { signal });
			if (tagged.code !== 0) {
				throw new Error(`Could not identify the worker region: ${safeError(tagged.stderr)}`);
			}
			return createdPane;
		} catch (error) {
			await killTmuxPane(createdPane, run);
			throw error;
		}
	});
	return { paneId, sessionId: request.sessionId };
}

export async function closeTmuxPane(
	paneId: string,
	run: RunProcess = runProcess,
): Promise<void> {
	if (!/^%\d+$/.test(paneId)) return;
	const inspected = await run("tmux", [
		"display-message",
		"-p",
		"-t",
		paneId,
		`#{${workerParentOption}}`,
	]).catch(() => undefined);
	const parentPane = inspected?.code === 0 ? inspected.stdout.trim() : "";
	if (/^%\d+$/.test(parentPane)) {
		await withPaneLayoutLock(parentPane, () => killTmuxPane(paneId, run));
		return;
	}
	await killTmuxPane(paneId, run);
}

export function currentTmuxPane(env: NodeJS.ProcessEnv = process.env): string {
	const pane = env.TMUX_PANE;
	if (!env.TMUX || !pane || !/^%\d+$/.test(pane)) {
		throw new Error("Persistent subagents require Pi to run inside tmux.");
	}
	return pane;
}

export function shellQuote(value: string): string {
	if (value.length === 0) return "''";
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

interface WorkerPane {
	paneId: string;
	width: number;
}

async function findWorkerPanes(
	targetPane: string,
	signal: AbortSignal | undefined,
	run: RunProcess,
): Promise<WorkerPane[]> {
	const result = await run("tmux", [
		"list-panes",
		"-t",
		targetPane,
		"-F",
		`#{pane_id}\t#{${workerParentOption}}\t#{pane_width}`,
	], { signal });
	if (result.code !== 0) {
		throw new Error(`Could not inspect the worker region: ${safeError(result.stderr)}`);
	}
	return result.stdout.trim().split("\n").flatMap((line) => {
		const [paneId, parentPane, width] = line.split("\t");
		if (!paneId || parentPane !== targetPane || !/^%\d+$/.test(paneId)) return [];
		const parsedWidth = Number.parseInt(width ?? "", 10);
		return Number.isFinite(parsedWidth) ? [{ paneId, width: parsedWidth }] : [];
	});
}

function widestPane(panes: WorkerPane[]): WorkerPane | undefined {
	return panes.reduce<WorkerPane | undefined>((widest, pane) => (
		!widest || pane.width > widest.width ? pane : widest
	), undefined);
}

async function killTmuxPane(paneId: string, run: RunProcess): Promise<void> {
	await run("tmux", ["kill-pane", "-t", paneId]).catch(() => undefined);
}

async function withPaneLayoutLock<T>(targetPane: string, action: () => Promise<T>): Promise<T> {
	const previous = paneLayoutTails.get(targetPane) ?? Promise.resolve();
	let release = (): void => undefined;
	const current = new Promise<void>((resolve) => { release = resolve; });
	paneLayoutTails.set(targetPane, current);
	await previous;
	try {
		return await action();
	} finally {
		release();
		if (paneLayoutTails.get(targetPane) === current) paneLayoutTails.delete(targetPane);
	}
}

function getPiInvocation(): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript] };
	}
	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	return isGenericRuntime ? { command: "pi", args: [] } : { command: process.execPath, args: [] };
}

function runProcess(
	command: string,
	args: string[],
	options: { signal?: AbortSignal } = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], signal: options.signal });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
		child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
		child.once("error", reject);
		child.once("close", (code) => resolve({ stdout, stderr, code }));
	});
}

function safeError(value: string): string {
	const line = value.trim().split("\n")[0] ?? "tmux failed";
	return line.slice(0, 512) || "tmux failed";
}
