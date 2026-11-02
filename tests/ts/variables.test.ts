import { describe, expect, it } from "vitest";
import { inferStructs, inferVariables, validateVariableMap } from "../../src/port/variables.js";
import type { MipsInstruction } from "../../src/mips/disasm.js";

function instruction(address: number, mnemonic: string, operands: string): MipsInstruction {
  return { address, size: 4, bytes: "", mnemonic, operands, operandDetail: [], groups: [], text: `${mnemonic} ${operands}` };
}

describe("variable inference", () => {
  it("recovers stack fields, globals and ABI registers as candidates", () => {
    const variables = inferVariables([
      instruction(0x80000400, "lw", "$a0,0x10($sp)"),
      instruction(0x80000404, "sw", "$v0,0x14($sp)"),
      instruction(0x80000408, "lw", "$t0,0x20($gp)")
    ]);
    expect(variables.some((variable) => variable.name === "local_10")).toBe(true);
    expect(variables.some((variable) => variable.name === "global_20")).toBe(true);
    expect(variables.some((variable) => variable.name === "arg0")).toBe(true);
  });

  it("groups non-stack offsets into candidate structs", () => {
    const variables = inferVariables([
      instruction(0x1000, "lw", "$t0,0x10($a0)"),
      instruction(0x1004, "sw", "$t1,0x14($a0)")
    ]);
    expect(inferStructs(variables)[0]?.fields.length).toBe(2);
  });

  it("rejects conflicting names and misaligned widths", () => {
    const result = validateVariableMap([
      { key: "sp:2", name: "value", suggestions: ["value"], kind: "stack_local", storage: "$sp+2", type: "uint32_t", width: 4, confidence: "low", evidence: [], offset: 2 },
      { key: "sp:4", name: "value", suggestions: ["value"], kind: "stack_local", storage: "$sp+4", type: "uint32_t", width: 4, confidence: "low", evidence: [], offset: 4 }
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(2);
  });
});
