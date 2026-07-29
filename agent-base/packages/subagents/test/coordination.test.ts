import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { COORDINATION_API_CHANNEL, requestCoordinationApi } from "../src/coordination.ts";

function fakePi(handler?: (data: unknown) => void): ExtensionAPI {
	return {
		events: {
			emit(channel: string, data: unknown) {
				if (channel === COORDINATION_API_CHANNEL) handler?.(data);
			},
			on: vi.fn(),
		},
	} as unknown as ExtensionAPI;
}

describe("coordination API discovery", () => {
	it("accepts the versioned agent-base API without receiving credentials", () => {
		const api = {
			version: 1 as const,
			sendToHarnessSession: vi.fn(),
			watch: vi.fn(),
			cancel: vi.fn(),
		};
		const pi = fakePi((data) => {
			const request = data as { version: number; accept(value: unknown): void };
			expect(request.version).toBe(1);
			request.accept(api);
		});
		expect(requestCoordinationApi(pi)).toBe(api);
	});

	it("rejects when agent-base is absent or incompatible", () => {
		expect(() => requestCoordinationApi(fakePi())).toThrow(/restart Pi/i);
		expect(() => requestCoordinationApi(fakePi((data) => {
			(data as { accept(value: unknown): void }).accept({ version: 2 });
		}))).toThrow(/restart Pi/i);
	});
});
