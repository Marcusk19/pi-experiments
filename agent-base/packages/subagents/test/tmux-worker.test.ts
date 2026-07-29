import { describe, expect, it, vi } from "vitest";
import { closeTmuxPane, currentTmuxPane, launchTmuxWorker, shellQuote, type RunProcess, type TmuxWorkerRequest } from "../src/tmux-worker.ts";

const request: TmuxWorkerRequest = {
	targetPane: "%7",
	cwd: "/tmp/repo with spaces",
	sessionId: "123e4567-e89b-42d3-a456-426614174000",
	name: "subagent: reviewer",
	systemPrompt: "Review 'carefully'",
	model: "openai/gpt-5.1-codex",
	tools: ["read", "grep"],
	xdgRuntimeDir: "/tmp/private-runtime",
};

describe("tmux worker launcher", () => {
	it("creates the first worker as the bottom half of the caller pane", async () => {
		const run = vi.fn()
			.mockResolvedValueOnce({ stdout: "%7\t\t120\n", stderr: "", code: 0 })
			.mockResolvedValueOnce({ stdout: "%42\n", stderr: "", code: 0 })
			.mockResolvedValueOnce({ stdout: "", stderr: "", code: 0 });
		const result = await launchTmuxWorker(request, undefined, run);

		expect(result).toEqual({ paneId: "%42", sessionId: request.sessionId });
		expect(run).toHaveBeenCalledTimes(3);
		expect(run.mock.calls[0]?.[1]).toEqual([
			"list-panes", "-t", "%7", "-F", "#{pane_id}\t#{@mkok_subagent_parent}\t#{pane_width}",
		]);
		const splitArgs = run.mock.calls[1]?.[1] as string[];
		expect(splitArgs).toEqual(expect.arrayContaining([
			"split-window", "-d", "-P", "-F", "#{pane_id}", "-v", "-l", "50%", "-t", "%7", "-c", request.cwd,
		]));
		expect(run.mock.calls[2]?.[1]).toEqual([
			"set-option", "-p", "-t", "%42", "@mkok_subagent_parent", "%7",
		]);
		const childCommand = splitArgs.at(-1) as string;
		expect(childCommand).toContain("'XDG_RUNTIME_DIR=/tmp/private-runtime'");
		expect(childCommand).toContain("'--session-id' '123e4567-e89b-42d3-a456-426614174000'");
		expect(childCommand).toContain("'--name' 'subagent: reviewer'");
		expect(childCommand).toContain("'--tools' 'read,grep'");
		expect(childCommand).not.toContain("--no-session");
		expect(childCommand).not.toContain("Task:");
	});

	it("splits the widest existing worker side by side without targeting unrelated panes", async () => {
		const run = vi.fn()
			.mockResolvedValueOnce({
				stdout: "%7\t\t120\n%20\t%7\t40\n%21\t%7\t79\n%30\t%99\t120\n",
				stderr: "",
				code: 0,
			})
			.mockResolvedValueOnce({ stdout: "%43\n", stderr: "", code: 0 })
			.mockResolvedValueOnce({ stdout: "", stderr: "", code: 0 });

		await launchTmuxWorker(request, undefined, run);

		const splitArgs = run.mock.calls[1]?.[1] as string[];
		expect(splitArgs).toContain("-h");
		expect(splitArgs).not.toContain("-v");
		expect(splitArgs.slice(splitArgs.indexOf("-t"), splitArgs.indexOf("-t") + 2)).toEqual(["-t", "%21"]);
	});

	it("serializes parallel launches so only the first splits the parent", async () => {
		let tagged = false;
		let nextPane = 42;
		const splitTargets: string[][] = [];
		const run: RunProcess = vi.fn(async (_command, args) => {
			switch (args[0]) {
				case "list-panes":
					return { stdout: tagged ? "%7\t\t120\n%42\t%7\t120\n" : "%7\t\t120\n", stderr: "", code: 0 };
				case "split-window":
					splitTargets.push(args);
					return { stdout: `%${nextPane++}\n`, stderr: "", code: 0 };
				case "set-option":
					tagged = true;
					return { stdout: "", stderr: "", code: 0 };
				default:
					throw new Error(`unexpected tmux command: ${args[0]}`);
			}
		});

		await Promise.all([
			launchTmuxWorker(request, undefined, run),
			launchTmuxWorker({ ...request, sessionId: "223e4567-e89b-42d3-a456-426614174000" }, undefined, run),
		]);

		expect(splitTargets).toHaveLength(2);
		expect(splitTargets[0]).toContain("-v");
		expect(splitTargets[0]).toContain("%7");
		expect(splitTargets[1]).toContain("-h");
		expect(splitTargets[1]).toContain("%42");
	});

	it("recreates the bottom worker region when no tagged worker pane remains", async () => {
		const run = vi.fn()
			.mockResolvedValueOnce({ stdout: "%7\t\t120\n%30\t%99\t60\n", stderr: "", code: 0 })
			.mockResolvedValueOnce({ stdout: "%44\n", stderr: "", code: 0 })
			.mockResolvedValueOnce({ stdout: "", stderr: "", code: 0 });

		await launchTmuxWorker(request, undefined, run);

		const splitArgs = run.mock.calls[1]?.[1] as string[];
		expect(splitArgs).toContain("-v");
		expect(splitArgs.slice(splitArgs.indexOf("-t"), splitArgs.indexOf("-t") + 2)).toEqual(["-t", "%7"]);
	});

	it("kills a created pane when tagging its worker region rejects", async () => {
		const run = vi.fn()
			.mockResolvedValueOnce({ stdout: "%7\t\t120\n", stderr: "", code: 0 })
			.mockResolvedValueOnce({ stdout: "%45\n", stderr: "", code: 0 })
			.mockRejectedValueOnce(new Error("tmux client aborted"))
			.mockResolvedValueOnce({ stdout: "", stderr: "", code: 0 });

		await expect(launchTmuxWorker(request, undefined, run)).rejects.toThrow("tmux client aborted");
		expect(run.mock.calls[3]?.[1]).toEqual(["kill-pane", "-t", "%45"]);
	});

	it("inspects tagged panes before closing them through the parent layout path", async () => {
		const commands: string[] = [];
		const run: RunProcess = vi.fn(async (_command, args) => {
			commands.push(args[0] ?? "");
			if (args[0] === "display-message") return { stdout: "%7\n", stderr: "", code: 0 };
			return { stdout: "", stderr: "", code: 0 };
		});

		await closeTmuxPane("%42", run);

		expect(commands).toEqual(["display-message", "kill-pane"]);
	});

	it("quotes shell arguments and requires an identified tmux pane", () => {
		expect(shellQuote("a'b")).toBe("'a'\"'\"'b'");
		expect(currentTmuxPane({ TMUX: "/tmp/tmux", TMUX_PANE: "%12" })).toBe("%12");
		expect(() => currentTmuxPane({})).toThrow(/inside tmux/i);
	});

	it("returns bounded tmux launch errors", async () => {
		const run = vi.fn()
			.mockResolvedValueOnce({ stdout: "%1\t\t120\n", stderr: "", code: 0 })
			.mockResolvedValueOnce({ stdout: "", stderr: `bad pane\n${"secret".repeat(200)}`, code: 1 });
		await expect(launchTmuxWorker({ ...request, targetPane: "%1" }, undefined, run)).rejects.toThrow("bad pane");
	});
});
