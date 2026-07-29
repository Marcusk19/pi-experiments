import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, isAbsolute, join, resolve } from "node:path";

const piCodingAgentEntry = fileURLToPath(await import.meta.resolve("@earendil-works/pi-coding-agent"));
const { parseArgs } = await import(pathToFileURL(join(dirname(piCodingAgentEntry), "cli", "args.js")).href);

const SAFE_PI_RUNTIME_FLAGS = new Set([
	"--verbose",
	"--approve",
	"-a",
	"--no-approve",
	"-na",
	"--offline",
	"--no-tools",
	"-nt",
	"--no-builtin-tools",
	"-nbt",
	"--no-extensions",
	"-ne",
	"--no-skills",
	"-ns",
	"--no-prompt-templates",
	"-np",
	"--no-themes",
	"--no-context-files",
	"-nc",
]);

const SAFE_PI_RUNTIME_OPTIONS = new Set([
	"--provider",
	"--model",
	"--models",
	"--thinking",
	"--tools",
	"-t",
	"--exclude-tools",
	"-xt",
	"--extension",
	"-e",
	"--skill",
	"--prompt-template",
	"--theme",
	"--session-dir",
]);

const ALWAYS_PATH_VALUE_OPTIONS = new Set([
	"--skill",
	"--prompt-template",
	"--theme",
	"--session-dir",
]);

const SKIPPED_PI_REQUIRED_VALUE_OPTIONS = new Set([
	"--api-key",
	"--system-prompt",
	"--append-system-prompt",
	"--mode",
	"--session",
	"--session-id",
	"--fork",
	"--name",
	"-n",
	"--export",
]);

const SKIPPED_PI_OPTIONAL_VALUE_OPTIONS = new Set([
	"--print",
	"-p",
	"--list-models",
]);

const SKIPPED_PI_FLAGS = new Set([
	"--continue",
	"-c",
	"--resume",
	"-r",
	"--no-session",
	"--help",
	"-h",
	"--version",
	"-v",
]);

function optionName(argument: string): string {
	const equals = argument.indexOf("=");
	return equals === -1 ? argument : argument.slice(0, equals);
}

function isLikelyEntrypoint(argument: string | undefined): boolean {
	return typeof argument === "string" && /(?:^|\/)[^/]+\.(?:[cm]?js|ts)$/.test(argument);
}

function isOptionalValueToken(argument: string | undefined): boolean {
	return argument !== undefined && !argument.startsWith("@") && (!argument.startsWith("-") || argument.startsWith("---"));
}

function resolvePathValue(value: string, originCwd: string): string {
	return isAbsolute(value) ? value : resolve(originCwd, value);
}

function looksLikeExtensionPathSource(value: string, originCwd: string): boolean {
	if (isAbsolute(value)) return true;
	if (/^(?:npm:|git:|https?:\/\/|ssh:\/\/|git@)/i.test(value)) return false;
	if (value === "." || value === ".." || value.startsWith("./") || value.startsWith("../")) return true;
	if (value.includes("/") || value.includes("\\")) return true;
	return existsSync(resolve(originCwd, value));
}

function resolveForwardedValue(option: string, value: string, originCwd: string): string {
	if (ALWAYS_PATH_VALUE_OPTIONS.has(option)) return resolvePathValue(value, originCwd);
	if ((option === "--extension" || option === "-e") && looksLikeExtensionPathSource(value, originCwd)) {
		return resolvePathValue(value, originCwd);
	}
	return value;
}

function formatUnknownFlag(name: string, value: boolean | string): string {
	return value === true ? `--${name}` : `--${name}=${value}`;
}

function replayError(problemLines: readonly string[]): Error {
	return new Error([
		"Cannot safely replay current Pi startup options for a new session.",
		...problemLines.map((line) => `- ${line}`),
		"Relaunch Pi without unsupported flags, or replace them with supported resource flags like --extension, --skill, --prompt-template, or --theme before retrying the launch.",
	].join("\n"));
}

function validateReplayablePiArgs(arguments_: readonly string[]): void {
	const parsed = parseArgs([...arguments_]);
	const problems = [
		...parsed.diagnostics.map((diagnostic) => `${diagnostic.type}: ${diagnostic.message}`),
	];
	if (parsed.unknownFlags.size > 0) {
		problems.push(`unsupported flags: ${[...parsed.unknownFlags.entries()].map(([name, value]) => formatUnknownFlag(name, value)).join(", ")}`);
	}
	if (problems.length > 0) throw replayError(problems);
}

function requireValue(option: string, arguments_: readonly string[], index: number): string {
	const value = arguments_[index + 1];
	if (value === undefined) throw replayError([`${option} requires a value`]);
	return value;
}

export function resolveForwardedPiRuntimeArgv(piArgv: readonly string[], originCwd = process.cwd()): string[] {
	if (piArgv.length === 0) return [];
	const resolved = [...piArgv];
	const optionStart = isLikelyEntrypoint(resolved[1]) ? 2 : 1;
	if (optionStart === 2) resolved[1] = resolvePathValue(resolved[1]!, originCwd);
	for (let index = optionStart; index < resolved.length; index++) {
		const argument = resolved[index]!;
		if (argument === "--") break;
		const name = optionName(argument);
		if (SAFE_PI_RUNTIME_FLAGS.has(argument) || SKIPPED_PI_FLAGS.has(argument)) continue;
		if (SAFE_PI_RUNTIME_OPTIONS.has(name)) {
			const value = resolved[index + 1];
			if (value === undefined) throw replayError([`${name} requires a value`]);
			resolved[index + 1] = resolveForwardedValue(name, value, originCwd);
			index++;
			continue;
		}
		if (SKIPPED_PI_REQUIRED_VALUE_OPTIONS.has(name)) {
			if (index + 1 >= resolved.length) throw replayError([`${name} requires a value`]);
			index++;
			continue;
		}
		if (SKIPPED_PI_OPTIONAL_VALUE_OPTIONS.has(argument)) {
			if (isOptionalValueToken(resolved[index + 1])) index++;
			continue;
		}
		throw replayError([`unsupported forwarded runtime argument: ${argument}`]);
	}
	return resolved;
}

export function extractSafePiRuntimeArgs(arguments_: readonly string[], originCwd = process.cwd()): string[] {
	validateReplayablePiArgs(arguments_);
	const forwarded: string[] = [];
	for (let index = 0; index < arguments_.length; index++) {
		const argument = arguments_[index]!;
		if (argument === "--") break;
		if (argument.startsWith("@") || !argument.startsWith("-")) break;

		const name = optionName(argument);
		if (SAFE_PI_RUNTIME_FLAGS.has(argument)) {
			forwarded.push(argument);
			continue;
		}
		if (SAFE_PI_RUNTIME_OPTIONS.has(name)) {
			const value = requireValue(name, arguments_, index);
			forwarded.push(argument, resolveForwardedValue(name, value, originCwd));
			index++;
			continue;
		}
		if (SKIPPED_PI_FLAGS.has(argument)) continue;
		if (SKIPPED_PI_REQUIRED_VALUE_OPTIONS.has(name)) {
			requireValue(name, arguments_, index);
			index++;
			continue;
		}
		if (SKIPPED_PI_OPTIONAL_VALUE_OPTIONS.has(argument)) {
			if (isOptionalValueToken(arguments_[index + 1])) index++;
			continue;
		}
		throw replayError([`unsupported startup option before the first prompt: ${argument}`]);
	}
	return forwarded;
}

export function currentPiRuntimeArgv(
	argv = process.argv,
	execPath = process.execPath,
	originCwd = process.cwd(),
): string[] | undefined {
	if (!execPath) return undefined;
	if (isLikelyEntrypoint(argv[1])) {
		return resolveForwardedPiRuntimeArgv([
			resolvePathValue(execPath, originCwd),
			resolvePathValue(argv[1]!, originCwd),
			...extractSafePiRuntimeArgs(argv.slice(2), originCwd),
		], originCwd);
	}
	return resolveForwardedPiRuntimeArgv([
		resolvePathValue(execPath, originCwd),
		...extractSafePiRuntimeArgs(argv.slice(1), originCwd),
	], originCwd);
}
