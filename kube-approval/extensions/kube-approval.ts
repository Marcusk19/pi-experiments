import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { basename } from "node:path";

type GuardedBinary = "kubectl" | "oc" | "aws";

const KUBE_BINARIES = new Set<GuardedBinary>(["kubectl", "oc"]);
const AWS_BINARY: GuardedBinary = "aws";
const GUARDED_BINARIES = new Set<GuardedBinary>([...KUBE_BINARIES, AWS_BINARY]);
const COMMAND_SEPARATORS = new Set([";", "&&", "||", "|", "&", "\n"]);

const KUBE_READ_ONLY_VERBS = new Set([
	"api-resources",
	"api-versions",
	"cluster-info",
	"completion",
	"describe",
	"explain",
	"get",
	"help",
	"logs",
	"options",
	"projects",
	"status",
	"top",
	"version",
	"wait",
	"whoami",
]);

const KUBE_READ_ONLY_CONFIG_SUBCOMMANDS = new Set([
	"current-context",
	"get-clusters",
	"get-contexts",
	"get-users",
	"view",
]);

const KUBE_READ_ONLY_AUTH_SUBCOMMANDS = new Set(["can-i", "whoami"]);
const KUBE_READ_ONLY_ROLLOUT_SUBCOMMANDS = new Set(["history", "status"]);

const KUBE_GLOBAL_FLAGS_WITH_VALUE = new Set([
	"--as",
	"--as-group",
	"--as-uid",
	"--cache-dir",
	"--certificate-authority",
	"--client-certificate",
	"--client-key",
	"--cluster",
	"--context",
	"--field-manager",
	"--kubeconfig",
	"--log-flush-frequency",
	"--match-server-version",
	"--namespace",
	"--profile",
	"--profile-output",
	"--request-timeout",
	"--server",
	"--tls-server-name",
	"--token",
	"--user",
	"--v",
	"--vmodule",
	"-n",
	"-o",
	"-l",
	"-v",
]);

const AWS_GLOBAL_FLAGS_WITH_VALUE = new Set([
	"--ca-bundle",
	"--cli-connect-timeout",
	"--cli-input-json",
	"--cli-input-yaml",
	"--cli-read-timeout",
	"--color",
	"--endpoint-url",
	"--output",
	"--profile",
	"--query",
	"--region",
]);

const AWS_GLOBAL_FLAGS_WITHOUT_VALUE = new Set([
	"--debug",
	"--no-cli-pager",
	"--no-paginate",
	"--no-sign-request",
	"--no-verify-ssl",
	"--version",
]);

const AWS_READ_ONLY_OPERATION_PREFIXES = [
	"batch-describe",
	"batch-get",
	"batch-list",
	"check",
	"describe",
	"get",
	"head",
	"list",
	"lookup",
	"query",
	"scan",
	"search",
	"select",
	"validate",
];

const AWS_READ_ONLY_EXACT_OPERATIONS = new Set([
	"help",
	"presign",
	"wait",
]);

const AWS_READ_ONLY_CONFIGURE_SUBCOMMANDS = new Set([
	"export-credentials",
	"get",
	"list",
]);

const AWS_READ_ONLY_S3_SUBCOMMANDS = new Set([
	"help",
	"ls",
	"presign",
]);

const OPTION_VALUE_FLAGS = new Set([
	"-c",
	"-g",
	"-h",
	"-i",
	"-n",
	"-o",
	"-p",
	"-s",
	"-t",
	"-u",
	"--command",
	"--delimiter",
	"--format",
	"--group",
	"--interval",
	"--max-args",
	"--max-chars",
	"--max-lines",
	"--max-procs",
	"--process-slot-var",
	"--replace",
	"--signal",
	"--user",
]);

interface GuardedInvocation {
	binary: GuardedBinary;
	domain: "kubernetes" | "aws";
	verb?: string;
	subcommand?: string;
	text: string;
	allowed: boolean;
	reason: string;
}

interface GuardedInspection {
	needsApproval: boolean;
	invocations: GuardedInvocation[];
	reason: string;
}

type ApprovalChoice = "once" | "session" | "all-session" | "deny";

// Deliberately in-memory: session approvals disappear when pi exits.
const sessionApprovals = new Set<string>();
let allowAllForSession = false;

function shellTokens(command: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: "'" | '"' | "`" | undefined;
	let escaped = false;

	function pushCurrent() {
		if (current.length > 0) {
			tokens.push(current);
			current = "";
		}
	}

	for (let i = 0; i < command.length; i++) {
		const char = command[i]!;

		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}

		if (char === "\\" && quote !== "'") {
			escaped = true;
			continue;
		}

		if (quote) {
			if (char === quote) quote = undefined;
			else current += char;
			continue;
		}

		if (char === "'" || char === '"' || char === "`") {
			quote = char;
			continue;
		}

		if (char === " " || char === "\t" || char === "\r") {
			pushCurrent();
			continue;
		}

		if (char === "\n") {
			pushCurrent();
			tokens.push("\n");
			continue;
		}

		const next = command[i + 1];
		if ((char === "&" && next === "&") || (char === "|" && next === "|")) {
			pushCurrent();
			tokens.push(char + next);
			i++;
			continue;
		}

		if (char === ";" || char === "|" || char === "&" || char === "(" || char === ")") {
			pushCurrent();
			tokens.push(char);
			continue;
		}

		current += char;
	}

	pushCurrent();
	return tokens;
}

function splitSegments(tokens: string[]): string[][] {
	const segments: string[][] = [];
	let current: string[] = [];

	for (const token of tokens) {
		if (COMMAND_SEPARATORS.has(token)) {
			if (current.length > 0) segments.push(current);
			current = [];
			continue;
		}
		if (token === "(" || token === ")") continue;
		current.push(token);
	}

	if (current.length > 0) segments.push(current);
	return segments;
}

function isEnvAssignment(token: string): boolean {
	return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token);
}

function commandName(token: string | undefined): string | undefined {
	if (!token) return undefined;
	return basename(token).toLowerCase();
}

function guardedCommandName(token: string | undefined): GuardedBinary | undefined {
	const name = commandName(token);
	return name && GUARDED_BINARIES.has(name as GuardedBinary) ? (name as GuardedBinary) : undefined;
}

function stripAssignments(tokens: string[], start: number): number {
	let index = start;
	while (index < tokens.length && isEnvAssignment(tokens[index]!)) index++;
	return index;
}

function skipOptions(tokens: string[], start: number): number {
	let index = start;
	while (index < tokens.length) {
		const token = tokens[index]!;
		if (token === "--") return index + 1;
		if (!token.startsWith("-") || token === "-") return index;
		index++;
		if (token.includes("=")) continue;
		if (OPTION_VALUE_FLAGS.has(token) && index < tokens.length) index++;
	}
	return index;
}

function findExecutableIndex(tokens: string[], start = 0): number | undefined {
	let index = stripAssignments(tokens, start);

	while (index < tokens.length) {
		index = stripAssignments(tokens, index);
		const name = commandName(tokens[index]);
		if (!name) return undefined;

		if (name === "sudo" || name === "doas") {
			index = skipOptions(tokens, index + 1);
			continue;
		}

		if (name === "env") {
			index = skipOptions(tokens, index + 1);
			index = stripAssignments(tokens, index);
			continue;
		}

		if (name === "command" || name === "builtin" || name === "exec" || name === "noglob" || name === "nohup") {
			index++;
			continue;
		}

		if (name === "time" || name === "nice" || name === "timeout" || name === "watch") {
			index = skipOptions(tokens, index + 1);
			if (name === "timeout" && index < tokens.length) index++; // duration
			continue;
		}

		return index;
	}

	return undefined;
}

function findShellCString(tokens: string[], executableIndex: number): string | undefined {
	const name = commandName(tokens[executableIndex]);
	if (name !== "sh" && name !== "bash" && name !== "zsh" && name !== "fish" && name !== "dash") return undefined;

	for (let i = executableIndex + 1; i < tokens.length; i++) {
		const token = tokens[i]!;
		if (token === "-c" || token === "--command") return tokens[i + 1];
		if (token.startsWith("-c") && token.length > 2) return token.slice(2);
	}

	return undefined;
}

function skipKubeGlobalFlags(tokens: string[], start: number): { index: number; uncertain: boolean } {
	let index = start;
	let uncertain = false;

	while (index < tokens.length) {
		const token = tokens[index]!;
		if (token === "--") return { index: index + 1, uncertain };
		if (!token.startsWith("-") || token === "-") return { index, uncertain };

		index++;

		if (token.includes("=")) continue;
		if (KUBE_GLOBAL_FLAGS_WITH_VALUE.has(token)) {
			if (index < tokens.length) index++;
			continue;
		}

		if (/^-[A-Za-z].+/.test(token)) continue; // short flag with attached value, e.g. -nfoo
		if (token.startsWith("--")) uncertain = true;
	}

	return { index, uncertain };
}

function skipAwsGlobalFlags(tokens: string[], start: number): { index: number; uncertain: boolean } {
	let index = start;
	let uncertain = false;

	while (index < tokens.length) {
		const token = tokens[index]!;
		if (token === "--") return { index: index + 1, uncertain };
		if (!token.startsWith("-") || token === "-") return { index, uncertain };

		index++;

		if (token.includes("=")) continue;
		if (AWS_GLOBAL_FLAGS_WITHOUT_VALUE.has(token)) continue;
		if (AWS_GLOBAL_FLAGS_WITH_VALUE.has(token)) {
			if (index < tokens.length) index++;
			continue;
		}

		if (token.startsWith("--")) uncertain = true;
	}

	return { index, uncertain };
}

function nextKubePositional(tokens: string[], start: number): string | undefined {
	const skipped = skipKubeGlobalFlags(tokens, start);
	return tokens[skipped.index];
}

function nextAwsPositional(tokens: string[], start: number): string | undefined {
	const skipped = skipAwsGlobalFlags(tokens, start);
	return tokens[skipped.index];
}

function classifyKubeInvocation(tokens: string[], binaryIndex: number): GuardedInvocation {
	const binary = guardedCommandName(tokens[binaryIndex]) as "kubectl" | "oc";
	const { index: verbIndex, uncertain } = skipKubeGlobalFlags(tokens, binaryIndex + 1);
	const verb = tokens[verbIndex]?.toLowerCase();
	const subcommand = verb ? nextKubePositional(tokens, verbIndex + 1)?.toLowerCase() : undefined;
	const text = tokens.slice(binaryIndex).join(" ");

	if (!verb || verb === "--help" || verb === "-h") {
		return { binary, domain: "kubernetes", verb, subcommand, text, allowed: true, reason: "help/no-op invocation" };
	}

	if (uncertain) {
		return { binary, domain: "kubernetes", verb, subcommand, text, allowed: false, reason: "contains unrecognized global options" };
	}

	if (verb === "config") {
		const allowed = Boolean(subcommand && KUBE_READ_ONLY_CONFIG_SUBCOMMANDS.has(subcommand));
		return {
			binary,
			domain: "kubernetes",
			verb,
			subcommand,
			text,
			allowed,
			reason: allowed ? "read-only config subcommand" : "config subcommand is not in the read-only allowlist",
		};
	}

	if (verb === "auth") {
		const allowed = Boolean(subcommand && KUBE_READ_ONLY_AUTH_SUBCOMMANDS.has(subcommand));
		return {
			binary,
			domain: "kubernetes",
			verb,
			subcommand,
			text,
			allowed,
			reason: allowed ? "read-only auth subcommand" : "auth subcommand is not in the read-only allowlist",
		};
	}

	if (verb === "rollout") {
		const allowed = Boolean(subcommand && KUBE_READ_ONLY_ROLLOUT_SUBCOMMANDS.has(subcommand));
		return {
			binary,
			domain: "kubernetes",
			verb,
			subcommand,
			text,
			allowed,
			reason: allowed ? "read-only rollout subcommand" : "rollout subcommand is not in the read-only allowlist",
		};
	}

	if (verb === "project") {
		const projectName = nextKubePositional(tokens, verbIndex + 1);
		return {
			binary,
			domain: "kubernetes",
			verb,
			subcommand,
			text,
			allowed: !projectName,
			reason: projectName ? "oc project with a target changes local context" : "read current project",
		};
	}

	const allowed = KUBE_READ_ONLY_VERBS.has(verb);
	return {
		binary,
		domain: "kubernetes",
		verb,
		subcommand,
		text,
		allowed,
		reason: allowed ? "verb is in the read-only allowlist" : "verb is not in the read-only allowlist",
	};
}

function isReadOnlyAwsOperation(operation: string): boolean {
	if (AWS_READ_ONLY_EXACT_OPERATIONS.has(operation)) return true;
	return AWS_READ_ONLY_OPERATION_PREFIXES.some((prefix) => operation === prefix || operation.startsWith(`${prefix}-`));
}

function classifyAwsInvocation(tokens: string[], binaryIndex: number): GuardedInvocation {
	const { index: serviceIndex, uncertain } = skipAwsGlobalFlags(tokens, binaryIndex + 1);
	const service = tokens[serviceIndex]?.toLowerCase();
	const operation = service ? nextAwsPositional(tokens, serviceIndex + 1)?.toLowerCase() : undefined;
	const text = tokens.slice(binaryIndex).join(" ");

	if (!service || service === "--version" || service === "--help" || service === "help") {
		return { binary: "aws", domain: "aws", verb: service, subcommand: operation, text, allowed: true, reason: "help/version/no-op invocation" };
	}

	if (uncertain) {
		return { binary: "aws", domain: "aws", verb: service, subcommand: operation, text, allowed: false, reason: "contains unrecognized global options" };
	}

	if (!operation || operation === "help" || operation === "--help") {
		return { binary: "aws", domain: "aws", verb: service, subcommand: operation, text, allowed: true, reason: "help/no-op invocation" };
	}

	if (service === "configure") {
		const allowed = AWS_READ_ONLY_CONFIGURE_SUBCOMMANDS.has(operation);
		return {
			binary: "aws",
			domain: "aws",
			verb: service,
			subcommand: operation,
			text,
			allowed,
			reason: allowed ? "read-only configure subcommand" : "configure subcommand is not in the read-only allowlist",
		};
	}

	if (service === "s3") {
		const allowed = AWS_READ_ONLY_S3_SUBCOMMANDS.has(operation);
		return {
			binary: "aws",
			domain: "aws",
			verb: service,
			subcommand: operation,
			text,
			allowed,
			reason: allowed ? "read-only s3 high-level subcommand" : "s3 high-level subcommand is not confidently read-only",
		};
	}

	const allowed = isReadOnlyAwsOperation(operation);
	return {
		binary: "aws",
		domain: "aws",
		verb: service,
		subcommand: operation,
		text,
		allowed,
		reason: allowed ? "operation matches the read-only allowlist" : "operation is not in the read-only allowlist",
	};
}

function classifyGuardedInvocation(tokens: string[], binaryIndex: number): GuardedInvocation {
	const binary = guardedCommandName(tokens[binaryIndex]);
	if (binary === "aws") return classifyAwsInvocation(tokens, binaryIndex);
	return classifyKubeInvocation(tokens, binaryIndex);
}

function extractCommandSubstitutions(token: string): string[] {
	const commands: string[] = [];

	for (let i = 0; i < token.length - 1; i++) {
		if (token[i] !== "$" || token[i + 1] !== "(") continue;

		let depth = 1;
		let current = "";
		i += 2;
		for (; i < token.length; i++) {
			const char = token[i]!;
			if (char === "(") depth++;
			if (char === ")") depth--;
			if (depth === 0) break;
			current += char;
		}
		if (current.trim()) commands.push(current.trim());
	}

	return commands;
}

function inspectTokens(tokens: string[]): GuardedInspection {
	const invocations: GuardedInvocation[] = [];
	const embeddedReasons: string[] = [];

	for (const segment of splitSegments(tokens)) {
		const executableIndex = findExecutableIndex(segment);
		if (executableIndex === undefined) continue;

		const shellCString = findShellCString(segment, executableIndex);
		if (shellCString) {
			const nested = inspectGuardedCommand(shellCString);
			invocations.push(...nested.invocations);
			if (nested.needsApproval && nested.invocations.length === 0) embeddedReasons.push(nested.reason);
			continue;
		}

		if (guardedCommandName(segment[executableIndex])) {
			invocations.push(classifyGuardedInvocation(segment, executableIndex));
			continue;
		}

		// xargs and find -exec execute a later token as a command. Handle the common cases explicitly.
		const possibleIndexes: number[] = [];
		const executable = commandName(segment[executableIndex]);
		if (executable === "xargs") {
			for (let i = executableIndex + 1; i < segment.length; i++) {
				if (guardedCommandName(segment[i])) possibleIndexes.push(i);
			}
		}
		for (let i = executableIndex + 1; i < segment.length - 1; i++) {
			if ((segment[i] === "-exec" || segment[i] === "-execdir") && guardedCommandName(segment[i + 1])) {
				possibleIndexes.push(i + 1);
			}
		}
		for (const index of possibleIndexes) {
			invocations.push(classifyGuardedInvocation(segment, index));
		}
	}

	for (const token of tokens) {
		for (const nestedCommand of extractCommandSubstitutions(token)) {
			const nested = inspectGuardedCommand(nestedCommand);
			invocations.push(...nested.invocations);
			if (nested.needsApproval && nested.invocations.length === 0) embeddedReasons.push(nested.reason);
		}
	}

	const blocked = invocations.filter((invocation) => !invocation.allowed);
	if (blocked.length > 0) {
		return {
			needsApproval: true,
			invocations,
			reason: blocked
				.map((invocation) => `${invocation.binary} ${invocation.verb ?? ""} ${invocation.subcommand ?? ""}: ${invocation.reason}`.trim())
				.join("; "),
		};
	}

	if (embeddedReasons.length > 0) {
		return { needsApproval: true, invocations, reason: embeddedReasons.join("; ") };
	}

	return {
		needsApproval: false,
		invocations,
		reason: invocations.length > 0 ? "all guarded CLI invocations are read-only" : `no ${[...GUARDED_BINARIES].join("/")} invocation detected`,
	};
}

export function inspectGuardedCommand(command: string): GuardedInspection {
	return inspectTokens(shellTokens(command));
}

export function inspectKubeCommand(command: string): GuardedInspection {
	return inspectGuardedCommand(command);
}

function textFromContentBlock(block: unknown): string | undefined {
	if (!block || typeof block !== "object") return undefined;
	const content = block as { type?: unknown; text?: unknown };
	if (content.type !== "text" || typeof content.text !== "string") return undefined;
	return content.text;
}

function findToolCallJustification(ctx: { sessionManager: { getBranch(): unknown[] } }, toolCallId: string): string | undefined {
	for (const entry of [...ctx.sessionManager.getBranch()].reverse()) {
		if (!entry || typeof entry !== "object") continue;
		const message = (entry as { type?: unknown; message?: unknown }).message;
		if (!message || typeof message !== "object") continue;
		const assistantMessage = message as { role?: unknown; content?: unknown };
		if (assistantMessage.role !== "assistant" || !Array.isArray(assistantMessage.content)) continue;

		const precedingText: string[] = [];
		for (const block of assistantMessage.content) {
			if (block && typeof block === "object") {
				const maybeToolCall = block as { type?: unknown; id?: unknown };
				if (maybeToolCall.type === "toolCall" && maybeToolCall.id === toolCallId) {
					const justification = precedingText.join("\n").trim();
					return justification.length > 0 ? justification : undefined;
				}
			}

			const text = textFromContentBlock(block);
			if (text) precedingText.push(text);
		}
	}

	return undefined;
}

function formatJustificationForDisplay(justification: string): string {
	const compact = justification.replace(/\s+/g, " ").trim();
	if (compact.length <= 600) return compact;
	return compact.slice(0, 597).trimEnd() + "...";
}

function approvalKey(inspection: GuardedInspection): string {
	const keys = inspection.invocations
		.filter((invocation) => !invocation.allowed)
		.map((invocation) => `${invocation.binary}:${invocation.verb ?? "unknown"}:${invocation.subcommand ?? "unknown"}`)
		.sort();
	return keys.length > 0 ? keys.join("|") : `reason:${inspection.reason}`;
}

function compactForDialog(text: string, maxLength: number): string {
	const compact = text.replace(/\s+/g, " ").trim();
	return compact.length <= maxLength ? compact : compact.slice(0, maxLength - 3).trimEnd() + "...";
}

function approvalMessage(command: string, inspection: GuardedInspection, justification?: string): string {
	const invocationLines = inspection.invocations.length
		? inspection.invocations
				.map((invocation) => {
					const status = invocation.allowed ? "read-only" : "needs approval";
					return `- ${compactForDialog(invocation.text, 180)} (${status}: ${compactForDialog(invocation.reason, 100)})`;
				})
				.join("\n")
		: `- ${compactForDialog(inspection.reason, 180)}`;
	const justificationSection = justification
		? ["Agent justification:", formatJustificationForDisplay(justification), ""]
		: [];

	return [
		"Pi is about to run a guarded CLI command that is not confidently read-only.",
		"",
		...justificationSection,
		"Command:",
		compactForDialog(command, 500),
		"",
		"Detected guarded invocations:",
		invocationLines,
		"",
		"Choose an approval scope:",
		"Allow once, allow matching commands, allow all guarded commands for this session, or deny.",
	].join("\n");
}

function policyText(): string {
	return [
		"Approval gate is active for agent bash tool calls using oc/kubectl/aws.",
		"Kubernetes read-only verbs: " + [...KUBE_READ_ONLY_VERBS].sort().join(", "),
		"Kubernetes special read-only subcommands: config " + [...KUBE_READ_ONLY_CONFIG_SUBCOMMANDS].sort().join("|"),
		"AWS read-only operation prefixes: " + [...AWS_READ_ONLY_OPERATION_PREFIXES].sort().join(", "),
		"AWS high-level s3 read-only subcommands: " + [...AWS_READ_ONLY_S3_SUBCOMMANDS].sort().join(", "),
		"Guarded non-read-only commands also require the agent to state a brief what/why justification before the approval dialog is shown.",
		"Everything else using oc/kubectl/aws asks for approval; non-UI runs fail closed.",
	].join("\n");
}

export default function kubeApproval(pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event) => {
		return {
			systemPrompt:
				event.systemPrompt +
				"\n\nGuarded CLI approval rule: before calling the bash tool with any non-read-only oc, kubectl, or aws command, first write a brief user-facing justification that explains what command you want to run and why. Read-only inspection commands do not need this extra justification.",
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;

		const command = (event.input as { command?: unknown }).command;
		if (typeof command !== "string") return undefined;

		const inspection = inspectGuardedCommand(command);
		if (!inspection.needsApproval) return undefined;

		// A global session bypass must happen before justification/UI checks. Otherwise
		// every subsequent guarded call can be rejected once, causing the model to
		// spend an extra turn retrying the same command.
		if (allowAllForSession) return undefined;

		const justification = findToolCallJustification(ctx, event.toolCallId);
		if (!justification) {
			return {
				block: true,
				reason: "Guarded CLI command requires a user-facing justification before approval. Explain what command you want to run and why, then retry.",
			};
		}

		if (!ctx.hasUI) {
			return {
				block: true,
				reason: `Guarded CLI command requires human approval, but no UI is available: ${inspection.reason}`,
			};
		}

		const key = approvalKey(inspection);
		if (sessionApprovals.has(key)) return undefined;

		const choice = await ctx.ui.select(approvalMessage(command, inspection, justification), [
			"Allow once",
			"Allow matching commands for this session",
			"Allow all guarded commands for this session",
			"Deny",
		]);

		const decision: ApprovalChoice =
			choice === "Allow all guarded commands for this session"
				? "all-session"
				: choice === "Allow matching commands for this session"
					? "session"
					: choice === "Allow once"
						? "once"
						: "deny";
		if (decision === "deny") return { block: true, reason: "Guarded CLI command blocked by user" };
		if (decision === "all-session") {
			allowAllForSession = true;
			ctx.ui.notify("All guarded-command approvals bypassed for this session", "info");
		} else if (decision === "session") {
			sessionApprovals.add(key);
			ctx.ui.notify("Approval remembered for matching commands this session", "info");
		}

		return undefined;
	});

	pi.registerCommand("approval-gates-reset", {
		description: "Clear all temporary approval-gate bypasses",
		handler: async (_args, ctx) => {
			const count = sessionApprovals.size;
			const hadGlobalApproval = allowAllForSession;
			sessionApprovals.clear();
			allowAllForSession = false;
			const suffix = hadGlobalApproval ? " plus the global session bypass" : "";
			ctx.ui.notify(`Cleared ${count} session approval${count === 1 ? "" : "s"}${suffix}`, "info");
		},
	});

	pi.registerCommand("kube-approval", {
		description: "Show the oc/kubectl/aws approval gate policy",
		handler: async (_args, ctx) => {
			ctx.ui.notify(policyText(), "info");
		},
	});

	pi.registerCommand("approval-gates", {
		description: "Show the guarded CLI approval gate policy",
		handler: async (_args, ctx) => {
			ctx.ui.notify(policyText(), "info");
		},
	});
}
