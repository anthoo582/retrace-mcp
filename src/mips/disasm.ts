import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { execFile } from "../core/exec.js";
import { AdapterUnavailableError, requireAdapter } from "../adapters/registry.js";

export type MipsArch = "r4300i" | "r5900" | "r5900-mmi" | "mips32" | "mips32r2" | "mips64" | "mips1" | "mips2" | "mips3";
export type Endian = "little" | "big";

export type MipsOperand =
  | { type: string; reg?: string }
  | { type: string; imm?: number }
  | { type: string; base?: string | null; index?: string | null; disp?: number };

export type MipsInstruction = {
  address: number;
  size: number;
  bytes: string;
  mnemonic: string;
  operands: string;
  operandDetail: MipsOperand[];
  groups: string[];
  text: string;
};

export type DisasmResult = {
  architecture: MipsArch;
  endian: Endian;
  address: number;
  decoded: number;
  consumedBytes: number;
  instructions: MipsInstruction[];
  notes: string[];
};

export const ARCH_PROFILES: Record<MipsArch, { cpu: string; defaultEndian: Endian; notes: string }> = {
  r4300i: {
    cpu: "NEC VR4300 (MIPS III, 32-bit, big-endian, CP0/CP1)",
    defaultEndian: "big",
    notes: "N64 code is MIPS III big-endian. No MMI, no VU, no macro mode."
  },
  r5900: {
    cpu: "Emotion Engine core (MIPS III + MMI, little-endian, 128-bit GPR aliases)",
    defaultEndian: "little",
    notes: "PS2 EE code is little-endian. VU0/VU1 are separate ISA and are not decoded here."
  },
  "r5900-mmi": {
    cpu: "Emotion Engine core with MMI macro instructions",
    defaultEndian: "little",
    notes: "Capstone does not implement every MMI encoding; undecoded words are reported verbatim, never guessed."
  },
  mips32: { cpu: "Generic MIPS32", defaultEndian: "big", notes: "Generic profile; no N64/PS2 ABI assumptions." },
  "mips32r2": { cpu: "Generic MIPS32r2", defaultEndian: "big", notes: "Generic profile." },
  mips64: { cpu: "Generic MIPS64", defaultEndian: "big", notes: "Generic profile." },
  mips1: { cpu: "MIPS I", defaultEndian: "big", notes: "Legacy profile." },
  mips2: { cpu: "MIPS II", defaultEndian: "big", notes: "Legacy profile." },
  mips3: { cpu: "MIPS III", defaultEndian: "big", notes: "Generic MIPS III profile." }
};

function scriptPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "py", "mips_disasm.py");
}

export async function disassemble(
  code: Buffer,
  address: number,
  options: { arch?: MipsArch; endian?: Endian; count?: number } = {}
): Promise<DisasmResult> {
  const arch = options.arch ?? "r5900";
  const endian = options.endian ?? ARCH_PROFILES[arch]?.defaultEndian ?? "little";
  await requireAdapter("capstone");
  const count = Math.min(Math.max(options.count ?? Math.floor(code.length / 4), 1), 20000);
  const request = JSON.stringify({
    arch,
    endian,
    address,
    count,
    code_base64: code.subarray(0, count * 4).toString("base64")
  });
  const result = await execFile(config.pythonBin, [scriptPath()], {
    input: request,
    timeoutMs: 120000,
    maxBytes: 64 * 1024 * 1024
  });
  if (result.code !== 0) {
    throw new Error(`Capstone bridge failed (exit ${result.code}): ${result.stderr.trim() || result.stdout.trim()}`);
  }
  let parsed: { ok: boolean; data?: DisasmResult; error?: { code: string; message: string } };
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Capstone bridge returned non-JSON output: ${result.stdout.slice(0, 400)}`);
  }
  if (!parsed.ok || !parsed.data) {
    throw new Error(`Capstone bridge error: ${parsed.error?.code ?? "unknown"} ${parsed.error?.message ?? ""}`.trim());
  }
  const data = parsed.data;
  return {
    ...data,
    instructions: data.instructions.map((instruction) => ({
      ...instruction,
      text: `${instruction.mnemonic} ${instruction.operands}`.trim()
    }))
  };
}

export async function disassembleFile(
  filePath: string,
  address: number,
  options: { arch?: MipsArch; endian?: Endian; count?: number } = {}
): Promise<DisasmResult> {
  const { readFileCapped } = await import("../security/paths.js");
  const count = options.count ?? 64;
  const code = await readFileCapped(filePath, 0, count * 4);
  return disassemble(code, address, options);
}

export function endianForArch(arch: MipsArch): Endian {
  return ARCH_PROFILES[arch]?.defaultEndian ?? "little";
}

export { AdapterUnavailableError };
