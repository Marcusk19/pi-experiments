import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import lazyWorktreeExtension from "../index.ts";

interface ExecCall {
	command: string;
	args: string[];
	options?: { cwd?: string; timeout?: number; signal?: AbortSignal };
}

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function commit(cwd: string, path: string, value: string, message: string): string {
	writeFileSync(join(cwd, path), value);
	git(cwd, "add", "--", path);
	git(cwd, "-c", "commit.gpgSign=false", "commit", "--no-gpg-sign", "-m", message);
	return git(cwd, "rev-parse", "HEAD");
}

function installLazyWorktree(t: test.TestContext, main: string, source: string): void {
	const bin = mkdtempSync(join(tmpdir(), "pi-lw-surface-bin-"));
	const command = join(bin, "lazyworktree");
	writeFileSync(command, `#!/usr/bin/env node
const { execFileSync } = require("node:child_process")
const args = process.argv.slice(2)
const main = ${JSON.stringify(main)}
const source = ${JSON.stringify(source)}
const repository = "integration-repository"
function branch(path) {
	return execFileSync("git", ["branch", "--show-current"], { cwd: path, encoding: "utf8" }).trim() || (path === source ? "feature" : "main")
}
function item(path) {
	return {
		path,
		name: path === main ? "main" : "task-source",
		branch: branch(path),
		repo: repository,
		is_main: path === main,
		dirty: execFileSync("git", ["status", "--porcelain"], { cwd: path, encoding: "utf8" }).trim().length > 0,
		ahead: 0,
		behind: 0,
	}
}
if (args[0] === "worktrees" && args[1] === "resolve") {
	const cwd = args[4]
	const path = cwd === source || cwd.startsWith(source + "/") ? source : cwd === main || cwd.startsWith(main + "/") ? main : undefined
	if (!path) process.exit(2)
	process.stdout.write(JSON.stringify({ input: cwd, resolved_by: "cwd", worktree: item(path) }))
} else if (args[0] === "worktrees" && args[1] === "context") {
	const path = args[5]
	if (path !== main && path !== source) process.exit(2)
	process.stdout.write(JSON.stringify({ worktree: item(path) }))
} else if (args[0] === "worktrees" && args[1] === "list") {
	process.stdout.write(JSON.stringify({ repo: repository, count: 2, items: [item(main), item(source)] }))
} else {
	process.stderr.write("unexpected args: " + args.join(" "))
	process.exit(64)
}
`, "utf8");
	chmodSync(command, 0o755);
	const previousPath = process.env.PATH;
	process.env.PATH = `${bin}:${previousPath ?? ""}`;
	t.after(() => {
		process.env.PATH = previousPath;
		rmSync(bin, { recursive: true, force: true });
	});
}

function surfaceFixture(t: test.TestContext) {
	const root = mkdtempSync(join(tmpdir(), "pi-lw-extension-integration-"));
	const main = join(root, "main");
	const source = join(root, "source with spaces");
	mkdirSync(main);
	git(main, "init", "-b", "main");
	git(main, "config", "user.name", "Pi Test");
	git(main, "config", "user.email", "pi@example.test");
	commit(main, "base.txt", "base\n", "base");
	git(main, "branch", "feature");
	git(main, "worktree", "add", source, "feature");
	commit(source, "source.txt", "source\n", "source change");
	commit(main, "target.txt", "target\n", "target change");
	installLazyWorktree(t, main, source);
	t.after(() => rmSync(root, { recursive: true, force: true }));

	const tools = new Map<string, any>();
	const commands = new Map<string, (args: string, ctx: any) => Promise<void>>();
	const execCalls: ExecCall[] = [];
	const pi = {
		registerTool(definition: { name: string }) {
			tools.set(definition.name, definition);
		},
		registerCommand(name: string, definition: { handler: (args: string, ctx: any) => Promise<void> }) {
			commands.set(name, definition.handler);
		},
		on() {},
		exec(command: string, args: string[], options?: ExecCall["options"]) {
			execCalls.push({ command, args: [...args], options });
			return new Promise<{ code: number; stdout: string; stderr: string }>((resolveCall, reject) => {
				execFile(command, args, {
					cwd: options?.cwd,
					encoding: "utf8",
					timeout: options?.timeout,
					signal: options?.signal,
				}, (error, stdout, stderr) => {
					if (error && (error as NodeJS.ErrnoException).code === "ABORT_ERR") {
						reject(error);
						return;
					}
					resolveCall({
						code: typeof (error as NodeJS.ErrnoException | null)?.code === "number" ? (error as NodeJS.ErrnoException & { code: number }).code : error ? 1 : 0,
						stdout: stdout ?? "",
						stderr: stderr ?? "",
					});
				});
			});
		},
	};
	lazyWorktreeExtension(pi as any);

	let confirmBehavior: boolean | ((message: string) => boolean) = false;
	const confirmations: Array<{ title: string; message: string }> = [];
	const selections: Array<{ title: string; options: string[] }> = [];
	const notifications: string[] = [];
	const ctx = {
		cwd: main,
		hasUI: true,
		mode: "rpc",
		signal: undefined,
		waitForIdle: async () => {},
		ui: {
			confirm: async (title: string, message: string) => {
				confirmations.push({ title, message });
				return typeof confirmBehavior === "function" ? confirmBehavior(message) : confirmBehavior;
			},
			select: async (title: string, options: string[]) => {
				selections.push({ title, options });
				if (title.includes("source")) return options.find((option) => option.includes(source));
				if (title.includes("strategy")) return "no-ff";
				return undefined;
			},
			notify: (message: string) => notifications.push(message),
			setStatus() {},
			setWidget() {},
			theme: { fg: (_color: string, text: string) => text },
		},
	};
	return {
		main,
		source,
		tools,
		commands,
		execCalls,
		ctx,
		confirmations,
		selections,
		notifications,
		setConfirm(value: typeof confirmBehavior) {
			confirmBehavior = value;
		},
	};
}

test("workspace tool validates integration inputs, fails closed without UI, and confirms exact plans", async (t) => {
	const fixture = surfaceFixture(t);
	const workspace = fixture.tools.get("workspace");
	assert.ok(workspace);
	assert.deepEqual(workspace.parameters.properties.action.enum, ["status", "list", "prepare", "create", "rebase", "merge"]);
	assert.deepEqual(workspace.parameters.properties.strategy.enum, ["rebase-ff", "no-ff"]);
	await assert.rejects(
		workspace.execute("call", { action: "merge", workspacePath: fixture.source }, undefined, undefined, fixture.ctx),
		/requires strategy=rebase-ff or strategy=no-ff/,
	);
	await assert.rejects(
		workspace.execute("call", { action: "rebase", strategy: "no-ff", workspacePath: fixture.source }, undefined, undefined, fixture.ctx),
		/does not accept strategy/,
	);
	await assert.rejects(
		workspace.execute("call", { action: "rebase", workspacePath: fixture.source }, undefined, undefined, { ...fixture.ctx, hasUI: false }),
		/require interactive confirmation/,
	);

	const cancellation = new AbortController();
	fixture.setConfirm(() => {
		cancellation.abort();
		return false;
	});
	const cancelled = await workspace.execute(
		"call",
		{ action: "rebase", workspacePath: fixture.source, targetBranch: "main" },
		cancellation.signal,
		undefined,
		fixture.ctx,
	);
	assert.equal(cancelled.details.outcome, "no-mutation");
	assert.equal(cancelled.details.cancelled, true);

	const sourceBefore = git(fixture.source, "rev-parse", "HEAD");
	fixture.setConfirm(false);
	const denied = await workspace.execute(
		"call",
		{ action: "rebase", workspacePath: fixture.source, targetBranch: "main" },
		undefined,
		undefined,
		fixture.ctx,
	);
	assert.equal(denied.details.outcome, "no-mutation");
	assert.equal(git(fixture.source, "rev-parse", "HEAD"), sourceBefore);
	assert.match(fixture.confirmations.at(-1)?.message ?? "", /source: .*source with spaces/);
	assert.match(fixture.confirmations.at(-1)?.message ?? "", /rebase --no-autostash --no-gpg-sign/);
	assert.match(fixture.confirmations.at(-1)?.message ?? "", /commit signing: explicitly disabled/);

	fixture.setConfirm(() => {
		commit(fixture.main, "stale.txt", "stale\n", "move target during confirmation");
		return true;
	});
	const stale = await workspace.execute(
		"call",
		{ action: "rebase", workspacePath: fixture.source, targetBranch: "main" },
		undefined,
		undefined,
		fixture.ctx,
	);
	assert.equal(stale.details.outcome, "no-mutation");
	assert.match(stale.details.message, /stale/);
	assert.equal(git(fixture.source, "rev-parse", "HEAD"), sourceBefore);

	const rendered = workspace.renderCall(
		{ action: "merge", strategy: "no-ff", targetBranch: "main\nspoof\tvalue" },
		{ fg: (_color: string, text: string) => text, bold: (text: string) => text },
	).render(200).join("\n");
	assert.match(rendered, /main\\x0Aspoof\\x09value/);
	assert.doesNotMatch(rendered, /main\nspoof/);
});

test("workspace command selects exact source paths and prompts for omitted strategy", async (t) => {
	const fixture = surfaceFixture(t);
	fixture.setConfirm(false);
	await fixture.commands.get("workspace")!("merge main", fixture.ctx);
	assert.match(fixture.selections[0]?.title ?? "", /exact managed source/);
	assert.ok(fixture.selections[0]?.options.some((option) => option.includes(resolve(fixture.source))));
	assert.match(fixture.selections[1]?.title ?? "", /merge strategy/);
	assert.match(fixture.confirmations.at(-1)?.message ?? "", /operation: merge \(no-ff\)/);
	assert.match(fixture.notifications.at(-1) ?? "", /no-mutation/);
	assert.equal(fixture.execCalls.some((call) => call.args.includes("--no-ff")), false, "denial performs no merge mutation");
});
