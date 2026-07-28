import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LazyWorktreeClient, type LazyWorktreeContextResult, type LazyWorktreeRunnerResult } from "./client.ts";
import {
	buildWorkspaceLaunch,
	canonicalPath,
	classifyWorkspace,
	nonTmuxLaunchHelp,
	prepareWorkspaceInput,
	resolveTmuxSessionTarget,
	type PreparedWorkspace,
	type WorkspaceClassification,
	type WorkspaceStatus,
} from "./core.ts";

export interface WorkspaceExecOptions {
	cwd?: string;
	timeout?: number;
	signal?: AbortSignal;
}

export interface WorkspaceExecResult {
	code: number;
	stdout: string;
	stderr: string;
	killed?: boolean;
}

export type WorkspaceExec = (command: string, args: string[], options?: WorkspaceExecOptions) => Promise<WorkspaceExecResult>;

const EXPECTED_UNMANAGED_RESOLUTION_CODES = new Set(["worktree_not_found", "repo_not_found"]);

function lazyWorktreeFailureReason(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function abortError(signal?: AbortSignal): Error {
	if (signal?.reason instanceof Error) return signal.reason;
	if (typeof DOMException === "function") return new DOMException("The operation was aborted.", "AbortError");
	const error = new Error("The operation was aborted.");
	error.name = "AbortError";
	return error;
}

export function isAbortError(error: unknown): boolean {
	return (error as { name?: unknown; code?: unknown } | undefined)?.name === "AbortError"
		|| (error as { code?: unknown } | undefined)?.code === "ABORT_ERR";
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw abortError(signal);
}

function rethrowIfAborted(error: unknown, signal?: AbortSignal): void {
	if (signal?.aborted || isAbortError(error)) throw signal?.aborted ? abortError(signal) : error as Error;
}

export function isExpectedUnmanagedResolutionError(error: unknown): boolean {
	const code = (error as { lazyWorktreeCode?: unknown } | undefined)?.lazyWorktreeCode;
	return typeof code === "string" && EXPECTED_UNMANAGED_RESOLUTION_CODES.has(code);
}

export function classifyWorkspaceResolutionFailure(cwd: string, error: unknown, isGitRepository: boolean): WorkspaceClassification {
	const canonicalCwd = canonicalPath(cwd);
	if (!isGitRepository || isExpectedUnmanagedResolutionError(error)) {
		return { kind: "unmanaged", cwd, canonicalCwd, reason: lazyWorktreeFailureReason(error) };
	}
	return { kind: "unknown", cwd, canonicalCwd, reason: lazyWorktreeFailureReason(error) };
}

export async function isGitRepository(exec: WorkspaceExec, cwd: string, signal?: AbortSignal): Promise<boolean> {
	const result = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, timeout: 5_000, signal });
	return result.code === 0 && Boolean(result.stdout.trim());
}

export async function classifyCurrentWorkspace(
	exec: WorkspaceExec,
	client: LazyWorktreeClient,
	cwd: string,
	signal?: AbortSignal,
): Promise<WorkspaceClassification> {
	throwIfAborted(signal);
	try {
		const resolved = await client.resolveFromCwd(cwd, signal);
		throwIfAborted(signal);
		return classifyWorkspace(cwd, resolved.worktree);
	} catch (error) {
		rethrowIfAborted(error, signal);
		const gitRepository = await isGitRepository(exec, cwd, signal).catch((gitError) => {
			rethrowIfAborted(gitError, signal);
			return false;
		});
		throwIfAborted(signal);
		return classifyWorkspaceResolutionFailure(cwd, error, gitRepository);
	}
}

export async function loadWorkspaceStatus(
	exec: WorkspaceExec,
	client: LazyWorktreeClient,
	cwd: string,
	signal?: AbortSignal,
): Promise<WorkspaceStatus> {
	const classification = await classifyCurrentWorkspace(exec, client, cwd, signal);
	if (classification.kind !== "main" && classification.kind !== "worktree") return { classification };
	let context: LazyWorktreeContextResult | undefined;
	try {
		context = await client.context(classification.worktreePath, cwd, signal);
		throwIfAborted(signal);
	} catch (error) {
		rethrowIfAborted(error, signal);
		context = undefined;
	}
	return { classification, context };
}

async function gitCheck(exec: WorkspaceExec, cwd: string, args: string[], failure: string, signal?: AbortSignal): Promise<string> {
	const result = await exec("git", args, { cwd, timeout: 10_000, signal });
	if (result.code !== 0) {
		const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
		throw new Error(`${failure}: ${detail}`);
	}
	return result.stdout.trim();
}

async function gitBranchExists(exec: WorkspaceExec, cwd: string, branch: string, signal?: AbortSignal): Promise<boolean> {
	const result = await exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd, timeout: 5_000, signal });
	return result.code === 0;
}

export async function detectDefaultBaseBranch(exec: WorkspaceExec, cwd: string, signal?: AbortSignal): Promise<string> {
	const symbolic = await exec("git", ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"], { cwd, timeout: 5_000, signal });
	if (symbolic.code === 0) {
		const ref = symbolic.stdout.trim().replace(/^refs\/remotes\//, "");
		if (ref) return ref;
	}
	for (const candidate of ["origin/main", "origin/master", "main", "master"]) {
		const result = await exec("git", ["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`], { cwd, timeout: 5_000, signal });
		if (result.code === 0) return candidate;
	}
	throw new Error("Could not determine a default base branch; specify baseBranch explicitly");
}

export async function prepareWorkspaceRequest(
	exec: WorkspaceExec,
	cwd: string,
	input: Omit<Parameters<typeof prepareWorkspaceInput>[0], "baseBranch"> & { baseBranch?: string },
	signal?: AbortSignal,
): Promise<PreparedWorkspace> {
	const baseBranch = input.baseBranch?.trim() || await detectDefaultBaseBranch(exec, cwd, signal);
	const prepared = prepareWorkspaceInput({ ...input, baseBranch });
	await gitCheck(exec, cwd, ["check-ref-format", "--branch", prepared.branch], `invalid Git branch name ${prepared.branch}`, signal);
	await gitCheck(exec, cwd, ["rev-parse", "--verify", "--quiet", `${prepared.baseBranch}^{commit}`], `base branch ${prepared.baseBranch} does not resolve`, signal);
	if (await gitBranchExists(exec, cwd, prepared.branch, signal)) {
		throw new Error(`target branch already exists: ${prepared.branch}`);
	}
	if (prepared.worktreeName !== prepared.branch && await gitBranchExists(exec, cwd, prepared.worktreeName, signal)) {
		throw new Error(`temporary worktree branch already exists: ${prepared.worktreeName}`);
	}
	return prepared;
}

async function withNoteFile<T>(note: string, run: (noteFile: string) => Promise<T>): Promise<T> {
	const directory = await mkdtemp(join(tmpdir(), "pi-lazyworktree-"));
	const noteFile = join(directory, "workspace-note.md");
	try {
		await writeFile(noteFile, note, "utf8");
		return await run(noteFile);
	} finally {
		await rm(directory, { recursive: true, force: true }).catch(() => undefined);
	}
}

async function safeExec(
	exec: WorkspaceExec,
	command: string,
	args: string[],
	options: WorkspaceExecOptions,
	missingMessage: string,
): Promise<LazyWorktreeRunnerResult> {
	try {
		return await exec(command, args, options);
	} catch (error) {
		if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") throw new Error(missingMessage);
		throw error;
	}
}

async function gitLike(resultPromise: Promise<LazyWorktreeRunnerResult>, failure: string): Promise<string> {
	const result = await resultPromise;
	if (result.code !== 0) {
		const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
		throw new Error(`${failure}: ${detail}`);
	}
	return result.stdout.trim();
}

export async function createWorkspace(
	exec: WorkspaceExec,
	client: LazyWorktreeClient,
	cwd: string,
	prepared: PreparedWorkspace,
	launchInTmux: boolean,
	signal?: AbortSignal,
	environment: NodeJS.ProcessEnv = process.env,
) {
	return withNoteFile(prepared.note, async (noteFile) => {
		const created = await client.create({
			cwd,
			fromBranch: prepared.baseBranch,
			worktreeName: prepared.worktreeName,
			noteFile,
			description: prepared.description,
			tags: prepared.workId ? [prepared.workId] : undefined,
		}, signal);
		let verified: LazyWorktreeContextResult;
		try {
			verified = await client.context(created.path, created.path, signal);
		} catch (error) {
			throw new Error(`workspace remains at ${created.path}, but its saved context could not be verified: ${error instanceof Error ? error.message : String(error)}`);
		}
		if (!verified.note?.note?.trim()) {
			throw new Error(`workspace remains at ${created.path}, but its saved note was empty`);
		}
		if (prepared.workId && !verified.worktree.tags?.includes(prepared.workId)) {
			throw new Error(`workspace remains at ${created.path}, but workId ${prepared.workId} was not saved as a tag`);
		}
		if (prepared.worktreeName !== prepared.branch) {
			await gitCheck(exec, created.path, ["branch", "--move", prepared.branch], `workspace remains at ${created.path} on temporary branch ${prepared.worktreeName}; branch rename failed`, signal);
		}
		const hasUpstream = await exec("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], { cwd: created.path, timeout: 5_000, signal });
		if (hasUpstream.code === 0) {
			await gitCheck(exec, created.path, ["branch", "--unset-upstream"], `workspace remains at ${created.path}, but upstream removal failed`, signal);
		}
		const currentBranch = await gitCheck(exec, created.path, ["branch", "--show-current"], `workspace remains at ${created.path}, but its branch could not be verified`, signal);
		if (currentBranch !== prepared.branch) {
			throw new Error(`workspace remains at ${created.path}, but expected branch ${prepared.branch} and found ${currentBranch}`);
		}
		const readyCreated = { ...created, branch: currentBranch };
		if (!launchInTmux || !environment.TMUX?.trim()) {
			return {
				created: readyCreated,
				verified,
				launchHelp: nonTmuxLaunchHelp(readyCreated.path, prepared.windowName, prepared.launchPrompt),
			};
		}
		const hasSession = await safeExec(
			exec,
			"tmux",
			["has-session", "-t", prepared.tmuxSession],
			{ cwd: created.path, timeout: 5_000, signal },
			`workspace is ready at ${created.path}, but tmux is not installed or is not available on PATH`,
		);
		if (hasSession.code !== 0) {
			throw new Error(`workspace is ready at ${created.path}, but tmux session ${prepared.tmuxSession} does not exist`);
		}
		const sessionMetadata = await gitLike(
			safeExec(
				exec,
				"tmux",
				["display-message", "-p", "-t", `${prepared.tmuxSession}:`, "#{session_name}\t#{session_group}"],
				{ cwd: created.path, timeout: 5_000, signal },
				`workspace is ready at ${created.path}, but tmux is not installed or is not available on PATH`,
			),
			`tmux session ${prepared.tmuxSession} could not be inspected`,
		);
		const launchSession = resolveTmuxSessionTarget(prepared.tmuxSession, sessionMetadata);
		let launch;
		try {
			launch = buildWorkspaceLaunch({
				worktreePath: created.path,
				windowName: prepared.windowName,
				sessionName: launchSession,
				prompt: prepared.launchPrompt,
			});
		} catch (error) {
			throw new Error(`workspace is ready at ${created.path}, but Pi could not be relaunched safely: ${error instanceof Error ? error.message : String(error)}`);
		}
		const launched = await safeExec(
			exec,
			"tmux",
			launch.args,
			{ cwd: created.path, timeout: 10_000, signal },
			`workspace is ready at ${created.path}, but tmux is not installed or is not available on PATH`,
		);
		if (launched.code !== 0) {
			const detail = launched.stderr.trim() || launched.stdout.trim() || `exit ${launched.code}`;
			throw new Error(`workspace is ready at ${created.path}, but the tmux Pi window failed to launch: ${detail}`);
		}
		return { created: readyCreated, verified, tmuxWindow: launched.stdout.trim(), launchHelp: undefined as string | undefined };
	});
}
