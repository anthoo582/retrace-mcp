import type { MipsInstruction } from "../mips/disasm.js";

export type VariableKind = "argument" | "return" | "stack_local" | "global" | "saved_register" | "struct_field" | "temporary";

export type VariableCandidate = {
  key: string;
  name: string;
  suggestions: string[];
  kind: VariableKind;
  storage: string;
  offset?: number;
  type: string;
  width: number;
  confidence: "high" | "medium" | "low";
  evidence: string[];
};

export type StructCandidate = {
  name: string;
  baseRegister: string;
  fields: Array<{ offset: number; name: string; type: string; width: number; accesses: number; evidence: string[] }>;
  confidence: "high" | "medium" | "low";
};

const MEMORY = /(-?0x[0-9a-f]+|-?\d+)\(\$?([a-z][a-z0-9]*)\)/i;
const REGISTER = /\$([a-z][a-z0-9]*)/gi;

function parseOffset(raw: string): number {
  return raw.toLowerCase().startsWith("-0x") ? -Number.parseInt(raw.slice(3), 16) : raw.toLowerCase().startsWith("0x") ? Number.parseInt(raw.slice(2), 16) : Number.parseInt(raw, 10);
}

function accessType(mnemonic: string): { type: string; width: number; confidence: VariableCandidate["confidence"] } {
  const op = mnemonic.toLowerCase();
  if (op === "lwc1" || op === "swc1") return { type: "float", width: 4, confidence: "high" };
  if (op === "ldc1" || op === "sdc1") return { type: "double", width: 8, confidence: "high" };
  if (op === "lb" || op === "sb") return { type: "int8_t", width: 1, confidence: "medium" };
  if (op === "lbu" || op === "sbu") return { type: "uint8_t", width: 1, confidence: "medium" };
  if (op === "lh" || op === "sh") return { type: "int16_t", width: 2, confidence: "medium" };
  if (op === "lhu" || op === "shu") return { type: "uint16_t", width: 2, confidence: "medium" };
  if (op === "ld" || op === "sd" || op === "ldl" || op === "ldr" || op === "sdl" || op === "sdr") return { type: "uint64_t", width: 8, confidence: "low" };
  return { type: "uint32_t_or_pointer", width: 4, confidence: "low" };
}

function kindFor(base: string): VariableKind {
  if (base === "sp" || base === "fp" || base === "s8") return "stack_local";
  if (base === "gp") return "global";
  return "struct_field";
}

function suggestion(kind: VariableKind, base: string, offset: number): string {
  if (kind === "stack_local") return `local_${offset < 0 ? "minus_" : ""}${Math.abs(offset).toString(16)}`;
  if (kind === "global") return `global_${offset.toString(16)}`;
  return `${base}_field_${offset.toString(16)}`;
}

export function inferVariables(instructions: MipsInstruction[]): VariableCandidate[] {
  const map = new Map<string, VariableCandidate>();
  const registerEvidence = new Map<string, string[]>();
  for (const instruction of instructions) {
    const memory = MEMORY.exec(instruction.operands);
    if (memory) {
      const offset = parseOffset(memory[1]!);
      const base = memory[2]!.toLowerCase();
      const key = `${base}:${offset}`;
      const type = accessType(instruction.mnemonic);
      const kind = kindFor(base);
      const evidence = `${instruction.text} @ 0x${instruction.address.toString(16)}`;
      const previous = map.get(key);
      if (previous) {
        previous.evidence.push(evidence);
        if (previous.type !== type.type) {
          previous.type = "ambiguous";
          previous.confidence = "low";
        }
      } else {
        const name = suggestion(kind, base, offset);
        map.set(key, { key, name, suggestions: [name], kind, storage: `$${base}${offset >= 0 ? "+" : ""}${offset}`, offset, type: type.type, width: type.width, confidence: type.confidence, evidence: [evidence] });
      }
    }
    for (const match of instruction.operands.matchAll(REGISTER)) {
      const reg = match[1]!.toLowerCase();
      const evidence = `${instruction.text} @ 0x${instruction.address.toString(16)}`;
      registerEvidence.set(reg, [...(registerEvidence.get(reg) ?? []), evidence]);
    }
  }
  for (const [reg, evidence] of registerEvidence) {
    if (/^a[0-3]$/.test(reg)) map.set(`reg:${reg}`, { key: `reg:${reg}`, name: `arg${reg.slice(1)}`, suggestions: [`arg${reg.slice(1)}`, `input_${reg.slice(1)}`], kind: "argument", storage: `$${reg}`, type: "uint32_t_or_pointer", width: 4, confidence: "medium", evidence });
    else if (/^v[01]$/.test(reg)) map.set(`reg:${reg}`, { key: `reg:${reg}`, name: `return_${reg}`, suggestions: [`return_${reg}`, "result"], kind: "return", storage: `$${reg}`, type: "uint32_t_or_pointer", width: 4, confidence: "medium", evidence });
    else if (/^s[0-7]$/.test(reg)) map.set(`reg:${reg}`, { key: `reg:${reg}`, name: `saved_${reg}`, suggestions: [`saved_${reg}`, "context"], kind: "saved_register", storage: `$${reg}`, type: "uint32_t_or_pointer", width: 4, confidence: "low", evidence });
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function inferStructs(variables: VariableCandidate[]): StructCandidate[] {
  const groups = new Map<string, VariableCandidate[]>();
  for (const variable of variables) {
    if (variable.kind !== "struct_field") continue;
    const base = variable.storage.match(/^\$([a-z0-9]+)/i)?.[1]?.toLowerCase();
    if (!base || variable.offset === undefined) continue;
    groups.set(base, [...(groups.get(base) ?? []), variable]);
  }
  return [...groups.entries()].map(([baseRegister, fields]) => ({
    name: `struct_${baseRegister}_candidate`,
    baseRegister,
    fields: fields.sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0)).map((field) => ({ offset: field.offset!, name: field.name, type: field.type, width: field.width, accesses: field.evidence.length, evidence: field.evidence })),
    confidence: fields.length >= 2 ? "medium" : "low"
  }));
}

export function validateVariableMap(variables: VariableCandidate[]) {
  const errors: string[] = [];
  const names = new Map<string, string>();
  for (const variable of variables) {
    const previous = names.get(variable.name);
    if (previous && previous !== variable.key) errors.push(`duplicate name '${variable.name}' for ${previous} and ${variable.key}`);
    names.set(variable.name, variable.key);
    if (variable.offset !== undefined && variable.width > 1 && Math.abs(variable.offset) % Math.min(variable.width, 4) !== 0) errors.push(`${variable.key} is not naturally aligned for ${variable.type}`);
    if (variable.type === "ambiguous") errors.push(`${variable.key} has conflicting access types`);
  }
  return { valid: errors.length === 0, errors, notes: ["Validation checks naming, alignment and conflicting observations; it does not prove semantic types."] };
}
