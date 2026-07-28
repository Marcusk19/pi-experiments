import { basename, resolve } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Key, matchesKey, Text, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { LazyWorktreeClient } from "./client.ts";
import { runLazyWorktreeCommand } from "./runner.ts";
import {
	describeClassification,
	directGitWorktreeLifecycleIssue,
	formatWorkspaceList,
	formatWorkspacePlan,
	formatWorkspaceStatus,
	isReadOnlyLazyWorktreeCommand,
	mainCheckoutCommandIssue,
	mainCheckoutPathIssue,
	prepareWorkspaceInput,
	shellCommandCwd,
	type WorkspaceStatus,
} from "./core.ts";
import {
	classifyCurrentWorkspace,
	createWorkspace,
	detectDefaultBaseBranch,
	loadWorkspaceStatus,
	prepareWorkspaceRequest,
	type WorkspaceExec,
} from "./operations.ts";
import {
	executeIntegrationPlan,
	formatIntegrationConfirmation,
	formatIntegrationResult,
	integrationNoMutationResult,
	prepareIntegrationPlan,
	type IntegrationRequest,
	type IntegrationResult,
	type IntegrationStrategy,
} from "./integration.ts";

const STATUS_ID = "lazyworktree";
const WIDGET_ID = "lazyworktree";
const WORKSPACE_COMMAND_USAGE = "Usage: /workspace [status | list | prepare [branch] | create [branch] | rebase [target-branch] | merge [rebase-ff|no-ff] [target-branch]]";
const WORKSPACE_TOOL_ACTIONS = ["status", "list", "prepare", "create", "rebase", "merge"] as const;
const WORKSPACE_TOOL_GUIDELINES = [
	"Use workspace status or list when Pi is working inside a LazyWorktree-managed Git checkout and needs exact workspace context.",
	"Use workspace prepare or create instead of raw git worktree lifecycle commands when a new worktree is required.",
	"Use workspace create without assuming dirty changes should be carried over or an existing worktree should be reset.",
	"Use workspace rebase or merge only for an exact managed source worktree and review the interactive integration confirmation before mutation.",
	"Use workspace merge with an explicit rebase-ff or no-ff strategy; rebase-ff never falls back to a merge commit.",
];

const WORKSPACE_PARAMETERS = Type.Object({
	action: StringEnum(WORKSPACE_TOOL_ACTIONS),
	branch: Type.Optional(Type.String({ description: "Target repository branch for a new workspace" })),
	baseBranch: Type.Optional(Type.String({ description: "Base ref or branch for the new workspace; defaults to the repository's default branch" })),
	description: Type.Optional(Type.String({ description: "One-line summary for the new workspace" })),
	note: Type.Optional(Type.String({ description: "Workspace note and next-step context saved into LazyWorktree" })),
	worktreeName: Type.Optional(Type.String({ description: "Filesystem-safe LazyWorktree name; defaults to a derived branch slug" })),
	workId: Type.Optional(Type.String({ description: "Optional ticket or work identifier recorded as a LazyWorktree tag" })),
	tmuxSession: Type.Optional(Type.String({ description: "Operator tmux session or session group to target when launching Pi" })),
	workspacePath: Type.Optional(Type.String({ description: "Exact managed source path for action=rebase/merge" })),
	targetBranch: Type.Optional(Type.String({ description: "Validated local target branch for action=rebase/merge; defaults safely" })),
	strategy: Type.Optional(StringEnum(["rebase-ff", "no-ff"] as const, { description: "Required integration strategy for action=merge" })),
});

function toolResult(text: string, details: unknown = {}) {
	return { content: [{ type: "text" as const, text }], details };
}

function createClient(_pi: ExtensionAPI): LazyWorktreeClient {
	return new LazyWorktreeClient(runLazyWorktreeCommand);
}

function confirmationUnavailableReason(issue: string): string {
	return `${issue} Interactive confirmation is unavailable, so this operation remains blocked.`;
}

function blockedByUserReason(subject: string): string {
	return `${subject} blocked by user confirmation.`;
}

function sanitizeConfirmationText(text: string): string {
	return text.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, (character) => {
		return `\\x${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;
	});
}

function sanitizeIdentityText(text: string): string {
	return text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, (character) => {
		const code = character.charCodeAt(0);
		return code <= 0xff
			? `\\x${code.toString(16).toUpperCase().padStart(2, "0")}`
			: `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`;
	});
}

function confirmationMessage(issue: string, label: "Command" | "Path", value: string): string {
	return sanitizeConfirmationText(`${issue}\n\n${label}:\n${value}`);
}

function confirmTitle(toolName: "bash" | "edit" | "write" | "user_bash"): string {
	switch (toolName) {
		case "bash":
			return "Allow bash mutation in LazyWorktree main checkout?";
		case "edit":
			return "Allow edit in LazyWorktree main checkout?";
		case "write":
			return "Allow write in LazyWorktree main checkout?";
		case "user_bash":
			return "Allow !command mutation in LazyWorktree main checkout?";
	}
}

function widgetLines(ctx: ExtensionContext, status: WorkspaceStatus): string[] | undefined {
	const classification = status.classification;
	if (classification.kind !== "worktree") return undefined;
	const firstNoteLine = status.context?.note?.note?.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
	return [
		ctx.ui.theme.fg("accent", `LazyWorktree ${classification.worktree.name} · ${classification.worktree.branch}`),
		ctx.ui.theme.fg("muted", `${classification.worktree.dirty ? "dirty" : "clean"} · ${classification.worktreePath}`),
		...(firstNoteLine ? [ctx.ui.theme.fg("dim", truncateToWidth(firstNoteLine, 120))] : []),
	];
}

async function refreshUi(pi: ExtensionAPI, client: LazyWorktreeClient, ctx: ExtensionContext): Promise<void> {
	if (!ctx.hasUI) return;
	const status = await loadWorkspaceStatus((command, args, options) => pi.exec(command, args, options), client, ctx.cwd).catch(() => undefined);
	if (!status) {
		ctx.ui.setStatus(STATUS_ID, undefined);
		ctx.ui.setWidget(WIDGET_ID, undefined);
		return;
	}
	const classification = status.classification;
	if (classification.kind === "unmanaged") {
		ctx.ui.setStatus(STATUS_ID, undefined);
		ctx.ui.setWidget(WIDGET_ID, undefined);
		return;
	}
	const label = classification.kind === "main"
		? undefined
		: classification.kind === "worktree"
			? ctx.ui.theme.fg("accent", `LW ${classification.worktree.name}`)
			: ctx.ui.theme.fg("warning", "LW unknown");
	ctx.ui.setStatus(STATUS_ID, label);
	ctx.ui.setWidget(WIDGET_ID, widgetLines(ctx, status));
}


async function showText(ctx: ExtensionCommandContext, title: string, text: string): Promise<void> {
	if (ctx.mode !== "tui") {
		if (ctx.hasUI) ctx.ui.notify(`${title}\n${text}`, "info");
		return;
	}
	await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
		const lines = text.split(/\r?\n/);
		let scroll = 0;
		const renderHeight = () => Math.max(4, (tui.terminal?.rows ?? 24) - 4);
		const clamp = () => {
			const max = Math.max(0, lines.length - renderHeight());
			scroll = Math.max(0, Math.min(scroll, max));
		};
		clamp();
		return {
			invalidate() {},
			render(width: number): string[] {
				clamp();
				const bodyHeight = renderHeight();
				const header = theme.fg("accent", truncateToWidth(title, width));
				const help = theme.fg("dim", truncateToWidth("↑↓ scroll • enter/esc close", width));
				const body = lines.slice(scroll, scroll + bodyHeight).flatMap((line) => wrapTextWithAnsi(line, Math.max(1, width)));
				const visible = body.slice(0, bodyHeight);
				while (visible.length < bodyHeight) visible.push("");
				return [header, ...visible, help];
			},
			handleInput(data: string) {
				if (matchesKey(data, Key.down)) scroll += 1;
				else if (matchesKey(data, Key.up)) scroll -= 1;
				else if (matchesKey(data, Key.pageDown)) scroll += renderHeight() - 1;
				else if (matchesKey(data, Key.pageUp)) scroll -= renderHeight() - 1;
				else if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape) || matchesKey(data, Key.backspace)) {
					done(undefined);
					return;
				}
				clamp();
				tui.requestRender();
			},
		};
	});
}

async function runConfirmedIntegration(
	exec: WorkspaceExec,
	client: LazyWorktreeClient,
	ctx: ExtensionContext,
	request: IntegrationRequest,
	signal?: AbortSignal,
): Promise<IntegrationResult> {
	if (!ctx.hasUI) throw new Error("Workspace rebase and merge require interactive confirmation; no UI is available");
	const plan = await prepareIntegrationPlan(exec, client, request, signal);
	const confirmed = await ctx.ui.confirm(
		`Confirm workspace ${request.operation}?`,
		formatIntegrationConfirmation(plan),
		signal ? { signal } : undefined,
	);
	if (!confirmed) {
		return integrationNoMutationResult(
			plan,
			signal?.aborted ? "Workspace integration was cancelled before mutation" : "Workspace integration was denied; no mutation was performed",
			signal?.aborted === true,
		);
	}
	return executeIntegrationPlan(exec, client, plan, signal);
}

async function commandIntegrationSource(
	exec: WorkspaceExec,
	client: LazyWorktreeClient,
	ctx: ExtensionCommandContext,
): Promise<string | undefined> {
	const classification = await classifyCurrentWorkspace(exec, client, ctx.cwd, ctx.signal);
	if (classification.kind === "worktree") return classification.worktreePath;
	if (classification.kind !== "main") {
		throw new Error(`Workspace integration requires a managed LazyWorktree repository: ${classification.reason ?? classification.kind}`);
	}
	if (!ctx.hasUI) throw new Error("Selecting an integration source from the main checkout requires interactive UI");
	const listed = await client.list(ctx.cwd, ctx.signal);
	const candidates = listed.items.filter((item) => !item.is_main && item.repo === classification.worktree.repo);
	if (candidates.length === 0) throw new Error("No managed non-main worktrees are available as an integration source");
	const options = candidates.map((item, index) => `[${index + 1}] ${sanitizeIdentityText(item.branch)} · ${sanitizeIdentityText(resolve(item.path))}`);
	const selected = await ctx.ui.select("Select the exact managed source worktree", options);
	if (!selected) return undefined;
	const index = options.indexOf(selected);
	if (index < 0) throw new Error("Selected integration source is no longer available");
	return resolve(candidates[index]!.path);
}

function integrationStrategy(value: string | undefined): IntegrationStrategy | undefined {
	return value === "rebase-ff" || value === "no-ff" ? value : undefined;
}

async function promptWorkspaceInput(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	branchHint?: string,
): Promise<Omit<Parameters<typeof prepareWorkspaceInput>[0], "baseBranch"> & { baseBranch?: string } | undefined> {
	if (!ctx.hasUI) throw new Error("/workspace prepare and /workspace create require interactive UI");
	const branch = branchHint?.trim() || await ctx.ui.input("Workspace branch", "feat/short-description");
	if (!branch?.trim()) return undefined;
	const defaultBase = await detectDefaultBaseBranch(pi, ctx.cwd).catch(() => "origin/main");
	const baseBranch = await ctx.ui.input("Base branch", defaultBase);
	if (!baseBranch?.trim()) return undefined;
	const description = await ctx.ui.input("Workspace description", "Short summary");
	if (!description?.trim()) return undefined;
	const workId = await ctx.ui.input("Work ID (optional)", "NO-ISSUE or ticket key");
	const tmuxSession = await ctx.ui.input("tmux session or group", "main");
	const noteTemplate = [
		"# Work Setup",
		"",
		`- Work ID: ${workId?.trim() || "NO-ISSUE"}`,
		`- Summary: ${description.trim()}`,
		`- Base ref: ${baseBranch.trim()}`,
		`- Branch: ${branch.trim()}`,
		"",
		"## Next step",
		"",
		"Describe the first concrete action for the new Pi session.",
	].join("\n");
	const note = await ctx.ui.editor("Workspace note", noteTemplate);
	if (!note?.trim()) return undefined;
	return {
		branch,
		baseBranch,
		description,
		note,
		workId: workId?.trim() || undefined,
		tmuxSession: tmuxSession?.trim() || undefined,
	};
}

export default function lazyWorktreeExtension(pi: ExtensionAPI): void {
	const client = createClient(pi);

	pi.registerTool({
		name: "workspace",
		label: "Workspace",
		description: "Inspect, prepare, or create LazyWorktree workspaces, and rebase or integrate an exact managed worktree with confirmation and stale-plan safeguards.",
		promptSnippet: "Inspect and prepare LazyWorktree-managed workspaces, create them safely, or perform confirmed exact-worktree integration",
		promptGuidelines: WORKSPACE_TOOL_GUIDELINES,
		parameters: WORKSPACE_PARAMETERS,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const exec = (command: string, args: string[], options?: { cwd?: string; timeout?: number; signal?: AbortSignal }) => pi.exec(command, args, options);
			if (params.action === "merge" && params.strategy === undefined) {
				throw new Error("workspace action=merge requires strategy=rebase-ff or strategy=no-ff");
			}
			if (params.action !== "merge" && params.strategy !== undefined) {
				throw new Error(`workspace action=${params.action} does not accept strategy`);
			}
			if (params.action !== "rebase" && params.action !== "merge" && params.targetBranch !== undefined) {
				throw new Error(`workspace action=${params.action} does not accept targetBranch`);
			}
			switch (params.action) {
				case "status": {
					const status = await loadWorkspaceStatus(exec, client, ctx.cwd, signal);
					return toolResult(formatWorkspaceStatus(status), status);
				}
				case "list": {
					const listed = await client.list(ctx.cwd, signal);
					return toolResult(formatWorkspaceList(listed.items), listed);
				}
				case "prepare": {
					const prepared = await prepareWorkspaceRequest(exec, ctx.cwd, params, signal);
					return toolResult(formatWorkspacePlan(prepared), prepared);
				}
				case "create": {
					const prepared = await prepareWorkspaceRequest(exec, ctx.cwd, params, signal);
					const created = await createWorkspace(exec, client, ctx.cwd, prepared, false, signal, process.env);
					const text = [
						`Created LazyWorktree workspace ${created.created.path}`,
						`branch: ${created.created.branch}`,
						created.launchHelp,
					].filter(Boolean).join("\n");
					return toolResult(text, { prepared, ...created });
				}
				case "rebase": {
					const result = await runConfirmedIntegration(exec, client, ctx, {
						operation: "rebase",
						workspacePath: params.workspacePath,
						targetBranch: params.targetBranch,
						cwd: ctx.cwd,
					}, signal);
					return toolResult(formatIntegrationResult(result), result);
				}
				case "merge": {
					const result = await runConfirmedIntegration(exec, client, ctx, {
						operation: "merge",
						strategy: params.strategy,
						workspacePath: params.workspacePath,
						targetBranch: params.targetBranch,
						cwd: ctx.cwd,
					}, signal);
					return toolResult(formatIntegrationResult(result), result);
				}
			}
		},
		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("workspace ")) + theme.fg("accent", args.action);
			if (typeof args.branch === "string" && args.branch.trim()) text += ` ${theme.fg("muted", sanitizeIdentityText(args.branch.trim()))}`;
			if (typeof args.strategy === "string" && args.strategy.trim()) text += ` ${theme.fg("muted", sanitizeIdentityText(args.strategy.trim()))}`;
			if (typeof args.targetBranch === "string" && args.targetBranch.trim()) text += ` → ${theme.fg("muted", sanitizeIdentityText(args.targetBranch.trim()))}`;
			return new Text(text, 0, 0);
		},
		renderResult(result, _options, theme) {
			const first = result.content[0];
			return new Text(first?.type === "text" ? theme.fg("muted", first.text) : "", 0, 0);
		},
	});

	pi.registerCommand("workspace", {
		description: "Inspect, create, rebase, or integrate LazyWorktree workspaces",
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			const exec = (command: string, args: string[], options?: { cwd?: string; timeout?: number; signal?: AbortSignal }) => pi.exec(command, args, options);
			const tokens = args.trim() ? args.trim().split(/\s+/) : [];
			const verb = tokens.shift() ?? "status";
			if (!["status", "list", "prepare", "create", "rebase", "merge"].includes(verb)) throw new Error(WORKSPACE_COMMAND_USAGE);
			if ((verb === "status" || verb === "list") && tokens.length > 0) throw new Error(WORKSPACE_COMMAND_USAGE);
			if ((verb === "prepare" || verb === "create" || verb === "rebase") && tokens.length > 1) throw new Error(WORKSPACE_COMMAND_USAGE);
			if (verb === "merge" && tokens.length > 2) throw new Error(WORKSPACE_COMMAND_USAGE);

			if (verb === "status") {
				await showText(ctx, "Workspace status", formatWorkspaceStatus(await loadWorkspaceStatus(exec, client, ctx.cwd, ctx.signal)));
				return;
			}
			if (verb === "list") {
				const listed = await client.list(ctx.cwd, ctx.signal);
				await showText(ctx, "Workspace list", formatWorkspaceList(listed.items));
				return;
			}
			if (verb === "rebase" || verb === "merge") {
				const sourcePath = await commandIntegrationSource(exec, client, ctx);
				if (!sourcePath) return;
				let strategy: IntegrationStrategy | undefined;
				let targetBranch: string | undefined;
				if (verb === "rebase") {
					targetBranch = tokens[0];
				} else {
					strategy = integrationStrategy(tokens[0]);
					if (strategy) targetBranch = tokens[1];
					else {
						if (tokens.length > 1) throw new Error(WORKSPACE_COMMAND_USAGE);
						targetBranch = tokens[0];
						if (!ctx.hasUI) throw new Error("Selecting a merge strategy requires interactive UI");
						strategy = integrationStrategy(await ctx.ui.select("Select the workspace merge strategy", ["rebase-ff", "no-ff"]));
						if (!strategy) return;
					}
				}
				const result = await runConfirmedIntegration(exec, client, ctx, {
					operation: verb,
					strategy,
					workspacePath: sourcePath,
					targetBranch,
					cwd: ctx.cwd,
				}, ctx.signal);
				await refreshUi(pi, client, ctx).catch(() => undefined);
				await showText(ctx, `Workspace ${verb}`, formatIntegrationResult(result));
				return;
			}

			const prompted = await promptWorkspaceInput(pi, ctx, tokens[0]);
			if (!prompted) return;
			const prepared = await prepareWorkspaceRequest(exec, ctx.cwd, prompted, ctx.signal);
			if (verb === "prepare") {
				await showText(ctx, "Workspace plan", formatWorkspacePlan(prepared));
				return;
			}
			const created = await createWorkspace(exec, client, ctx.cwd, prepared, true, ctx.signal, process.env);
			const lines = [
				`Created LazyWorktree workspace ${created.created.path}`,
				`branch: ${created.created.branch}`,
				created.tmuxWindow ? `tmux window: ${created.tmuxWindow}` : undefined,
				created.tmuxWindow ? `switch: tmux select-window -t '${created.tmuxWindow.split(/\s+/)[0] ?? created.tmuxWindow}'` : undefined,
				created.launchHelp,
			].filter(Boolean) as string[];
			if (ctx.hasUI) ctx.ui.notify(`Created workspace ${basename(created.created.path)}.`, "info");
			await showText(ctx, "Workspace created", lines.join("\n"));
		},
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const status = await loadWorkspaceStatus((command, args, options) => pi.exec(command, args, options), client, ctx.cwd).catch(() => undefined);
		if (!status) return undefined;
		const classification = status.classification;
		const guidance = classification.kind === "main"
			? [
				"Current directory is the LazyWorktree main checkout.",
				"Main-checkout bash/edit/write work and !commands require explicit user confirmation for each operation.",
				"Prefer using the workspace tool to prepare or create a dedicated worktree before making code changes.",
			].join(" ")
			: classification.kind === "worktree"
				? `Current directory is LazyWorktree worktree ${classification.worktree.name} on branch ${classification.worktree.branch}.`
				: classification.kind === "unknown"
					? `Workspace classification failed: ${classification.reason}. Avoid mutations until the workspace tool or lazyworktree can resolve the current checkout.`
					: undefined;
		if (!guidance) return undefined;
		return {
			systemPrompt: `${event.systemPrompt}\n\n[PI WORKSPACE]\n${describeClassification(classification)}\n${guidance}\nNever use raw git worktree lifecycle commands; use the workspace tool or lazyworktree instead.`,
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!["bash", "edit", "write"].includes(event.toolName)) return undefined;
		if (event.toolName === "bash") {
			const command = (event.input as { command?: unknown }).command;
			if (typeof command !== "string" || !command.trim()) return undefined;
			const classification = await classifyCurrentWorkspace(
				(command, args, options) => pi.exec(command, args, options),
				client,
				shellCommandCwd(command, ctx.cwd),
			);
			const lifecycleIssue = directGitWorktreeLifecycleIssue(command);
			if (lifecycleIssue) return { block: true, reason: lifecycleIssue };
			const issue = mainCheckoutCommandIssue(classification, command)
				?? (classification.kind === "unknown"
					? (isReadOnlyLazyWorktreeCommand(command) ? undefined : `Workspace classification failed: ${classification.reason}. Mutating shell commands are blocked until the current checkout can be resolved.`)
					: undefined);
			if (!issue) return undefined;
			if (classification.kind !== "main") return { block: true, reason: issue };
			if (!ctx.hasUI) return { block: true, reason: confirmationUnavailableReason(issue) };
			const confirmed = await ctx.ui.confirm(confirmTitle("bash"), confirmationMessage(issue, "Command", command));
			return confirmed ? undefined : { block: true, reason: blockedByUserReason("LazyWorktree main-checkout bash mutation") };
		}
		const classification = await classifyCurrentWorkspace((command, args, options) => pi.exec(command, args, options), client, ctx.cwd);
		if (classification.kind === "unknown") {
			return {
				block: true,
				reason: `Workspace classification failed: ${classification.reason}. File mutations are blocked until the current checkout can be resolved.`,
			};
		}
		const path = (event.input as { path?: unknown }).path;
		if (typeof path !== "string") return undefined;
		const issue = mainCheckoutPathIssue(classification, path, ctx.cwd);
		if (!issue) return undefined;
		if (!ctx.hasUI) return { block: true, reason: confirmationUnavailableReason(issue) };
		const confirmed = await ctx.ui.confirm(confirmTitle(event.toolName), confirmationMessage(issue, "Path", path));
		return confirmed ? undefined : { block: true, reason: blockedByUserReason(`LazyWorktree main-checkout ${event.toolName}`) };
	});

	pi.on("user_bash", async (event, ctx) => {
		const classification = await classifyCurrentWorkspace(
			(command, args, options) => pi.exec(command, args, options),
			client,
			shellCommandCwd(event.command, event.cwd),
		);
		const lifecycleIssue = directGitWorktreeLifecycleIssue(event.command);
		if (lifecycleIssue) {
			return {
				result: {
					output: lifecycleIssue,
					exitCode: 1,
					cancelled: true,
					truncated: false,
				},
			};
		}
		const issue = mainCheckoutCommandIssue(classification, event.command)
			?? (classification.kind === "unknown"
				? (isReadOnlyLazyWorktreeCommand(event.command) ? undefined : `Workspace classification failed: ${classification.reason}. Mutating shell commands are blocked until the current checkout can be resolved.`)
				: undefined);
		if (!issue) return undefined;
		if (classification.kind !== "main") {
			return {
				result: {
					output: issue,
					exitCode: 1,
					cancelled: true,
					truncated: false,
				},
			};
		}
		if (!ctx.hasUI) {
			return {
				result: {
					output: confirmationUnavailableReason(issue),
					exitCode: 1,
					cancelled: true,
					truncated: false,
				},
			};
		}
		const confirmed = await ctx.ui.confirm(confirmTitle("user_bash"), confirmationMessage(issue, "Command", event.command));
		if (confirmed) return undefined;
		return {
			result: {
				output: blockedByUserReason("LazyWorktree main-checkout !command mutation"),
				exitCode: 1,
				cancelled: true,
				truncated: false,
			},
		};
	});

	pi.on("session_start", async (_event, ctx) => {
		await refreshUi(pi, client, ctx).catch(() => undefined);
	});
	pi.on("tool_execution_end", async (event, ctx) => {
		if (["bash", "edit", "write", "workspace"].includes(event.toolName)) await refreshUi(pi, client, ctx).catch(() => undefined);
	});
	pi.on("session_shutdown", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setStatus(STATUS_ID, undefined);
		ctx.ui.setWidget(WIDGET_ID, undefined);
	});
}
