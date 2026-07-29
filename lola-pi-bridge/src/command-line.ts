export interface InstallArguments {
  source: string;
  moduleName?: string;
  moduleContent?: string;
}

const INSTALL_USAGE =
  "Usage: /lola-install <source> [--name <module>] [--module-content <path>]";

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | undefined;
  let escaped = false;
  let started = false;

  for (const character of input) {
    if (escaped) {
      token += character;
      escaped = false;
      started = true;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      started = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      else token += character;
      started = true;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      started = true;
      continue;
    }
    if (/\s/.test(character)) {
      if (started) {
        tokens.push(token);
        token = "";
        started = false;
      }
      continue;
    }
    token += character;
    started = true;
  }

  if (quote) throw new Error("Unterminated quoted argument");
  if (escaped) token += "\\";
  if (started) tokens.push(token);
  return tokens;
}

function optionValue(tokens: string[], index: number, option: string): string {
  const value = tokens[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

export function parseInstallArgs(input: string): InstallArguments {
  const tokens = tokenize(input);
  let source: string | undefined;
  let moduleName: string | undefined;
  let moduleContent: string | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--name") {
      moduleName = optionValue(tokens, index, token);
      index += 1;
    } else if (token.startsWith("--name=")) {
      moduleName = token.slice("--name=".length);
      if (!moduleName) throw new Error("--name requires a value");
    } else if (token === "--module-content") {
      moduleContent = optionValue(tokens, index, token);
      index += 1;
    } else if (token.startsWith("--module-content=")) {
      moduleContent = token.slice("--module-content=".length);
      if (!moduleContent) throw new Error("--module-content requires a value");
    } else if (token.startsWith("--")) {
      throw new Error(`Unsupported option: ${token}`);
    } else if (source === undefined) {
      source = token;
    } else {
      throw new Error(`Unexpected argument: ${token}`);
    }
  }

  if (!source) throw new Error(INSTALL_USAGE);
  return { source, moduleName, moduleContent };
}

export function parseSyncArgs(input: string): string | undefined {
  const tokens = tokenize(input);
  if (tokens.length === 0) return undefined;
  if (tokens.length > 1) throw new Error("Expected one Lola module name");

  const moduleName = tokens[0];
  if (!/^[a-z0-9][a-z0-9-]*$/.test(moduleName)) {
    throw new Error(`Invalid Lola module name: ${moduleName}`);
  }
  return moduleName;
}
