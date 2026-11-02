import { describe, expect, it } from "vitest";
import { analyzeBuild } from "../../src/build/analysis.js";

describe("build analysis", () => {
  it("detects the repository's npm and Python manifests without executing them", async () => {
    const result = await analyzeBuild(process.cwd());
    expect(result.systems).toContain("npm");
    expect(result.systems).toContain("python");
    expect(result.files.map((file) => file.file)).toContain("package.json");
    expect(result.files.map((file) => file.file)).toContain("pyproject.toml");
  });
});
