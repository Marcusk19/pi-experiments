import { resolve } from "node:path";

export interface LazyWorktreeAgentSession {
	id: string;
	agent: string;
	status: string;
	activity: string;
	liveness?: string;
	source?: string;
	is_open?: boolean;
	last_activity?: string;
	task_label?: string;
	model?: string;
}

export interface LazyWorktreeSummary {
	path: string;
	name: string;
	branch: string;
	repo: string;
	is_main: boolean;
	dirty: boolean;
	ahead: number;
	behind: number;
	unpushed?: number;
	last_active?: string;
	note_present?: boolean;
	agent_count?: number;
	agent_open?: boolean;
	description?: string;
	tags?: string[];
}

export interface LazyWorktreeListResult {
	repo: string;
	count: number;
	items: LazyWorktreeSummary[];
}

export interface LazyWorktreeResolveResult {
	input: string;
	resolved_by: string;
	worktree: LazyWorktreeSummary;
}

export interface LazyWorktreeNote {
	worktree_name?: string;
	path?: string;
	note?: string;
	description?: string;
	tags?: string[];
}

export interface LazyWorktreeContextResult {
	worktree: LazyWorktreeSummary;
	note?: LazyWorktreeNote;
	agent_sessions?: LazyWorktreeAgentSession[];
}

export interface LazyWorktreeCreateResult {
	path: string;
	name: string;
	branch: string;
}

export interface LazyWorktreeRunnerResult {
	code: number;
	stdout: string;
	stderr: string;
}

export interface LazyWorktreeInvokeOptions {
	cwd?: string;
	timeout?: number;
	signal?: AbortSignal;
}

export interface LazyWorktreeRunner {
	(command: string, args: string[], options?: LazyWorktreeInvokeOptions): Promise<LazyWorktreeRunnerResult>;
}

export interface LazyWorktreeCreateInput {
	cwd: string;
	fromBranch: string;
	worktreeName: string;
	noteFile: string;
	description: string;
	tags?: string[];
}

const CREATE_TIMEOUT_MS = 5 * 60_000;

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string" || !value.trim()) throw new Error(`LazyWorktree JSON field ${field} must be a non-empty string`);
	return value;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
	return items.length > 0 ? items : undefined;
}

function parseSummary(value: unknown, field: string): LazyWorktreeSummary {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`LazyWorktree JSON field ${field} must be an object`);
	const record = value as Record<string, unknown>;
	return {
		path: resolve(requiredString(record.path, `${field}.path`)),
		name: requiredString(record.name, `${field}.name`),
		branch: requiredString(record.branch, `${field}.branch`),
		repo: requiredString(record.repo, `${field}.repo`),
		is_main: record.is_main === true,
		dirty: record.dirty === true,
		ahead: typeof record.ahead === "number" ? record.ahead : 0,
		behind: typeof record.behind === "number" ? record.behind : 0,
		unpushed: optionalNumber(record.unpushed),
		last_active: optionalString(record.last_active),
		note_present: optionalBoolean(record.note_present),
		agent_count: optionalNumber(record.agent_count),
		agent_open: optionalBoolean(record.agent_open),
		description: optionalString(record.description),
		tags: optionalStringArray(record.tags),
	};
}

function parseContext(value: unknown): LazyWorktreeContextResult {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("LazyWorktree context JSON must be an object");
	const record = value as Record<string, unknown>;
	const noteRecord = record.note && typeof record.note === "object" && !Array.isArray(record.note)
		? record.note as Record<string, unknown>
		: undefined;
	const sessions = Array.isArray(record.agent_sessions)
		? record.agent_sessions
			.filter((session): session is Record<string, unknown> => Boolean(session) && typeof session === "object" && !Array.isArray(session))
			.map((session) => ({
				id: requiredString(session.id, "agent_sessions.id"),
				agent: requiredString(session.agent, "agent_sessions.agent"),
				status: requiredString(session.status, "agent_sessions.status"),
				activity: requiredString(session.activity, "agent_sessions.activity"),
				liveness: optionalString(session.liveness),
				source: optionalString(session.source),
				is_open: optionalBoolean(session.is_open),
				last_activity: optionalString(session.last_activity),
				task_label: optionalString(session.task_label),
				model: optionalString(session.model),
			}))
		: undefined;
	return {
		worktree: parseSummary(record.worktree, "worktree"),
		note: noteRecord
			? {
				worktree_name: optionalString(noteRecord.worktree_name),
				path: optionalString(noteRecord.path),
				note: optionalString(noteRecord.note),
				description: optionalString(noteRecord.description),
				tags: optionalStringArray(noteRecord.tags),
			}
			: undefined,
		agent_sessions: sessions,
	};
}

function parseJson<T>(stdout: string, parser: (value: unknown) => T): T {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch (error) {
		throw new Error(`LazyWorktree returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
	}
	return parser(parsed);
}

function parseStructuredFailure(stdout: string, stderr: string): { code?: string; message?: string } | undefined {
	for (const text of [stderr, stdout]) {
		const start = text.indexOf("{");
		if (start === -1) continue;
		try {
			const parsed = JSON.parse(text.slice(start)) as { error?: { code?: unknown; message?: unknown } };
			if (parsed?.error && typeof parsed.error === "object") {
				return {
					code: typeof parsed.error.code === "string" ? parsed.error.code : undefined,
					message: typeof parsed.error.message === "string" ? parsed.error.message : undefined,
				};
			}
		} catch {
			continue;
		}
	}
	return undefined;
}

function parseCreate(value: unknown): LazyWorktreeCreateResult {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("LazyWorktree create JSON must be an object");
	const record = value as Record<string, unknown>;
	return {
		path: resolve(requiredString(record.path, "path")),
		name: requiredString(record.name, "name"),
		branch: requiredString(record.branch, "branch"),
	};
}

export class LazyWorktreeClient {
	private readonly run: LazyWorktreeRunner;
	private readonly command: string;

	constructor(run: LazyWorktreeRunner, command = "lazyworktree") {
		this.run = run;
		this.command = command;
	}

	private async invoke<T>(
		args: string[],
		parser: (value: unknown) => T,
		options: LazyWorktreeInvokeOptions = {},
	): Promise<T> {
		let result: LazyWorktreeRunnerResult;
		try {
			result = await this.run(this.command, args, options);
		} catch (error) {
			if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
				throw new Error("lazyworktree is not installed or is not available on PATH");
			}
			throw error;
		}
		if (result.code !== 0) {
			const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
			const structured = parseStructuredFailure(result.stdout, result.stderr);
			const error = new Error(`lazyworktree ${args.join(" ")} failed: ${structured?.message ?? detail}`) as Error & { lazyWorktreeCode?: string };
			error.lazyWorktreeCode = structured?.code;
			throw error;
		}
		return parseJson(result.stdout, parser);
	}

	list(cwd: string, signal?: AbortSignal): Promise<LazyWorktreeListResult> {
		return this.invoke(["worktrees", "list", "--json", "--no-agent"], (value) => {
			if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("LazyWorktree list JSON must be an object");
			const record = value as Record<string, unknown>;
			if (!Array.isArray(record.items)) throw new Error("LazyWorktree list JSON field items must be an array");
			return {
				repo: requiredString(record.repo, "repo"),
				count: typeof record.count === "number" ? record.count : record.items.length,
				items: record.items.map((item, index) => parseSummary(item, `items[${index}]`)),
			};
		}, { cwd, timeout: 5_000, signal });
	}

	resolveFromCwd(cwd: string, signal?: AbortSignal): Promise<LazyWorktreeResolveResult> {
		return this.invoke(["worktrees", "resolve", "--json", "--cwd", cwd, "--no-agent"], (value) => {
			if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("LazyWorktree resolve JSON must be an object");
			const record = value as Record<string, unknown>;
			return {
				input: requiredString(record.input, "input"),
				resolved_by: requiredString(record.resolved_by, "resolved_by"),
				worktree: parseSummary(record.worktree, "worktree"),
			};
		}, { cwd, timeout: 5_000, signal });
	}

	context(worktree: string, cwd = worktree, signal?: AbortSignal): Promise<LazyWorktreeContextResult> {
		return this.invoke(["worktrees", "context", "--json", "--include", "notes", worktree], parseContext, { cwd, timeout: 5_000, signal });
	}

	create(input: LazyWorktreeCreateInput, signal?: AbortSignal): Promise<LazyWorktreeCreateResult> {
		const args = [
			"create",
			"--from-branch",
			input.fromBranch,
			"--note-file",
			input.noteFile,
			"--description",
			input.description,
			"--json",
		];
		if (input.tags && input.tags.length > 0) {
			args.push("--tags", input.tags.join(","));
		}
		args.push(input.worktreeName);
		return this.invoke(args, parseCreate, { cwd: input.cwd, timeout: CREATE_TIMEOUT_MS, signal });
	}
}
