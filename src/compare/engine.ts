import type { MipsInstruction } from "../mips/disasm.js";
import { isReturn } from "../mips/analysis.js";

export type MatchLevel = "exact" | "structural" | "probable" | "unknown";

export type InstructionCategory =
  | "call"
  | "return"
  | "branch"
  | "load"
  | "store"
  | "arith"
  | "logic"
  | "shift"
  | "const"
  | "float"
  | "vector"
  | "syscall"
  | "nop"
  | "other";

export type NormalizedInstruction = {
  address: number;
  mnemonic: string;
  canonical: string;
  category: InstructionCategory;
  shape: string;
  skeleton: string;
};

export type FunctionSignature = {
  instructionCount: number;
  rawMnemonics: string[];
  canonical: string[];
  shapes: string[];
  skeletons: string[];
  categories: InstructionCategory[];
  trigrams: string[];
  blockSizes: number[];
  blockTerminators: string[];
  callCount: number;
  branchCount: number;
  loadStoreCount: number;
  returnCount: number;
  stackFrame?: number;
  stackDelta: number;
};

export type FunctionComparison = {
  level: MatchLevel;
  confirmedEquivalence: false;
  score: number;
  metrics: {
    sequenceSimilarity: number;
    categorySimilarity: number;
    trigramJaccard: number;
    lengthRatio: number;
    blockSimilarity: number;
    callCountDelta: number;
    branchCountDelta: number;
    loadStoreDelta: number;
    stackFrameDelta?: number;
  };
  differences: string[];
  evidence: string[];
  notes: string[];
};

const CANONICAL: Record<string, string> = {
  daddu: "addu",
  dadd: "add",
  daddiu: "addiu",
  dsubu: "subu",
  dsub: "sub",
  dsll: "sll",
  dsrl: "srl",
  dsra: "sra",
  dsll32: "sll",
  dsrl32: "srl",
  dsra32: "sra",
  dmult: "mult",
  dmultu: "multu",
  ddiv: "div",
  ddivu: "divu",
  ld: "lw",
  lq: "lw",
  sd: "sw",
  sq: "sw",
  ldc1: "lwc1",
  sdc1: "swc1",
  dmfc1: "mfc1",
  dmtc1: "mtc1",
  beql: "beq",
  bnel: "bne",
  bgezall: "bgezal",
  bgezl: "bgez",
  bgtzl: "bgtz",
  blezl: "blez",
  bltzl: "bltz",
  bltzall: "bltzal",
  movz: "movz",
  movn: "movn"
};

const CALL = /^(jal|jalr|bal|bgezal|bltzal)$/;
const BRANCH = /^(b|beq|bne|beqz|bnez|bgez|bgtz|blez|bltz|bc1t|bc1f|j|jr)$/;
const LOAD = /^(l[bwhd]|lbu|lhu|lq|lwc1|lwl|lwr|ldl|ldr|mfc1|cfc1|qmfc2)$/;
const STORE = /^(s[bwhd]|sq|swc1|swl|swr|sdl|sdr|mtc1|ctc1|qmtc2)$/;
const ARITH = /^(add|addu|addi|addiu|sub|subu|slt|sltu|slti|sltiu|mult|multu|div|divu|neg)$/;
const LOGIC = /^(and|andi|or|ori|xor|xori|nor|not|movz|movn)$/;
const SHIFT = /^(sll|srl|sra|sllv|srlv|srav)$/;
const FLOAT = /^(add\.s|add\.d|sub\.s|sub\.d|mul\.s|mul\.d|div\.s|div\.d|cvt\..*|c\..*|bc1.*)$/;
const VECTOR = /^(v|pext|pins|pcpy|pabs|padd|psub|pmul|pmadd|pdiv|psll|psrl|psra|por|pand|pxor|pnor|lq|sq|mfir|mtir|vilwr|viswr|vu0|vu1)/;
const SYSCALL = /^(syscall|break|sync|eret|tlb[a-z]+|cache|pref)$/;
const CONST = /^(lui|li|la|dla)$/;

export function canonicalMnemonic(mnemonic: string): string {
  const lower = mnemonic.toLowerCase();
  return CANONICAL[lower] ?? lower;
}

export function categorize(instruction: MipsInstruction): InstructionCategory {
  const mnemonic = canonicalMnemonic(instruction.mnemonic);
  if (isReturn(instruction)) return "return";
  if (CALL.test(mnemonic)) return "call";
  if (mnemonic === "nop") return "nop";
  if (SYSCALL.test(mnemonic)) return "syscall";
  if (CONST.test(mnemonic)) return "const";
  if (STORE.test(mnemonic)) return "store";
  if (LOAD.test(mnemonic)) return "load";
  if (BRANCH.test(mnemonic)) return "branch";
  if (SHIFT.test(mnemonic)) return "shift";
  if (LOGIC.test(mnemonic)) return "logic";
  if (ARITH.test(mnemonic)) return "arith";
  if (FLOAT.test(mnemonic)) return "float";
  if (VECTOR.test(mnemonic)) return "vector";
  return "other";
}

export function normalizeInstruction(instruction: MipsInstruction): NormalizedInstruction {
  const canonical = canonicalMnemonic(instruction.mnemonic);
  const operands = instruction.operands
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const shapes: string[] = [];
  const kinds: string[] = [];
  for (const operand of operands) {
    if (/^\$[a-z0-9]+$/i.test(operand)) {
      shapes.push("REG");
      kinds.push("R");
      continue;
    }
    if (/^-?(?:0x[0-9a-f]+|\d+)\((?:\$[a-z0-9]+)\)$/i.test(operand)) {
      shapes.push("MEM");
      kinds.push("M");
      continue;
    }
    if (/^-?(?:0x[0-9a-f]+|\d+)$/i.test(operand)) {
      shapes.push("IMM");
      kinds.push("I");
      continue;
    }
    shapes.push("SYM");
    kinds.push("S");
  }
  return {
    address: instruction.address,
    mnemonic: instruction.mnemonic.toLowerCase(),
    canonical,
    category: categorize(instruction),
    shape: `${canonical} ${shapes.join(",")}`.trim(),
    skeleton: `${canonical} ${kinds.join("")}`.trim()
  };
}

export function buildSignature(instructions: MipsInstruction[], options: { stackFrame?: number } = {}): FunctionSignature {
  const normalized = instructions.map(normalizeInstruction);
  const skeletons = normalized.map((entry) => entry.skeleton);
  const trigrams = new Set<string>();
  for (let index = 0; index + 2 < skeletons.length; index += 1) {
    trigrams.add(`${skeletons[index]}|${skeletons[index + 1]}|${skeletons[index + 2]}`);
  }
  const blockSizes: number[] = [];
  const blockTerminators: string[] = [];
  let current = 0;
  let stackDelta = 0;
  for (const instruction of instructions) {
    current += 1;
    if (BRANCH.test(canonicalMnemonic(instruction.mnemonic)) || CALL.test(canonicalMnemonic(instruction.mnemonic))) {
      blockSizes.push(current);
      blockTerminators.push(canonicalMnemonic(instruction.mnemonic));
      current = 0;
    }
    if (canonicalMnemonic(instruction.mnemonic) === "addiu" && /\$sp\s*,\s*\$sp/i.test(instruction.operands)) {
      const match = /(-?(?:0x[0-9a-f]+|\d+))\(\$sp\)/i.exec(instruction.operands);
      if (match) stackDelta += /^0x/i.test(match[1]!) ? Number.parseInt(match[1]!.slice(2), 16) : Number.parseInt(match[1]!, 10);
    }
  }
  if (current > 0) {
    blockSizes.push(current);
    blockTerminators.push("end");
  }
  return {
    instructionCount: normalized.length,
    rawMnemonics: normalized.map((entry) => entry.mnemonic),
    canonical: normalized.map((entry) => entry.canonical),
    shapes: normalized.map((entry) => entry.shape),
    skeletons,
    categories: normalized.map((entry) => entry.category),
    trigrams: [...trigrams],
    blockSizes,
    blockTerminators,
    callCount: normalized.filter((entry) => entry.category === "call").length,
    branchCount: normalized.filter((entry) => entry.category === "branch").length,
    loadStoreCount: normalized.filter((entry) => entry.category === "load" || entry.category === "store").length,
    returnCount: normalized.filter((entry) => entry.category === "return").length,
    stackFrame: options.stackFrame,
    stackDelta
  };
}

function lcsSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return a.length === b.length ? 1 : 0;
  const limit = 4000;
  const left = a.slice(0, limit);
  const right = b.slice(0, limit);
  let previous = new Uint32Array(right.length + 1);
  let current = new Uint32Array(right.length + 1);
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = left[i - 1] === right[j - 1] ? previous[j - 1]! + 1 : Math.max(previous[j]!, current[j - 1]!);
    }
    const swap = previous;
    previous = current;
    current = swap;
    current.fill(0);
  }
  return previous[right.length]! / Math.max(left.length, right.length);
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const left = new Set(a);
  const right = new Set(b);
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function blockSimilarity(a: FunctionSignature, b: FunctionSignature): number {
  if (a.blockSizes.length === 0 || b.blockSizes.length === 0) return 0;
  const terminatorScore = jaccard(a.blockTerminators, b.blockTerminators);
  const countScore = 1 - Math.abs(a.blockSizes.length - b.blockSizes.length) / Math.max(a.blockSizes.length, b.blockSizes.length);
  const sizeScore = jaccard(a.blockSizes.map(String), b.blockSizes.map(String));
  return terminatorScore * 0.4 + countScore * 0.4 + sizeScore * 0.2;
}

export function compareSignatures(
  a: FunctionSignature,
  b: FunctionSignature,
  options: { labelA?: string; labelB?: string } = {}
): FunctionComparison {
  const sequenceSimilarity = lcsSimilarity(a.skeletons, b.skeletons);
  const categorySimilarity = lcsSimilarity(a.categories, b.categories);
  const trigramJaccard = jaccard(a.trigrams, b.trigrams);
  const lengthRatio = a.instructionCount === 0 || b.instructionCount === 0
    ? 0
    : Math.min(a.instructionCount, b.instructionCount) / Math.max(a.instructionCount, b.instructionCount);
  const blocks = blockSimilarity(a, b);
  const callCountDelta = a.callCount - b.callCount;
  const branchCountDelta = a.branchCount - b.branchCount;
  const loadStoreDelta = a.loadStoreCount - b.loadStoreCount;
  const stackFrameDelta = a.stackFrame !== undefined && b.stackFrame !== undefined ? a.stackFrame - b.stackFrame : undefined;

  const score =
    sequenceSimilarity * 0.5 +
    categorySimilarity * 0.2 +
    trigramJaccard * 0.2 +
    blocks * 0.1;

  const identical =
    a.instructionCount === b.instructionCount &&
    a.skeletons.length === b.skeletons.length &&
    a.skeletons.every((entry, index) => entry === b.skeletons[index]) &&
    a.rawMnemonics.every((entry, index) => entry === b.rawMnemonics[index]);

  let level: MatchLevel;
  if (identical) level = "exact";
  else if (score >= 0.85 && callCountDelta === 0 && Math.abs(branchCountDelta) <= 1 && lengthRatio >= 0.8) level = "structural";
  else if (score >= 0.65 && lengthRatio >= 0.5) level = "probable";
  else level = "unknown";

  const differences: string[] = [];
  const compared = Math.min(a.skeletons.length, b.skeletons.length);
  for (let index = 0; index < compared && differences.length < 5; index += 1) {
    if (a.skeletons[index] !== b.skeletons[index]) {
      differences.push(`instruction ${index}: ${a.skeletons[index]} vs ${b.skeletons[index]}`);
    }
  }
  if (a.instructionCount !== b.instructionCount) {
    differences.push(`instruction count: ${a.instructionCount} vs ${b.instructionCount}`);
  }
  if (callCountDelta !== 0) differences.push(`call sites: ${a.callCount} vs ${b.callCount}`);
  if (branchCountDelta !== 0) differences.push(`branches: ${a.branchCount} vs ${b.branchCount}`);
  if (stackFrameDelta !== undefined && stackFrameDelta !== 0) differences.push(`stack frame: ${a.stackFrame} vs ${b.stackFrame}`);

  const notes: string[] = [];
  if (level === "exact") notes.push("Instruction mnemonics and operand shapes are identical; semantics are still not proven.");
  if (level === "structural") notes.push("Control-flow and instruction classes agree closely; register allocation and constants may differ.");
  if (level === "probable") notes.push("Similar shape, but differences exist; treat as a candidate for manual confirmation.");
  if (level === "unknown") notes.push("No defensible equivalence from instruction shape alone.");
  notes.push("This engine never returns 'confirmed': confirmation requires recorded evidence.");

  return {
    level,
    confirmedEquivalence: false,
    score: Number(score.toFixed(4)),
    metrics: {
      sequenceSimilarity: Number(sequenceSimilarity.toFixed(4)),
      categorySimilarity: Number(categorySimilarity.toFixed(4)),
      trigramJaccard: Number(trigramJaccard.toFixed(4)),
      lengthRatio: Number(lengthRatio.toFixed(4)),
      blockSimilarity: Number(blocks.toFixed(4)),
      callCountDelta,
      branchCountDelta,
      loadStoreDelta,
      stackFrameDelta
    },
    differences,
    evidence: [
      `${options.labelA ?? "left"}: ${a.instructionCount} instructions, ${a.callCount} calls, ${a.branchCount} branches`,
      `${options.labelB ?? "right"}: ${b.instructionCount} instructions, ${b.callCount} calls, ${b.branchCount} branches`,
      `skeleton LCS similarity ${sequenceSimilarity.toFixed(4)}, category similarity ${categorySimilarity.toFixed(4)}, trigram Jaccard ${trigramJaccard.toFixed(4)}`
    ],
    notes
  };
}

export function compareInstructions(
  a: MipsInstruction[],
  b: MipsInstruction[],
  options: { labelA?: string; labelB?: string; stackFrameA?: number; stackFrameB?: number } = {}
): FunctionComparison {
  return compareSignatures(
    buildSignature(a, { stackFrame: options.stackFrameA }),
    buildSignature(b, { stackFrame: options.stackFrameB }),
    options
  );
}

export type CandidateComparison = {
  name: string;
  address?: number;
  comparison: FunctionComparison;
};

export function rankCandidates(
  target: MipsInstruction[],
  candidates: Array<{ name: string; address?: number; instructions: MipsInstruction[] }>,
  options: { stackFrame?: number; limit?: number } = {}
): CandidateComparison[] {
  const targetSignature = buildSignature(target, { stackFrame: options.stackFrame });
  const limit = options.limit ?? 25;
  return candidates
    .map((candidate) => ({
      name: candidate.name,
      address: candidate.address,
      comparison: compareSignatures(targetSignature, buildSignature(candidate.instructions), {
        labelA: "target",
        labelB: candidate.name
      })
    }))
    .sort((a, b) => b.comparison.score - a.comparison.score)
    .slice(0, limit);
}
