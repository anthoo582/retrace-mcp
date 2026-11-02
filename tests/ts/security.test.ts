import { describe, it, expect } from "vitest";
import { isInside, resolveInWorkspace, PathSecurityError } from "../../src/security/paths.js";
import path from "node:path";

describe("security / paths", () => {
  it("verifies isInside correctly for subdirectories", () => {
    const root = path.resolve(".");
    const file = path.resolve("src", "config.ts");
    expect(isInside(root, file)).toBe(true);
  });

  it("rejects path traversal outside workspace root", () => {
    const outside = path.resolve("..", "secret.txt");
    expect(() => resolveInWorkspace(outside)).toThrow(PathSecurityError);
  });
});

