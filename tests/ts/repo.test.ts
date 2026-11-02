import { describe, expect, it } from "vitest";
import { buildRepoIndex, searchCode } from "../../src/repo/intel.js";

describe("repository architecture", () => {
  it("indexes real languages and build manifests", async () => {
    const index = await buildRepoIndex(process.cwd(), { includeDuplicates: false });
    expect(index.fileCount).toBeGreaterThan(0);
    expect(index.languages.some((entry) => entry.language === "TypeScript")).toBe(true);
    expect(index.buildSystems.some((entry) => entry.file === "package.json")).toBe(true);
    expect(index.git.available).toBe(true);
  });

  it("supports literal symbol reference searches", async () => {
    const result = await searchCode(process.cwd(), "registerRepoTools", { caseSensitive: true });
    expect(result.hits.some((hit) => hit.file.endsWith("src/tools/repo.ts"))).toBe(true);
  });
});
