import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import test from "node:test";
import type { LazyWorktreeClient, LazyWorktreeSummary } from "../client.ts";
import {
	executeIntegrationPlan,
	formatIntegrationConfirmation,
	prepareIntegrationPlan,
	type IntegrationPlan,
} from "../integration.ts";
import type { WorkspaceExec, WorkspaceExecOptions, WorkspaceExecResult } from "../operations.ts";

interface GitFixture {
	root: string;
	main: string;
	source: string;
	repository: string;
	client: LazyWorktreeClient;
	exec: WorkspaceExec;
	calls: Array<{ command: string; args: string[]; options?: WorkspaceExecOptions }>;
}

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function write(path: string, value: string): void {
	writeFileSync(path, value, "utf8");
}

function commitFile(cwd: string, path: string, value: string, message: string): string {
	write(join(cwd, path), value);
	git(cwd, "add", "--", path);
	git(cwd, "-c", "commit.gpgSign=false", "commit", "--no-gpg-sign", "-m", message);
	return git(cwd, "rev-parse", "HEAD");
}

function createExec(calls: GitFixture["calls"]): WorkspaceExec {
	return (command, args, options) => new Promise<WorkspaceExecResult>((resolveCall, reject) => {
		calls.push({ command, args: [...args], options });
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
}

function summary(fixture: Pick<GitFixture, "main" | "source" | "repository">, path: string): LazyWorktreeSummary {
	const main = resolve(path) === resolve(fixture.main);
	return {
		path: resolve(path),
		name: main ? "main" : "task",
		branch: main ? git(fixture.main, "branch", "--show-current") : git(fixture.source, "branch", "--show-current") || "feature",
		repo: fixture.repository,
		is_main: main,
		dirty: git(path, "status", "--porcelain").length > 0,
		ahead: 0,
		behind: 0,
	};
}

function fakeClient(fixture: Pick<GitFixture, "main" | "source" | "repository">): LazyWorktreeClient {
	return {
		async list() {
			const items = [summary(fixture, fixture.main), summary(fixture, fixture.source)];
			return { repo: fixture.repository, count: items.length, items };
		},
		async context(path: string) {
			const canonical = resolve(path);
			if (canonical !== resolve(fixture.main) && canonical !== resolve(fixture.source)) throw new Error(`unknown worktree: ${path}`);
			return { worktree: summary(fixture, canonical) };
		},
		async resolveFromCwd(cwd: string) {
			const canonical = resolve(cwd);
			const path = canonical === resolve(fixture.main) || canonical.startsWith(`${resolve(fixture.main)}/`)
				? fixture.main
				: canonical === resolve(fixture.source) || canonical.startsWith(`${resolve(fixture.source)}/`)
					? fixture.source
					: undefined;
			if (!path) throw new Error(`unmanaged cwd: ${cwd}`);
			return { input: cwd, resolved_by: "cwd", worktree: summary(fixture, path) };
		},
	} as unknown as LazyWorktreeClient;
}

function createFixture(t: test.TestContext, sourceName = "source workspace"): GitFixture {
	const root = mkdtempSync(join(tmpdir(), "pi-lw-integration-"));
	const main = join(root, "main");
	const source = join(root, sourceName);
	mkdirSync(main);
	git(main, "init", "-b", "main");
	git(main, "config", "user.name", "Pi Test");
	git(main, "config", "user.email", "pi@example.test");
	commitFile(main, "base.txt", "base\n", "base");
	git(main, "branch", "feature");
	git(main, "worktree", "add", source, "feature");
	const calls: GitFixture["calls"] = [];
	const fixture = {
		root,
		main,
		source,
		repository: `repo-${root}`,
		client: undefined as unknown as LazyWorktreeClient,
		exec: createExec(calls),
		calls,
	};
	fixture.client = fakeClient(fixture);
	t.after(() => rmSync(root, { recursive: true, force: true }));
	return fixture;
}

function diverge(fixture: GitFixture): { target: string; source: string } {
	const source = commitFile(fixture.source, "source.txt", "source\n", "source change");
	const target = commitFile(fixture.main, "target.txt", "target\n", "target change");
	return { target, source };
}

async function plan(fixture: GitFixture, operation: "rebase" | "merge", strategy?: "rebase-ff" | "no-ff", signal?: AbortSignal): Promise<IntegrationPlan> {
	return prepareIntegrationPlan(fixture.exec, fixture.client, {
		operation,
		strategy,
		workspacePath: fixture.source,
		targetBranch: "main",
		cwd: fixture.main,
	}, signal);
}

function mutationCalls(fixture: GitFixture, action: "rebase" | "merge"): string[][] {
	return fixture.calls
		.filter((call) => call.command === "git" && call.args.includes(action))
		.map((call) => call.args);
}

test("preflight requires an exact managed source and rejects dirty or mismatched checkouts", async (t) => {
	const fixture = createFixture(t);
	diverge(fixture);
	await assert.rejects(
		prepareIntegrationPlan(fixture.exec, fixture.client, { operation: "rebase", targetBranch: "main", cwd: fixture.main }),
		/workspacePath is required.*main checkout/,
	);
	await assert.rejects(
		prepareIntegrationPlan(fixture.exec, fixture.client, { operation: "rebase", workspacePath: "source workspace", targetBranch: "main", cwd: fixture.main }),
		/exact absolute path/,
	);
	write(join(fixture.source, "untracked.txt"), "dirty\n");
	await assert.rejects(plan(fixture, "rebase"), /source worktree is not clean/);
	rmSync(join(fixture.source, "untracked.txt"));
	write(join(fixture.main, "untracked.txt"), "dirty\n");
	await assert.rejects(plan(fixture, "rebase"), /target worktree is not clean/);
	rmSync(join(fixture.main, "untracked.txt"));
	const mergeHead = git(fixture.source, "rev-parse", "--git-path", "MERGE_HEAD");
	write(isAbsolute(mergeHead) ? mergeHead : resolve(fixture.source, mergeHead), `${git(fixture.main, "rev-parse", "HEAD")}\n`);
	await assert.rejects(plan(fixture, "rebase"), /source worktree has an unfinished Git operation: merge/);
	rmSync(isAbsolute(mergeHead) ? mergeHead : resolve(fixture.source, mergeHead));
	git(fixture.source, "checkout", "--detach");
	await assert.rejects(plan(fixture, "rebase"), /managed source worktree .* is detached/);
	git(fixture.source, "switch", "feature");
	git(fixture.main, "checkout", "-b", "other");
	await assert.rejects(plan(fixture, "rebase"), /must have target branch main checked out/);
});

test("preserves trailing whitespace in the exact managed workspace path", async (t) => {
	const fixture = createFixture(t, "source trailing ");
	diverge(fixture);
	const prepared = await plan(fixture, "rebase");
	assert.equal(prepared.source.path, fixture.source);
});

test("killed Git inspections fail closed even when the subprocess reports code zero", async (t) => {
	const fixture = createFixture(t);
	diverge(fixture);
	const baseExec = fixture.exec;
	let killedStatus = false;
	fixture.exec = async (command, args, options) => {
		if (!killedStatus && command === "git" && args[0] === "status") {
			killedStatus = true;
			fixture.calls.push({ command, args: [...args], options });
			return { code: 0, stdout: "", stderr: "", killed: true };
		}
		return baseExec(command, args, options);
	};
	await assert.rejects(plan(fixture, "rebase"), /was terminated before completion/);
});

test("default target follows local origin/HEAD and rejects revision expressions", async (t) => {
	const fixture = createFixture(t);
	diverge(fixture);
	git(fixture.main, "update-ref", "refs/remotes/origin/main", "main");
	git(fixture.main, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
	const prepared = await prepareIntegrationPlan(fixture.exec, fixture.client, {
		operation: "rebase",
		workspacePath: fixture.source,
		cwd: fixture.main,
	});
	assert.equal(prepared.target.branch, "main");
	await assert.rejects(
		prepareIntegrationPlan(fixture.exec, fixture.client, {
			operation: "rebase",
			workspacePath: fixture.source,
			targetBranch: "main~1",
			cwd: fixture.main,
		}),
		/invalid local target branch/,
	);
	await assert.rejects(
		prepareIntegrationPlan(fixture.exec, fixture.client, {
			operation: "rebase",
			workspacePath: fixture.source,
			targetBranch: "missing",
			cwd: fixture.main,
		}),
		/local target branch does not exist/,
	);
});

test("formats sanitized strategy-specific confirmation contracts", async (t) => {
	const fixture = createFixture(t);
	diverge(fixture);
	const standalone = await plan(fixture, "rebase");
	const rebaseFastForwardPlan = await plan(fixture, "merge", "rebase-ff");
	const noFastForwardPlan = await plan(fixture, "merge", "no-ff");
	const text = formatIntegrationConfirmation(rebaseFastForwardPlan);
	assert.match(text, /source: .*source workspace/);
	assert.match(text, /source OID: [0-9a-f]{40}/);
	assert.match(text, /target OID: [0-9a-f]{40}/);
	assert.match(text, /rebase --no-autostash --no-gpg-sign --no-update-refs '[0-9a-f]{40}'/);
	assert.match(text, /merge --ff-only '<verified-post-rebase-source-oid>'/);
	assert.match(text, /commit signing: explicitly disabled/);
	assert.match(text, /conflict state only in the isolated source/);
	assert.match(text, /successful source rebase remains intact/);
	assert.match(text, /deletion: never/);

	const standaloneText = formatIntegrationConfirmation(standalone);
	assert.match(standaloneText, /target is never mutated/);
	assert.doesNotMatch(standaloneText, /failed target recovery/);
	const noFastForwardText = formatIntegrationConfirmation(noFastForwardPlan);
	assert.match(noFastForwardText, /merge --no-ff --commit --no-edit --no-gpg-sign '[0-9a-f]{40}'/);
	assert.match(noFastForwardText, /failed target recovery/);

	const injected = formatIntegrationConfirmation({
		...standalone,
		source: { ...standalone.source, path: `${standalone.source.path}\ncommands:\n  git push attacker`, branch: `${standalone.source.branch}\tspoof` },
		target: { ...standalone.target, path: `${standalone.target.path}\tspoof` },
	});
	assert.match(injected, /\\x0Acommands:\\x0A  git push attacker/);
	assert.match(injected, /feature\\x09spoof/);
	assert.match(injected, /main\\x09spoof/);
	assert.doesNotMatch(injected, /\n  git push attacker/);
	assert.doesNotMatch(injected, /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/);
});

test("standalone rebase rewrites onto the target with signing disabled", async (t) => {
	const fixture = createFixture(t);
	const before = diverge(fixture);
	git(fixture.main, "config", "commit.gpgSign", "true");
	git(fixture.main, "config", "user.signingkey", "invalid-test-key");
	const prepared = await plan(fixture, "rebase");
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, prepared);
	assert.equal(result.outcome, "completed");
	assert.equal(result.mutation.sourceRebased, true);
	assert.equal(result.mutation.targetUpdated, false);
	assert.equal(result.target.afterOid, before.target);
	assert.notEqual(result.source.afterOid, before.source);
	assert.ok((result.source.rewrittenCommits ?? 0) > 0);
	assert.equal(git(fixture.source, "merge-base", "--is-ancestor", before.target, "HEAD"), "");
	assert.doesNotMatch(git(fixture.source, "cat-file", "-p", "HEAD"), /^gpgsig /m);
	assert.ok(mutationCalls(fixture, "rebase").some((args) => args.includes("--no-gpg-sign") && args.includes("--no-update-refs") && args.includes("commit.gpgSign=false") && args.at(-1) === before.target));
});

test("standalone rebase overrides rebase.updateRefs and preserves sibling branches", async (t) => {
	const fixture = createFixture(t);
	const source = commitFile(fixture.source, "source.txt", "source\n", "source change");
	git(fixture.main, "branch", "sibling", source);
	commitFile(fixture.main, "target.txt", "target\n", "target change");
	git(fixture.main, "config", "rebase.updateRefs", "true");
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, await plan(fixture, "rebase"));
	assert.equal(result.outcome, "completed");
	assert.equal(git(fixture.main, "rev-parse", "sibling"), source);
});

test("rebase conflicts remain isolated to the source and leave recovery choices", async (t) => {
	const fixture = createFixture(t);
	commitFile(fixture.source, "base.txt", "source version\n", "source conflict");
	const target = commitFile(fixture.main, "base.txt", "target version\n", "target conflict");
	const prepared = await plan(fixture, "rebase");
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, prepared);
	assert.equal(result.outcome, "source-rebase-conflict");
	assert.equal(result.target.afterOid, target);
	assert.equal(git(fixture.main, "status", "--porcelain"), "");
	assert.match(git(fixture.source, "status", "--porcelain"), /^UU base\.txt$/m);
	assert.deepEqual(result.recovery?.conflictedPaths, ["base.txt"]);
	assert.equal(result.source.afterOid, git(fixture.source, "rev-parse", "feature"));
	assert.equal(result.source.afterOid, prepared.source.headOid);
	assert.equal(result.mutation.sourceRebased, false);
	assert.match(result.recovery?.instructions?.join("\n") ?? "", /git rebase --continue/);
	assert.match(result.recovery?.instructions?.join("\n") ?? "", /git rebase --abort/);
});

test("rebase-ff skips a previously completed rebase and strictly fast-forwards", async (t) => {
	const fixture = createFixture(t);
	diverge(fixture);
	const rebaseResult = await executeIntegrationPlan(fixture.exec, fixture.client, await plan(fixture, "rebase"));
	assert.equal(rebaseResult.outcome, "completed");
	const callsBeforeMerge = fixture.calls.length;
	const prepared = await plan(fixture, "merge", "rebase-ff");
	assert.equal(prepared.sourceRebaseRequired, false);
	assert.equal(prepared.commands.length, 1);
	assert.match(prepared.commands[0]!, /merge --ff-only/);
	assert.doesNotMatch(prepared.commands[0]!, / rebase --/);
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, prepared);
	assert.equal(result.outcome, "completed");
	assert.equal(result.target.afterOid, result.source.afterOid);
	const mergeCalls = fixture.calls.slice(callsBeforeMerge).filter((call) => call.command === "git" && call.args.includes("merge"));
	assert.ok(mergeCalls.some((call) => call.args.includes("--ff-only") && call.args.at(-1) === result.source.afterOid));
	assert.ok(mergeCalls.every((call) => !call.args.includes("--no-ff")));
	assert.equal(fixture.calls.slice(callsBeforeMerge).some((call) => call.args.includes("rebase")), false);
	assert.equal(git(fixture.main, "rev-list", "--parents", "-n", "1", "HEAD").split(/\s+/).length, 2, "fast-forward does not create a merge commit");
});

test("rebase-ff stops when an already-based source moves after stale-plan revalidation", async (t) => {
	const fixture = createFixture(t);
	commitFile(fixture.source, "source.txt", "source\n", "source change");
	const prepared = await plan(fixture, "merge", "rebase-ff");
	assert.equal(prepared.sourceRebaseRequired, false);
	const baseExec = fixture.exec;
	let ancestryChecks = 0;
	fixture.exec = async (command, args, options) => {
		const result = await baseExec(command, args, options);
		if (command === "git" && args[0] === "merge-base" && args[1] === "--is-ancestor" && ++ancestryChecks === 2) {
			commitFile(fixture.source, "unconfirmed.txt", "unconfirmed\n", "unconfirmed source advance");
		}
		return result;
	};
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, prepared);
	assert.equal(result.outcome, "source-rebased-target-unchanged");
	assert.match(result.verification.failures.join(" "), /source branch still has the confirmed OID/);
	assert.equal(mutationCalls(fixture, "merge").some((args) => args.includes("--ff-only")), false);
});

test("target movement after source rebase returns a partial result without target integration", async (t) => {
	const fixture = createFixture(t);
	diverge(fixture);
	const baseExec = fixture.exec;
	let moved = false;
	fixture.exec = async (command, args, options) => {
		const result = await baseExec(command, args, options);
		if (!moved && command === "git" && args.includes("rebase") && result.code === 0) {
			moved = true;
			commitFile(fixture.main, "external.txt", "external\n", "external movement");
		}
		return result;
	};
	const prepared = await plan(fixture, "merge", "rebase-ff");
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, prepared);
	assert.equal(result.outcome, "source-rebased-target-unchanged");
	assert.equal(result.mutation.sourceRebased, true);
	assert.equal(result.mutation.targetUpdated, false, "the integration operation did not update the externally moved target");
	assert.match(result.verification.failures.join(" "), /target (?:still has|remained at) the confirmed OID/);
	assert.equal(mutationCalls(fixture, "merge").some((args) => args.includes("--ff-only")), false);
});

test("strict fast-forward failure never falls back to a merge commit", async (t) => {
	const fixture = createFixture(t);
	diverge(fixture);
	const baseExec = fixture.exec;
	fixture.exec = async (command, args, options) => {
		if (command === "git" && args.includes("merge") && args.includes("--ff-only")) {
			fixture.calls.push({ command, args: [...args], options });
			return { code: 1, stdout: "", stderr: "simulated non-fast-forward" };
		}
		return baseExec(command, args, options);
	};
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, await plan(fixture, "merge", "rebase-ff"));
	assert.equal(result.outcome, "source-rebased-target-unchanged");
	assert.equal(result.mutation.sourceRebased, true);
	assert.equal(result.mutation.targetUpdated, false);
	assert.match(result.message, /No merge-commit fallback was attempted/);
	assert.equal(mutationCalls(fixture, "merge").some((args) => args.includes("--no-ff")), false);
});

test("killed target mutation returns a structured recovery result instead of success", async (t) => {
	const fixture = createFixture(t);
	diverge(fixture);
	const baseExec = fixture.exec;
	fixture.exec = async (command, args, options) => {
		const result = await baseExec(command, args, options);
		if (command === "git" && args.includes("merge") && args.includes("--ff-only")) return { ...result, code: 0, killed: true };
		return result;
	};
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, await plan(fixture, "merge", "rebase-ff"));
	assert.equal(result.outcome, "target-merge-recovery-required");
	assert.equal(result.verification.passed, true, "both checkout recovery states were inspected");
	assert.match(result.message, /stopped unexpectedly.*terminated/);
});

test("no-ff uses the confirmed source OID when the source ref moves before merge", async (t) => {
	const fixture = createFixture(t);
	const before = diverge(fixture);
	const prepared = await plan(fixture, "merge", "no-ff");
	const baseExec = fixture.exec;
	let advancedSource: string | undefined;
	fixture.exec = async (command, args, options) => {
		if (!advancedSource && command === "git" && args.includes("--no-ff")) {
			advancedSource = commitFile(fixture.source, "unconfirmed.txt", "unconfirmed\n", "unconfirmed source advance");
		}
		return baseExec(command, args, options);
	};
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, prepared);
	assert.equal(result.outcome, "target-merge-recovery-required", "post-merge source drift remains visible");
	const parents = git(fixture.main, "rev-list", "--parents", "-n", "1", "HEAD").split(/\s+/);
	assert.deepEqual(parents.slice(1), [before.target, before.source]);
	assert.notEqual(parents[2], advancedSource);
	const merge = mutationCalls(fixture, "merge").find((args) => args.includes("--no-ff"));
	assert.equal(merge?.at(-1), before.source);
});

test("no-ff creates and verifies an unsigned two-parent commit while hooks remain enabled", async (t) => {
	const fixture = createFixture(t);
	const before = diverge(fixture);
	git(fixture.main, "config", "commit.gpgSign", "true");
	git(fixture.main, "config", "user.signingkey", "invalid-test-key");
	const hookMarker = join(fixture.root, "merge-hook-ran");
	const hooks = git(fixture.main, "rev-parse", "--git-path", "hooks");
	const hook = join(isAbsolute(hooks) ? hooks : resolve(fixture.main, hooks), "pre-merge-commit");
	write(hook, `#!/bin/sh\nprintf ran > ${JSON.stringify(hookMarker)}\n`);
	chmodSync(hook, 0o755);
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, await plan(fixture, "merge", "no-ff"));
	assert.equal(result.outcome, "completed");
	const parents = git(fixture.main, "rev-list", "--parents", "-n", "1", "HEAD").split(/\s+/);
	assert.equal(parents.length, 3);
	assert.equal(parents[1], before.target);
	assert.equal(parents[2], before.source);
	assert.doesNotMatch(git(fixture.main, "cat-file", "-p", "HEAD"), /^gpgsig /m);
	assert.equal(git(fixture.main, "status", "--porcelain"), "");
	assert.equal(execFileSync("cat", [hookMarker], { encoding: "utf8" }), "ran");
	const merge = mutationCalls(fixture, "merge").find((args) => args.includes("--no-ff"));
	assert.ok(merge?.includes("--no-gpg-sign"));
	assert.ok(merge?.includes("--commit"));
	assert.equal(merge?.at(-1), before.source);
	assert.equal(merge?.includes("--no-verify"), false);
});

test("no-ff overrides branch mergeOptions=--no-commit and leaves no target merge state", async (t) => {
	const fixture = createFixture(t);
	diverge(fixture);
	git(fixture.main, "config", "branch.main.mergeOptions", "--no-commit");
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, await plan(fixture, "merge", "no-ff"));
	assert.equal(result.outcome, "completed");
	assert.equal(result.verification.passed, true);
	assert.equal(result.recovery?.mergeInProgress, undefined);
	assert.ok(mutationCalls(fixture, "merge").some((args) => args.includes("--no-ff") && args.includes("--commit")));
});

test("zero-exit incomplete no-ff merge is defensively aborted", async (t) => {
	const fixture = createFixture(t);
	diverge(fixture);
	const baseExec = fixture.exec;
	fixture.exec = async (command, args, options) => {
		if (command === "git" && args.includes("--no-ff")) {
			return baseExec(command, ["-c", "commit.gpgSign=false", "merge", "--no-ff", "--no-commit", args.at(-1)!], options);
		}
		return baseExec(command, args, options);
	};
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, await plan(fixture, "merge", "no-ff"));
	assert.equal(result.outcome, "target-merge-aborted");
	assert.equal(result.target.afterOid, result.target.beforeOid);
	assert.equal(git(fixture.main, "status", "--porcelain"), "");
	assert.match(result.recovery?.blocker ?? "", /without creating the requested merge commit/);
});

test("no-ff creates a merge commit even when the source is fast-forwardable", async (t) => {
	const fixture = createFixture(t);
	const source = commitFile(fixture.source, "source.txt", "source\n", "source change");
	const target = git(fixture.main, "rev-parse", "HEAD");
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, await plan(fixture, "merge", "no-ff"));
	assert.equal(result.outcome, "completed");
	const parents = git(fixture.main, "rev-list", "--parents", "-n", "1", "HEAD").split(/\s+/);
	assert.deepEqual(parents.slice(1), [target, source]);
});

test("no-ff conflict aborts and restores the protected target", async (t) => {
	const fixture = createFixture(t);
	commitFile(fixture.source, "base.txt", "source version\n", "source conflict");
	const target = commitFile(fixture.main, "base.txt", "target version\n", "target conflict");
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, await plan(fixture, "merge", "no-ff"));
	assert.equal(result.outcome, "target-merge-aborted");
	assert.equal(result.target.afterOid, target);
	assert.equal(git(fixture.main, "status", "--porcelain"), "");
	assert.equal(result.recovery?.mergeInProgress, false);
	assert.ok(mutationCalls(fixture, "merge").some((args) => args.includes("--abort")));
	assert.equal(fixture.calls.some((call) => call.args.includes("reset")), false);
});

test("failed no-ff abort is reported without reset or cleanup", async (t) => {
	const fixture = createFixture(t);
	commitFile(fixture.source, "base.txt", "source version\n", "source conflict");
	commitFile(fixture.main, "base.txt", "target version\n", "target conflict");
	const baseExec = fixture.exec;
	fixture.exec = async (command, args, options) => {
		if (command === "git" && args[0] === "merge" && args[1] === "--abort") {
			fixture.calls.push({ command, args: [...args], options });
			return { code: 1, stdout: "", stderr: "simulated abort failure" };
		}
		return baseExec(command, args, options);
	};
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, await plan(fixture, "merge", "no-ff"));
	assert.equal(result.outcome, "target-merge-recovery-required");
	assert.equal(result.recovery?.mergeInProgress, true);
	assert.match(result.recovery?.blocker ?? "", /simulated abort failure/);
	assert.match(git(fixture.main, "status", "--porcelain"), /^UU base\.txt$/m);
	assert.equal(fixture.calls.some((call) => call.args.includes("reset") || call.args.includes("clean")), false);
});

test("already integrated no-ff is a successful no-op", async (t) => {
	const fixture = createFixture(t);
	commitFile(fixture.source, "source.txt", "source\n", "source change");
	git(fixture.main, "merge", "--ff-only", "feature");
	const prepared = await plan(fixture, "merge", "no-ff");
	assert.equal(prepared.sourceAlreadyIntegrated, true);
	assert.deepEqual(prepared.commands, []);
	assert.match(formatIntegrationConfirmation(prepared), /commands:\n  \(none; the requested result is already present\)/);
	const beforeCalls = fixture.calls.length;
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, prepared);
	assert.equal(result.outcome, "completed");
	assert.equal(result.mutation.targetUpdated, false);
	assert.equal(fixture.calls.slice(beforeCalls).some((call) => call.args.includes("--no-ff")), false);
});

test("already-integrated no-ff stops when the source advances after stale-plan revalidation", async (t) => {
	const fixture = createFixture(t);
	commitFile(fixture.source, "source.txt", "source\n", "source change");
	git(fixture.main, "merge", "--ff-only", "feature");
	const prepared = await plan(fixture, "merge", "no-ff");
	assert.equal(prepared.sourceAlreadyIntegrated, true);
	const baseExec = fixture.exec;
	let ancestryChecks = 0;
	fixture.exec = async (command, args, options) => {
		const result = await baseExec(command, args, options);
		if (command === "git" && args[0] === "merge-base" && args[1] === "--is-ancestor" && ++ancestryChecks === 2) {
			commitFile(fixture.source, "unconfirmed.txt", "unconfirmed\n", "unconfirmed source advance");
		}
		return result;
	};
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, prepared);
	assert.equal(result.outcome, "no-mutation");
	assert.match(result.message, /became stale/);
	assert.match(result.verification.failures.join(" "), /source branch still has the confirmed OID/);
	assert.equal(mutationCalls(fixture, "merge").some((args) => args.includes("--no-ff")), false);
	assert.equal(git(fixture.main, "branch", "--contains", "feature", "--format=%(refname:short)").split("\n").includes("main"), false);
});

test("killed already-integrated no-ff inspection preserves an external merge", async (t) => {
	const fixture = createFixture(t);
	const base = git(fixture.main, "rev-parse", "HEAD");
	git(fixture.source, "switch", "-c", "external", base);
	const externalOid = commitFile(fixture.source, "base.txt", "external version\n", "external conflict");
	git(fixture.source, "switch", "feature");
	commitFile(fixture.source, "source.txt", "source\n", "source change");
	git(fixture.main, "merge", "--ff-only", "feature");
	commitFile(fixture.main, "base.txt", "target version\n", "target conflict");
	const prepared = await plan(fixture, "merge", "no-ff");
	assert.equal(prepared.sourceAlreadyIntegrated, true);
	const baseExec = fixture.exec;
	let ancestryChecks = 0;
	let killInspection = false;
	fixture.exec = async (command, args, options) => {
		if (killInspection && command === "git" && args[0] === "status") {
			killInspection = false;
			fixture.calls.push({ command, args: [...args], options });
			return { code: 0, stdout: "", stderr: "", killed: true };
		}
		const result = await baseExec(command, args, options);
		if (command === "git" && args[0] === "merge-base" && args[1] === "--is-ancestor" && ++ancestryChecks === 2) {
			assert.throws(() => git(fixture.main, "merge", "--no-ff", "--no-commit", "external"));
			killInspection = true;
		}
		return result;
	};
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, prepared);
	assert.equal(result.outcome, "target-merge-recovery-required");
	assert.equal(result.recovery?.mergeInProgress, true);
	assert.equal(git(fixture.main, "rev-parse", "MERGE_HEAD"), externalOid);
	assert.match(git(fixture.main, "status", "--porcelain"), /^UU base\.txt$/m);
	assert.equal(mutationCalls(fixture, "merge").some((args) => args.includes("--abort")), false);
});

test("failed no-ff attempt preserves merge state that does not match its confirmed source", async (t) => {
	const fixture = createFixture(t);
	const base = git(fixture.main, "rev-parse", "HEAD");
	git(fixture.source, "switch", "-c", "external", base);
	const externalOid = commitFile(fixture.source, "external.txt", "external\n", "external change");
	git(fixture.source, "switch", "feature");
	commitFile(fixture.source, "source.txt", "source\n", "source change");
	commitFile(fixture.main, "target.txt", "target\n", "target change");
	const prepared = await plan(fixture, "merge", "no-ff");
	const baseExec = fixture.exec;
	fixture.exec = async (command, args, options) => {
		if (command === "git" && args[0] === "-c" && args.includes("--no-ff")) {
			fixture.calls.push({ command, args: [...args], options });
			git(fixture.main, "merge", "--no-ff", "--no-commit", "external");
			return { code: 1, stdout: "", stderr: "simulated planned merge failure" };
		}
		return baseExec(command, args, options);
	};
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, prepared);
	assert.equal(result.outcome, "target-merge-recovery-required");
	assert.equal(result.recovery?.mergeInProgress, true);
	assert.equal(git(fixture.main, "rev-parse", "MERGE_HEAD"), externalOid);
	assert.match(git(fixture.main, "status", "--porcelain"), /^A  external\.txt$/m);
	assert.equal(mutationCalls(fixture, "merge").some((args) => args.includes("--abort")), false);
});

test("stale OIDs fail closed before mutation", async (t) => {
	const fixture = createFixture(t);
	diverge(fixture);
	const prepared = await plan(fixture, "rebase");
	commitFile(fixture.source, "later.txt", "later\n", "later source movement");
	const callsBefore = fixture.calls.length;
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, prepared);
	assert.equal(result.outcome, "no-mutation");
	assert.match(result.message, /stale/);
	assert.equal(fixture.calls.slice(callsBefore).some((call) => call.args.includes("rebase")), false);
});

test("same-repository integration calls fail immediately instead of queueing", async (t) => {
	const fixture = createFixture(t);
	diverge(fixture);
	const prepared = await plan(fixture, "rebase");
	const baseExec = fixture.exec;
	let release!: () => void;
	const blocked = new Promise<void>((resolveBlocked) => {
		release = resolveBlocked;
	});
	let mutationStarted!: () => void;
	const started = new Promise<void>((resolveStarted) => {
		mutationStarted = resolveStarted;
	});
	let held = false;
	fixture.exec = async (command, args, options) => {
		if (!held && command === "git" && args.includes("rebase")) {
			held = true;
			mutationStarted();
			await blocked;
		}
		return baseExec(command, args, options);
	};
	const first = executeIntegrationPlan(fixture.exec, fixture.client, prepared);
	await started;
	const second = await executeIntegrationPlan(fixture.exec, fixture.client, prepared);
	assert.equal(second.outcome, "no-mutation");
	assert.match(second.message, /already in progress/);
	release();
	assert.equal((await first).outcome, "completed");
});

test("all Git subprocesses receive the caller AbortSignal and a timeout", async (t) => {
	const fixture = createFixture(t);
	diverge(fixture);
	const controller = new AbortController();
	const prepared = await plan(fixture, "rebase", undefined, controller.signal);
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, prepared, controller.signal);
	assert.equal(result.outcome, "completed");
	assert.ok(fixture.calls.length > 0);
	for (const call of fixture.calls) {
		assert.equal(call.options?.signal, controller.signal, `${call.command} ${call.args.join(" ")}`);
		assert.ok((call.options?.timeout ?? 0) > 0, `${call.command} ${call.args.join(" ")}`);
	}
});

test("cancellation after a conflicted source rebase inspects and preserves source recovery state", async (t) => {
	const fixture = createFixture(t);
	commitFile(fixture.source, "base.txt", "source version\n", "source conflict");
	const target = commitFile(fixture.main, "base.txt", "target version\n", "target conflict");
	const controller = new AbortController();
	const prepared = await plan(fixture, "rebase", undefined, controller.signal);
	const baseExec = fixture.exec;
	fixture.exec = async (command, args, options) => {
		const result = await baseExec(command, args, options);
		if (command === "git" && args.includes("rebase")) {
			controller.abort();
			throw new DOMException("cancelled after Git stopped", "AbortError");
		}
		return result;
	};
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, prepared, controller.signal);
	assert.equal(result.cancelled, true);
	assert.equal(result.outcome, "source-rebase-conflict");
	assert.equal(result.target.afterOid, target);
	assert.equal(result.recovery?.rebaseInProgress, true);
	assert.match(result.recovery?.instructions?.join("\n") ?? "", /git rebase --abort/);
	assert.match(git(fixture.source, "status", "--porcelain"), /^UU base\.txt$/m);
	assert.equal(git(fixture.main, "status", "--porcelain"), "");
});

test("cancellation during a conflicted no-ff merge safely aborts the protected target", async (t) => {
	const fixture = createFixture(t);
	commitFile(fixture.source, "base.txt", "source version\n", "source conflict");
	const target = commitFile(fixture.main, "base.txt", "target version\n", "target conflict");
	const controller = new AbortController();
	const prepared = await plan(fixture, "merge", "no-ff", controller.signal);
	const baseExec = fixture.exec;
	fixture.exec = async (command, args, options) => {
		const result = await baseExec(command, args, options);
		if (command === "git" && args.includes("--no-ff")) {
			controller.abort();
			throw new DOMException("cancelled after Git stopped", "AbortError");
		}
		return result;
	};
	const result = await executeIntegrationPlan(fixture.exec, fixture.client, prepared, controller.signal);
	assert.equal(result.cancelled, true);
	assert.equal(result.outcome, "target-merge-aborted");
	assert.equal(result.target.afterOid, target);
	assert.equal(result.recovery?.mergeInProgress, false);
	assert.equal(git(fixture.main, "status", "--porcelain"), "");
	assert.equal(fixture.calls.some((call) => call.args.includes("reset")), false);
});
