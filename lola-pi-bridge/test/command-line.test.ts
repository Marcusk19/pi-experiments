import { describe, expect, it } from "vitest";
import { parseInstallArgs, parseSyncArgs } from "../src/command-line.js";

describe("parseInstallArgs", () => {
  it("parses a URL with optional Lola flags", () => {
    expect(parseInstallArgs(
      "https://github.com/example/skills.git --name shared --module-content plugins/dev",
    )).toEqual({
      source: "https://github.com/example/skills.git",
      moduleName: "shared",
      moduleContent: "plugins/dev",
    });
  });

  it("accepts equals-form options and quoted paths", () => {
    expect(parseInstallArgs(
      "'/Users/test/My Skills' --name=my-skills --module-content='plugin content'",
    )).toEqual({
      source: "/Users/test/My Skills",
      moduleName: "my-skills",
      moduleContent: "plugin content",
    });
  });

  it("rejects a missing source", () => {
    expect(() => parseInstallArgs("--name shared"))
      .toThrow("Usage: /lola-install <source> [--name <module>] [--module-content <path>]");
  });

  it("rejects missing option values", () => {
    expect(() => parseInstallArgs("https://example.com/skills.git --name"))
      .toThrow("--name requires a value");
  });

  it("rejects unsupported options", () => {
    expect(() => parseInstallArgs("https://example.com/skills.git --force"))
      .toThrow("Unsupported option: --force");
  });

  it("rejects unterminated quotes", () => {
    expect(() => parseInstallArgs("'/Users/test/My Skills"))
      .toThrow("Unterminated quoted argument");
  });
});

describe("parseSyncArgs", () => {
  it("returns undefined to update all modules", () => {
    expect(parseSyncArgs("   ")).toBeUndefined();
  });

  it("returns a valid module name", () => {
    expect(parseSyncArgs("shared-skills")).toBe("shared-skills");
  });

  it("rejects invalid or multiple module names", () => {
    expect(() => parseSyncArgs("../shared")).toThrow("Invalid Lola module name: ../shared");
    expect(() => parseSyncArgs("one two")).toThrow("Expected one Lola module name");
  });
});
