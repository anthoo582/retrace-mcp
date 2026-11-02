import { describe, expect, it } from "vitest";
import { analyzeBuild } from "../../src/build/analysis.js";
import { runBuild, validateBuildRequest } from "../../src/build/run.js";

describe("build analysis", () => {
  it("detects the repository's npm and Python manifests without executing them", async () => {
    const result = await analyzeBuild(process.cwd());
    expect(result.systems).toContain("npm");
    expect(result.systems).toContain("python");
    expect(result.files.map((file) => file.file)).toContain("package.json");
    expect(result.files.map((file) => file.file)).toContain("pyproject.toml");
  });

  it("rejects commands outside the allowlist", () => {
    expect(() => validateBuildRequest({ command: "curl" as never, args: [] })).toThrow(/allowlist/);
  });

  it("rejects shell metacharacters in arguments", () => {
    expect(() => validateBuildRequest({ command: "npm", args: ["run", "build;rm -rf /"] })).toThrow(/not allowed/);
    expect(() => validateBuildRequest({ command: "npm", args: ["run", "build && whoami"] })).toThrow(/not allowed/);
  });

  it("accepts a plain allowlisted invocation", () => {
    expect(validateBuildRequest({ command: "npm", args: ["run", "typecheck"] })).toEqual({
      command: "npm",
      args: ["run", "typecheck"]
    });
  });

  it("refuses to execute without the write policy", async () => {
    if (process.env.RETRACE_ALLOW_WRITE === "1") return;
    await expect(runBuild({ command: "npm", args: ["--version"] })).rejects.toThrow(/RETRACE_ALLOW_WRITE/);
  });
});
