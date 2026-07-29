import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	buildWorkspaceLaunch,
	classifyWorkspace,
	directGitWorktreeLifecycleIssue,
	mainCheckoutCommandIssue,
	mainCheckoutPathIssue,
	nonTmuxLaunchHelp,
	prepareWorkspaceInput,
	resolveTmuxSessionTarget,
	shellCommandCwd,
} from "../core.ts";
import type { LazyWorktreeSummary } from "../client.ts";

function worktree(input: Partial<LazyWorktreeSummary> = {}): LazyWorktreeSummary {
	return {
		path: "/repo",
		name: "repo",
		branch: "main",
		repo: "repo-1",
		is_main: true,
		dirty: false,
		ahead: 0,
		behind: 0,
		...input,
	};
}

test("classifies exact and nested cwd paths and follows symlinks safely", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-lw-core-"));
	try {
		const repo = join(root, "repo");
		const nested = join(repo, "src", "feature");
		mkdirSync(nested, { recursive: true });
		const alias = join(root, "repo-link");
		symlinkSync(repo, alias);
		const throughSymlink = join(alias, "src");

		const exact = classifyWorkspace(repo, worktree({ path: repo }));
		assert.equal(exact.kind, "main");
		assert.equal(exact.relation, "exact");

		const descendant = classifyWorkspace(throughSymlink, worktree({ path: repo }));
		assert.equal(descendant.kind, "main");
		assert.equal(descendant.relation, "descendant");
		assert.equal(descendant.worktreePath, repo);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("marks all main-checkout shell mutations for explicit confirmation except exact read-only lazyworktree inspection", () => {
	const classification = classifyWorkspace("/repo", worktree({ path: "/repo" }));
	assert.match(mainCheckoutCommandIssue(classification, "npm test") ?? "", /explicit user confirmation/);
	assert.match(mainCheckoutCommandIssue(classification, "git status --short") ?? "", /explicit user confirmation/);
	assert.equal(mainCheckoutCommandIssue(classification, "lazyworktree worktrees list --json --no-agent"), undefined);
	assert.equal(mainCheckoutCommandIssue(classification, "lazyworktree worktrees get --json --no-agent repo"), undefined);
	assert.equal(mainCheckoutCommandIssue(classification, "lazyworktree worktrees resolve --json --cwd /repo --no-agent"), undefined);
	assert.equal(mainCheckoutCommandIssue(classification, "lazyworktree worktrees context --json /repo"), undefined);
	assert.equal(mainCheckoutCommandIssue(classification, "lazyworktree worktrees context --json --include notes /repo"), undefined);
	assert.equal(mainCheckoutCommandIssue(classification, "lazyworktree worktrees context --json --include=notes /repo"), undefined);
	assert.match(mainCheckoutCommandIssue(classification, "lazyworktree worktrees context --json --include agents /repo") ?? "", /explicit user confirmation/);
	assert.match(mainCheckoutCommandIssue(classification, "lazyworktree worktrees context --json --include notes,agents /repo") ?? "", /explicit user confirmation/);
	assert.match(mainCheckoutCommandIssue(classification, "lazyworktree worktrees list --json --debug-log /tmp/log") ?? "", /explicit user confirmation/);
	assert.match(mainCheckoutCommandIssue(classification, "lazyworktree worktrees list --json $(touch /tmp/pwned)") ?? "", /explicit user confirmation/);
	assert.match(mainCheckoutCommandIssue(classification, "lazyworktree worktrees list --json\necho nope") ?? "", /explicit user confirmation/);
	assert.match(mainCheckoutPathIssue(classification, "src/index.ts", "/repo") ?? "", /explicit user confirmation/);
	assert.equal(mainCheckoutPathIssue(classification, "../outside.txt", "/repo"), undefined);
});

test("uses a safe leading cd as the shell command cwd", () => {
	const main = "/repo/main";
	const managed = "/worktrees/managed session";
	assert.equal(
		shellCommandCwd(`cd '${managed}' && base=$(git merge-base main HEAD) && printf '%s\\n' "$base"`, main),
		managed,
	);
	assert.equal(shellCommandCwd("cd -- ../managed && npm test", main), "/repo/managed");

	assert.equal(shellCommandCwd("cd ../managed; touch changed", main), main);
	assert.equal(shellCommandCwd('cd "$TARGET" && touch changed', main), main);
	assert.equal(shellCommandCwd("cd ../managed && cd /repo/main && touch changed", main), main);
});

test("always blocks direct git worktree lifecycle bypasses", () => {
	assert.match(directGitWorktreeLifecycleIssue("git worktree add ../new feature") ?? "", /bypasses LazyWorktree/);
	assert.match(directGitWorktreeLifecycleIssue("git --paginate worktree add ../new feature") ?? "", /bypasses LazyWorktree/);
	assert.match(directGitWorktreeLifecycleIssue("bash -c 'git worktree remove ../old'") ?? "", /bypasses LazyWorktree/);
	assert.match(directGitWorktreeLifecycleIssue("sh -c 'git --paginate worktree remove ../old'") ?? "", /bypasses LazyWorktree/);
	assert.match(directGitWorktreeLifecycleIssue("env GIT_PAGER=cat git worktree lock ../old") ?? "", /bypasses LazyWorktree/);
	assert.equal(directGitWorktreeLifecycleIssue("echo 'git worktree add ../new feature'"), undefined);
	assert.match(mainCheckoutCommandIssue(classifyWorkspace("/repo", worktree({ path: "/repo" })), "git worktree remove ../old") ?? "", /bypasses LazyWorktree/);
});

test("prepares validated workspace metadata and keeps launch argv separated", () => {
	const prepared = prepareWorkspaceInput({
		branch: "feat/short-description",
		baseBranch: "origin/main",
		description: "Add the requested behavior",
		note: "# Work Setup\n\n## Next step\nImplement it.",
		workId: "NO-ISSUE",
	});
	assert.equal(prepared.worktreeName, "feat-short-description");
	assert.equal(prepared.tmuxSession, "main");
	assert.match(prepared.launchPrompt, /Do not redo completed setup/);
	assert.match(prepared.launchPrompt, /worktrees context --json --include notes/);

	const originCwd = "/tmp/origin cwd";
	const launched = buildWorkspaceLaunch({
		worktreePath: "/tmp/worktree with spaces",
		windowName: prepared.windowName,
		sessionName: prepared.tmuxSession,
		prompt: prepared.launchPrompt,
		piArgvOriginCwd: originCwd,
		piArgv: ["/opt/node runtime/bin/node", "dist/cli.js", "-e", "extensions/pi ext.ts", "--session-dir", "sessions dir", "--model", "openai/gpt-5"],
	});
	assert.deepEqual(launched.args.slice(0, 8), [
		"new-window",
		"-a",
		"-P",
		"-F",
		"#{window_id}\t#{window_name}",
		"-t",
		"main:",
		"-n",
	]);
	assert.equal(launched.args[launched.args.indexOf("-c") + 1], "/tmp/worktree with spaces");
	assert.ok(launched.args.includes("/opt/node runtime/bin/node"));
	assert.ok(launched.args.includes("/tmp/origin cwd/dist/cli.js"));
	assert.ok(launched.args.includes("-e"));
	assert.ok(launched.args.includes("/tmp/origin cwd/extensions/pi ext.ts"));
	assert.ok(launched.args.includes("--session-dir"));
	assert.ok(launched.args.includes("/tmp/origin cwd/sessions dir"));
	assert.ok(launched.args.includes("--model"));
	assert.ok(launched.args.includes("openai/gpt-5"));
	assert.equal(launched.args.includes("attacker"), false);
	const help = nonTmuxLaunchHelp(
		"/tmp/worktree with spaces",
		prepared.windowName,
		prepared.launchPrompt,
		["/opt/node runtime/bin/node", "dist/cli.js", "-e", "extensions/pi ext.ts"],
		originCwd,
	);
	assert.match(help, /'\/opt\/node runtime\/bin\/node' '\/tmp\/origin cwd\/dist\/cli\.js' '-e' '\/tmp\/origin cwd\/extensions\/pi ext\.ts'/);
});

test("accepts an ungrouped main session or a linked session group target", () => {
	assert.equal(resolveTmuxSessionTarget("main", "main\t"), "main");
	assert.equal(resolveTmuxSessionTarget("main", "main-2\tmain"), "main-2");
	assert.throws(() => resolveTmuxSessionTarget("main", "other\tother-group"), /exact ungrouped session main or a member of group main/);
});
