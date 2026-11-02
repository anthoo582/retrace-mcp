import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerTool } from "./helpers.js";
import { disassemble, type Endian, type MipsArch } from "../mips/disasm.js";
import { compareInstructions, rankCandidates } from "../compare/engine.js";
import { EquivalenceRegistry } from "../compare/registry.js";
import { ElfFile } from "../parsers/elf.js";
import { readFileCapped, resolveInWorkspace } from "../security/paths.js";
import { config } from "../config.js";
import { ok } from "../core/evidence.js";

const sourceSchema = z.object({
  hex: z.string().optional().describe("Raw function bytes as hex"),
  path: z.string().optional().describe("ELF file in the workspace"),
  symbol: z.string().optional().describe("Function symbol name inside the ELF"),
  address: z.string().optional().describe("Function start address when reading from a path without a symbol"),
  size: z.number().int().positive().optional().describe("Byte length when reading from an address"),
  arch: z.enum(["r4300i", "r5900", "r5900-mmi", "mips32", "mips64", "mips3"]).optional(),
  endian: z.enum(["little", "big"]).optional()
});

type SourceInput = z.infer<typeof sourceSchema>;

type ResolvedFunction = {
  bytes: Buffer;
  address: number;
  arch: MipsArch;
  endian: Endian;
  label: string;
  notes: string[];
};

function resolveEndian(input: SourceInput): Endian {
  if (input.endian) return input.endian;
  const arch = input.arch ?? "r4300i";
  return arch === "r4300i" || arch === "mips64" || arch === "mips3" ? "big" : "little";
}

async function resolveFunction(input: SourceInput, side: "target" | "candidate"): Promise<ResolvedFunction> {
  const notes: string[] = [];
  const arch = (input.arch ?? "r4300i") as MipsArch;
  const endian = resolveEndian(input);
  if (input.hex) {
    const bytes = Buffer.from(input.hex.replace(/[^0-9a-fA-F]/g, ""), "hex");
    if (bytes.length === 0) throw new Error(`${side}: hex input is empty`);
    const address = input.address ? Number.parseInt(input.address.replace(/^0x/i, ""), 16) : 0;
    notes.push(`${side}: raw hex input (${bytes.length} bytes); addresses are relative to the supplied base.`);
    return { bytes, address, arch, endian, label: `${side}:hex`, notes };
  }
  if (!input.path) throw new Error(`${side}: provide either hex or an ELF path.`);
  if (!input.symbol && !input.address) throw new Error(`${side}: an ELF path needs a symbol or an address.`);
  const fullPath = resolveInWorkspace(input.path);
  const buffer = await readFileCapped(fullPath);
  const elf = ElfFile.fromBuffer(buffer);
  const section = (address: number) =>
    elf.sections.find(
      (entry) => entry.allocated && address >= entry.addr && address < entry.addr + Math.max(entry.size, 1)
    );
  let start: number;
  let size: number;
  let label: string;
  if (input.symbol) {
    const symbol = [...elf.symbols, ...elf.dynamicSymbols].find((entry) => entry.name === input.symbol);
    if (!symbol) throw new Error(`${side}: symbol '${input.symbol}' not found in ${input.path}`);
    start = symbol.value;
    size = symbol.size;
    label = symbol.name;
    if (size === 0) {
      const sameSection = [...elf.symbols, ...elf.dynamicSymbols]
        .filter((entry) => entry.section === symbol.section && entry.value > start)
        .sort((a, b) => a.value - b.value);
      const next = sameSection[0];
      const owningSection = section(start);
      size = Math.max(4, Math.min(next ? next.value - start : owningSection ? owningSection.addr + owningSection.size - start : 0, 64 * 1024));
      notes.push(`${side}: symbol has size 0; inferred ${size} bytes from the next symbol or section end.`);
    }
  } else {
    start = Number.parseInt(input.address!.replace(/^0x/i, ""), 16);
    if (!Number.isFinite(start)) throw new Error(`${side}: invalid address '${input.address}'`);
    const owningSection = section(start);
    if (!owningSection) throw new Error(`${side}: address 0x${start.toString(16)} is not inside an allocated section.`);
    size = input.size ?? Math.min(owningSection.addr + owningSection.size - start, 64 * 1024);
    if (!input.size) notes.push(`${side}: no size given; read ${size} bytes to the end of the section.`);
    label = `sub_${start.toString(16)}`;
  }
  const owningSection = section(start);
  if (!owningSection) throw new Error(`${side}: 0x${start.toString(16)} is not inside an allocated section.`);
  const offset = owningSection.offset + (start - owningSection.addr);
  if (offset < 0 || offset + size > buffer.length) throw new Error(`${side}: function bytes fall outside the file.`);
  notes.push(`${side}: read ${size} bytes from ${owningSection.name} at 0x${start.toString(16)}.`);
  return { bytes: buffer.subarray(offset, offset + size), address: start, arch, endian, label, notes };
}

async function loadInstructions(resolved: ResolvedFunction) {
  const disasm = await disassemble(resolved.bytes, resolved.address, { arch: resolved.arch, endian: resolved.endian });
  return disasm.instructions;
}

export function registerCompareTools(server: McpServer): void {
  registerTool(
    server,
    "compare_functions",
    "Compare two functions across N64 (R4300i) and PS2 (R5900) by canonical instruction shape. Returns exact|structural|probable|unknown and never claims confirmed equivalence.",
    {
      target: sourceSchema.describe("Reference function (usually N64)"),
      candidate: sourceSchema.describe("Function to compare (usually PS2)"),
      stackFrameTarget: z.number().int().nonnegative().optional(),
      stackFrameCandidate: z.number().int().nonnegative().optional()
    },
    async ({ target, candidate, stackFrameTarget, stackFrameCandidate }) => {
      const [left, right] = await Promise.all([resolveFunction(target, "target"), resolveFunction(candidate, "candidate")]);
      const [leftInstructions, rightInstructions] = await Promise.all([loadInstructions(left), loadInstructions(right)]);
      const comparison = compareInstructions(leftInstructions, rightInstructions, {
        labelA: left.label,
        labelB: right.label,
        stackFrameA: stackFrameTarget,
        stackFrameB: stackFrameCandidate
      });
      return ok({
        target: { label: left.label, address: `0x${left.address.toString(16)}`, arch: left.arch, endian: left.endian, bytes: left.bytes.length },
        candidate: { label: right.label, address: `0x${right.address.toString(16)}`, arch: right.arch, endian: right.endian, bytes: right.bytes.length },
        comparison,
        notes: [...left.notes, ...right.notes, "Equivalence is not confirmed by this tool; record evidence with equivalence_record."]
      });
    }
  );

  registerTool(
    server,
    "compare_rank",
    "Rank candidate functions against a reference by canonical instruction-shape similarity.",
    {
      target: sourceSchema,
      candidates: z.array(sourceSchema.extend({ name: z.string().describe("Label for this candidate") })).min(1).max(200),
      limit: z.number().int().positive().max(200).optional()
    },
    async ({ target, candidates, limit }) => {
      const left = await resolveFunction(target, "target");
      const leftInstructions = await loadInstructions(left);
      const resolved = await Promise.all(
        candidates.map(async (candidate) => ({ name: candidate.name, resolved: await resolveFunction(candidate, "candidate") }))
      );
      const withInstructions = await Promise.all(
        resolved.map(async (entry) => ({ name: entry.name, address: entry.resolved.address, instructions: await loadInstructions(entry.resolved) }))
      );
      const ranked = rankCandidates(leftInstructions, withInstructions, { limit: limit ?? 25 });
      return ok({ target: left.label, ranked, notes: ["Ranking is heuristic shape matching, not proof of equivalence."] });
    }
  );

  registerTool(
    server,
    "equivalence_record",
    "Record a CONFIRMED N64<->PS2 function equivalence with mandatory evidence. Only this tool can mark equivalence as confirmed.",
    {
      workspace: z.string().optional().describe("Workspace root (defaults to the configured root)"),
      n64Name: z.string(),
      n64Address: z.string(),
      n64File: z.string().optional(),
      n64Sha256: z.string().optional(),
      ps2Name: z.string(),
      ps2Address: z.string(),
      ps2File: z.string().optional(),
      ps2Sha256: z.string().optional(),
      evidence: z.array(z.string()).min(1).describe("Concrete evidence: test name, trace, disassembly diff, runtime observation"),
      recordedBy: z.string().describe("Agent or person making the claim"),
      notes: z.string().optional(),
      confirm: z.boolean().describe("Must be true; recording without this flag is refused")
    },
    async (input) => {
      if (!input.confirm) throw new Error("Set confirm=true: recording a confirmed equivalence is an explicit act.");
      const workspace = input.workspace ? resolveInWorkspace(input.workspace) : config.workspaceRoots[0] ?? process.cwd();
      const registry = EquivalenceRegistry.forWorkspace(workspace, config.dataDir);
      const record = await registry.add(workspace, {
        n64: {
          name: input.n64Name,
          address: Number.parseInt(input.n64Address.replace(/^0x/i, ""), 16),
          file: input.n64File,
          sha256: input.n64Sha256
        },
        ps2: {
          name: input.ps2Name,
          address: Number.parseInt(input.ps2Address.replace(/^0x/i, ""), 16),
          file: input.ps2File,
          sha256: input.ps2Sha256
        },
        evidence: input.evidence,
        recordedBy: input.recordedBy,
        notes: input.notes
      });
      return ok({ record, notes: ["Confirmed equivalence recorded; it is now attributable and evidence-backed."] });
    }
  );

  registerTool(
    server,
    "equivalence_list",
    "List recorded confirmed N64<->PS2 equivalences for a workspace.",
    {
      workspace: z.string().optional(),
      n64Name: z.string().optional(),
      ps2Name: z.string().optional(),
      file: z.string().optional()
    },
    async ({ workspace, n64Name, ps2Name, file }) => {
      const root = workspace ? resolveInWorkspace(workspace) : config.workspaceRoots[0] ?? process.cwd();
      const registry = EquivalenceRegistry.forWorkspace(root, config.dataDir);
      const records = await registry.list({ n64Name, ps2Name, file });
      return ok({ workspace: root, count: records.length, records });
    }
  );
}
