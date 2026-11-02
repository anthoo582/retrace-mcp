import { describe, it, expect } from "vitest";
import { parseOperands, reconstructFunction } from "../../src/mips/decompile.js";
import type { MipsInstruction } from "../../src/mips/disasm.js";

function instruction(address: number, mnemonic: string, operands: string): MipsInstruction {
  return {
    address,
    size: 4,
    bytes: "",
    mnemonic,
    operands,
    operandDetail: [],
    groups: [],
    text: `${mnemonic} ${operands}`
  };
}

describe("mips / reconstruct", () => {
  it("parses register, immediate and memory operands", () => {
    expect(parseOperands(instruction(0, "addiu", "$sp,$sp,-0x20"))).toEqual([
      { kind: "reg", reg: "$sp", text: "$sp" },
      { kind: "reg", reg: "$sp", text: "$sp" },
      { kind: "imm", imm: -32, text: "-0x20" }
    ]);
    expect(parseOperands(instruction(0, "lw", "$ra,0x1c($sp)"))).toEqual([
      { kind: "reg", reg: "$ra", text: "$ra" },
      { kind: "mem", base: "$sp", disp: 28, text: "0x1c($sp)" }
    ]);
  });

  it("detects the stack frame and saved ra", () => {
    const body = [
      instruction(0x80000400, "addiu", "$sp,$sp,-0x20"),
      instruction(0x80000404, "sw", "$ra,0x1c($sp)"),
      instruction(0x80000408, "lw", "$ra,0x1c($sp)"),
      instruction(0x8000040c, "jr", "$ra"),
      instruction(0x80000410, "addiu", "$sp,$sp,0x20")
    ];
    const result = reconstructFunction(body, { name: "demo", arch: "r4300i", endian: "big", abi: "o32" });
    expect(result.frame.size).toBe(0x20);
    expect(result.frame.savesRa).toBe(true);
    expect(result.frame.balanced).toBe(true);
    expect(result.instructionCount).toBe(5);
    expect(result.method).toBe("structural-heuristic");
    expect(result.pseudocodeKind).toBe("heuristic-pseudocode");
    expect(result.certainty).not.toBe("confirmed");
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it("records a branch edge and a back-edge loop", () => {
    const branch = instruction(0x8000040c, "bne", "$t1,$zero,0x80000404");
    branch.operandDetail = [{ type: "reg" }, { type: "reg" }, { type: "imm", imm: 0x80000404 }];
    const body = [
      instruction(0x80000400, "addiu", "$t0,$zero,0x0"),
      instruction(0x80000404, "addiu", "$t0,$t0,0x1"),
      instruction(0x80000408, "slti", "$t1,$t0,0xa"),
      branch,
      instruction(0x80000410, "nop", ""),
      instruction(0x80000414, "jr", "$ra")
    ];
    const result = reconstructFunction(body, { name: "loop", abi: "o32" });
    expect(result.blocks.length).toBeGreaterThan(1);
    expect(result.edges.some((edge) => edge.kind === "branch_taken")).toBe(true);
    expect(result.loops.length).toBeGreaterThanOrEqual(1);
  });

  it("refuses an empty instruction list", () => {
    expect(() => reconstructFunction([])).toThrow(/empty/);
  });
});
