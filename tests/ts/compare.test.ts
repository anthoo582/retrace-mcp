import { describe, it, expect } from "vitest";
import {
  buildSignature,
  canonicalMnemonic,
  compareInstructions,
  normalizeInstruction,
  rankCandidates
} from "../../src/compare/engine.js";
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

const n64Body = [
  instruction(0x80000400, "addiu", "$sp,$sp,-0x20"),
  instruction(0x80000404, "sw", "$ra,0x1c($sp)"),
  instruction(0x80000408, "jal", "0x80001000"),
  instruction(0x8000040c, "nop", ""),
  instruction(0x80000410, "lw", "$ra,0x1c($sp)"),
  instruction(0x80000414, "jr", "$ra"),
  instruction(0x80000418, "addiu", "$sp,$sp,0x20")
];

const ps2Equivalent = [
  instruction(0x00100000, "daddiu", "$sp,$sp,-0x20"),
  instruction(0x00100004, "sd", "$ra,0x18($sp)"),
  instruction(0x00100008, "jal", "0x00102000"),
  instruction(0x0010000c, "nop", ""),
  instruction(0x00100010, "ld", "$ra,0x18($sp)"),
  instruction(0x00100014, "jr", "$ra"),
  instruction(0x00100018, "daddiu", "$sp,$sp,0x20")
];

describe("compare / engine", () => {
  it("canonicalises 64-bit mnemonics onto their 32-bit shape", () => {
    expect(canonicalMnemonic("daddu")).toBe("addu");
    expect(canonicalMnemonic("daddiu")).toBe("addiu");
    expect(canonicalMnemonic("ld")).toBe("lw");
    expect(canonicalMnemonic("sd")).toBe("sw");
    expect(canonicalMnemonic("beql")).toBe("beq");
    expect(canonicalMnemonic("addiu")).toBe("addiu");
  });

  it("normalises registers, immediates and memory operands separately", () => {
    const normalized = normalizeInstruction(instruction(0, "lw", "$t0,0x10($sp)"));
    expect(normalized.shape).toBe("lw REG,MEM");
    expect(normalized.skeleton).toBe("lw RM");
    expect(normalized.category).toBe("load");
  });

  it("marks identical instruction skeletons as exact but never confirmed", () => {
    const comparison = compareInstructions(n64Body, n64Body);
    expect(comparison.level).toBe("exact");
    expect(comparison.confirmedEquivalence).toBe(false);
    expect(comparison.score).toBe(1);
    expect(comparison.notes.join(" ")).toContain("never returns 'confirmed'");
  });

  it("recognises a canonical N64/PS2 pair as structural, not confirmed", () => {
    const comparison = compareInstructions(n64Body, ps2Equivalent, { labelA: "n64", labelB: "ps2" });
    expect(comparison.level).toBe("structural");
    expect(comparison.confirmedEquivalence).toBe(false);
    expect(comparison.metrics.sequenceSimilarity).toBeGreaterThanOrEqual(0.85);
  });

  it("does not overstate unrelated functions", () => {
    const unrelated = [
      instruction(0x00100000, "mult", "$a0,$a1"),
      instruction(0x00100004, "mflo", "$v0"),
      instruction(0x00100008, "jr", "$ra")
    ];
    const comparison = compareInstructions(n64Body, unrelated);
    expect(["probable", "unknown"]).toContain(comparison.level);
    expect(comparison.confirmedEquivalence).toBe(false);
  });

  it("counts stack adjustment and call sites in the signature", () => {
    const signature = buildSignature(n64Body);
    expect(signature.callCount).toBe(1);
    expect(signature.stackDelta).toBe(0);
    expect(signature.blockSizes.length).toBeGreaterThan(0);
  });

  it("ranks the closer candidate first", () => {
    const ranked = rankCandidates(n64Body, [
      { name: "unrelated", instructions: [instruction(0, "mult", "$a0,$a1"), instruction(4, "jr", "$ra")] },
      { name: "equivalent", instructions: ps2Equivalent }
    ]);
    expect(ranked[0]!.name).toBe("equivalent");
    expect(ranked[0]!.comparison.score).toBeGreaterThan(ranked[1]!.comparison.score);
  });
});
