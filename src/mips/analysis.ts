import type { MipsInstruction } from "./disasm.js";

export type BasicBlock = {
  start: number;
  end: number;
  instructions: MipsInstruction[];
  terminator: string;
  successors: number[];
};

export type CallSite = {
  address: number;
  instruction: string;
  target?: number;
  kind: "direct" | "indirect";
};

export type FunctionAnalysis = {
  start: number;
  end: number;
  size: number;
  instructionCount: number;
  basicBlocks: BasicBlock[];
  calls: CallSite[];
  returns: number[];
  stackFrame: number;
  savesRa: boolean;
  constants: Array<{ register: string; value: number }>;
  registersRead: string[];
  registersWritten: string[];
  branches: number;
  notes: string[];
};

const BRANCH_PREFIXES = ["b", "j", "beq", "bne", "bgez", "bgtz", "blez", "bltz", "bc1", "bal"];
const INDIRECT_CALL = /^jalr$/;
const DIRECT_CALL = /^jal$/;
const JUMP = /^(j|b|bal)$/;
const RETURN = /^jr$/;

export function isBranch(instruction: MipsInstruction): boolean {
  return BRANCH_PREFIXES.includes(instruction.mnemonic);
}

export function isCall(instruction: MipsInstruction): boolean {
  return DIRECT_CALL.test(instruction.mnemonic) || INDIRECT_CALL.test(instruction.mnemonic);
}

export function isReturn(instruction: MipsInstruction): boolean {
  return RETURN.test(instruction.mnemonic) && instruction.operands.trim() === "$ra";
}

function immediate(instruction: MipsInstruction): number | undefined {
  const operand = instruction.operandDetail.find((entry) => "imm" in entry && typeof entry.imm === "number");
  return operand && "imm" in operand ? operand.imm : undefined;
}

function regs(instruction: MipsInstruction): string[] {
  return instruction.operandDetail.flatMap((operand) => {
    if ("reg" in operand && operand.reg) return [operand.reg];
    if ("base" in operand && operand.base) return [operand.base];
    return [];
  });
}

export function buildBasicBlocks(instructions: MipsInstruction[]): BasicBlock[] {
  if (instructions.length === 0) return [];
  const indexByAddress = new Map(instructions.map((instruction, index) => [instruction.address, index]));
  const leaders = new Set<number>([0]);
  instructions.forEach((instruction, index) => {
    if (isBranch(instruction)) {
      const target = immediate(instruction);
      if (target !== undefined) {
        const targetIndex = indexByAddress.get(target);
        if (targetIndex !== undefined) leaders.add(targetIndex);
      }
      if (index + 1 < instructions.length) leaders.add(index + 1);
    }
  });
  const sorted = [...leaders].sort((a, b) => a - b);
  const blocks: BasicBlock[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const startIndex = sorted[i]!;
    const endIndex = i + 1 < sorted.length ? sorted[i + 1]! : instructions.length;
    const slice = instructions.slice(startIndex, endIndex);
    if (slice.length === 0) continue;
    const last = slice[slice.length - 1]!;
    const successors: number[] = [];
    if (isBranch(last)) {
      const target = immediate(last);
      if (target !== undefined) successors.push(target);
      if (!JUMP.test(last.mnemonic) && endIndex < instructions.length) {
        successors.push(instructions[endIndex]!.address);
      }
    }
    blocks.push({
      start: slice[0]!.address,
      end: last.address + last.size,
      instructions: slice,
      terminator: `${last.mnemonic} ${last.operands}`.trim(),
      successors
    });
  }
  return blocks;
}

export function extractCalls(instructions: MipsInstruction[]): CallSite[] {
  const calls: CallSite[] = [];
  for (let index = 0; index < instructions.length; index += 1) {
    const instruction = instructions[index]!;
    if (DIRECT_CALL.test(instruction.mnemonic)) {
      const target = immediate(instruction);
      calls.push({
        address: instruction.address,
        instruction: instruction.text,
        target,
        kind: "direct"
      });
    } else if (INDIRECT_CALL.test(instruction.mnemonic)) {
      calls.push({
        address: instruction.address,
        instruction: instruction.text,
        kind: "indirect"
      });
    }
  }
  return calls;
}

export function analyzeFunction(instructions: MipsInstruction[]): FunctionAnalysis {
  if (instructions.length === 0) throw new Error("Cannot analyze an empty instruction list");
  const start = instructions[0]!.address;
  const last = instructions[instructions.length - 1]!;
  const notes: string[] = [];
  let stackFrame = 0;
  let savesRa = false;
  const constants: Array<{ register: string; value: number }> = [];
  const read = new Set<string>();
  const written = new Set<string>();
  const returns: number[] = [];
  let branches = 0;

  let pendingLui: { register: string; value: number } | null = null;

  for (const instruction of instructions) {
    const mnemonic = instruction.mnemonic;
    if (isBranch(instruction)) branches += 1;
    if (isReturn(instruction)) returns.push(instruction.address);

    const ops = regs(instruction);
    if (ops.length > 0) written.add(ops[0]!);
    ops.slice(1).forEach((register) => read.add(register));

    if (mnemonic === "addiu" || mnemonic === "addi") {
      const imm = immediate(instruction);
      const target = ops[0];
      const source = ops[1];
      if (target === "$sp" && source === "$sp" && imm !== undefined) stackFrame = Math.abs(imm);
      if (target && source === "$sp" && imm !== undefined && imm >= 0) {
        const stored = regs(instruction)[2];
        if (stored === "$ra") savesRa = true;
      }
    }
    if (mnemonic === "sw" && instruction.operands.includes("$ra")) savesRa = true;

    if (mnemonic === "lui") {
      const imm = immediate(instruction);
      const target = ops[0];
      if (target && imm !== undefined) pendingLui = { register: target, value: (imm & 0xffff) << 16 };
      continue;
    }
    if (pendingLui && (mnemonic === "ori" || mnemonic === "addiu" || mnemonic === "addi")) {
      const imm = immediate(instruction);
      const target = ops[0];
      if (target === pendingLui.register && imm !== undefined) {
        const mask = mnemonic === "ori" ? 0xffff : 0xffff;
        const value = (pendingLui.value | (imm & mask)) >>> 0;
        constants.push({ register: pendingLui.register, value });
      }
      pendingLui = null;
    } else if (mnemonic !== "lui") {
      pendingLui = null;
    }
  }

  if (stackFrame === 0) notes.push("No stack frame detected in this range; the function may be a leaf or the range may be truncated.");
  if (returns.length === 0) notes.push("No `jr $ra` found; the range may be truncated or the function ends with an indirect return.");

  return {
    start,
    end: last.address + last.size,
    size: last.address + last.size - start,
    instructionCount: instructions.length,
    basicBlocks: buildBasicBlocks(instructions),
    calls: extractCalls(instructions),
    returns,
    stackFrame,
    savesRa,
    constants,
    registersRead: [...read].sort(),
    registersWritten: [...written].sort(),
    branches,
    notes
  };
}

export type DiscoveredFunction = {
  start: number;
  end: number;
  size: number;
  evidence: string[];
  confidence: "confirmed" | "very_likely" | "possible";
};

export function discoverFunctionsFromBytes(
  buffer: Buffer,
  baseAddress: number,
  options: { minSize?: number; maxSize?: number } = {}
): DiscoveredFunction[] {
  const minSize = options.minSize ?? 8;
  const maxSize = options.maxSize ?? 0x4000;
  const words = Math.floor(buffer.length / 4);
  const candidates: number[] = [];
  for (let index = 0; index < words; index += 1) {
    const word = buffer.readUInt32BE(index * 4);
    const isPrologue = (word & 0xffff0000) === 0x27bd0000;
    const isJrRa = word === 0x03e00008;
    if (isPrologue || isJrRa) candidates.push(index);
  }
  if (candidates.length === 0) return [];

  const functions: DiscoveredFunction[] = [];
  let current: { startWord: number; evidence: string[]; confidence: "confirmed" | "very_likely" | "possible" } | null = null;

  for (let index = 0; index < words; index += 1) {
    const word = buffer.readUInt32BE(index * 4);
    const isPrologue = (word & 0xffff0000) === 0x27bd0000;
    if (isPrologue) {
      if (current) {
        functions.push({
          start: baseAddress + current.startWord * 4,
          end: baseAddress + index * 4,
          size: (index - current.startWord) * 4,
          evidence: current.evidence,
          confidence: current.confidence
        });
      }
      current = {
        startWord: index,
        evidence: [`stack-frame prologue addiu $sp,$sp,-N at 0x${(baseAddress + index * 4).toString(16)}`],
        confidence: "very_likely"
      };
      continue;
    }
    if (current && word === 0x03e00008) {
      current.evidence.push(`jr $ra at 0x${(baseAddress + index * 4).toString(16)}`);
    }
  }
  if (current) {
    functions.push({
      start: baseAddress + current.startWord * 4,
      end: baseAddress + words * 4,
      size: (words - current.startWord) * 4,
      evidence: current.evidence,
      confidence: "possible"
    });
  }

  return functions
    .filter((fn) => fn.size >= minSize && fn.size <= maxSize)
    .sort((a, b) => a.start - b.start);
}

export function collectDirectCallTargets(instructions: MipsInstruction[]): number[] {
  return extractCalls(instructions)
    .filter((call) => call.kind === "direct" && typeof call.target === "number")
    .map((call) => call.target!);
}

export function compareInstructions(a: MipsInstruction[], b: MipsInstruction[]): {
  similarity: number;
  sameMnemonics: number;
  compared: number;
  firstDifference: number | null;
} {
  const compared = Math.min(a.length, b.length);
  let same = 0;
  let firstDifference: number | null = null;
  for (let index = 0; index < compared; index += 1) {
    const left = a[index]!;
    const right = b[index]!;
    if (left.mnemonic === right.mnemonic && shape(left.operands) === shape(right.operands)) same += 1;
    else if (firstDifference === null) firstDifference = index;
  }
  const denominator = Math.max(a.length, b.length) || 1;
  return {
    similarity: same / denominator,
    sameMnemonics: same,
    compared,
    firstDifference
  };
}

function shape(operands: string): string {
  return operands
    .replace(/0x[0-9a-f]+/gi, "IMM")
    .replace(/-?\d+/g, "IMM")
    .replace(/\$[a-z0-9]+/gi, "REG");
}

export function toPseudoC(analysis: FunctionAnalysis, name: string): string {
  const lines: string[] = [];
  lines.push(`// Structural pseudo-C for ${name} (${analysis.basicBlocks.length} basic blocks, ${analysis.instructionCount} instructions)`);
  lines.push("// Derived mechanically from MIPS semantics. Not a decompilation and not guaranteed equivalent.");
  lines.push(`void ${name}(void) {`);
  for (const block of analysis.basicBlocks) {
    lines.push(`label_${block.start.toString(16)}:`);
    for (const instruction of block.instructions) {
      lines.push(`  ${translate(instruction)}`);
    }
    if (block.successors.length === 1) lines.push(`  goto label_${block.successors[0]!.toString(16)};`);
    else if (block.successors.length > 1) {
      lines.push(`  goto (${block.successors.map((target) => `label_${target.toString(16)}`).join(" | ")});`);
    }
  }
  lines.push("}");
  return lines.join("\n");
}

function translate(instruction: MipsInstruction): string {
  const operands = instruction.operands.split(",").map((part) => part.trim());
  const mnemonic = instruction.mnemonic;
  const register = (value: string | undefined) => (value ?? "").replace("$", "");
  switch (mnemonic) {
    case "lui": {
      const imm = immediate(instruction) ?? 0;
      return `${register(operands[0])} = 0x${((imm & 0xffff) << 16).toString(16)};`;
    }
    case "ori":
    case "addiu":
    case "addi": {
      const imm = immediate(instruction) ?? 0;
      const op = mnemonic === "ori" ? "|=" : "+=";
      if (operands.length === 3 && register(operands[0]) === register(operands[1])) {
        return `${register(operands[0])} ${op} 0x${(imm >>> 0).toString(16)};`;
      }
      return `${register(operands[0])} = ${register(operands[1])} ${op === "+=" ? "+" : "|"} 0x${(imm >>> 0).toString(16)};`;
    }
    case "lw":
    case "sw":
    case "lb":
    case "sb":
    case "lh":
    case "sh":
    case "lbu":
    case "lhu": {
      const memory = /(-?0x[0-9a-f]+|-?\d+)?\((\$[a-z0-9]+)\)/i.exec(instruction.operands);
      const offset = memory?.[1] ?? "0";
      const base = register(memory?.[2] ?? "$zero");
      const access = `*(${base} + ${offset})`;
      return mnemonic.startsWith("s") ? `${access} = ${register(operands[0])};` : `${register(operands[0])} = ${access};`;
    }
    case "add":
    case "addu":
    case "sub":
    case "subu":
    case "and":
    case "or":
    case "xor":
    case "sll":
    case "srl":
    case "sra": {
      const symbol = { add: "+", addu: "+", sub: "-", subu: "-", and: "&", or: "|", xor: "^", sll: "<<", srl: ">>", sra: ">>" }[
        mnemonic
      ];
      if (operands.length === 3) {
        const third = /^\d+$/.test(operands[2]!) ? operands[2] : register(operands[2]);
        return `${register(operands[0])} = ${register(operands[1])} ${symbol} ${third};`;
      }
      return instruction.text;
    }
    case "jal":
      return `call(${instruction.operands});`;
    case "jalr":
      return `call_indirect(${instruction.operands});`;
    case "jr":
      return `return ${instruction.operands === "$ra" ? "" : instruction.operands};`;
    case "mult":
    case "multu":
    case "div":
    case "divu":
      return `${instruction.text};`;
    default:
      if (isBranch(instruction)) return `if (${instruction.text}) goto ...;`;
      return `asm("${instruction.text}");`;
  }
}
