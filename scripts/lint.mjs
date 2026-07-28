import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const textExtensions = new Set([".cjs", ".js", ".json", ".md", ".mjs", ".ts", ".yaml", ".yml"]);
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
	encoding: "utf8",
})
	.split("\0")
	.filter((file) => file && textExtensions.has(extname(file)));

const errors = [];

for (const file of files) {
	const contents = readFileSync(file, "utf8");
	const lines = contents.split("\n");

	for (const [index, line] of lines.entries()) {
		if (/[\t ]+$/.test(line)) errors.push(`${file}:${index + 1}: trailing whitespace`);
	}
	if (contents.length > 0 && !contents.endsWith("\n")) errors.push(`${file}: missing final newline`);

	if (extname(file) === ".json") {
		try {
			JSON.parse(contents);
		} catch (error) {
			errors.push(`${file}: invalid JSON (${error.message})`);
		}
	}

	if ([".cjs", ".js", ".mjs", ".ts"].includes(extname(file))) {
		const args = extname(file) === ".ts" ? ["--experimental-strip-types", "--check", file] : ["--check", file];
		const result = spawnSync(process.execPath, args, { encoding: "utf8" });
		if (result.status !== 0) errors.push(`${file}: syntax check failed\n${result.stderr.trim()}`);
	}
}

if (errors.length > 0) {
	console.error(errors.join("\n"));
	process.exitCode = 1;
} else {
	console.log(`Lint passed for ${files.length} files.`);
}
