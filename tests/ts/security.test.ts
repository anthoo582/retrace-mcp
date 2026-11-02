import { describe, it, expect } from "vitest";
import { isInside, resolveInWorkspace, PathSecurityError } from "../../src/security/paths.js";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

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

  it("rejects symlinks that resolve outside workspace roots", async () => {
    const link = path.resolve("tests", `.outside-link-${process.pid}`);
    const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "retrace-outside-"));
    const target = path.join(targetDir, "secret.bin");
    await fs.writeFile(target, "secret");

    try {
      try {
        await fs.symlink(target, link, "file");
      } catch {
        // Some Windows environments disable symlink creation for unprivileged users.
        return;
      }
      expect(() => resolveInWorkspace(link)).toThrow(PathSecurityError);
    } finally {
      await fs.rm(link, { force: true });
      await fs.rm(targetDir, { recursive: true, force: true });
    }
  });
});

