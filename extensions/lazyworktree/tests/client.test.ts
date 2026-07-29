import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { LazyWorktreeClient } from "../client.ts";
import { runLazyWorktreeCommand } from "../runner.ts";

test("invokes stable JSON lazyworktree commands with argv-separated arguments", async () => {
	const signal = new AbortController().signal;
	const calls: Array<{ command: string; args: string[]; cwd?: string; signal?: AbortSignal }> = [];
	const timeouts: Array<number | undefined> = [];
	const client = new LazyWorktreeClient(async (command, args, options) => {
		calls.push({ command, args, cwd: options?.cwd, signal: options?.signal });
		timeouts.push(options?.timeout);
		if (args[0] === "worktrees" && args[1] === "list") {
			return {
				code: 0,
				stdout: JSON.stringify({
					repo: "repo-1",
					count: 1,
					items: [{ path: "/repo", name: "repo", branch: "main", repo: "repo-1", is_main: true, dirty: false, ahead: 0, behind: 0 }],
				}),
				stderr: "",
			};
		}
		if (args[0] === "worktrees" && args[1] === "resolve") {
			return {
				code: 0,
				stdout: JSON.stringify({
					input: "/repo/src",
					resolved_by: "cwd",
					worktree: { path: "/repo", name: "repo", branch: "main", repo: "repo-1", is_main: true, dirty: false, ahead: 0, behind: 0 },
				}),
				stderr: "",
			};
		}
		if (args[0] === "worktrees" && args[1] === "context") {
			return {
				code: 0,
				stdout: JSON.stringify({
					worktree: { path: "/repo", name: "repo", branch: "main", repo: "repo-1", is_main: true, dirty: false, ahead: 0, behind: 0 },
					note: { note: "next step", tags: ["NO-ISSUE"] },
				}),
				stderr: "",
			};
		}
		if (args[0] === "create") {
			return {
				code: 0,
				stdout: JSON.stringify({ path: "/worktrees/feat-safe", name: "feat-safe", branch: "feat-safe" }),
				stderr: "",
			};
		}
		throw new Error(`unexpected call: ${args.join(" ")}`);
	});

	const cwd = "/repo";
	assert.equal((await client.list(cwd, signal)).items[0]?.name, "repo");
	assert.equal((await client.resolveFromCwd("/repo/src", signal)).worktree.path, "/repo");
	assert.equal((await client.context("/repo", "/repo", signal)).note?.note, "next step");
	assert.deepEqual(
		await client.create({
			cwd,
			fromBranch: "origin/main",
			worktreeName: "feat-safe",
			noteFile: "/tmp/note.md",
			description: "Safe create",
			tags: ["NO-ISSUE"],
		}, signal),
		{ path: "/worktrees/feat-safe", name: "feat-safe", branch: "feat-safe" },
	);

	assert.deepEqual(calls[0], { command: "lazyworktree", args: ["worktrees", "list", "--json", "--no-agent"], cwd, signal });
	assert.deepEqual(calls[1], {
		command: "lazyworktree",
		args: ["worktrees", "resolve", "--json", "--cwd", "/repo/src", "--no-agent"],
		cwd: "/repo/src",
		signal,
	});
	assert.deepEqual(calls[2], {
		command: "lazyworktree",
		args: ["worktrees", "context", "--json", "--include", "notes", "/repo"],
		cwd: "/repo",
		signal,
	});
	assert.deepEqual(calls[3], {
		command: "lazyworktree",
		args: [
			"create",
			"--from-branch",
			"origin/main",
			"--note-file",
			"/tmp/note.md",
			"--description",
			"Safe create",
			"--json",
			"--tags",
			"NO-ISSUE",
			"feat-safe",
		],
		cwd,
		signal,
	});
	assert.deepEqual(timeouts, [5_000, 5_000, 5_000, 5 * 60_000]);
	assert.equal(calls[3]?.args.includes("--with-change"), false);
	assert.equal(calls[3]?.args.includes("--no-workspace"), false);
	assert.equal(calls[3]?.args.includes("--update-on-existing"), false);
	assert.equal(calls[3]?.args.includes("--exec"), false);
});

test("captures complete short-lived lazyworktree stdout with the dedicated runner", async (t) => {
	const root = mkdtempSync(join(tmpdir(), "pi-lw-client-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const command = join(root, "fake-lazyworktree");
	writeFileSync(command, `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args[0] === "worktrees" && args[1] === "list") {
	process.stdout.write(JSON.stringify({
		repo: "repo-1",
		count: 1,
		items: [{
			path: "/repo",
			name: "repo",
			branch: "main",
			repo: "repo-1",
			is_main: true,
			dirty: false,
			ahead: 0,
			behind: 0,
			description: "x".repeat(300000),
		}],
	}))
} else {
	process.stderr.write("unexpected args: " + args.join(" "))
	process.exitCode = 64
}
`);
	chmodSync(command, 0o755);

	const client = new LazyWorktreeClient(runLazyWorktreeCommand, command);
	const listed = await client.list(root);
	assert.equal(listed.items[0]?.description?.length, 300_000);
	assert.equal(listed.items[0]?.description, "x".repeat(300_000));
});

test("reports invalid JSON, structured failures, and missing lazyworktree clearly", async () => {
	const badJson = new LazyWorktreeClient(async () => ({ code: 0, stdout: "not json", stderr: "" }));
	await assert.rejects(badJson.list("/repo"), /invalid JSON/);

	const structuredFailure = new LazyWorktreeClient(async () => ({
		code: 1,
		stdout: JSON.stringify({ error: { code: "worktree_not_found", message: "worktree not found for cwd: /repo" } }),
		stderr: "",
	}));
	await assert.rejects(
		structuredFailure.resolveFromCwd("/repo"),
		(error: Error & { lazyWorktreeCode?: string }) => {
			assert.equal(error.lazyWorktreeCode, "worktree_not_found");
			assert.match(error.message, /worktree not found/);
			return true;
		},
	);

	const missingBinary = new LazyWorktreeClient(async () => {
		const error = new Error("spawn lazyworktree ENOENT") as NodeJS.ErrnoException;
		error.code = "ENOENT";
		throw error;
	});
	await assert.rejects(missingBinary.list("/repo"), /lazyworktree is not installed/);
});
