import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { currentPiRuntimeArgv, resolveForwardedPiRuntimeArgv } from "./runtime-argv.ts";
import type { LazyWorktreeContextResult, LazyWorktreeSummary } from "./client.ts";

const WORKTREE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WORK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHELL_WRAPPERS = new Set(["sh", "bash", "zsh", "dash", "fish", "ksh"]);
const DIRECT_GIT_WORKTREE_ACTIONS = new Set(["add", "move", "remove", "prune", "repair", "lock", "unlock"]);
const GIT_GLOBAL_OPTIONS_WITH_VALUE = new Set(["-C", "-c", "--config-env", "--exec-path", "--git-dir", "--namespace", "--super-prefix", "--work-tree"]);
const GIT_GLOBAL_FLAGS = new Set([
	"--bare",
	"--help",
	"--literal-pathspecs",
	"--glob-pathspecs",
	"--noglob-pathspecs",
	"--icase-pathspecs",
	"--no-optional-locks",
	"--no-pager",
	"--paginate",
	"--version",
	"-p",
	"-P",
]);

export interface WorkspaceStatus {
	classification: WorkspaceClassification;
	context?: LazyWorktreeContextResult;
}

export type WorkspaceClassification =
	| {
		kind: "main" | "worktree";
		cwd: string;
		canonicalCwd: string;
		worktreePath: string;
		relation: "exact" | "descendant";
		worktree: LazyWorktreeSummary;
	}
	| {
		kind: "unmanaged" | "unknown";
		cwd: string;
		canonicalCwd: string;
		reason?: string;
		worktree?: LazyWorktreeSummary;
	};

export interface WorkspacePreparationInput {
	branch: string;
	baseBranch: string;
	description: string;
	note: string;
	worktreeName?: string;
	workId?: string;
	tmuxSession?: string;
}

export interface PreparedWorkspace {
	branch: string;
	baseBranch: string;
	description: string;
	note: string;
	worktreeName: string;
	workId?: string;
	tmuxSession: string;
	windowName: string;
	launchPrompt: string;
}

export interface WorkspacePiLaunchOptions {
	worktreePath: string;
	windowName: string;
	sessionName: string;
	prompt: string;
	piArgv?: readonly string[];
	piArgvOriginCwd?: string;
}

export interface WorkspacePiLaunchResult {
	args: string[];
	environmentEntries: string[];
}

function nativeRealpath(path: string): string {
	return (realpathSync as typeof realpathSync & { native?: (path: string) => string }).native?.(path) ?? realpathSync(path);
}

export function canonicalPath(input: string): string {
	const absolute = resolve(input);
	if (existsSync(absolute)) return nativeRealpath(absolute);
	const suffix: string[] = [];
	let current = absolute;
	while (!existsSync(current)) {
		const parent = dirname(current);
		if (parent === current) return absolute;
		suffix.push(basename(current));
		current = parent;
	}
	return resolve(nativeRealpath(current), ...suffix.reverse());
}

export function isPathInside(parent: string, candidate: string): boolean {
	const resolvedParent = canonicalPath(parent);
	const resolvedCandidate = canonicalPath(candidate);
	if (resolvedParent === resolvedCandidate) return true;
	const difference = relative(resolvedParent, resolvedCandidate);
	return difference !== "" && !difference.startsWith("..") && !isAbsolute(difference);
}

export function classifyWorkspace(cwd: string, worktree: LazyWorktreeSummary | undefined, issue?: string): WorkspaceClassification {
	const canonicalCwd = canonicalPath(cwd);
	if (!worktree) return { kind: "unmanaged", cwd, canonicalCwd, reason: issue };
	const worktreePath = canonicalPath(worktree.path);
	if (!isPathInside(worktreePath, canonicalCwd)) {
		return {
			kind: "unknown",
			cwd,
			canonicalCwd,
			worktree,
			reason: `current directory ${canonicalCwd} is no longer inside resolved worktree ${worktreePath}`,
		};
	}
	return {
		kind: worktree.is_main ? "main" : "worktree",
		cwd,
		canonicalCwd,
		worktreePath,
		relation: canonicalCwd === worktreePath ? "exact" : "descendant",
		worktree: { ...worktree, path: worktreePath },
	};
}

export function describeClassification(classification: WorkspaceClassification): string {
	if (classification.kind === "main") {
		return `LazyWorktree main checkout · ${classification.worktree.branch} · ${classification.worktreePath}`;
	}
	if (classification.kind === "worktree") {
		return `LazyWorktree worktree ${classification.worktree.name} · ${classification.worktree.branch} · ${classification.worktreePath}`;
	}
	return classification.reason ? `Workspace unavailable · ${classification.reason}` : "Workspace unavailable";
}

function parseSingleShellCommand(command: string): string[] | undefined {
	if (!command.trim() || command.includes("\0")) return undefined;
	const words: string[] = [];
	let index = 0;
	while (index < command.length) {
		const character = command[index]!;
		if (character === " " || character === "\t" || character === "\r") {
			index++;
			continue;
		}
		if (character === "\n" || character === "#") return undefined;
		if (";|&<>()".includes(character)) return undefined;
		let word = "";
		let quote: "'" | '"' | undefined;
		while (index < command.length) {
			const current = command[index]!;
			if (quote) {
				if (current === quote) {
					quote = undefined;
					index++;
					continue;
				}
				if (quote === '"' && (current === "$" || current === "`")) return undefined;
				if (current === "\\" && quote === '"' && index + 1 < command.length) {
					word += command[index + 1]!;
					index += 2;
					continue;
				}
				word += current;
				index++;
				continue;
			}
			if (current === "'" || current === '"') {
				quote = current;
				index++;
				continue;
			}
			if (/\s/.test(current) || ";|&<>()#".includes(current)) break;
			if (current === "$" || current === "`") return undefined;
			if (current === "\\") {
				if (index + 1 >= command.length || command[index + 1] === "\n") return undefined;
				word += command[index + 1]!;
				index += 2;
				continue;
			}
			if ("*?[{".includes(current)) return undefined;
			word += current;
			index++;
		}
		if (quote || word.length === 0) return undefined;
		words.push(word);
	}
	return words.length > 0 ? words : undefined;
}

function parseOptionSchema(
	args: readonly string[],
	schema: {
		flags?: readonly string[];
		valueOptions?: readonly string[];
		requiredValueOptions?: readonly string[];
		allowedOptionValues?: Readonly<Record<string, readonly string[]>>;
		positionals: number;
	},
): boolean {
	const flags = new Set(schema.flags ?? []);
	const valueOptions = new Set(schema.valueOptions ?? []);
	const required = new Set(schema.requiredValueOptions ?? []);
	const seenValueOptions = new Set<string>();
	const positionals: string[] = [];
	for (let index = 0; index < args.length; index++) {
		const argument = args[index]!;
		if (!argument.startsWith("-")) {
			positionals.push(argument);
			continue;
		}
		const equals = argument.indexOf("=");
		const name = equals === -1 ? argument : argument.slice(0, equals);
		if (flags.has(name)) {
			if (equals !== -1) return false;
			continue;
		}
		if (!valueOptions.has(name)) return false;
		seenValueOptions.add(name);
		const value = equals === -1 ? args[++index] : argument.slice(equals + 1);
		if (!value?.trim()) return false;
		const allowedValues = schema.allowedOptionValues?.[name];
		if (allowedValues && !allowedValues.includes(value)) return false;
	}
	if (positionals.length !== schema.positionals) return false;
	for (const option of required) {
		if (!seenValueOptions.has(option)) return false;
	}
	return true;
}

function extractShellCommandString(argv: readonly string[]): string | undefined {
	for (let index = 1; index < argv.length; index++) {
		const argument = argv[index]!;
		if (argument === "--command" || /^-[A-Za-z]*c[A-Za-z]*$/.test(argument)) {
			return argv[index + 1];
		}
	}
	return undefined;
}

function unwrapEnvCommand(argv: readonly string[]): string[] | undefined {
	let index = 1;
	while (index < argv.length) {
		const argument = argv[index]!;
		if (/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(argument) || argument === "-i" || argument === "--ignore-environment") {
			index++;
			continue;
		}
		if (["-u", "-C", "--chdir", "--default-signal", "--ignore-signal", "--argv0", "--unset"].includes(argument)) {
			if (index + 1 >= argv.length) return undefined;
			index += 2;
			continue;
		}
		if (["--chdir=", "--argv0=", "--default-signal=", "--ignore-signal=", "--unset="].some((prefix) => argument.startsWith(prefix))) {
			index++;
			continue;
		}
		break;
	}
	return index < argv.length ? [...argv.slice(index)] : undefined;
}

function unwrapCommandBuiltin(argv: readonly string[]): string[] | undefined {
	let index = 1;
	while (index < argv.length && argv[index]!.startsWith("-")) index++;
	return index < argv.length ? [...argv.slice(index)] : undefined;
}

function unwrapCommandArgv(argv: readonly string[], depth = 0): string[] | undefined {
	if (argv.length === 0) return undefined;
	const command = argv[0]!.toLowerCase();
	if (command === "env") return unwrapCommandArgv(unwrapEnvCommand(argv) ?? [], depth);
	if (["command", "builtin", "nohup"].includes(command)) return unwrapCommandArgv(unwrapCommandBuiltin(argv) ?? [], depth);
	if (!SHELL_WRAPPERS.has(command)) return [...argv];
	if (depth >= 2) return undefined;
	const inner = extractShellCommandString(argv);
	if (!inner) return undefined;
	const parsed = parseSingleShellCommand(inner);
	return parsed ? unwrapCommandArgv(parsed, depth + 1) : undefined;
}

function gitWorktreeLifecycleAction(argv: readonly string[]): string | undefined {
	if (argv[0]?.toLowerCase() !== "git") return undefined;
	let index = 1;
	while (index < argv.length) {
		const argument = argv[index]!;
		const equals = argument.indexOf("=");
		const name = equals === -1 ? argument : argument.slice(0, equals);
		if (GIT_GLOBAL_FLAGS.has(name)) {
			index++;
			continue;
		}
		if (GIT_GLOBAL_OPTIONS_WITH_VALUE.has(name)) {
			if (equals === -1) {
				if (index + 1 >= argv.length) return undefined;
				index += 2;
			} else {
				index++;
			}
			continue;
		}
		break;
	}
	if (argv[index]?.toLowerCase() !== "worktree") return undefined;
	const action = argv[index + 1]?.toLowerCase();
	return action && DIRECT_GIT_WORKTREE_ACTIONS.has(action) ? action : undefined;
}

export function directGitWorktreeLifecycleIssue(command: string): string | undefined {
	const parsed = parseSingleShellCommand(command);
	if (!parsed) return undefined;
	const action = gitWorktreeLifecycleAction(unwrapCommandArgv(parsed) ?? parsed);
	return action
		? `Direct git worktree ${action} bypasses LazyWorktree. Use the workspace tool or lazyworktree instead.`
		: undefined;
}

function leadingAndCommand(command: string): { argv: string[]; remainder: string } | undefined {
	let quote: "'" | '"' | undefined;
	for (let index = 0; index < command.length; index++) {
		const character = command[index]!;
		if (quote) {
			if (character === quote) quote = undefined;
			else if (character === "\\" && quote === '"') index++;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			continue;
		}
		if (character === "\\") {
			index++;
			continue;
		}
		if (character === "&" && command[index + 1] === "&") {
			const argv = parseSingleShellCommand(command.slice(0, index));
			return argv ? { argv, remainder: command.slice(index + 2) } : undefined;
		}
		if (character === "\n" || ";|&<>()".includes(character)) return undefined;
	}
	return undefined;
}

export function shellCommandCwd(command: string, cwd: string): string {
	const leading = leadingAndCommand(command);
	if (!leading) return cwd;
	const target = leading.argv[0] === "cd" && leading.argv.length === 2
		? leading.argv[1]
		: leading.argv[0] === "cd" && leading.argv[1] === "--" && leading.argv.length === 3
			? leading.argv[2]
			: undefined;
	if (!target || target === "-") return cwd;
	// A later directory-changing command makes the mutation location ambiguous. False positives
	// are preferable to authorizing a main-checkout mutation against the wrong workspace.
	if (/(?:^|[;&|()]|\s)(?:cd|pushd|popd)(?:\s|$)/.test(leading.remainder)) return cwd;
	return resolve(cwd, target);
}

export function isReadOnlyLazyWorktreeCommand(command: string): boolean {
	const argv = parseSingleShellCommand(command);
	if (!argv || argv[0] !== "lazyworktree") return false;
	if (argv[1] === "doctor" || argv[1] === "describe") return argv.length === 2;
	if (argv[1] === "worktrees") {
		if (argv[2] === "list") return parseOptionSchema(argv.slice(3), { flags: ["--json", "--no-agent"], positionals: 0 });
		if (argv[2] === "get") return parseOptionSchema(argv.slice(3), { flags: ["--json", "--no-agent"], positionals: 1 });
		if (argv[2] === "resolve") {
			return parseOptionSchema(argv.slice(3), {
				flags: ["--json", "--no-agent"],
				valueOptions: ["--cwd"],
				requiredValueOptions: ["--cwd"],
				positionals: 0,
			});
		}
		if (argv[2] === "context") {
			return parseOptionSchema(argv.slice(3), {
				flags: ["--json"],
				valueOptions: ["--include"],
				allowedOptionValues: { "--include": ["notes"] },
				positionals: 1,
			});
		}
		return false;
	}
	if (argv[1] === "notes" && argv[2] === "get") return parseOptionSchema(argv.slice(3), { flags: ["--json"], positionals: 1 });
	return false;
}

export function mainCheckoutCommandIssue(
	classification: WorkspaceClassification,
	command: string,
): string | undefined {
	const lifecycle = directGitWorktreeLifecycleIssue(command);
	if (lifecycle) return lifecycle;
	if (classification.kind !== "main") return undefined;
	if (isReadOnlyLazyWorktreeCommand(command)) return undefined;
	return [
		`Current directory is the LazyWorktree main checkout at ${classification.worktreePath}.`,
		"This mutating shell command requires explicit user confirmation for this one operation.",
		"Prefer workspace prepare/create to start a dedicated worktree, then work there instead.",
	].join(" ");
}

export function mainCheckoutPathIssue(
	classification: WorkspaceClassification,
	targetPath: string,
	cwd: string,
): string | undefined {
	if (classification.kind !== "main") return undefined;
	const absoluteTarget = canonicalPath(resolve(cwd, targetPath));
	if (!isPathInside(classification.worktreePath, absoluteTarget)) return undefined;
	return [
		`Current directory is the LazyWorktree main checkout at ${classification.worktreePath}.`,
		`File mutation inside ${absoluteTarget} requires explicit user confirmation for this one operation.`,
		"Prefer creating or switching to a dedicated worktree first.",
	].join(" ");
}

export function deriveSafeWorktreeName(branch: string): string {
	const value = branch.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
	if (!value) throw new Error("branch does not produce a valid LazyWorktree name");
	if (value.length > 100) throw new Error("derived LazyWorktree name exceeds 100 characters");
	return value;
}

function requireNonEmpty(value: string | undefined, field: string): string {
	if (!value?.trim()) throw new Error(`${field} is required`);
	return value.trim();
}

function launchPromptLines(description: string, workId: string | undefined): string[] {
	return [
		`Continue ${description}${workId ? ` (${workId})` : ""} in this managed worktree.`,
		"Read AGENTS.md, then run lazyworktree worktrees context --json --include notes \"$PWD\" and use its note as the authoritative setup and next step.",
		"Do not redo completed setup.",
	];
}

export function prepareWorkspaceInput(input: WorkspacePreparationInput): PreparedWorkspace {
	const branch = requireNonEmpty(input.branch, "branch");
	const baseBranch = requireNonEmpty(input.baseBranch, "baseBranch");
	const description = requireNonEmpty(input.description, "description");
	if (description.includes("\n")) throw new Error("description must be a single line");
	const note = requireNonEmpty(input.note, "note");
	const workId = input.workId?.trim() ? input.workId.trim() : undefined;
	if (workId && !WORK_ID_PATTERN.test(workId)) {
		throw new Error("workId may contain only letters, numbers, dots, underscores, and hyphens");
	}
	const worktreeName = (input.worktreeName?.trim() || deriveSafeWorktreeName(branch));
	if (!WORKTREE_NAME_PATTERN.test(worktreeName)) throw new Error("worktreeName must be lowercase kebab-case");
	if (worktreeName.length > 100) throw new Error("worktreeName exceeds LazyWorktree's 100-character limit");
	const tmuxSession = input.tmuxSession?.trim() || "main";
	if (!/^[A-Za-z0-9_.-]+$/.test(tmuxSession)) throw new Error(`invalid tmux session name: ${tmuxSession}`);
	const launchPrompt = launchPromptLines(description, workId).join(" ");
	const windowName = `pi-${worktreeName}`.slice(0, 64);
	return {
		branch,
		baseBranch,
		description,
		note,
		worktreeName,
		workId,
		tmuxSession,
		windowName,
		launchPrompt,
	};
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `"'"'`)}'`;
}

export function workspaceCreateDisplayCommand(workspace: PreparedWorkspace): string {
	const command = [
		"lazyworktree",
		"create",
		"--from-branch",
		workspace.baseBranch,
		"--note-file",
		"<note-file>",
		"--description",
		workspace.description,
		"--json",
		workspace.worktreeName,
	];
	return command.map(shellQuote).join(" ").replace(/^'lazyworktree'/, "lazyworktree").replace(/ 'create'/, " create");
}

export function workspaceRenameDisplayCommand(workspace: PreparedWorkspace): string {
	if (workspace.worktreeName === workspace.branch) return "branch already named target branch";
	return `git -C ${shellQuote("<created-worktree>")} branch --move ${shellQuote(workspace.branch)}`;
}

export function resolveTmuxSessionTarget(requestedSession: string, sessionMetadata: string): string {
	const [sessionName = "", sessionGroup = ""] = sessionMetadata.split("\t", 2);
	if (!sessionName) throw new Error(`tmux session ${requestedSession} did not report a launchable session name`);
	if (sessionGroup === requestedSession) return sessionName;
	if (!sessionGroup && sessionName === requestedSession) return sessionName;
	throw new Error(
		`tmux session ${requestedSession} must be the exact ungrouped session ${requestedSession} or a member of group ${requestedSession} (found: ${sessionName}${sessionGroup ? ` in group ${sessionGroup}` : " ungrouped"})`,
	);
}

export function buildWorkspaceLaunch(
	options: WorkspacePiLaunchOptions,
): WorkspacePiLaunchResult {
	const piArgv = options.piArgv
		? resolveForwardedPiRuntimeArgv(options.piArgv, options.piArgvOriginCwd)
		: currentPiRuntimeArgv(process.argv, process.execPath, options.piArgvOriginCwd);
	if (!piArgv || piArgv.length === 0) throw new Error("Cannot determine the current Pi executable");
	const environmentEntries: string[] = [];
	const args = [
		"new-window",
		"-a",
		"-P",
		"-F",
		"#{window_id}\t#{window_name}",
		"-t",
		`${options.sessionName}:`,
		"-n",
		options.windowName,
		"-c",
		options.worktreePath,
		...environmentEntries.flatMap((entry) => ["-e", entry]),
		...piArgv,
		"--name",
		`${options.windowName} ${basename(options.worktreePath)}`,
		options.prompt,
	];
	return { args, environmentEntries };
}

export function nonTmuxLaunchHelp(
	worktreePath: string,
	windowName: string,
	prompt: string,
	piArgv?: readonly string[],
	piArgvOriginCwd?: string,
): string {
	let resolvedPiArgv: string[] | undefined;
	try {
		resolvedPiArgv = piArgv
			? resolveForwardedPiRuntimeArgv(piArgv, piArgvOriginCwd)
			: currentPiRuntimeArgv(process.argv, process.execPath, piArgvOriginCwd);
	} catch (error) {
		return [
			"Workspace creation succeeded, but Pi could not build a safe relaunch command.",
			error instanceof Error ? error.message : String(error),
		].join("\n");
	}
	if (!resolvedPiArgv || resolvedPiArgv.length === 0) return "Pi created the worktree but could not determine the current executable to show a recovery command.";
	return [
		"Workspace creation succeeded, but launching Pi requires tmux.",
		"Start or attach to a tmux session with: tmux new-session -A -s main",
		"Then launch Pi from the created worktree with:",
		`cd -- ${shellQuote(worktreePath)} && ${resolvedPiArgv.map(shellQuote).join(" ")} --name ${shellQuote(`${windowName} ${basename(worktreePath)}`)} ${shellQuote(prompt)}`,
	].join("\n");
}

export function formatWorkspaceStatus(status: WorkspaceStatus): string {
	const lines = [describeClassification(status.classification)];
	if (status.classification.kind === "main" || status.classification.kind === "worktree") {
		const worktree = status.classification.worktree;
		const dirty = worktree.dirty ? "dirty" : "clean";
		lines.push(`branch: ${worktree.branch} · ${dirty} · ahead ${worktree.ahead} · behind ${worktree.behind}`);
		if (worktree.unpushed !== undefined) lines.push(`unpushed: ${worktree.unpushed}`);
		if (worktree.last_active) lines.push(`last active: ${worktree.last_active}`);
		if (worktree.note_present !== undefined) lines.push(`note: ${worktree.note_present ? "present" : "absent"}`);
		if (worktree.agent_count !== undefined) lines.push(`agents: ${worktree.agent_count}${worktree.agent_open ? " open" : ""}`);
	}
	const note = status.context?.note?.note?.trim();
	if (note) {
		lines.push("", "note:", note);
	}
	return lines.join("\n");
}

export function formatWorkspaceList(items: readonly LazyWorktreeSummary[]): string {
	if (items.length === 0) return "No LazyWorktree workspaces found.";
	return items.map((worktree) => {
		const state = worktree.is_main ? "main" : "worktree";
		const dirty = worktree.dirty ? "dirty" : "clean";
		return `${state} · ${worktree.name} · ${worktree.branch} · ${dirty} · ${worktree.path}`;
	}).join("\n");
}

export function formatWorkspacePlan(workspace: PreparedWorkspace): string {
	return [
		"Workspace plan:",
		`branch: ${workspace.branch}`,
		`base: ${workspace.baseBranch}`,
		`worktree: ${workspace.worktreeName}`,
		`tmux session: ${workspace.tmuxSession}`,
		`create: ${workspaceCreateDisplayCommand(workspace)}`,
		`rename: ${workspaceRenameDisplayCommand(workspace)}`,
		"",
		"note:",
		workspace.note,
	].join("\n");
}
