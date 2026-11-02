import { describe, expect, it } from "vitest";
import { buildPs2Template } from "../../src/tools/automation.js";

describe("automation MVP", () => {
  it("generates an explicit PS2 scaffold without pretending to port a game", () => {
    const files = buildPs2Template("Mario 64 / PS2");
    expect(Object.keys(files)).toEqual(["CMakeLists.txt", "src/main.c", "PORTING.md"]);
    expect(files["CMakeLists.txt"]).toContain("project(Mario_64___PS2 C)");
    expect(files["PORTING.md"]).toContain("not a converted game");
  });
});
