import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { runLazyWorktreeCommand } from "../runner.ts";

test("lazyworktree runner captures complete stdout from a short-lived process and honors cwd", async (t) => {
	const cwd = mkdtempSync(join(tmpdir(), "pi-lw-runner-"));
	t.after(() => rmSync(cwd, { recursive: true, force: true }));
	const expected = JSON.stringify({ cwd, data: "x".repeat(300_000) });
	const result = await runLazyWorktreeCommand(process.execPath, ["-e", 'process.stdout.write(JSON.stringify({ cwd: process.cwd(), data: "x".repeat(300000) }))'], { cwd });
	assert.equal(result.code, 0);
	assert.equal(result.stdout, expected);
	assert.equal(result.stderr, "");
});

test("lazyworktree runner aborts long-running processes via AbortSignal", async () => {
	const controller = new AbortController();
	const promise = runLazyWorktreeCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { signal: controller.signal });
	setTimeout(() => controller.abort(), 50).unref?.();
	await assert.rejects(
		promise,
		(error: Error) => {
			assert.equal(error.name, "AbortError");
			return true;
		},
	);
});

test("lazyworktree runner times out and enforces a bounded output limit", async () => {
	await assert.rejects(
		runLazyWorktreeCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { timeout: 50 }),
		/timed out after 50ms/,
	);
	await assert.rejects(
		runLazyWorktreeCommand(process.execPath, ["-e", 'process.stdout.write("x".repeat(4096))'], { maxOutputBytes: 1024 }),
		/output exceeded 1024 bytes/,
	);
});
