import type { MipsInstruction } from "./disasm.js";
import { buildBasicBlocks, isBranch, isCall, isReturn, type BasicBlock } from "./analysis.js";

export type Certainty = "confirmed" | "very_likely" | "possible" | "insufficient";

export type StackSlot = {
  offset: number;
  name: string;
  direction: "load" | "store" | "both";
  accesses: number;
  evidence: string[];
};

export type InferredRegister = {
  register: string;
  role: "argument" | "return" | "constant" | "temporary" | "saved" | "stack_pointer" | "frame_pointer";
  value?: number;
  evidence: string[];
};

export type ControlFlowEdge = {
  from: number;
  to: number;
  kind: "fallthrough" | "branch_taken" | "branch_not_taken" | "call" | "return" | "indirect";
};

export type LoopInfo = {
  header: number;
  blocks: number[];
  kind: "natural" | "irreducible";
  backEdgeFrom: number[];
};

export type FunctionReconstruction = {
  name: string;
  start: number;
  end: number;
  size: number;
  instructionCount: number;
  method: "structural-heuristic";
  pseudocodeKind: "heuristic-pseudocode";
  certainty: Certainty;
  abi: {
    arch: string;
    endian: string;
    returnRegisters: string[];
    argumentRegisters: string[];
    calleeSaved: string[];
    stackPointer: string;
  };
  frame: {
    size: number;
    savesRa: boolean;
    savedRegisters: string[];
    stackSlots: StackSlot[];
    outgoingArgBytes: number;
    balanced: boolean;
  };
  parameters: Array<{ register: string; index: number; evidence: string[] }>;
  returnValues: string[];
  registers: InferredRegister[];
  blocks: BasicBlock[];
  edges: ControlFlowEdge[];
  loops: LoopInfo[];
  calls: Array<{ address: number; target?: number; kind: "direct" | "indirect"; instruction: string }>;
  tailCalls: number[];
  returns: number[];
  pseudoC: string;
  evidence: string[];
  notes: string[];
  limitations: string[];
};

type Operand =
  | { kind: "reg"; reg: string; text: string }
  | { kind: "imm"; imm: number; text: string }
  | { kind: "mem"; base: string; disp: number; text: string }
  | { kind: "other"; text: string };

const ARG_REGS = ["$a0", "$a1", "$a2", "$a3"];
const RETURN_REGS = ["$v0", "$v1"];
const CALLEE_SAVED = ["$s0", "$s1", "$s2", "$s3", "$s4", "$s5", "$s6", "$s7", "$fp", "$ra"];
const STORE_MNEMONICS = /^(s[bwhd]|sq|swc1|sdc1|swl|swr|sdl|sdr)$/;
const LOAD_MNEMONICS = /^(l[bwhd]|lq|lwc1|ldc1|lwl|lwr|ldl|ldr|lbu|lhu)$/;

export function parseOperands(instruction: MipsInstruction): Operand[] {
  return instruction.operands
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(parseOperand);
}

function parseOperand(text: string): Operand {
  const memory = /^(-?(?:0x[0-9a-f]+|\d+))?\((\$[a-z0-9]+)\)$/i.exec(text);
  if (memory) {
    const raw = memory[1] ?? "0";
    const disp = /^0x/i.test(raw) ? Number.parseInt(raw.slice(2), 16) : Number.parseInt(raw, 10);
    return { kind: "mem", base: memory[2]!.toLowerCase(), disp: Number.isFinite(disp) ? disp : 0, text };
  }
  if (/^\$[a-z0-9]+$/i.test(text)) return { kind: "reg", reg: text.toLowerCase(), text };
  if (/^-?0x[0-9a-f]+$/i.test(text)) {
    const value = Number.parseInt(text.replace(/^-?0x/i, ""), 16);
    return { kind: "imm", imm: text.startsWith("-") ? -value : value, text };
  }
  if (/^-?\d+$/.test(text)) return { kind: "imm", imm: Number.parseInt(text, 10), text };
  return { kind: "other", text };
}

function reg(operands: Operand[], index: number): string | undefined {
  const operand = operands[index];
  return operand && operand.kind === "reg" ? operand.reg : undefined;
}

function imm(operands: Operand[], index: number): number | undefined {
  const operand = operands[index];
  return operand && operand.kind === "imm" ? operand.imm : undefined;
}

function mem(operands: Operand[], index: number): Extract<Operand, { kind: "mem" }> | undefined {
  const operand = operands[index];
  return operand && operand.kind === "mem" ? operand : undefined;
}

function branchTarget(instruction: MipsInstruction): number | undefined {
  for (const operand of instruction.operandDetail) {
    if ("imm" in operand && typeof operand.imm === "number") return operand.imm >>> 0;
  }
  const operands = parseOperands(instruction);
  const last = operands[operands.length - 1];
  if (last && last.kind === "imm") return last.imm >>> 0;
  return undefined;
}

function label(address: number): string {
  return `loc_${(address >>> 0).toString(16).padStart(8, "0")}`;
}

function varName(offset: number): string {
  return offset < 0 ? `var_m${Math.abs(offset)}` : `arg_${offset}`;
}

export function reconstructFunction(
  instructions: MipsInstruction[],
  options: { name?: string; arch?: string; endian?: string; abi?: "o32" | "n64" | "ps2" } = {}
): FunctionReconstruction {
  if (instructions.length === 0) throw new Error("Cannot reconstruct an empty instruction list");
  const name = options.name ?? `func_${(instructions[0]!.address >>> 0).toString(16).padStart(8, "0")}`;
  const arch = options.arch ?? "unknown";
  const endian = options.endian ?? "unknown";
  const start = instructions[0]!.address;
  const last = instructions[instructions.length - 1]!;
  const end = last.address + last.size;

  const blocks = buildBasicBlocks(instructions);
  const edges: ControlFlowEdge[] = [];
  const blockByStart = new Map(blocks.map((block) => [block.start, block]));

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    const terminator = block.instructions[block.instructions.length - 1]!;
    const target = branchTarget(terminator);
    const next = blocks[index + 1];
    if (isReturn(terminator)) {
      edges.push({ from: block.start, to: block.end, kind: "return" });
      continue;
    }
    if (isCall(terminator)) {
      if (target !== undefined) edges.push({ from: block.start, to: target, kind: "call" });
      else edges.push({ from: block.start, to: block.end, kind: "indirect" });
      if (next) edges.push({ from: block.start, to: next.start, kind: "fallthrough" });
      continue;
    }
    if (isBranch(terminator)) {
      const unconditional = /^(j|b|bal)$/.test(terminator.mnemonic);
      if (target !== undefined) {
        edges.push({ from: block.start, to: target, kind: "branch_taken" });
        if (!unconditional && next) edges.push({ from: block.start, to: next.start, kind: "branch_not_taken" });
      } else {
        edges.push({ from: block.start, to: block.end, kind: "indirect" });
      }
      continue;
    }
    if (next) edges.push({ from: block.start, to: next.start, kind: "fallthrough" });
  }

  const stackSlots = new Map<number, StackSlot>();
  const savedRegisters = new Set<string>();
  const parameters: Array<{ register: string; index: number; evidence: string[] }> = [];
  const parameterSeen = new Set<string>();
  const returns: number[] = [];
  const calls: FunctionReconstruction["calls"] = [];
  const tailCalls: number[] = [];
  const constants = new Map<string, { value: number; evidence: string[] }>();
  const registerRoles = new Map<string, InferredRegister>();
  const notes: string[] = [];
  const evidence: string[] = [];

  let frameSize = 0;
  let savesRa = false;
  let spDelta = 0;
  let pendingLui: { register: string; value: number; address: number } | null = null;
  let outgoingArgBytes = 0;

  const noteRegister = (register: string, role: InferredRegister["role"], item: string) => {
    const existing = registerRoles.get(register);
    if (existing) {
      if (!existing.evidence.includes(item)) existing.evidence.push(item);
      return;
    }
    registerRoles.set(register, { register, role, evidence: [item] });
  };

  for (const instruction of instructions) {
    const operands = parseOperands(instruction);
    const mnemonic = instruction.mnemonic;
    const text = instruction.text;
    const addressHex = `0x${(instruction.address >>> 0).toString(16).padStart(8, "0")}`;

    if (isReturn(instruction)) returns.push(instruction.address);

    if (mnemonic === "lui") {
      const target = reg(operands, 0);
      const value = imm(operands, 1);
      if (target && value !== undefined) pendingLui = { register: target, value: (value & 0xffff) << 16, address: instruction.address };
    } else if (pendingLui) {
      const target = reg(operands, 0);
      const value = imm(operands, 1);
      const source = reg(operands, 1);
      if (target === pendingLui.register && value !== undefined && (mnemonic === "ori" || mnemonic === "addiu" || mnemonic === "addi")) {
        const combined = (pendingLui.value | (value & 0xffff)) >>> 0;
        const existing = constants.get(target);
        constants.set(target, {
          value: combined,
          evidence: [...(existing?.evidence ?? []), `lui+${mnemonic} at ${addressHex}`]
        });
      }
      pendingLui = null;
      if (source) noteRegister(source, "temporary", `${mnemonic} at ${addressHex}`);
    }

    if (mnemonic === "addiu" || mnemonic === "addi") {
      const target = reg(operands, 0);
      const source = reg(operands, 1);
      const value = imm(operands, 2);
      if (target === "$sp" && source === "$sp" && value !== undefined) {
        frameSize = Math.max(frameSize, Math.abs(value));
        spDelta += value;
      }
      if (source) noteRegister(source, "temporary", `${mnemonic} at ${addressHex}`);
    }

    const memory = mem(operands, operands.length - 1);
    if (memory && (memory.base === "$sp" || memory.base === "$fp")) {
      const slot = stackSlots.get(memory.disp) ?? {
        offset: memory.disp,
        name: varName(memory.disp),
        direction: "store" as const,
        accesses: 0,
        evidence: []
      };
      slot.accesses += 1;
      if (STORE_MNEMONICS.test(mnemonic)) {
        slot.direction = slot.direction === "load" ? "both" : "store";
        const stored = reg(operands, 0);
        if (stored && CALLEE_SAVED.includes(stored)) savedRegisters.add(stored);
        if (stored === "$ra") savesRa = true;
        if (stored && ARG_REGS.includes(stored)) {
          const index = ARG_REGS.indexOf(stored);
          if (!parameterSeen.has(stored)) {
            parameterSeen.add(stored);
            parameters.push({ register: stored, index, evidence: [`spilled at ${addressHex} (${text})`] });
          }
        }
        if (memory.disp >= 0 && stored && ARG_REGS.includes(stored)) {
          outgoingArgBytes = Math.max(outgoingArgBytes, memory.disp + 4);
        }
      } else if (LOAD_MNEMONICS.test(mnemonic)) {
        slot.direction = slot.direction === "store" ? "both" : "load";
        const loaded = reg(operands, 0);
        if (loaded && ARG_REGS.includes(loaded)) {
          const index = ARG_REGS.indexOf(loaded);
          if (!parameterSeen.has(loaded)) {
            parameterSeen.add(loaded);
            parameters.push({ register: loaded, index, evidence: [`loaded from caller frame at ${addressHex} (${text})`] });
          }
        }
      }
      slot.evidence.push(`${mnemonic} at ${addressHex}`);
      stackSlots.set(memory.disp, slot);
    }

    if (isCall(instruction)) {
      const target = branchTarget(instruction);
      calls.push({ address: instruction.address, target, kind: mnemonic === "jal" ? "direct" : "indirect", instruction: text });
      if (mnemonic === "jal" && /^(j|b)$/.test(blocks.find((block) => block.start <= instruction.address && instruction.address < block.end)?.terminator.split(" ")[0] ?? "")) {
        tailCalls.push(instruction.address);
      }
    }

    for (const operand of operands) {
      if (operand.kind !== "reg") continue;
      if (ARG_REGS.includes(operand.reg) && !parameterSeen.has(operand.reg) && !STORE_MNEMONICS.test(mnemonic)) {
        parameterSeen.add(operand.reg);
        parameters.push({
          register: operand.reg,
          index: ARG_REGS.indexOf(operand.reg),
          evidence: [`read before spill at ${addressHex} (${text})`]
        });
      }
    }
  }

  for (const [register, constant] of constants) {
    noteRegister(register, "constant", `constant 0x${constant.value.toString(16)} from ${constant.evidence.join(", ")}`);
    const entry = registerRoles.get(register);
    if (entry) entry.value = constant.value;
  }
  for (const register of savedRegisters) noteRegister(register, "saved", "callee-saved register stored in frame");
  if (frameSize > 0) noteRegister("$sp", "stack_pointer", `frame allocated with addiu $sp,$sp,-${frameSize}`);
  if (returns.length > 0) noteRegister("$ra", "return", "jr $ra return instruction");

  const loops = detectLoops(blocks, edges);
  const balanced = frameSize === 0 ? spDelta === 0 : true;
  const certainty = certaintyFor(instructions, returns, frameSize, blocks.length);
  const returnValues = inferReturnValues(instructions, returns);

  if (parameters.length === 0) notes.push("No argument registers read: the function may take no arguments or the range may be truncated.");
  if (returns.length === 0) notes.push("No `jr $ra` found: the range may be truncated or the function returns indirectly.");
  if (!balanced) notes.push(`Stack pointer delta is ${spDelta} but frame size is ${frameSize}; the prologue/epilogue pair may be incomplete.`);
  if (loops.length > 0) evidence.push(`${loops.length} natural loop(s) detected from backward edges.`);
  if (savesRa) evidence.push("$ra is saved to the stack, so this is a non-leaf function.");
  if (calls.length > 0) evidence.push(`${calls.length} call site(s) found.`);

  const pseudoC = renderPseudoC({ name, blocks, edges, instructions, frameSize, parameters, returnValues, stackSlots, loops, calls });

  return {
    name,
    start,
    end,
    size: end - start,
    instructionCount: instructions.length,
    method: "structural-heuristic",
    pseudocodeKind: "heuristic-pseudocode",
    certainty,
    abi: {
      arch,
      endian,
      returnRegisters: RETURN_REGS,
      argumentRegisters: ARG_REGS,
      calleeSaved: CALLEE_SAVED,
      stackPointer: "$sp"
    },
    frame: {
      size: frameSize,
      savesRa,
      savedRegisters: [...savedRegisters].sort(),
      stackSlots: [...stackSlots.values()].sort((a, b) => a.offset - b.offset),
      outgoingArgBytes,
      balanced
    },
    parameters: parameters.sort((a, b) => a.index - b.index),
    returnValues,
    registers: [...registerRoles.values()].sort((a, b) => a.register.localeCompare(b.register)),
    blocks,
    edges,
    loops,
    calls,
    tailCalls,
    returns,
    pseudoC,
    evidence,
    notes,
    limitations: [
      "Pseudo-C is generated mechanically from instruction semantics; it is not recovered source code.",
      "No type inference, no variable coalescing and no inlining are performed.",
      "Indirect calls and jump tables are reported but not resolved.",
      "Confirm behaviour by differential testing or emulator tracing, never by reading the pseudo-C alone."
    ]
  };
}

function certaintyFor(instructions: MipsInstruction[], returns: number[], frameSize: number, blocks: number): Certainty {
  if (instructions.length < 2) return "insufficient";
  if (returns.length === 0) return "possible";
  if (blocks < 1) return "possible";
  return frameSize > 0 ? "very_likely" : "possible";
}

function inferReturnValues(instructions: MipsInstruction[], returns: number[]): string[] {
  const values = new Set<string>();
  for (const instruction of instructions) {
    const operands = parseOperands(instruction);
    const target = reg(operands, 0);
    if (target && RETURN_REGS.includes(target) && !LOAD_MNEMONICS.test(instruction.mnemonic)) values.add(target);
  }
  if (returns.length > 0 && values.size === 0) values.add("$v0");
  return [...values].sort();
}

function detectLoops(blocks: BasicBlock[], edges: ControlFlowEdge[]): LoopInfo[] {
  const blockStarts = new Set(blocks.map((block) => block.start));
  const backEdges = edges.filter((edge) => edge.kind === "branch_taken" && blockStarts.has(edge.to) && edge.to <= edge.from);
  if (backEdges.length === 0) return [];
  const byHeader = new Map<number, number[]>();
  for (const edge of backEdges) {
    const list = byHeader.get(edge.to) ?? [];
    list.push(edge.from);
    byHeader.set(edge.to, list);
  }
  const loops: LoopInfo[] = [];
  for (const [header, sources] of byHeader) {
    const members = new Set<number>([header]);
    const queue = [...sources];
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (members.has(current)) continue;
      members.add(current);
      for (const edge of edges) {
        if (edge.to === current && blockStarts.has(edge.from) && !members.has(edge.from)) queue.push(edge.from);
      }
    }
    loops.push({ header, blocks: [...members].sort((a, b) => a - b), kind: "natural", backEdgeFrom: sources.sort((a, b) => a - b) });
  }
  return loops.sort((a, b) => a.header - b.header);
}

function renderPseudoC(input: {
  name: string;
  blocks: BasicBlock[];
  edges: ControlFlowEdge[];
  instructions: MipsInstruction[];
  frameSize: number;
  parameters: Array<{ register: string; index: number }>;
  returnValues: string[];
  stackSlots: Map<number, StackSlot>;
  loops: LoopInfo[];
  calls: Array<{ target?: number; kind: string }>;
}): string {
  const lines: string[] = [];
  lines.push(`// heuristic-pseudocode for ${input.name}: derived from MIPS semantics, NOT decompiled source.`);
  lines.push(`// certainty: structural; validate behaviour with tests or an emulator.`);
  const args = input.parameters.length > 0 ? input.parameters.map((parameter) => `arg${parameter.index}`).join(", ") : "void";
  lines.push(`int ${input.name}(${args}) {`);
  if (input.frameSize > 0) lines.push(`  // stack frame: ${input.frameSize} bytes`);
  const slotNames = [...input.stackSlots.values()].filter((slot) => slot.offset < 0).map((slot) => slot.name);
  if (slotNames.length > 0) lines.push(`  // stack locals: ${slotNames.join(", ")}`);
  if (input.loops.length > 0) lines.push(`  // loops: ${input.loops.map((loop) => label(loop.header)).join(", ")}`);

  const edgeByFrom = new Map<number, ControlFlowEdge[]>();
  for (const edge of input.edges) {
    const list = edgeByFrom.get(edge.from) ?? [];
    list.push(edge);
    edgeByFrom.set(edge.from, list);
  }

  for (const block of input.blocks) {
    lines.push(`${label(block.start)}:`);
    const terminator = block.instructions[block.instructions.length - 1]!;
    const body = isBranch(terminator) || isReturn(terminator) || isCall(terminator) ? block.instructions.slice(0, -1) : block.instructions;
    for (const instruction of body) lines.push(`  ${translateInstruction(instruction)}`);
    const outgoing = edgeByFrom.get(block.start) ?? [];
    const target = branchTarget(terminator);
    if (isReturn(terminator)) {
      lines.push(`  return ${input.returnValues[0]?.replace("$", "") ?? "0"};`);
      continue;
    }
    if (isCall(terminator)) {
      lines.push(`  ${translateInstruction(terminator)}`);
      const fallthrough = outgoing.find((edge) => edge.kind === "fallthrough");
      if (fallthrough) lines.push(`  goto ${label(fallthrough.to)};`);
      continue;
    }
    if (isBranch(terminator)) {
      const unconditional = /^(j|b|bal)$/.test(terminator.mnemonic);
      if (target !== undefined) {
        if (unconditional) {
          lines.push(`  goto ${label(target)};`);
        } else {
          lines.push(`  if (${conditionFor(terminator, target)}) goto ${label(target)};`);
          const fallthrough = outgoing.find((edge) => edge.kind === "branch_not_taken");
          if (fallthrough) lines.push(`  goto ${label(fallthrough.to)};`);
        }
      } else {
        lines.push(`  goto *(${terminator.operands});`);
      }
      continue;
    }
    const fallthrough = outgoing.find((edge) => edge.kind === "fallthrough");
    if (fallthrough) lines.push(`  goto ${label(fallthrough.to)};`);
  }
  lines.push("}");
  return lines.join("\n");
}

function conditionFor(instruction: MipsInstruction, target: number): string {
  const operands = parseOperands(instruction);
  const left = reg(operands, 0)?.replace("$", "") ?? "0";
  const right = reg(operands, 1)?.replace("$", "");
  const value = imm(operands, 1);
  switch (instruction.mnemonic) {
    case "beq":
    case "beql":
      return value !== undefined ? `${left} == ${value}` : `${left} == ${right ?? "0"}`;
    case "bne":
    case "bnel":
      return value !== undefined ? `${left} != ${value}` : `${left} != ${right ?? "0"}`;
    case "beqz":
      return `${left} == 0`;
    case "bnez":
      return `${left} != 0`;
    case "bgez":
    case "bgezal":
      return `${left} >= 0`;
    case "bgtz":
      return `${left} > 0`;
    case "blez":
      return `${left} <= 0`;
    case "bltz":
    case "bltzal":
      return `${left} < 0`;
    case "bc1t":
      return "fp_condition";
    case "bc1f":
      return "!fp_condition";
    default:
      return `${instruction.mnemonic}(${instruction.operands}) /* target ${label(target)} */`;
  }
}

function translateInstruction(instruction: MipsInstruction): string {
  const operands = parseOperands(instruction);
  const mnemonic = instruction.mnemonic;
  const r = (index: number) => (reg(operands, index) ?? `unknown${index}`).replace("$", "");
  const value = (index: number) => imm(operands, index);

  if (mnemonic === "lui") return `${r(0)} = 0x${(((value(1) ?? 0) & 0xffff) << 16).toString(16)};`;
  if (mnemonic === "ori" || mnemonic === "addiu" || mnemonic === "addi") {
    const immediateValue = value(2) ?? 0;
    const operator = mnemonic === "ori" ? "|" : "+";
    return `${r(0)} = ${r(1)} ${operator} 0x${(immediateValue >>> 0).toString(16)};`;
  }
  if (mnemonic === "lw" || mnemonic === "sw" || mnemonic === "lb" || mnemonic === "sb" || mnemonic === "lh" || mnemonic === "sh" || mnemonic === "lbu" || mnemonic === "lhu" || mnemonic === "ld" || mnemonic === "sd" || mnemonic === "lq" || mnemonic === "sq") {
    const memory = mem(operands, operands.length - 1);
    const base = (memory?.base ?? "$zero").replace("$", "");
    const offset = memory?.disp ?? 0;
    const access = `MEM_${base}[${offset}]`;
    return STORE_MNEMONICS.test(mnemonic) ? `${access} = ${r(0)};` : `${r(0)} = ${access};`;
  }
  const binary: Record<string, string> = {
    add: "+", addu: "+", dadd: "+", daddu: "+",
    sub: "-", subu: "-", dsub: "-", dsubu: "-",
    and: "&", or: "|", xor: "^", nor: "~|",
    sll: "<<", srl: ">>", sra: ">>", dsll: "<<", dsrl: ">>", dsra: ">>",
    slt: "<", sltu: "<", slti: "<", sltiu: "<"
  };
  if (binary[mnemonic] && operands.length >= 3) {
    const third = value(2) !== undefined ? String(value(2)) : r(2);
    return `${r(0)} = ${r(1)} ${binary[mnemonic]} ${third};`;
  }
  if (mnemonic === "mult" || mnemonic === "multu" || mnemonic === "div" || mnemonic === "divu" || mnemonic === "dmult" || mnemonic === "ddiv") {
    return `${mnemonic.toUpperCase()}_RESULT = ${r(0)} ${mnemonic.startsWith("d") ? mnemonic.slice(1) : mnemonic} ${r(1)};`;
  }
  if (mnemonic === "mfhi") return `${r(0)} = HI;`;
  if (mnemonic === "mflo") return `${r(0)} = LO;`;
  if (mnemonic === "jal") {
    const target = branchTarget(instruction);
    return `sub_${target !== undefined ? (target >>> 0).toString(16).padStart(8, "0") : "unknown"}(${ARG_REGS.map((entry) => entry.replace("$", "")).join(", ")}); /* args not verified */`;
  }
  if (mnemonic === "jalr") return `CALL_INDIRECT(${instruction.operands});`;
  if (mnemonic === "nop") return `;`;
  if (mnemonic === "syscall") return `/* syscall ${instruction.operands} */;`;
  if (mnemonic === "break") return `/* break ${instruction.operands} */;`;
  return `asm("${instruction.text.replace(/"/g, '\\"')}");`;
}
