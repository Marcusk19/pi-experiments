import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverAgents } from "../src/agents.ts";

const agent = (name: string, description: string, model?: string) =>
	`---\nname: ${name}\ndescription: ${description}${model ? `\nmodel: ${model}` : ""}\n---\nPrompt`;

describe("bundled agent discovery", () => {
	it("loads defaults without user agent files", () => {
		const root = mkdtempSync(join(tmpdir(), "agent-base-agents-"));
		const bundled = join(root, "bundled");
		const user = join(root, "user");
		mkdirSync(bundled);
		mkdirSync(user);
		writeFileSync(join(bundled, "worker.md"), agent("worker", "bundled"));

		const result = discoverAgents(root, "user", {
			bundledAgentsDir: bundled,
			userAgentsDir: user,
		});

		expect(result.agents).toMatchObject([
			{ name: "worker", source: "bundled", model: "openai/gpt-5-mini" },
		]);
	});

	it("uses the environment override when an agent has no explicit model", () => {
		const root = mkdtempSync(join(tmpdir(), "agent-base-agents-"));
		const bundled = join(root, "bundled");
		mkdirSync(bundled);
		writeFileSync(join(bundled, "worker.md"), agent("worker", "bundled"));
		const previous = process.env.PI_SUBAGENT_MODEL;
		process.env.PI_SUBAGENT_MODEL = "google/gemini-2.5-flash-lite";
		try {
			const result = discoverAgents(root, "user", { bundledAgentsDir: bundled, userAgentsDir: join(root, "user") });
			expect(result.agents[0]?.model).toBe("google/gemini-2.5-flash-lite");
		} finally {
			if (previous === undefined) delete process.env.PI_SUBAGENT_MODEL;
			else process.env.PI_SUBAGENT_MODEL = previous;
		}
	});

	it("prefers an explicit agent model over the environment override", () => {
		const root = mkdtempSync(join(tmpdir(), "agent-base-agents-"));
		const bundled = join(root, "bundled");
		mkdirSync(bundled);
		writeFileSync(join(bundled, "worker.md"), agent("worker", "bundled", "openai/gpt-5.4"));
		const previous = process.env.PI_SUBAGENT_MODEL;
		process.env.PI_SUBAGENT_MODEL = "google/gemini-2.5-flash-lite";
		try {
			const result = discoverAgents(root, "user", { bundledAgentsDir: bundled, userAgentsDir: join(root, "user") });
			expect(result.agents[0]?.model).toBe("openai/gpt-5.4");
		} finally {
			if (previous === undefined) delete process.env.PI_SUBAGENT_MODEL;
			else process.env.PI_SUBAGENT_MODEL = previous;
		}
	});

	it("lets a user definition replace a bundled definition", () => {
		const root = mkdtempSync(join(tmpdir(), "agent-base-agents-"));
		const bundled = join(root, "bundled");
		const user = join(root, "user");
		mkdirSync(bundled);
		mkdirSync(user);
		writeFileSync(join(bundled, "worker.md"), agent("worker", "bundled"));
		writeFileSync(join(user, "worker.md"), agent("worker", "user"));

		const result = discoverAgents(root, "user", {
			bundledAgentsDir: bundled,
			userAgentsDir: user,
		});

		expect(result.agents).toMatchObject([{ name: "worker", source: "user" }]);
	});

	it("lets a trusted project definition replace user and bundled definitions", () => {
		const root = mkdtempSync(join(tmpdir(), "agent-base-agents-"));
		const bundled = join(root, "bundled");
		const user = join(root, "user");
		const project = join(root, ".pi", "agents");
		mkdirSync(bundled);
		mkdirSync(user);
		mkdirSync(project, { recursive: true });
		writeFileSync(join(bundled, "worker.md"), agent("worker", "bundled"));
		writeFileSync(join(user, "worker.md"), agent("worker", "user"));
		writeFileSync(join(project, "worker.md"), agent("worker", "project"));

		const result = discoverAgents(root, "both", {
			bundledAgentsDir: bundled,
			userAgentsDir: user,
		});

		expect(result.agents).toMatchObject([{ name: "worker", source: "project" }]);
	});
});
