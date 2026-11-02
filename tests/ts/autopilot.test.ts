import { describe, expect, it } from "vitest";
import { buildAutopilotPlan, hashState } from "../../src/port/autopilot.js";

describe("project autopilot", () => {
  it("blocks missing external tools without simulating them", () => {
    const plan = buildAutopilotPlan({ splat: false, ghidra: false, n64recomp: false, "ps2-gcc": false, pcsx2: false }, false);
    expect(plan.blocked.length).toBeGreaterThan(0);
    expect(plan.stages.find((stage) => stage.id === "ps2-project")?.status).toBe("ready");
    expect(plan.stages.find((stage) => stage.id === "ghidra")?.status).toBe("blocked");
  });

  it("produces a stable state hash", () => {
    expect(hashState({ a: 1 })).toBe(hashState({ a: 1 }));
    expect(hashState({ a: 1 })).not.toBe(hashState({ a: 2 }));
  });
});
