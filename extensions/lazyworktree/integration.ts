import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { LazyWorktreeClient, LazyWorktreeSummary } from "./client.ts";
import { canonicalPath, isPathInside } from "./core.ts";
import { isAbortError, type WorkspaceExec } from "./operations.ts";

export type IntegrationOperation = "rebase" | "merge";
export type IntegrationStrategy = "rebase-ff" | "no-ff";
export type IntegrationMutationStage = "preflight" | "source-rebase" | "target-fast-forward" | "target-merge" | "verification";
export type IntegrationOutcome =
	| "no-mutation"
	| "source-rebase-conflict"
	| "source-rebased-target-unchanged"
	| "target-merge-aborted"
	| "target-merge-recovery-required"
	| "completed";

export interface IntegrationRequest {
	operation: IntegrationOperation;
	strategy?: IntegrationStrategy;
	workspacePath?: string;
	targetBranch?: string;
	cwd: string;
}

export interface CheckoutSnapshot {
	path: string;
	branch: string;
	headOid: string;
	commonDirectory: string;
	clean: boolean;
	status: string[];
	activeOperations: string[];
}

export interface IntegrationPlan {
	version: 1;
	operation: IntegrationOperation;
	strategy?: IntegrationStrategy;
	repository: string;
	commonDirectory: string;
	source: CheckoutSnapshot & { worktreeName: string };
	target: CheckoutSnapshot & { worktreeName: string };
	sourceAhead: number;
	sourceBehind: number;
	sourceRebaseRequired: boolean;
	sourceAlreadyIntegrated: boolean;
	commands: string[];
}

export interface IntegrationVerification {
	passed: boolean;
	checks: string[];
	failures: string[];
}

export interface IntegrationRecovery {
	rebaseInProgress?: boolean;
	mergeInProgress?: boolean;
	conflictedPaths?: string[];
	status?: string[];
	instructions?: string[];
	blocker?: string;
}

export interface IntegrationResult {
	outcome: IntegrationOutcome;
	operation: IntegrationOperation;
	strategy?: IntegrationStrategy;
	stage: IntegrationMutationStage;
	message: string;
	cancelled: boolean;
	source: {
		path: string;
		branch: string;
		beforeOid: string;
		afterOid?: string;
		rewrittenCommits?: number;
	};
	target: {
		path: string;
		branch: string;
		beforeOid: string;
		afterOid?: string;
	};
	mutation: {
		sourceRebased: boolean;
		targetUpdated: boolean;
	};
	verification: IntegrationVerification;
	recovery?: IntegrationRecovery;
}

interface ResolvedRepository {
	repository: string;
	source: LazyWorktreeSummary;
	main: LazyWorktreeSummary;
}

interface SourceRebaseResult {
	status: "success" | "conflict" | "failed";
	source: CheckoutSnapshot;
	sourceBranchOid: string;
	target: CheckoutSnapshot;
	rewrittenCommits: number;
	commandFailure?: string;
	conflictedPaths: string[];
	verification: IntegrationVerification;
}

const INSPECTION_TIMEOUT_MS = 10_000;
const MUTATION_TIMEOUT_MS = 120_000;
const mutationLocks = new Set<string>();
const OPERATION_GIT_PATHS = [
	["rebase", "rebase-merge"],
	["rebase", "rebase-apply"],
	["merge", "MERGE_HEAD"],
	["cherry-pick", "CHERRY_PICK_HEAD"],
	["revert", "REVERT_HEAD"],
] as const;

function escaped(value: string): string {
	return escapedIdentity(value);
}

function escapedIdentity(value: string): string {
	return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, (character) => {
		return `\\x${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;
	});
}

function shellQuote(value: string): string {
	return `'${escapedIdentity(value).replaceAll("'", `'"'"'`)}'`;
}

function commandFailure(result: { code: number; stdout: string; stderr: string; killed?: boolean }): string {
	const fallback = result.killed ? "process was terminated" : `exit ${result.code}`;
	return escapedIdentity((result.stderr.trim() || result.stdout.trim() || fallback).slice(0, 8_192));
}

async function gitResult(
	exec: WorkspaceExec,
	cwd: string,
	args: string[],
	signal?: AbortSignal,
	timeout = INSPECTION_TIMEOUT_MS,
) {
	const result = await exec("git", args, { cwd, timeout, signal });
	if (result.killed) {
		const error = new Error(`git ${escapedIdentity(args[0] ?? "command")} was terminated before completion`);
		if (signal?.aborted) error.name = "AbortError";
		throw error;
	}
	return result;
}

async function requireGit(
	exec: WorkspaceExec,
	cwd: string,
	args: string[],
	failure: string,
	signal?: AbortSignal,
): Promise<string> {
	const result = await gitResult(exec, cwd, args, signal);
	if (result.code !== 0) throw new Error(`${failure}: ${commandFailure(result)}`);
	return result.stdout.trim();
}

function parseNulList(value: string): string[] {
	return value.split("\0").filter(Boolean);
}

async function operationState(exec: WorkspaceExec, cwd: string, signal?: AbortSignal): Promise<string[]> {
	const active = new Set<string>();
	for (const [operation, gitPath] of OPERATION_GIT_PATHS) {
		const path = await requireGit(
			exec,
			cwd,
			["rev-parse", "--path-format=absolute", "--git-path", gitPath],
			`could not inspect ${operation} state in ${cwd}`,
			signal,
		);
		if (existsSync(resolve(cwd, path))) active.add(operation);
	}
	return [...active];
}

async function inspectCheckout(exec: WorkspaceExec, path: string, signal?: AbortSignal): Promise<CheckoutSnapshot> {
	const canonical = canonicalPath(path);
	const [branch, headOid, commonDirectory, statusResult, activeOperations] = await Promise.all([
		requireGit(exec, canonical, ["branch", "--show-current"], `could not determine the checked-out branch in ${canonical}`, signal),
		requireGit(exec, canonical, ["rev-parse", "--verify", "HEAD^{commit}"], `could not determine HEAD in ${canonical}`, signal),
		requireGit(exec, canonical, ["rev-parse", "--path-format=absolute", "--git-common-dir"], `could not determine the Git common directory in ${canonical}`, signal),
		gitResult(exec, canonical, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], signal),
		operationState(exec, canonical, signal),
	]);
	if (statusResult.code !== 0) throw new Error(`could not inspect worktree cleanliness in ${canonical}: ${commandFailure(statusResult)}`);
	const status = parseNulList(statusResult.stdout);
	return {
		path: canonical,
		branch,
		headOid,
		commonDirectory: canonicalPath(resolve(canonical, commonDirectory)),
		clean: status.length === 0,
		status,
		activeOperations,
	};
}

async function localBranchOid(
	exec: WorkspaceExec,
	cwd: string,
	branch: string,
	signal?: AbortSignal,
): Promise<string | undefined> {
	const result = await gitResult(exec, cwd, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}^{commit}`], signal);
	return result.code === 0 ? result.stdout.trim() || undefined : undefined;
}

async function requireLocalBranchOid(
	exec: WorkspaceExec,
	cwd: string,
	branch: string,
	failure: string,
	signal?: AbortSignal,
): Promise<string> {
	const oid = await localBranchOid(exec, cwd, branch, signal);
	if (!oid) throw new Error(`${failure}: refs/heads/${escapedIdentity(branch)} does not resolve to a commit`);
	return oid;
}

async function mergeHeadOid(
	exec: WorkspaceExec,
	cwd: string,
	signal?: AbortSignal,
): Promise<string | undefined> {
	const result = await gitResult(exec, cwd, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD^{commit}"], signal);
	return result.code === 0 ? result.stdout.trim() || undefined : undefined;
}

async function validateTargetBranch(
	exec: WorkspaceExec,
	mainPath: string,
	requested: string | undefined,
	signal?: AbortSignal,
): Promise<string> {
	let target = requested?.trim();
	if (!target) {
		const symbolic = await gitResult(exec, mainPath, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"], signal);
		if (symbolic.code === 0) {
			const candidate = symbolic.stdout.trim().replace(/^refs\/remotes\/origin\//, "");
			if (candidate && await localBranchOid(exec, mainPath, candidate, signal)) target = candidate;
		}
		if (!target) {
			for (const candidate of ["main", "master"]) {
				if (await localBranchOid(exec, mainPath, candidate, signal)) {
					target = candidate;
					break;
				}
			}
		}
	}
	if (!target) throw new Error("Could not determine a local integration target from origin/HEAD, main, or master");
	const valid = await gitResult(exec, mainPath, ["check-ref-format", "--branch", target], signal);
	if (valid.code !== 0) throw new Error(`invalid local target branch ${escaped(target)}: ${commandFailure(valid)}`);
	if (!await localBranchOid(exec, mainPath, target, signal)) throw new Error(`local target branch does not exist: ${escaped(target)}`);
	return target;
}

function exactListedWorktree(
	items: readonly LazyWorktreeSummary[],
	path: string,
	repository: string,
): LazyWorktreeSummary | undefined {
	return items.find((item) => canonicalPath(item.path) === path && item.repo === repository);
}

async function resolveRepository(
	client: LazyWorktreeClient,
	cwd: string,
	workspacePath: string | undefined,
	signal?: AbortSignal,
): Promise<ResolvedRepository> {
	let sourcePath: string;
	if (workspacePath !== undefined) {
		if (!workspacePath.trim() || !isAbsolute(workspacePath)) throw new Error("workspacePath must be the exact absolute path of a managed non-main worktree");
		sourcePath = canonicalPath(workspacePath);
	} else {
		const resolvedSource = await client.resolveFromCwd(cwd, signal);
		sourcePath = canonicalPath(resolvedSource.worktree.path);
		if (!isPathInside(sourcePath, canonicalPath(cwd))) {
			throw new Error("workspacePath is required when the current directory is outside the selected managed worktree");
		}
		if (resolvedSource.worktree.is_main) {
			throw new Error("workspacePath is required when workspace rebase or merge runs from the LazyWorktree main checkout");
		}
	}

	const [sourceContext, listed] = await Promise.all([
		client.context(sourcePath, cwd, signal),
		client.list(cwd, signal),
	]);
	const contextualPath = canonicalPath(sourceContext.worktree.path);
	if (contextualPath !== sourcePath) throw new Error(`LazyWorktree resolved ${sourcePath} to a different canonical path: ${contextualPath}`);
	if (sourceContext.worktree.is_main) throw new Error("The LazyWorktree main checkout cannot be used as an integration source");
	if (sourceContext.worktree.repo !== listed.repo) throw new Error("The selected source repository does not match the current LazyWorktree repository");
	const source = exactListedWorktree(listed.items, sourcePath, listed.repo);
	if (!source || source.is_main) throw new Error("The selected source is not an exact managed non-main worktree in the current LazyWorktree repository");
	if (source.branch !== sourceContext.worktree.branch) throw new Error("LazyWorktree source branch metadata differs between context and repository listing");
	const mains = listed.items.filter((item) => item.is_main && item.repo === listed.repo);
	if (mains.length !== 1) throw new Error(`Expected exactly one LazyWorktree main checkout for ${escaped(listed.repo)}; found ${mains.length}`);
	const mainPath = canonicalPath(mains[0]!.path);
	const mainContext = await client.context(mainPath, cwd, signal);
	if (
		!mainContext.worktree.is_main ||
		canonicalPath(mainContext.worktree.path) !== mainPath ||
		mainContext.worktree.repo !== listed.repo ||
		mainContext.worktree.branch !== mains[0]!.branch
	) {
		throw new Error("LazyWorktree main-checkout identity differs between context and repository listing");
	}
	return {
		repository: listed.repo,
		source: { ...source, path: sourcePath },
		main: { ...mains[0]!, path: mainPath },
	};
}

async function isAncestor(
	exec: WorkspaceExec,
	cwd: string,
	ancestor: string,
	descendant: string,
	signal?: AbortSignal,
): Promise<boolean> {
	const result = await gitResult(exec, cwd, ["merge-base", "--is-ancestor", ancestor, descendant], signal);
	if (result.code === 0) return true;
	if (result.code === 1) return false;
	throw new Error(`could not compare commits ${ancestor} and ${descendant}: ${commandFailure(result)}`);
}

function integrationCommands(
	operation: IntegrationOperation,
	strategy: IntegrationStrategy | undefined,
	sourceOid: string,
	targetOid: string,
	sourceRebaseRequired: boolean,
	sourceAlreadyIntegrated: boolean,
): string[] {
	const rebase = `git -c commit.gpgSign=false rebase --no-autostash --no-gpg-sign --no-update-refs ${shellQuote(targetOid)}`;
	if (operation === "rebase") return sourceRebaseRequired ? [rebase] : [];
	if (strategy === "rebase-ff") {
		const fastForward = `git -c commit.gpgSign=false merge --ff-only ${shellQuote("<verified-post-rebase-source-oid>")}`;
		return sourceRebaseRequired ? [rebase, fastForward] : [fastForward];
	}
	return sourceAlreadyIntegrated ? [] : [`git -c commit.gpgSign=false merge --no-ff --commit --no-edit --no-gpg-sign ${shellQuote(sourceOid)}`];
}

export async function prepareIntegrationPlan(
	exec: WorkspaceExec,
	client: LazyWorktreeClient,
	request: IntegrationRequest,
	signal?: AbortSignal,
): Promise<IntegrationPlan> {
	if (request.operation === "merge" && request.strategy !== "rebase-ff" && request.strategy !== "no-ff") {
		throw new Error("workspace merge requires strategy=rebase-ff or strategy=no-ff");
	}
	if (request.operation === "rebase" && request.strategy !== undefined) {
		throw new Error("workspace rebase does not accept a merge strategy");
	}
	const resolved = await resolveRepository(client, request.cwd, request.workspacePath, signal);
	const targetBranch = await validateTargetBranch(exec, resolved.main.path, request.targetBranch, signal);
	const [source, target] = await Promise.all([
		inspectCheckout(exec, resolved.source.path, signal),
		inspectCheckout(exec, resolved.main.path, signal),
	]);
	if (!source.branch) throw new Error(`managed source worktree ${source.path} is detached`);
	if (!target.branch) throw new Error(`LazyWorktree main checkout ${target.path} is detached`);
	if (source.branch !== resolved.source.branch) {
		throw new Error(`LazyWorktree source branch ${escaped(resolved.source.branch)} does not match checked-out branch ${escaped(source.branch)}`);
	}
	if (target.branch !== resolved.main.branch) {
		throw new Error(`LazyWorktree main branch ${escaped(resolved.main.branch)} does not match checked-out branch ${escaped(target.branch)}`);
	}
	if (target.branch !== targetBranch) {
		throw new Error(`LazyWorktree main checkout ${target.path} must have target branch ${escaped(targetBranch)} checked out; found ${escaped(target.branch)}`);
	}
	if (source.branch === targetBranch) throw new Error("The source and target branches must be distinct");
	if (source.commonDirectory !== target.commonDirectory) throw new Error("The source and main checkout do not share the same canonical Git common directory");
	const [sourceRefOid, targetRefOid] = await Promise.all([
		localBranchOid(exec, source.path, source.branch, signal),
		localBranchOid(exec, target.path, targetBranch, signal),
	]);
	if (sourceRefOid !== source.headOid) throw new Error(`source branch refs/heads/${escaped(source.branch)} does not match source HEAD`);
	if (targetRefOid !== target.headOid) throw new Error(`target branch refs/heads/${escaped(targetBranch)} does not match main-checkout HEAD`);
	if (!source.clean) throw new Error(`source worktree is not clean: ${escaped(source.path)}`);
	if (!target.clean) throw new Error(`target worktree is not clean: ${escaped(target.path)}`);
	if (source.activeOperations.length > 0) throw new Error(`source worktree has an unfinished Git operation: ${source.activeOperations.join(", ")}`);
	if (target.activeOperations.length > 0) throw new Error(`target worktree has an unfinished Git operation: ${target.activeOperations.join(", ")}`);
	const counts = await requireGit(
		exec,
		source.path,
		["rev-list", "--left-right", "--count", `${target.headOid}...${source.headOid}`],
		"could not calculate source/target divergence",
		signal,
	);
	const [sourceBehindText, sourceAheadText] = counts.split(/\s+/, 2);
	const sourceBehind = Number(sourceBehindText);
	const sourceAhead = Number(sourceAheadText);
	if (!Number.isSafeInteger(sourceAhead) || !Number.isSafeInteger(sourceBehind)) throw new Error(`Git returned invalid ahead/behind counts: ${escaped(counts)}`);
	const [targetIsAncestor, sourceAlreadyIntegrated] = await Promise.all([
		isAncestor(exec, source.path, target.headOid, source.headOid, signal),
		isAncestor(exec, source.path, source.headOid, target.headOid, signal),
	]);
	const sourceRebaseRequired = !targetIsAncestor;
	return {
		version: 1,
		operation: request.operation,
		strategy: request.strategy,
		repository: resolved.repository,
		commonDirectory: source.commonDirectory,
		source: { ...source, worktreeName: resolved.source.name },
		target: { ...target, worktreeName: resolved.main.name },
		sourceAhead,
		sourceBehind,
		sourceRebaseRequired,
		sourceAlreadyIntegrated,
		commands: integrationCommands(request.operation, request.strategy, source.headOid, target.headOid, sourceRebaseRequired, sourceAlreadyIntegrated),
	};
}

export function formatIntegrationConfirmation(plan: IntegrationPlan): string {
	const rewrites = plan.sourceRebaseRequired && (plan.operation === "rebase" || plan.strategy === "rebase-ff");
	const partialOutcome = plan.operation === "rebase"
		? "partial outcome: rebase conflicts remain in the isolated source; the target is never mutated"
		: plan.strategy === "rebase-ff"
			? "partial outcome: a successful source rebase remains intact if the target moves or strict fast-forward fails"
			: "partial outcome: failed target recovery is reported for manual inspection; no hard reset is performed";
	return [
		"LazyWorktree integration preflight",
		`operation: ${escapedIdentity(plan.operation)}${plan.strategy ? ` (${escapedIdentity(plan.strategy)})` : ""}`,
		`source: ${escapedIdentity(plan.source.path)}`,
		`source branch: ${escapedIdentity(plan.source.branch)}`,
		`source OID: ${escapedIdentity(plan.source.headOid)}`,
		`target checkout: ${escapedIdentity(plan.target.path)}`,
		`target branch: ${escapedIdentity(plan.target.branch)}`,
		`target OID: ${escapedIdentity(plan.target.headOid)}`,
		`source divergence: ahead ${plan.sourceAhead}, behind ${plan.sourceBehind}`,
		`source commits will be rewritten: ${rewrites ? "yes" : "no"}`,
		"commands:",
		...(plan.commands.length > 0
			? plan.commands.map((command) => `  ${escapedIdentity(command)}`)
			: ["  (none; the requested result is already present)"]),
		"commit signing: explicitly disabled",
		plan.operation === "rebase" || plan.strategy === "rebase-ff"
			? "rebase conflict behavior: leave conflict state only in the isolated source; target remains unchanged"
			: "merge conflict behavior: abort the target merge when Git can safely restore the confirmed target",
		partialOutcome,
		"source branch/worktree deletion: never",
	].join("\n");
}

function verification(checks: Array<[description: string, passed: boolean]>): IntegrationVerification {
	return {
		passed: checks.every(([, passed]) => passed),
		checks: checks.filter(([, passed]) => passed).map(([description]) => description),
		failures: checks.filter(([, passed]) => !passed).map(([description]) => description),
	};
}

function baseResult(
	plan: IntegrationPlan,
	outcome: IntegrationOutcome,
	stage: IntegrationMutationStage,
	message: string,
	sourceAfter: string | undefined,
	targetAfter: string | undefined,
	checks: IntegrationVerification,
	options: {
		cancelled?: boolean;
		sourceRebased?: boolean;
		targetUpdated?: boolean;
		rewrittenCommits?: number;
		recovery?: IntegrationRecovery;
	} = {},
): IntegrationResult {
	return {
		outcome,
		operation: plan.operation,
		strategy: plan.strategy,
		stage,
		message: escaped(message),
		cancelled: options.cancelled ?? false,
		source: {
			path: plan.source.path,
			branch: plan.source.branch,
			beforeOid: plan.source.headOid,
			afterOid: sourceAfter,
			rewrittenCommits: options.rewrittenCommits,
		},
		target: {
			path: plan.target.path,
			branch: plan.target.branch,
			beforeOid: plan.target.headOid,
			afterOid: targetAfter,
		},
		mutation: {
			sourceRebased: options.sourceRebased ?? false,
			targetUpdated: options.targetUpdated ?? false,
		},
		verification: checks,
		recovery: options.recovery,
	};
}

export function integrationNoMutationResult(plan: IntegrationPlan, message: string, cancelled = false): IntegrationResult {
	return baseResult(
		plan,
		"no-mutation",
		"preflight",
		message,
		plan.source.headOid,
		plan.target.headOid,
		verification([["no Git mutation was performed", true]]),
		{ cancelled },
	);
}

function planMismatches(plan: IntegrationPlan, fresh: IntegrationPlan): string[] {
	const mismatches: string[] = [];
	if (fresh.repository !== plan.repository) mismatches.push("repository identity changed");
	if (fresh.commonDirectory !== plan.commonDirectory) mismatches.push("Git common directory changed");
	if (fresh.source.path !== plan.source.path) mismatches.push("source path changed");
	if (fresh.source.branch !== plan.source.branch) mismatches.push("source branch changed");
	if (fresh.source.headOid !== plan.source.headOid) mismatches.push("source OID changed");
	if (fresh.target.path !== plan.target.path) mismatches.push("target path changed");
	if (fresh.target.branch !== plan.target.branch) mismatches.push("target branch changed");
	if (fresh.target.headOid !== plan.target.headOid) mismatches.push("target OID changed");
	return mismatches;
}

async function revalidatePlan(
	exec: WorkspaceExec,
	client: LazyWorktreeClient,
	plan: IntegrationPlan,
	signal?: AbortSignal,
): Promise<string[]> {
	try {
		const fresh = await prepareIntegrationPlan(exec, client, {
			operation: plan.operation,
			strategy: plan.strategy,
			workspacePath: plan.source.path,
			targetBranch: plan.target.branch,
			cwd: plan.target.path,
		}, signal);
		return planMismatches(plan, fresh);
	} catch (error) {
		if (signal?.aborted || isAbortError(error)) throw error;
		return [error instanceof Error ? error.message : String(error)];
	}
}

async function conflictedPaths(exec: WorkspaceExec, cwd: string, signal?: AbortSignal): Promise<string[]> {
	const result = await gitResult(exec, cwd, ["diff", "--name-only", "--diff-filter=U", "-z"], signal);
	return result.code === 0 ? parseNulList(result.stdout).map(escaped) : [];
}

async function rewrittenCommitCount(
	exec: WorkspaceExec,
	cwd: string,
	before: string,
	after: string,
	signal?: AbortSignal,
): Promise<number> {
	if (before === after) return 0;
	const value = await requireGit(exec, cwd, ["rev-list", "--count", `${after}..${before}`], "could not count rewritten source commits", signal);
	const count = Number(value);
	if (!Number.isSafeInteger(count) || count < 0) throw new Error(`Git returned an invalid rewritten commit count: ${escaped(value)}`);
	return count;
}

async function runSourceRebase(
	exec: WorkspaceExec,
	plan: IntegrationPlan,
	signal?: AbortSignal,
): Promise<SourceRebaseResult> {
	if (!plan.sourceRebaseRequired) {
		const [source, target, sourceBranchOid] = await Promise.all([
			inspectCheckout(exec, plan.source.path, signal),
			inspectCheckout(exec, plan.target.path, signal),
			requireLocalBranchOid(exec, plan.source.path, plan.source.branch, "could not inspect the source branch after the rebase no-op", signal),
		]);
		const verified = verification([
			["source already contains the confirmed target", true],
			["source branch still has the confirmed OID", sourceBranchOid === plan.source.headOid && source.headOid === plan.source.headOid],
			["source branch remains checked out", source.branch === plan.source.branch],
			["source worktree is clean", source.clean],
			["source has no active Git operation", source.activeOperations.length === 0],
			["target still has the confirmed OID", target.headOid === plan.target.headOid],
		]);
		return {
			status: verified.passed ? "success" : "failed",
			source,
			sourceBranchOid,
			target,
			rewrittenCommits: 0,
			conflictedPaths: [],
			verification: verified,
		};
	}
	const result = await gitResult(
		exec,
		plan.source.path,
		["-c", "commit.gpgSign=false", "rebase", "--no-autostash", "--no-gpg-sign", "--no-update-refs", plan.target.headOid],
		signal,
		MUTATION_TIMEOUT_MS,
	);
	const [source, sourceBranchOid, target, conflicts] = await Promise.all([
		inspectCheckout(exec, plan.source.path, signal),
		requireLocalBranchOid(exec, plan.source.path, plan.source.branch, "could not inspect the source branch after rebase", signal),
		inspectCheckout(exec, plan.target.path, signal),
		conflictedPaths(exec, plan.source.path, signal),
	]);
	if (result.code !== 0) {
		const inProgress = source.activeOperations.includes("rebase") || conflicts.length > 0;
		return {
			status: inProgress ? "conflict" : "failed",
			source,
			sourceBranchOid,
			target,
			rewrittenCommits: 0,
			commandFailure: commandFailure(result),
			conflictedPaths: conflicts,
			verification: verification([
				["target remained at the confirmed OID", target.headOid === plan.target.headOid],
				["rebase conflict state is isolated to the source", inProgress && !target.activeOperations.includes("merge")],
			]),
		};
	}
	const based = await isAncestor(exec, source.path, plan.target.headOid, sourceBranchOid, signal);
	const rewrittenCommits = await rewrittenCommitCount(exec, source.path, plan.source.headOid, sourceBranchOid, signal);
	const verified = verification([
		["source branch remains checked out", source.branch === plan.source.branch],
		["source branch ref equals checkout HEAD", sourceBranchOid === source.headOid],
		["confirmed target is an ancestor of the resulting source", based],
		["source worktree is clean", source.clean],
		["source has no rebase state", !source.activeOperations.includes("rebase")],
		["target remained at the confirmed OID", target.headOid === plan.target.headOid],
	]);
	return {
		status: verified.passed ? "success" : "failed",
		source,
		sourceBranchOid,
		target,
		rewrittenCommits,
		conflictedPaths: conflicts,
		verification: verified,
	};
}

function sourceRebaseResult(plan: IntegrationPlan, rebased: SourceRebaseResult): IntegrationResult {
	if (rebased.status === "conflict") {
		return baseResult(
			plan,
			"source-rebase-conflict",
			"source-rebase",
			`Source rebase stopped with conflicts${rebased.commandFailure ? `: ${rebased.commandFailure}` : ""}. The target was not updated.`,
			rebased.sourceBranchOid,
			rebased.target.headOid,
			rebased.verification,
			{
				sourceRebased: rebased.sourceBranchOid !== plan.source.headOid,
				recovery: {
					rebaseInProgress: true,
					conflictedPaths: rebased.conflictedPaths,
					status: rebased.source.status.map(escaped),
					instructions: [
						`cd -- ${shellQuote(plan.source.path)} && git rebase --continue`,
						`cd -- ${shellQuote(plan.source.path)} && git rebase --abort`,
					],
				},
			},
		);
	}
	return baseResult(
		plan,
		rebased.sourceBranchOid === plan.source.headOid ? "no-mutation" : "source-rebased-target-unchanged",
		"verification",
		`Source rebase did not pass verification${rebased.commandFailure ? `: ${rebased.commandFailure}` : ""}. The target was not updated.`,
		rebased.sourceBranchOid,
		rebased.target.headOid,
		rebased.verification,
		{
			sourceRebased: rebased.sourceBranchOid !== plan.source.headOid,
			rewrittenCommits: rebased.rewrittenCommits,
			recovery: {
				rebaseInProgress: rebased.source.activeOperations.includes("rebase"),
				status: rebased.source.status.map(escaped),
				blocker: rebased.verification.failures.join("; ") || rebased.commandFailure,
			},
		},
	);
}

async function standaloneRebase(
	exec: WorkspaceExec,
	plan: IntegrationPlan,
	signal?: AbortSignal,
): Promise<IntegrationResult> {
	const rebased = await runSourceRebase(exec, plan, signal);
	if (rebased.status !== "success") return sourceRebaseResult(plan, rebased);
	return baseResult(
		plan,
		"completed",
		"verification",
		plan.sourceRebaseRequired ? "Source rebase completed and verified; target unchanged." : "Source already contains the target; no rebase was needed.",
		rebased.sourceBranchOid,
		rebased.target.headOid,
		rebased.verification,
		{
			sourceRebased: rebased.sourceBranchOid !== plan.source.headOid,
			rewrittenCommits: rebased.rewrittenCommits,
		},
	);
}

async function rebaseFastForward(
	exec: WorkspaceExec,
	plan: IntegrationPlan,
	signal: AbortSignal | undefined,
	onStage: (stage: IntegrationMutationStage) => void,
): Promise<IntegrationResult> {
	const rebased = await runSourceRebase(exec, plan, signal);
	if (rebased.status !== "success") return sourceRebaseResult(plan, rebased);
	const integratedSourceOid = rebased.sourceBranchOid;
	const [sourceBeforeTarget, sourceBranchBeforeTarget, targetBeforeMutation] = await Promise.all([
		inspectCheckout(exec, plan.source.path, signal),
		requireLocalBranchOid(exec, plan.source.path, plan.source.branch, "could not revalidate the source branch before fast-forward", signal),
		inspectCheckout(exec, plan.target.path, signal),
	]);
	const targetReady = verification([
		["source branch remains checked out", sourceBeforeTarget.branch === plan.source.branch],
		["source branch still has the verified post-rebase OID", sourceBranchBeforeTarget === integratedSourceOid && sourceBeforeTarget.headOid === integratedSourceOid],
		["source is clean before target update", sourceBeforeTarget.clean],
		["source has no active Git operation", sourceBeforeTarget.activeOperations.length === 0],
		["target branch remains checked out", targetBeforeMutation.branch === plan.target.branch],
		["target still has the confirmed OID", targetBeforeMutation.headOid === plan.target.headOid],
		["target is clean before target update", targetBeforeMutation.clean],
		["target has no active Git operation", targetBeforeMutation.activeOperations.length === 0],
	]);
	if (!targetReady.passed) {
		return baseResult(
			plan,
			"source-rebased-target-unchanged",
			"target-fast-forward",
			"Source rebase succeeded, but target revalidation failed before fast-forward. The target was not changed by this operation.",
			sourceBranchBeforeTarget,
			targetBeforeMutation.headOid,
			targetReady,
			{
				sourceRebased: sourceBranchBeforeTarget !== plan.source.headOid,
				rewrittenCommits: rebased.rewrittenCommits,
				recovery: { blocker: targetReady.failures.join("; ") },
			},
		);
	}
	onStage("target-fast-forward");
	const result = await gitResult(
		exec,
		plan.target.path,
		["-c", "commit.gpgSign=false", "merge", "--ff-only", integratedSourceOid],
		signal,
		MUTATION_TIMEOUT_MS,
	);
	const [source, sourceBranchAfter, target] = await Promise.all([
		inspectCheckout(exec, plan.source.path, signal),
		requireLocalBranchOid(exec, plan.source.path, plan.source.branch, "could not inspect the source branch after fast-forward", signal),
		inspectCheckout(exec, plan.target.path, signal),
	]);
	if (result.code !== 0) {
		const targetChanged = target.headOid !== plan.target.headOid;
		return baseResult(
			plan,
			targetChanged ? "target-merge-recovery-required" : "source-rebased-target-unchanged",
			"target-fast-forward",
			`Strict fast-forward failed: ${commandFailure(result)}. No merge-commit fallback was attempted.`,
			sourceBranchAfter,
			target.headOid,
			verification([
				["target remained at the confirmed OID", !targetChanged],
				["target has no merge state", !target.activeOperations.includes("merge")],
			]),
			{
				sourceRebased: sourceBranchAfter !== plan.source.headOid,
				targetUpdated: targetChanged,
				rewrittenCommits: rebased.rewrittenCommits,
				recovery: {
					mergeInProgress: target.activeOperations.includes("merge"),
					status: target.status.map(escaped),
					blocker: commandFailure(result),
				},
			},
		);
	}
	const verified = verification([
		["target HEAD equals the verified post-rebase source OID", target.headOid === integratedSourceOid],
		["target branch remains checked out", target.branch === plan.target.branch],
		["source branch remains checked out", source.branch === plan.source.branch],
		["source branch still has the integrated OID", sourceBranchAfter === integratedSourceOid],
		["source worktree is clean", source.clean],
		["target worktree is clean", target.clean],
		["target has no merge state", !target.activeOperations.includes("merge")],
	]);
	return baseResult(
		plan,
		verified.passed ? "completed" : "target-merge-recovery-required",
		"verification",
		verified.passed ? "Source integration completed with a strict fast-forward and was verified." : "Fast-forward returned success, but post-update verification failed.",
		sourceBranchAfter,
		target.headOid,
		verified,
		{
			sourceRebased: sourceBranchAfter !== plan.source.headOid,
			targetUpdated: target.headOid !== plan.target.headOid,
			rewrittenCommits: rebased.rewrittenCommits,
			recovery: verified.passed ? undefined : {
				mergeInProgress: target.activeOperations.includes("merge"),
				status: target.status.map(escaped),
				blocker: verified.failures.join("; "),
			},
		},
	);
}

function commitParents(value: string): string[] {
	const fields = value.trim().split(/\s+/);
	return fields.length > 0 ? fields.slice(1) : [];
}

async function noFastForward(
	exec: WorkspaceExec,
	plan: IntegrationPlan,
	signal: AbortSignal | undefined,
	onMergeLaunch: () => void,
): Promise<IntegrationResult> {
	if (plan.sourceAlreadyIntegrated) {
		const [source, sourceBranchOid, target, targetBranchOid] = await Promise.all([
			inspectCheckout(exec, plan.source.path, signal),
			requireLocalBranchOid(exec, plan.source.path, plan.source.branch, "could not revalidate the source branch before the no-fast-forward no-op", signal),
			inspectCheckout(exec, plan.target.path, signal),
			requireLocalBranchOid(exec, plan.target.path, plan.target.branch, "could not revalidate the target branch before the no-fast-forward no-op", signal),
		]);
		const stillIntegrated = await isAncestor(exec, plan.target.path, sourceBranchOid, targetBranchOid, signal);
		const verified = verification([
			["source branch still has the confirmed OID", sourceBranchOid === plan.source.headOid && source.headOid === plan.source.headOid],
			["target branch still has the confirmed OID", targetBranchOid === plan.target.headOid && target.headOid === plan.target.headOid],
			["source branch remains checked out", source.branch === plan.source.branch],
			["target branch remains checked out", target.branch === plan.target.branch],
			["source worktree is clean", source.clean],
			["target worktree is clean", target.clean],
			["source has no active Git operation", source.activeOperations.length === 0],
			["target has no active Git operation", target.activeOperations.length === 0],
			["current source is already integrated", stillIntegrated],
			["no Git mutation was performed", true],
		]);
		return baseResult(
			plan,
			verified.passed ? "completed" : "no-mutation",
			"verification",
			verified.passed
				? "Source is already an ancestor of the target; no merge commit was created."
				: "The already-integrated no-fast-forward result became stale before completion; no mutation was performed.",
			sourceBranchOid,
			targetBranchOid,
			verified,
			verified.passed ? undefined : { recovery: { blocker: verified.failures.join("; ") } },
		);
	}
	const [sourceBeforeMerge, sourceBranchBeforeMerge, targetBeforeMerge, targetBranchBeforeMerge] = await Promise.all([
		inspectCheckout(exec, plan.source.path, signal),
		requireLocalBranchOid(exec, plan.source.path, plan.source.branch, "could not revalidate the source branch before no-fast-forward merge", signal),
		inspectCheckout(exec, plan.target.path, signal),
		requireLocalBranchOid(exec, plan.target.path, plan.target.branch, "could not revalidate the target branch before no-fast-forward merge", signal),
	]);
	const targetReady = verification([
		["source branch remains checked out", sourceBeforeMerge.branch === plan.source.branch],
		["source branch ref equals checkout HEAD", sourceBeforeMerge.headOid === sourceBranchBeforeMerge],
		["source is clean before target merge", sourceBeforeMerge.clean],
		["source has no active Git operation", sourceBeforeMerge.activeOperations.length === 0],
		["target branch remains checked out", targetBeforeMerge.branch === plan.target.branch],
		["target branch still has the confirmed OID", targetBranchBeforeMerge === plan.target.headOid && targetBeforeMerge.headOid === plan.target.headOid],
		["target is clean before target merge", targetBeforeMerge.clean],
		["target has no active Git operation", targetBeforeMerge.activeOperations.length === 0],
	]);
	if (!targetReady.passed) {
		return baseResult(
			plan,
			"no-mutation",
			"target-merge",
			"Target revalidation failed before no-fast-forward merge; no mutation was performed.",
			sourceBranchBeforeMerge,
			targetBranchBeforeMerge,
			targetReady,
			{
				recovery: {
					mergeInProgress: targetBeforeMerge.activeOperations.includes("merge"),
					status: targetBeforeMerge.status.map(escaped),
					blocker: targetReady.failures.join("; "),
				},
			},
		);
	}
	onMergeLaunch();
	const result = await gitResult(
		exec,
		plan.target.path,
		["-c", "commit.gpgSign=false", "merge", "--no-ff", "--commit", "--no-edit", "--no-gpg-sign", plan.source.headOid],
		signal,
		MUTATION_TIMEOUT_MS,
	);
	let [source, sourceBranchAfter, target, currentMergeHead] = await Promise.all([
		inspectCheckout(exec, plan.source.path, signal),
		requireLocalBranchOid(exec, plan.source.path, plan.source.branch, "could not inspect the source branch after no-fast-forward merge", signal),
		inspectCheckout(exec, plan.target.path, signal),
		mergeHeadOid(exec, plan.target.path, signal),
	]);
	const incompleteSuccess = result.code === 0 && (target.headOid === plan.target.headOid || target.activeOperations.includes("merge"));
	if (result.code !== 0 || incompleteSuccess) {
		const failure = result.code === 0 ? "git merge exited successfully without creating the requested merge commit" : commandFailure(result);
		const ownsMergeState = target.activeOperations.includes("merge") && target.headOid === plan.target.headOid && currentMergeHead === plan.source.headOid;
		if (ownsMergeState) {
			const aborted = await gitResult(exec, plan.target.path, ["merge", "--abort"], signal, MUTATION_TIMEOUT_MS);
			[source, sourceBranchAfter, target, currentMergeHead] = await Promise.all([
				inspectCheckout(exec, plan.source.path, signal),
				requireLocalBranchOid(exec, plan.source.path, plan.source.branch, "could not inspect the source branch after aborting no-fast-forward merge", signal),
				inspectCheckout(exec, plan.target.path, signal),
				mergeHeadOid(exec, plan.target.path, signal),
			]);
			const restored = aborted.code === 0 && target.headOid === plan.target.headOid && target.clean && !target.activeOperations.includes("merge");
			if (restored) {
				return baseResult(
					plan,
					"target-merge-aborted",
					"target-merge",
					`No-fast-forward merge failed and was cleanly aborted: ${failure}`,
					sourceBranchAfter,
					target.headOid,
					verification([
						["target OID was restored", target.headOid === plan.target.headOid],
						["target worktree is clean", target.clean],
						["target merge state was removed", !target.activeOperations.includes("merge")],
					]),
					{ recovery: { mergeInProgress: false, status: target.status.map(escaped), blocker: failure } },
				);
			}
			return baseResult(
				plan,
				"target-merge-recovery-required",
				"target-merge",
				`No-fast-forward merge failed and automatic abort did not restore the confirmed clean target: ${failure}`,
				sourceBranchAfter,
				target.headOid,
				verification([
					["merge abort command succeeded", aborted.code === 0],
					["target OID was restored", target.headOid === plan.target.headOid],
					["target worktree is clean", target.clean],
					["target merge state was removed", !target.activeOperations.includes("merge")],
				]),
				{
					targetUpdated: target.headOid !== plan.target.headOid,
					recovery: {
						mergeInProgress: target.activeOperations.includes("merge"),
						status: target.status.map(escaped),
						blocker: aborted.code === 0 ? failure : `${failure}; git merge --abort failed: ${commandFailure(aborted)}`,
					},
				},
			);
		}
		const cleanFailure = target.headOid === plan.target.headOid && target.clean && !target.activeOperations.includes("merge");
		return baseResult(
			plan,
			cleanFailure ? "no-mutation" : "target-merge-recovery-required",
			"target-merge",
			`No-fast-forward merge failed: ${failure}`,
			sourceBranchAfter,
			target.headOid,
			verification([
				["target remained at the confirmed OID", target.headOid === plan.target.headOid],
				["target worktree is clean", target.clean],
				["target has no merge state", !target.activeOperations.includes("merge")],
			]),
			{
				targetUpdated: target.headOid !== plan.target.headOid,
				recovery: {
					mergeInProgress: target.activeOperations.includes("merge"),
					status: target.status.map(escaped),
					blocker: failure,
				},
			},
		);
	}
	const [parentsText, commitText] = await Promise.all([
		requireGit(exec, plan.target.path, ["rev-list", "--parents", "-n", "1", target.headOid], "could not inspect merge-commit parents", signal),
		requireGit(exec, plan.target.path, ["cat-file", "-p", target.headOid], "could not inspect merge-commit signature", signal),
	]);
	const parents = commitParents(parentsText);
	const headerEnd = commitText.indexOf("\n\n");
	const unsigned = !/^gpgsig /m.test(headerEnd === -1 ? commitText : commitText.slice(0, headerEnd));
	const verified = verification([
		["target HEAD changed", target.headOid !== plan.target.headOid],
		["merge commit has exactly two parents", parents.length === 2],
		["merge first parent is the confirmed target", parents[0] === plan.target.headOid],
		["merge second parent is the confirmed source", parents[1] === plan.source.headOid],
		["merge commit is unsigned", unsigned],
		["target branch remains checked out", target.branch === plan.target.branch],
		["source branch remains checked out", source.branch === plan.source.branch],
		["source branch remains at the confirmed OID", sourceBranchAfter === plan.source.headOid],
		["source worktree is clean", source.clean],
		["target worktree is clean", target.clean],
		["target has no merge state", !target.activeOperations.includes("merge")],
	]);
	return baseResult(
		plan,
		verified.passed ? "completed" : "target-merge-recovery-required",
		"verification",
		verified.passed ? "Unsigned two-parent no-fast-forward merge completed and was verified." : "No-fast-forward merge returned success, but verification failed.",
		sourceBranchAfter,
		target.headOid,
		verified,
		{
			targetUpdated: target.headOid !== plan.target.headOid,
			recovery: verified.passed ? undefined : {
				mergeInProgress: target.activeOperations.includes("merge"),
				status: target.status.map(escaped),
				blocker: verified.failures.join("; "),
			},
		},
	);
}

async function bestEffortCheckout(
	exec: WorkspaceExec,
	path: string,
	signal?: AbortSignal,
): Promise<CheckoutSnapshot | undefined> {
	return inspectCheckout(exec, path, signal).catch(() => undefined);
}

async function bestEffortBranchOid(
	exec: WorkspaceExec,
	path: string,
	branch: string,
	signal?: AbortSignal,
): Promise<string | undefined> {
	return localBranchOid(exec, path, branch, signal).catch(() => undefined);
}

async function bestEffortMergeHeadOid(
	exec: WorkspaceExec,
	path: string,
	signal?: AbortSignal,
): Promise<string | undefined> {
	return mergeHeadOid(exec, path, signal).catch(() => undefined);
}

async function interruptedResult(
	exec: WorkspaceExec,
	plan: IntegrationPlan,
	stage: IntegrationMutationStage,
	error: unknown,
	targetMergeLaunched: boolean,
	signal?: AbortSignal,
): Promise<IntegrationResult> {
	const cancelled = signal?.aborted === true || isAbortError(error);
	// An already-aborted caller signal cannot launch the mandatory recovery inspection.
	// Recovery commands therefore use an uncancelled inspection window after cancellation.
	const recoverySignal = signal?.aborted ? undefined : signal;
	let [source, sourceBranchOid, target, currentMergeHead] = await Promise.all([
		bestEffortCheckout(exec, plan.source.path, recoverySignal),
		bestEffortBranchOid(exec, plan.source.path, plan.source.branch, recoverySignal),
		bestEffortCheckout(exec, plan.target.path, recoverySignal),
		bestEffortMergeHeadOid(exec, plan.target.path, recoverySignal),
	]);
	if (
		stage === "target-merge" &&
		targetMergeLaunched &&
		target?.activeOperations.includes("merge") &&
		target.headOid === plan.target.headOid &&
		currentMergeHead === plan.source.headOid
	) {
		const aborted = await gitResult(exec, plan.target.path, ["merge", "--abort"], recoverySignal, MUTATION_TIMEOUT_MS).catch(() => undefined);
		[source, sourceBranchOid, target, currentMergeHead] = await Promise.all([
			bestEffortCheckout(exec, plan.source.path, recoverySignal),
			bestEffortBranchOid(exec, plan.source.path, plan.source.branch, recoverySignal),
			bestEffortCheckout(exec, plan.target.path, recoverySignal),
			bestEffortMergeHeadOid(exec, plan.target.path, recoverySignal),
		]);
		if (aborted?.code === 0 && target?.headOid === plan.target.headOid && target.clean && !target.activeOperations.includes("merge")) {
			return baseResult(
				plan,
				"target-merge-aborted",
				stage,
				`Integration was cancelled; the interrupted target merge was cleanly aborted. Cancellation is not a general rollback. ${error instanceof Error ? error.message : String(error)}`,
				sourceBranchOid,
				target.headOid,
				verification([
					["source recovery state was inspected", source !== undefined],
					["target OID was restored", true],
					["target worktree is clean", true],
					["target merge state was removed", true],
				]),
				{
					cancelled,
					sourceRebased: sourceBranchOid !== undefined && sourceBranchOid !== plan.source.headOid,
					recovery: { mergeInProgress: false, status: target.status.map(escaped) },
				},
			);
		}
	}
	const targetStage = stage === "target-fast-forward" || stage === "target-merge" || stage === "verification";
	const sourceConflict = source?.activeOperations.includes("rebase") === true;
	const outcome: IntegrationOutcome = sourceConflict
		? "source-rebase-conflict"
		: targetStage && (target?.headOid !== plan.target.headOid || target?.activeOperations.includes("merge"))
			? "target-merge-recovery-required"
			: sourceBranchOid !== undefined && sourceBranchOid !== plan.source.headOid
				? "source-rebased-target-unchanged"
				: "no-mutation";
	return baseResult(
		plan,
		outcome,
		stage,
		`${cancelled ? "Integration was cancelled" : "Integration stopped unexpectedly"}; cancellation is not a rollback. ${error instanceof Error ? error.message : String(error)}`,
		sourceBranchOid,
		target?.headOid,
		verification([
			["source recovery state was inspected", source !== undefined],
			["target recovery state was inspected", target !== undefined],
		]),
		{
			cancelled,
			sourceRebased: sourceBranchOid !== undefined && sourceBranchOid !== plan.source.headOid,
			targetUpdated: target?.headOid !== undefined && target.headOid !== plan.target.headOid,
			recovery: {
				rebaseInProgress: source?.activeOperations.includes("rebase"),
				mergeInProgress: target?.activeOperations.includes("merge"),
				status: target?.status.map(escaped),
				blocker: error instanceof Error ? error.message : String(error),
				instructions: sourceConflict ? [
					`cd -- ${shellQuote(plan.source.path)} && git rebase --continue`,
					`cd -- ${shellQuote(plan.source.path)} && git rebase --abort`,
				] : undefined,
			},
		},
	);
}

export async function executeIntegrationPlan(
	exec: WorkspaceExec,
	client: LazyWorktreeClient,
	plan: IntegrationPlan,
	signal?: AbortSignal,
): Promise<IntegrationResult> {
	if (mutationLocks.has(plan.commonDirectory)) {
		return integrationNoMutationResult(plan, `Another workspace rebase or merge is already in progress for ${plan.commonDirectory}`);
	}
	mutationLocks.add(plan.commonDirectory);
	let stage: IntegrationMutationStage = "preflight";
	let targetMergeLaunched = false;
	try {
		const mismatches = await revalidatePlan(exec, client, plan, signal);
		if (mismatches.length > 0) {
			return integrationNoMutationResult(plan, `Confirmed integration plan is stale; no mutation was performed: ${mismatches.map(escaped).join("; ")}`);
		}
		if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException("The operation was aborted.", "AbortError");
		if (plan.operation === "rebase") {
			stage = "source-rebase";
			return await standaloneRebase(exec, plan, signal);
		}
		if (plan.strategy === "rebase-ff") {
			stage = "source-rebase";
			const result = await rebaseFastForward(exec, plan, signal, (nextStage) => {
				stage = nextStage;
			});
			return result;
		}
		stage = "target-merge";
		return await noFastForward(exec, plan, signal, () => {
			targetMergeLaunched = true;
		});
	} catch (error) {
		if (stage === "preflight" && !signal?.aborted && !isAbortError(error)) throw error;
		return interruptedResult(exec, plan, stage, error, targetMergeLaunched, signal);
	} finally {
		mutationLocks.delete(plan.commonDirectory);
	}
}

export function formatIntegrationResult(result: IntegrationResult): string {
	const lines = [
		`${result.outcome}: ${escaped(result.message)}`,
		`operation: ${escapedIdentity(result.operation)}${result.strategy ? ` (${escapedIdentity(result.strategy)})` : ""}`,
		`stage: ${escapedIdentity(result.stage)}`,
		`source: ${escapedIdentity(result.source.branch)} · ${escapedIdentity(result.source.beforeOid)} -> ${escapedIdentity(result.source.afterOid ?? "unknown")} · ${escapedIdentity(result.source.path)}`,
		`target: ${escapedIdentity(result.target.branch)} · ${escapedIdentity(result.target.beforeOid)} -> ${escapedIdentity(result.target.afterOid ?? "unknown")} · ${escapedIdentity(result.target.path)}`,
		`verification: ${result.verification.passed ? "passed" : "failed"}`,
	];
	if (result.source.rewrittenCommits !== undefined) lines.push(`rewritten source commits: ${result.source.rewrittenCommits}`);
	if (result.verification.failures.length > 0) lines.push(`verification failures: ${result.verification.failures.join("; ")}`);
	if (result.recovery?.conflictedPaths?.length) lines.push(`conflicted paths: ${result.recovery.conflictedPaths.join(", ")}`);
	if (result.recovery?.instructions?.length) lines.push("recovery:", ...result.recovery.instructions.map((instruction) => `  ${instruction}`));
	if (result.recovery?.blocker) lines.push(`recovery blocker: ${escaped(result.recovery.blocker)}`);
	return lines.join("\n");
}
