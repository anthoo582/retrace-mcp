import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerTool } from "./helpers.js";
import { disassemble, MipsArch, Endian } from "../mips/disasm.js";
import { analyzeFunction } from "../mips/analysis.js";
import { ok } from "../core/evidence.js";

export function registerMipsTools(server: McpServer): void {
  registerTool(
    server,
    "mips_disassemble",
    "Disassemble raw MIPS machine code instructions (R4300i for N64 big-endian or R5900 for PS2 little-endian) using Capstone engine.",
    {
      hex: z.string().describe("Hex string of binary code to disassemble"),
      address: z.number().optional().describe("Base virtual address (default 0x80000400 for N64, 0x00100000 for PS2)"),
      arch: z.enum(["r4300i", "r5900", "mips32", "mips64"]).optional().describe("Target architecture profile"),
      endian: z.enum(["little", "big"]).optional().describe("Endianness")
    },
    async ({ hex, address, arch, endian }) => {
      const cleanHex = hex.replace(/[^0-9a-fA-F]/g, "");
      const buffer = Buffer.from(cleanHex, "hex");
      const baseAddr = address ?? (arch === "r5900" ? 0x00100000 : 0x80000400);
      const result = await disassemble(buffer, baseAddr, {
        arch: (arch as MipsArch) ?? "r4300i",
        endian: (endian as Endian)
      });
      return ok(result);
    }
  );

  registerTool(
    server,
    "mips_analyze_function",
    "Analyze a MIPS function: detects stack frame size, saved registers (ra, s0-s7, fp), calls, jumps, basic blocks and pseudocode.",
    {
      hex: z.string().describe("Hex string of function machine code"),
      address: z.number().optional().describe("Base virtual address"),
      arch: z.enum(["r4300i", "r5900"]).optional().describe("Architecture")
    },
    async ({ hex, address, arch }) => {
      const cleanHex = hex.replace(/[^0-9a-fA-F]/g, "");
      const buffer = Buffer.from(cleanHex, "hex");
      const baseAddr = address ?? (arch === "r5900" ? 0x00100000 : 0x80000400);
      const disasm = await disassemble(buffer, baseAddr, { arch: (arch as MipsArch) ?? "r4300i" });
      const analysis = analyzeFunction(disasm.instructions);
      return ok({
        address: baseAddr,
        arch: arch ?? "r4300i",
        instructionsCount: disasm.instructions.length,
        analysis
      });
    }
  );
}
