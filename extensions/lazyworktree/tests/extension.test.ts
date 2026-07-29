import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import lazyWorktreeExtension from "../index.ts";
import { LazyWorktreeClient } from "../client.ts";
import {
	classifyCurrentWorkspace,
	classifyWorkspaceResolutionFailure,
	createWorkspace,
	loadWorkspaceStatus,
	prepareWorkspaceRequest,
	type WorkspaceExec,
} from "../operations.ts";

interface ExecCall {
	command: string;
	args: string[];
	options?: { cwd?: string; timeout?: number; signal?: AbortSignal };
}

function abortError(message = "The operation was aborted.") {
	return new DOMException(message, "AbortError");
}

function installFakeLazyWorktree(t: test.TestContext, script: string): void {
	const bin = mkdtempSync(join(tmpdir(), "pi-lw-bin-"));
	const command = join(bin, "lazyworktree");
	writeFileSync(command, script);
	chmodSync(command, 0o755);
	const previousPath = process.env.PATH;
	process.env.PATH = `${bin}:${previousPath ?? ""}`;
	t.after(() => {
		process.env.PATH = previousPath;
		rmSync(bin, { recursive: true, force: true });
	});
}

function installResolveLazyWorktree(t: test.TestContext, resolvedPath: string | "cwd", isMain = true): void {
	const pathExpression = resolvedPath === "cwd" ? "cwd" : JSON.stringify(resolvedPath);
	installFakeLazyWorktree(t, `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args[0] === "worktrees" && args[1] === "resolve") {
	const cwd = args[4]
	process.stdout.write(JSON.stringify({
		input: cwd,
		resolved_by: "cwd",
		worktree: {
			path: ${pathExpression},
			name: "repo",
			branch: "main",
			repo: "repo-1",
			is_main: ${isMain ? "true" : "false"},
			dirty: false,
			ahead: 0,
			behind: 0,
		},
	}))
} else if (args[0] === "worktrees" && args[1] === "context") {
	process.stdout.write(JSON.stringify({
		worktree: {
			path: args[5],
			name: "repo",
			branch: "main",
			repo: "repo-1",
			is_main: ${isMain ? "true" : "false"},
			dirty: false,
			ahead: 0,
			behind: 0,
		},
	}))
} else {
	process.stderr.write("unexpected args: " + args.join(" "))
	process.exitCode = 64
}
`);
}

function lazyWorktreeEventFixture(options: {
	repo: string;
	hasUI?: boolean;
	confirmations?: boolean[];
	selections?: Array<string | undefined>;
}) {
	const handlers = new Map<string, Array<(event: any, ctx: any) => Promise<any>>>();
	const confirmCalls: Array<{ title: string; message: string }> = [];
	const selectCalls: Array<{ title: string; options: string[] }> = [];
	const notifyCalls: Array<{ message: string; level: string }> = [];
	const widgets: Array<{ id: string; value: string[] | undefined }> = [];
	const statuses: Array<{ id: string; value: string | undefined }> = [];
	const confirmations = [...(options.confirmations ?? [])];
	const selections = [...(options.selections ?? [])];
	const pi = {
		registerTool() {},
		registerCommand() {},
		on(event: string, handler: (event: any, ctx: any) => Promise<any>) {
			handlers.set(event, [...(handlers.get(event) ?? []), handler]);
		},
		async exec(command: string, args: string[]) {
			throw new Error(`unexpected pi.exec call: ${command} ${args.join(" ")}`);
		},
	};
	lazyWorktreeExtension(pi as any);
	return {
		handlers,
		confirmCalls,
		selectCalls,
		notifyCalls,
		widgets,
		statuses,
		ctx: {
			cwd: options.repo,
			hasUI: options.hasUI ?? true,
			ui: {
				confirm: async (title: string, message: string) => {
					confirmCalls.push({ title, message });
					return confirmations.shift() ?? false;
				},
				select: async (title: string, selectOptions: string[]) => {
					selectCalls.push({ title, options: selectOptions });
					return selections.shift();
				},
				notify: (message: string, level: string) => notifyCalls.push({ message, level }),
				setStatus: (id: string, value: string | undefined) => statuses.push({ id, value }),
				setWidget: (id: string, value: string[] | undefined) => widgets.push({ id, value }),
				theme: { fg: (_color: string, text: string) => text },
			},
		},
	};
}

test("treats only structured unmanaged resolution results as unmanaged in Git repos", () => {
	const plainRepo = Object.assign(new Error("worktree not found for cwd: /repo"), { lazyWorktreeCode: "worktree_not_found" });
	assert.equal(classifyWorkspaceResolutionFailure("/repo", plainRepo, true).kind, "unmanaged");

	const incompatible = new Error("lazyworktree worktrees resolve --json --cwd /repo failed: unknown flag: --json");
	assert.equal(classifyWorkspaceResolutionFailure("/repo", incompatible, true).kind, "unknown");

	const missingBinary = new Error("lazyworktree is not installed or is not available on PATH");
	assert.equal(classifyWorkspaceResolutionFailure("/repo", missingBinary, true).kind, "unknown");
	assert.equal(classifyWorkspaceResolutionFailure("/repo", incompatible, false).kind, "unmanaged");
});

test("propagates cancellation from classifyCurrentWorkspace instead of returning unmanaged", async () => {
	const controller = new AbortController();
	controller.abort();
	const exec: WorkspaceExec = async () => ({ code: 0, stdout: "/repo\n", stderr: "" });
	const client = {
		resolveFromCwd: async () => {
			throw new Error("cancelled");
		},
	} as unknown as LazyWorktreeClient;
	await assert.rejects(
		classifyCurrentWorkspace(exec, client, "/repo", controller.signal),
		(error: Error) => {
			assert.equal(error.name, "AbortError");
			return true;
		},
	);
});

test("propagates cancellation from loadWorkspaceStatus context loading instead of returning partial success", async () => {
	const controller = new AbortController();
	const exec: WorkspaceExec = async () => ({ code: 0, stdout: "/repo\n", stderr: "" });
	const client = {
		resolveFromCwd: async () => ({
			input: "/repo",
			resolved_by: "cwd",
			worktree: { path: "/repo", name: "repo", branch: "main", repo: "repo-1", is_main: true, dirty: false, ahead: 0, behind: 0 },
		}),
		context: async () => {
			controller.abort();
			throw new Error("cancelled");
		},
	} as unknown as LazyWorktreeClient;
	await assert.rejects(
		loadWorkspaceStatus(exec, client, "/repo", controller.signal),
		(error: Error) => {
			assert.equal(error.name, "AbortError");
			return true;
		},
	);
});

test("does not swallow explicit AbortError from lazyworktree resolution", async () => {
	const exec: WorkspaceExec = async () => ({ code: 0, stdout: "/repo\n", stderr: "" });
	const client = {
		resolveFromCwd: async () => {
			throw abortError();
		},
	} as unknown as LazyWorktreeClient;
	await assert.rejects(classifyCurrentWorkspace(exec, client, "/repo"), /AbortError/);
});

test("interactive workspace prepare uses the default-base helper without a ReferenceError", async () => {
	const commands = new Map<string, (args: string, ctx: any) => Promise<void>>();
	const notifications: string[] = [];
	const prompts: Array<{ title: string; placeholder?: string }> = [];
	const answers = ["origin/main", "Regression fix", "NO-ISSUE", "", "main"];
	const pi = {
		registerTool() {},
		registerCommand(name: string, definition: { handler: (args: string, ctx: any) => Promise<void> }) {
			commands.set(name, definition.handler);
		},
		on() {},
		async exec(command: string, args: string[]) {
			assert.equal(command, "git");
			if (args[0] === "symbolic-ref") return { code: 0, stdout: "refs/remotes/origin/main\n", stderr: "" };
			if (args[0] === "check-ref-format") return { code: 0, stdout: "", stderr: "" };
			if (args[0] === "rev-parse") return { code: 0, stdout: "deadbeef\n", stderr: "" };
			if (args[0] === "show-ref") return { code: 1, stdout: "", stderr: "" };
			throw new Error(`unexpected git call: ${args.join(" ")}`);
		},
	};
	lazyWorktreeExtension(pi as any);

	const ctx = {
		cwd: "/repo",
		hasUI: true,
		mode: "text",
		waitForIdle: async () => {},
		sessionManager: { getBranch: () => [] },
		ui: {
			input: async (title: string, placeholder?: string) => {
				prompts.push({ title, placeholder });
				return answers.shift();
			},
			editor: async () => "# Work Setup\n\n## Next step\n\nRun the regression fix.",
			notify: (message: string) => notifications.push(message),
		},
	};

	await commands.get("workspace")!("prepare feat/restore-default-base", ctx);
	assert.equal(prompts[0]?.title, "Base branch");
	assert.equal(prompts[0]?.placeholder, "origin/main");
	assert.match(notifications[0] ?? "", /Workspace plan/);
});

test("threads the tool AbortSignal through lazyworktree and git subprocesses", async () => {
	const calls: ExecCall[] = [];
	const exec: WorkspaceExec = async (command, args, options) => {
		calls.push({ command, args, options });
		if (command === "git" && args[0] === "symbolic-ref") {
			return { code: 0, stdout: "refs/remotes/origin/main\n", stderr: "" };
		}
		if (command === "git" && args[0] === "check-ref-format") {
			return { code: 0, stdout: "", stderr: "" };
		}
		if (command === "git" && args[0] === "rev-parse" && args.at(-1) === "origin/main^{commit}") {
			return { code: 0, stdout: "deadbeef\n", stderr: "" };
		}
		if (command === "git" && args[0] === "show-ref") {
			return { code: 1, stdout: "", stderr: "" };
		}
		if (command === "git" && args[0] === "branch" && args[1] === "--move") {
			return { code: 0, stdout: "", stderr: "" };
		}
		if (command === "git" && args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
			return { code: 1, stdout: "", stderr: "" };
		}
		if (command === "git" && args[0] === "branch" && args[1] === "--show-current") {
			return { code: 0, stdout: "feat/signal-check\n", stderr: "" };
		}
		if (command === "tmux" && args[0] === "has-session") {
			return { code: 1, stdout: "", stderr: "missing session" };
		}
		throw new Error(`unexpected call: ${command} ${args.join(" ")}`);
	};
	const client = new LazyWorktreeClient(async (command, args, options) => {
		calls.push({ command, args, options });
		if (args[0] === "create") {
			return { code: 0, stdout: JSON.stringify({ path: "/worktrees/feat-signal-check", name: "feat-signal-check", branch: "feat-signal-check" }), stderr: "" };
		}
		if (args[0] === "worktrees" && args[1] === "context") {
			return {
				code: 0,
				stdout: JSON.stringify({
					worktree: { path: "/worktrees/feat-signal-check", name: "feat-signal-check", branch: "feat/signal-check", repo: "repo-1", is_main: false, dirty: false, ahead: 0, behind: 0, tags: ["NO-ISSUE"] },
					note: { note: "next step", tags: ["NO-ISSUE"] },
				}),
				stderr: "",
			};
		}
		throw new Error(`unexpected lazyworktree call: ${args.join(" ")}`);
	});
	const controller = new AbortController();
	const prepared = await prepareWorkspaceRequest(exec, "/repo", {
		branch: "feat/signal-check",
		description: "Signal check",
		note: "# Work Setup\n\n## Next step\nRun it.",
		workId: "NO-ISSUE",
	}, controller.signal);
	const created = await createWorkspace(exec, client, "/repo", prepared, false, controller.signal, {});
	assert.equal(created.created.branch, "feat/signal-check", "returns the verified renamed branch instead of LazyWorktree's temporary branch");

	await assert.rejects(
		createWorkspace(exec, client, "/repo", prepared, true, controller.signal, { TMUX: "/tmp/tmux" }),
		/tmux session main does not exist/,
	);
	assert.ok(calls.length > 0);
	for (const call of calls) {
		assert.equal(call.options?.signal, controller.signal, `${call.command} ${call.args.join(" ")}`);
	}
});

test("workspace status command invokes lazyworktree directly instead of routing through pi.exec", async (t) => {
	const commands = new Map<string, (args: string, ctx: any) => Promise<void>>();
	const notifications: string[] = [];
	const execCalls: ExecCall[] = [];
	const repo = mkdtempSync(join(tmpdir(), "pi-lw-repo-"));
	t.after(() => rmSync(repo, { recursive: true, force: true }));
	mkdirSync(join(repo, ".git"));
	installFakeLazyWorktree(t, `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args[0] === "worktrees" && args[1] === "resolve") {
	process.stdout.write(JSON.stringify({
		input: args[4],
		resolved_by: "cwd",
		worktree: {
			path: args[4],
			name: "repo",
			branch: "feat/direct-runner",
			repo: "repo-1",
			is_main: false,
			dirty: false,
			ahead: 0,
			behind: 0,
			note_present: true,
		},
	}))
} else if (args[0] === "worktrees" && args[1] === "context") {
	process.stdout.write(JSON.stringify({
		worktree: {
			path: args[5],
			name: "repo",
			branch: "feat/direct-runner",
			repo: "repo-1",
			is_main: false,
			dirty: false,
			ahead: 0,
			behind: 0,
			note_present: true,
		},
		note: { note: "Run the workspace status regression." },
	}))
} else {
	process.stderr.write("unexpected args: " + args.join(" "))
	process.exitCode = 64
}
`);
	const pi = {
		registerTool() {},
		registerCommand(name: string, definition: { handler: (args: string, ctx: any) => Promise<void> }) {
			commands.set(name, definition.handler);
		},
		on() {},
		async exec(command: string, args: string[], options?: ExecCall["options"]) {
			execCalls.push({ command, args, options });
			throw new Error(`unexpected pi.exec call: ${command} ${args.join(" ")}`);
		},
	};
	lazyWorktreeExtension(pi as any);

	await commands.get("workspace")!("status", {
		cwd: repo,
		hasUI: true,
		mode: "text",
		waitForIdle: async () => {},
		sessionManager: { getBranch: () => [] },
		ui: {
			notify: (message: string) => notifications.push(message),
		},
	});

	assert.equal(execCalls.length, 0);
	assert.match(notifications[0] ?? "", /Workspace status/);
	assert.match(notifications[0] ?? "", /feat\/direct-runner/);
	assert.match(notifications[0] ?? "", /Run the workspace status regression/);
});


test("clears the footer status and widget in the main checkout", async (t) => {
	const repo = mkdtempSync(join(tmpdir(), "pi-lw-main-widget-"));
	t.after(() => rmSync(repo, { recursive: true, force: true }));
	mkdirSync(join(repo, ".git"));
	installResolveLazyWorktree(t, "cwd");
	const fixture = lazyWorktreeEventFixture({ repo });
	const handler = fixture.handlers.get("session_start")?.[0];
	assert.ok(handler);

	await handler({}, fixture.ctx);
	assert.deepEqual(fixture.statuses.at(-1), {
		id: "lazyworktree",
		value: undefined,
	});
	assert.deepEqual(fixture.widgets.at(-1), {
		id: "lazyworktree",
		value: undefined,
	});
});

test("keeps the footer status and widget in a managed worktree", async (t) => {
	const repo = mkdtempSync(join(tmpdir(), "pi-lw-managed-widget-"));
	t.after(() => rmSync(repo, { recursive: true, force: true }));
	mkdirSync(join(repo, ".git"));
	installResolveLazyWorktree(t, "cwd", false);
	const fixture = lazyWorktreeEventFixture({ repo });
	const handler = fixture.handlers.get("session_start")?.[0];
	assert.ok(handler);

	await handler({}, fixture.ctx);
	assert.deepEqual(fixture.statuses.at(-1), {
		id: "lazyworktree",
		value: "LW repo",
	});
	assert.deepEqual(fixture.widgets.at(-1)?.value?.slice(0, 2), [
		"LazyWorktree repo · main",
		`clean · ${repo}`,
	]);
});

test("confirms each main-checkout bash tool mutation separately", async (t) => {
	const repo = mkdtempSync(join(tmpdir(), "pi-lw-main-bash-"));
	t.after(() => rmSync(repo, { recursive: true, force: true }));
	mkdirSync(join(repo, ".git"));
	installResolveLazyWorktree(t, "cwd");
	const fixture = lazyWorktreeEventFixture({ repo, confirmations: [true, false] });
	const handler = fixture.handlers.get("tool_call")?.[0];
	assert.ok(handler);

	assert.equal(await handler({ toolName: "bash", input: { command: "npm test" } }, fixture.ctx), undefined);
	const denied = await handler({ toolName: "bash", input: { command: "npm run lint" } }, fixture.ctx);
	assert.equal(denied?.block, true);
	assert.match(denied?.reason ?? "", /blocked by user confirmation/);
	assert.deepEqual(fixture.confirmCalls.map(({ title }) => title), [
		"Allow bash mutation in LazyWorktree main checkout?",
		"Allow bash mutation in LazyWorktree main checkout?",
	]);
	assert.match(fixture.confirmCalls[0]?.message ?? "", /explicit user confirmation/);
	assert.match(fixture.confirmCalls[0]?.message ?? "", /Command:\nnpm test/);
	assert.match(fixture.confirmCalls[1]?.message ?? "", /Command:\nnpm run lint/);
});

test("does not prompt when bash commands safely cd into a managed worktree", async (t) => {
	const root = mkdtempSync(join(tmpdir(), "pi-lw-command-cwd-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const repo = join(root, "main");
	const managed = join(root, "managed-session-live-inspection");
	mkdirSync(join(repo, ".git"), { recursive: true });
	mkdirSync(join(managed, ".git"), { recursive: true });
	installFakeLazyWorktree(t, `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args[0] !== "worktrees" || args[1] !== "resolve") process.exit(64)
const cwd = args[4]
const isMain = cwd === ${JSON.stringify(repo)}
process.stdout.write(JSON.stringify({
	input: cwd,
	resolved_by: "cwd",
	worktree: {
		path: cwd,
		name: isMain ? "main" : "managed-session-live-inspection",
		branch: isMain ? "main" : "feat/live-inspection",
		repo: "repo-1",
		is_main: isMain,
		dirty: false,
		ahead: 0,
		behind: 0,
	},
}))
`);
	const fixture = lazyWorktreeEventFixture({ repo });
	const toolCall = fixture.handlers.get("tool_call")?.[0];
	const userBash = fixture.handlers.get("user_bash")?.[0];
	assert.ok(toolCall);
	assert.ok(userBash);

	const command = `cd ${managed} && base=$(git merge-base main HEAD) && printf 'merge-base: %s\\n' "$base" && git status --short`;
	assert.equal(await toolCall({ toolName: "bash", input: { command } }, fixture.ctx), undefined);
	assert.equal(await userBash({ command: `cd ${managed} && npm test`, cwd: repo }, fixture.ctx), undefined);
	assert.deepEqual(fixture.confirmCalls, []);
});

test("fails closed for main-checkout bash tool mutations without UI", async (t) => {
	const repo = mkdtempSync(join(tmpdir(), "pi-lw-main-noui-"));
	t.after(() => rmSync(repo, { recursive: true, force: true }));
	mkdirSync(join(repo, ".git"));
	installResolveLazyWorktree(t, "cwd");
	const fixture = lazyWorktreeEventFixture({ repo, hasUI: false });
	const handler = fixture.handlers.get("tool_call")?.[0];
	assert.ok(handler);

	const blocked = await handler({ toolName: "bash", input: { command: "npm test" } }, fixture.ctx);
	assert.equal(blocked?.block, true);
	assert.match(blocked?.reason ?? "", /Interactive confirmation is unavailable/);
	assert.deepEqual(fixture.confirmCalls, []);
});

test("fails closed for main-checkout user_bash mutations without UI or prompting", async (t) => {
	const repo = mkdtempSync(join(tmpdir(), "pi-lw-user-bash-noui-"));
	t.after(() => rmSync(repo, { recursive: true, force: true }));
	mkdirSync(join(repo, ".git"));
	installResolveLazyWorktree(t, "cwd");
	const fixture = lazyWorktreeEventFixture({ repo, hasUI: false });
	const handler = fixture.handlers.get("user_bash")?.[0];
	assert.ok(handler);

	const blocked = await handler({ command: "touch blocked", cwd: repo }, fixture.ctx);
	assert.equal(blocked?.result.cancelled, true);
	assert.equal(blocked?.result.exitCode, 1);
	assert.match(blocked?.result.output ?? "", /Interactive confirmation is unavailable/);
	assert.deepEqual(fixture.confirmCalls, []);
});

test("fails closed for main-checkout edit and write mutations without UI or prompting", async (t) => {
	const repo = mkdtempSync(join(tmpdir(), "pi-lw-paths-noui-"));
	t.after(() => rmSync(repo, { recursive: true, force: true }));
	mkdirSync(join(repo, ".git"));
	installResolveLazyWorktree(t, "cwd");
	const fixture = lazyWorktreeEventFixture({ repo, hasUI: false });
	const handler = fixture.handlers.get("tool_call")?.[0];
	assert.ok(handler);

	for (const toolName of ["edit", "write"]) {
		const blocked = await handler({ toolName, input: { path: `src/${toolName}.ts` } }, fixture.ctx);
		assert.equal(blocked?.block, true);
		assert.match(blocked?.reason ?? "", /Interactive confirmation is unavailable/);
	}
	assert.deepEqual(fixture.confirmCalls, []);
});

test("prompts per user_bash mutation in the main checkout", async (t) => {
	const repo = mkdtempSync(join(tmpdir(), "pi-lw-user-bash-"));
	t.after(() => rmSync(repo, { recursive: true, force: true }));
	mkdirSync(join(repo, ".git"));
	installResolveLazyWorktree(t, "cwd");
	const fixture = lazyWorktreeEventFixture({ repo, confirmations: [true, false] });
	const handler = fixture.handlers.get("user_bash")?.[0];
	assert.ok(handler);

	assert.equal(await handler({ command: "touch keep", cwd: repo }, fixture.ctx), undefined);
	const denied = await handler({ command: "touch deny", cwd: repo }, fixture.ctx);
	assert.equal(denied?.result.cancelled, true);
	assert.equal(denied?.result.exitCode, 1);
	assert.match(denied?.result.output ?? "", /blocked by user confirmation/);
	assert.deepEqual(fixture.confirmCalls.map(({ title }) => title), [
		"Allow !command mutation in LazyWorktree main checkout?",
		"Allow !command mutation in LazyWorktree main checkout?",
	]);
	assert.match(fixture.confirmCalls[0]?.message ?? "", /Command:\ntouch keep/);
	assert.match(fixture.confirmCalls[1]?.message ?? "", /Command:\ntouch deny/);
});

test("prompts before edit and write inside the main checkout", async (t) => {
	const repo = mkdtempSync(join(tmpdir(), "pi-lw-paths-"));
	t.after(() => rmSync(repo, { recursive: true, force: true }));
	mkdirSync(join(repo, ".git"));
	mkdirSync(join(repo, "src"));
	installResolveLazyWorktree(t, "cwd");
	const fixture = lazyWorktreeEventFixture({ repo, confirmations: [true, false] });
	const handler = fixture.handlers.get("tool_call")?.[0];
	assert.ok(handler);

	assert.equal(await handler({ toolName: "edit", input: { path: "src/index.ts" } }, fixture.ctx), undefined);
	const denied = await handler({ toolName: "write", input: { path: "src/output.ts" } }, fixture.ctx);
	assert.equal(denied?.block, true);
	assert.match(denied?.reason ?? "", /blocked by user confirmation/);
	assert.deepEqual(fixture.confirmCalls.map(({ title }) => title), [
		"Allow edit in LazyWorktree main checkout?",
		"Allow write in LazyWorktree main checkout?",
	]);
	assert.match(fixture.confirmCalls[0]?.message ?? "", /Path:\nsrc\/index.ts/);
	assert.match(fixture.confirmCalls[1]?.message ?? "", /Path:\nsrc\/output.ts/);
});

test("escapes terminal controls in command and path confirmation messages", async (t) => {
	const repo = mkdtempSync(join(tmpdir(), "pi-lw-prompt-controls-"));
	t.after(() => rmSync(repo, { recursive: true, force: true }));
	mkdirSync(join(repo, ".git"));
	installResolveLazyWorktree(t, "cwd");
	const fixture = lazyWorktreeEventFixture({ repo, confirmations: [false, false] });
	const handler = fixture.handlers.get("tool_call")?.[0];
	assert.ok(handler);

	const command = "touch safe\u001b[2J\u0007\u009b31m\u007f\nprintf\tok";
	const path = "src/\u001b[2J\u0007\u009b31m\u007ffile\tname\nnext.ts";
	assert.equal((await handler({ toolName: "bash", input: { command } }, fixture.ctx))?.block, true);
	assert.equal((await handler({ toolName: "edit", input: { path } }, fixture.ctx))?.block, true);

	assert.equal(fixture.confirmCalls.length, 2);
	for (const { message } of fixture.confirmCalls) {
		assert.doesNotMatch(message, /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/);
		assert.match(message, /\\x1B\[2J/);
		assert.match(message, /\\x07/);
		assert.match(message, /\\x9B31m/);
		assert.match(message, /\\x7F/);
	}
	assert.ok(fixture.confirmCalls[0]?.message.includes("\\x7F\nprintf\tok"));
	assert.ok(fixture.confirmCalls[1]?.message.includes("\\x7Ffile\tname\nnext.ts"));
});

test("hard-blocks direct git worktree lifecycle bypasses without confirmation", async (t) => {
	const repo = mkdtempSync(join(tmpdir(), "pi-lw-lifecycle-"));
	t.after(() => rmSync(repo, { recursive: true, force: true }));
	mkdirSync(join(repo, ".git"));
	installResolveLazyWorktree(t, "cwd");
	const fixture = lazyWorktreeEventFixture({ repo, confirmations: [true, true] });
	const toolCall = fixture.handlers.get("tool_call")?.[0];
	const userBash = fixture.handlers.get("user_bash")?.[0];
	assert.ok(toolCall);
	assert.ok(userBash);

	const toolBlocked = await toolCall({ toolName: "bash", input: { command: "git worktree remove ../old" } }, fixture.ctx);
	assert.equal(toolBlocked?.block, true);
	assert.match(toolBlocked?.reason ?? "", /bypasses LazyWorktree/);
	const userBlocked = await userBash({ command: "git worktree add ../new feature", cwd: repo }, fixture.ctx);
	assert.equal(userBlocked?.result.cancelled, true);
	assert.match(userBlocked?.result.output ?? "", /bypasses LazyWorktree/);
	assert.deepEqual(fixture.confirmCalls, []);
});

test("keeps unknown workspace classification fail-closed for mutations", async (t) => {
	const repo = mkdtempSync(join(tmpdir(), "pi-lw-unknown-"));
	t.after(() => rmSync(repo, { recursive: true, force: true }));
	mkdirSync(join(repo, ".git"));
	installResolveLazyWorktree(t, "/definitely-not-this-repo");
	const fixture = lazyWorktreeEventFixture({ repo, confirmations: [true, true, true] });
	const toolCall = fixture.handlers.get("tool_call")?.[0];
	const userBash = fixture.handlers.get("user_bash")?.[0];
	assert.ok(toolCall);
	assert.ok(userBash);

	const bashBlocked = await toolCall({ toolName: "bash", input: { command: "npm test" } }, fixture.ctx);
	assert.equal(bashBlocked?.block, true);
	assert.match(bashBlocked?.reason ?? "", /Workspace classification failed/);
	const editBlocked = await toolCall({ toolName: "edit", input: { path: "src/index.ts" } }, fixture.ctx);
	assert.equal(editBlocked?.block, true);
	assert.match(editBlocked?.reason ?? "", /Workspace classification failed/);
	const userBlocked = await userBash({ command: "touch nope", cwd: repo }, fixture.ctx);
	assert.equal(userBlocked?.result.cancelled, true);
	assert.match(userBlocked?.result.output ?? "", /Workspace classification failed/);
	assert.deepEqual(fixture.confirmCalls, []);
});
