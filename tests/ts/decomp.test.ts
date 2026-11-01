import { describe, it, expect } from "vitest";
import {
  sniffConfigFormat,
  unifiedDiff
} from "../../src/config/decomp.js";

describe("config / decomp", () => {
  it("sniffs YAML, JSON, and splat config formats", () => {
    expect(sniffConfigFormat("config.yaml", "segments:\n  - name: main")).toBe("yaml");
    expect(sniffConfigFormat("config.json", '{"functions": []}')).toBe("json");
    expect(sniffConfigFormat("splat.yaml", "name: mk64\nsha1: 1234")).toBe("yaml");
  });

  it("generates unified diff correctly", () => {
    const original = "func_80000400 = 0x80000400\n";
    const proposed = "kart_init = 0x80000400\n";
    const diff = unifiedDiff(original, proposed, "symbols.txt");
    expect(diff).toContain("+kart_init");
    expect(diff).toContain("-func_80000400");
  });
});
